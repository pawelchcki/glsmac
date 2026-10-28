"""Real Sound/observer regressions; synthetic PCM is not audio parity evidence."""
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class NativeSoundEpochTests(unittest.TestCase):
    def test_surviving_actors_register_before_controls_and_callback_stays_realtime_safe(self):
        compiler = shutil.which('c++')
        if not compiler:
            self.skipTest('host C++ compiler unavailable')
        source = r'''
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <new>
#include <pthread.h>
#include "scene/actor/Sound.h"
#include "types/Sound.h"
#include "scene/Scene.h"
#include "ui/PresentationTrace.h"
// Only logging identity and unattached scene lookup are host stubs. Actor,
// Sound, PCM storage, timer and the observer are compiled from real sources.
namespace common { Class::Class() {} const std::string Class::GetNamespace() const { return ""; } }
namespace scene { Camera* Scene::GetCamera() const { return nullptr; } }
static size_t callback_allocations=0, callback_locks=0;
void* operator new(size_t size) {
 if(ui::presentation::in_audio_callback)++callback_allocations;
 if(void* memory=malloc(size))return memory;
 throw std::bad_alloc();
}
void operator delete(void* memory) noexcept {free(memory);}
void operator delete(void* memory,size_t) noexcept {free(memory);}
extern "C" int __real_pthread_mutex_lock(pthread_mutex_t*);
extern "C" int __wrap_pthread_mutex_lock(pthread_mutex_t* mutex) {
 if(ui::presentation::in_audio_callback)++callback_locks;
 return __real_pthread_mutex_lock(mutex);
}
int main() {
 types::Sound pcm;pcm.m_name="synthetic-pcm";pcm.m_buffer_size=32;
 pcm.m_buffer=static_cast<unsigned char*>(malloc(pcm.m_buffer_size));std::memset(pcm.m_buffer,1,pcm.m_buffer_size);
 auto& observer=ui::presentation::Get();
 // Born before the first Start: a later control must still be retained.
 auto* early=new scene::actor::Sound("early",&pcm);
 observer.Start();early->SetVolume(0.0000001f);early->Play();
 auto* armed=new scene::actor::Sound("armed",&pcm);
 std::cout<<observer.Drain()<<'\n';
 // Both actors survive Stop/Start. New-epoch birth must precede each control.
 observer.Stop();observer.Start();early->Pause();armed->SetVolume(0.1234567f);
 std::cout<<observer.Drain()<<'\n';
 // Destruction may be the first observation in an epoch as well.
 observer.Start();delete early;delete armed;std::cout<<observer.Drain()<<'\n';
 scene::actor::Sound callback("callback",&pcm);
 callback.SetRepeatable(true);callback.SetAutoPlay(true);callback.Play();observer.Drain();
 unsigned char output[8];for(unsigned i=0;i<7;++i)callback.GetNextBuffer(output,sizeof(output));
 std::cout<<observer.Drain()<<'\n';
 std::cout<<"{\"allocations\":"<<callback_allocations<<",\"locks\":"<<callback_locks<<"}\n";
 // Formatter keeps float type and round-trips small/distinct finite values.
 std::cout<<'['<<ui::presentation::Float(0.0000001f)<<','<<ui::presentation::Float(0.1234567f)<<','<<ui::presentation::Float(0.1234568f)<<','<<ui::presentation::Float(1.0f)<<"]\n";
}
'''
        sources = ['scene/actor/Sound.cpp', 'scene/actor/Actor.cpp', 'scene/Entity.cpp',
                   'scene/actor/Cache.cpp', 'util/Timer.cpp', 'types/Sound.cpp',
                   'types/Matrix44.cpp', 'types/Buffer.cpp', 'types/Vec3.cpp']
        with tempfile.TemporaryDirectory(prefix='presentation-sound-') as directory:
            src = Path(directory)/'test.cpp'; src.write_text(source)
            exe = Path(directory)/'test'
            subprocess.run([compiler, '-std=c++23', '-DFASTDEBUG', '-O1', '-pthread',
                            '-ffunction-sections', '-fdata-sections', '-I'+str(ROOT/'src'), str(src),
                            *[str(ROOT/'src'/p) for p in sources], '-Wl,--gc-sections',
                            '-Wl,--wrap=pthread_mutex_lock', '-o', str(exe)], check=True, capture_output=True)
            run = subprocess.run([str(exe)], check=True, capture_output=True, text=True)
        rows = [json.loads(line) for line in run.stdout.splitlines()]
        for batch in rows[:3]:
            self.assertEqual(batch['dropped'], 0)
            born = set()
            for event in batch['events']:
                if event['kind'] == 'media.create':
                    self.assertNotIn(event['target'], born)
                    born.add(event['target'])
                else:
                    self.assertIn(event['target'], born)
            self.assertEqual(len(born), 2)
        self.assertEqual([e['kind'] for e in rows[2]['events']],
                         ['media.create', 'media.destroy', 'media.create', 'media.destroy'])
        self.assertEqual(rows[3]['events'], [])
        self.assertEqual(rows[4], {'allocations': 0, 'locks': 0})
        native_float = lambda value: struct.unpack('f', struct.pack('f', value))[0]
        self.assertEqual([native_float(v) for v in rows[5]],
                         [native_float(v) for v in (1e-7, .1234567, .1234568, 1.0)])
        self.assertNotEqual(rows[5][1], rows[5][2])
        self.assertTrue(all(type(v) is float for v in rows[5]))
