"""Actual native geometry formatter precision; synthetic coordinates, no parity claim."""
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class NativeGeometryPrecisionTests(unittest.TestCase):
    def test_producer_preserves_every_native_f32_coordinate_and_zindex(self):
        compiler = shutil.which('g++')
        if not compiler:
            self.skipTest('host C++ compiler unavailable')
        source = r'''
#include <cmath>
#include <cstring>
#include <iostream>
#include <locale>
#include <unordered_map>
#include "ui/Types.h"
#include "ui/PresentationGeometry.h"
static_assert(sizeof(ui::coord_t)==sizeof(float), "native coordinate width changed");
struct Comma : std::numpunct<char> { char do_decimal_point() const override { return ','; } };
int main() {
 std::locale::global(std::locale(std::locale::classic(),new Comma));
 const ui::coord_t values[]={0.0000001f,std::nextafter(10.0f,11.0f),0.1234567f,0.1234568f,0.9900001f};
 std::cout << ui::presentation::GeometryFields("layout",values[0],values[1],values[2],values[3],values[4]) << '\n';
 std::cout << '[';
 for(unsigned i=0;i<5;++i){uint32_t bits;std::memcpy(&bits,&values[i],sizeof(bits));if(i)std::cout<<',';std::cout<<bits;}
 std::cout << "]\n";
}
'''
        with tempfile.TemporaryDirectory(prefix='presentation-geometry-') as directory:
            src=Path(directory)/'probe.cpp';src.write_text(source)
            exe=Path(directory)/'probe'
            subprocess.run([compiler,'-std=c++17','-pthread','-I'+str(ROOT/'src'),str(src),'-o',str(exe)],check=True,capture_output=True)
            run=subprocess.run([str(exe)],check=True,capture_output=True,text=True)
        geometry,bits=[json.loads(line) for line in run.stdout.splitlines()]
        actual=[geometry[key] for key in ('left','top','right','bottom','zindex')]
        self.assertEqual([struct.unpack('I',struct.pack('f',value))[0] for value in actual],bits)
        self.assertNotEqual(geometry['right'],geometry['bottom'])
        self.assertNotEqual(geometry['left'],0)
        self.assertGreater(geometry['top'],10)
        self.assertEqual(geometry['area'],'layout')
        self.assertTrue(all(type(value) is float for value in actual))

if __name__=='__main__':unittest.main()
