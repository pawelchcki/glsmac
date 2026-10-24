"""Compile real bounded observer control queue; no SDL or assets required."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class NativeInputFenceTests(unittest.TestCase):
    def test_actual_dispatch_formatter_does_not_expose_stale_reused_union_fields(self):
        compiler = shutil.which('g++')
        if not compiler:
            self.skipTest('host C++ compiler unavailable')
        source = r'''#include "src/input/PresentationTrace.h"
#include <iostream>
#include <cstring>
int main() {
 input::Event event;
 std::memset(&event.data,0x5a,sizeof(event.data));
 const auto emit = [&]() {
  unsigned char before[sizeof(event.data)];std::memcpy(before,&event.data,sizeof(event.data));
  std::cout<<input::PresentationDispatchData(event,1)<<'\n';
  if(std::memcmp(before,&event.data,sizeof(event.data)))std::terminate();
 };
 event.SetType(input::EV_KEY_DOWN);event.data.key.is_printable=true;event.data.key.code=input::K_A;event.data.key.key='A';event.data.key.modifiers=input::KM_SHIFT;emit();
 // Reuse the same data union, exactly as the input poller does. Do not clean it.
 event.SetType(input::EV_MOUSE_SCROLL);event.data.mouse.x=91;event.data.mouse.y=73;event.data.mouse.scroll_y=-2;emit();
 event.SetType(input::EV_MOUSE_MOVE);event.data.mouse.x=12;event.data.mouse.y=34;emit();
 event.SetType(input::EV_MOUSE_DOWN);event.data.mouse.x=43;event.data.mouse.y=21;event.data.mouse.button=input::MB_RIGHT;emit();
}
'''
        with tempfile.TemporaryDirectory() as directory:
            src = Path(directory)/'test.cpp'; src.write_text(source)
            exe = Path(directory)/'test'
            subprocess.run([compiler, '-std=c++17', '-pthread', '-I', str(ROOT), '-I', str(ROOT/'src'), str(src), str(ROOT/'src/input/Event.cpp'), '-o', str(exe)], check=True, capture_output=True)
            run = subprocess.run([str(exe)], check=True, capture_output=True, text=True)
        rows = [json.loads(line) for line in run.stdout.splitlines()]
        common = dict(phase='begin', ingress=0, action=1)
        self.assertEqual(rows, [dict(common, type='keydown', code='A', key=65, modifiers=1, printable=True),
                                dict(common, type='mousescroll', x=91, y=73, scroll_y=-2),
                                dict(common, type='mousemove', x=12, y=34),
                                dict(common, type='mousedown', x=43, y=21, button=2)])

    def test_real_threaded_queue_barrier_order_errors_bounds_and_seal(self):
        compiler = shutil.which('g++')
        if not compiler:
            self.skipTest('host C++ compiler unavailable')
        source = r'''
#include "src/ui/PresentationTrace.h"
#include <iostream>
#include <thread>
int main() {
 auto& o = ui::presentation::Get();
 if(o.Command(2,1,0,1)!=-1)return 1;
 o.Start();o.StartInputs();std::cout<<o.Drain()<<'\n';
 std::thread browser([&](){if(o.Command(2,1,0,1)!=1)std::terminate();});browser.join();
 std::cout<<o.Drain()<<'\n'; // Enqueue must not itself acknowledge.
 o.Record("input.dispatch","input","{\"phase\":\"end\",\"ingress\":1,\"handled\":false}");
 o.InputBarrier();std::cout<<o.Drain()<<'\n';
 if(o.Command(3,1,1,2)!=1)return 2;
 o.InputBarrier();std::cout<<o.Drain()<<'\n';
 if(o.Command(1,2,0,3)!=1)return 3;
 o.InputBarrier();std::cout<<o.Drain()<<'\n';
 // Duplicate nonce and invalid ordering are sticky failures, not empty success.
 if(o.Command(2,2,0,3)!=-2)return 4;
 std::cout<<o.Drain()<<'\n';
 if(o.Command(3,2,2,4)!=1)return 5;
 o.InputBarrier();std::cout<<o.Drain()<<'\n';
 o.Start();o.StartInputs();o.Drain();
 for(unsigned n=1;n<=o.MAX_COMMANDS;n++)if(o.Command(2,1,0,n)!=1)return 6;
 if(o.Command(2,1,0,o.MAX_COMMANDS+1)!=-3)return 7;
 std::cout<<o.Drain()<<'\n';
 o.Start();o.StartInputs();o.Drain();
 if(o.Command(2,1,0,1)!=1)return 8;
 std::cout<<o.Drain(true)<<'\n'; // Cannot seal over an unapplied fence.
 if(o.Command(2,1,0,2)!=-1)return 9;
 o.Start();o.StartInputs();o.Drain();o.RequestSeal();
 if(o.Command(2,1,0,1)!=-1)return 10;
 std::cout<<o.Drain(true)<<'\n';
}
'''
        with tempfile.TemporaryDirectory() as directory:
            src = Path(directory)/'test.cpp'; src.write_text(source)
            exe = Path(directory)/'test'
            subprocess.run([compiler, '-std=c++17', '-pthread', '-I', str(ROOT), str(src), '-o', str(exe)], check=True, capture_output=True)
            run = subprocess.run([str(exe)], check=True, capture_output=True, text=True)
        rows = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual([e['kind'] for e in rows[0]['events']], ['trace.protocol', 'trace.action'])
        self.assertEqual(rows[1]['events'], [])
        self.assertEqual([e['kind'] for e in rows[2]['events']], ['input.dispatch', 'trace.action'])
        self.assertEqual(rows[2]['events'][1]['data'], dict(op=2, action=1, checkpoint=0, nonce=1))
        self.assertEqual(rows[3]['events'][0]['kind'], 'trace.checkpoint')
        self.assertEqual(rows[4]['events'][0]['data']['action'], 2)
        self.assertEqual(rows[5]['dropped'], 1)
        self.assertEqual(rows[6]['events'][0]['kind'], 'trace.error')
        self.assertEqual(rows[7]['dropped'], 1)
        self.assertEqual(rows[8]['dropped'], 1)
        self.assertEqual(rows[9]['dropped'], 0)
