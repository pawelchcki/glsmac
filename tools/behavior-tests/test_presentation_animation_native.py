"""Actual native animation/scene lifecycle with synthetic assets and clock.

This is candidate producer coverage, not rendered pixels or original agreement.
"""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from copy import deepcopy

from protocol import ProtocolError
from state_trace.presentation import RawRecorder, DOMAINS
from state_trace.presentation_projector import project_capture
from state_trace.presentation_audit import audit_capture

ROOT = Path(__file__).resolve().parents[2]


class NativeAnimationTraceTests(unittest.TestCase):
    def test_scene_frames_completion_cancellation_epochs_and_disabled_observer(self):
        compiler = shutil.which('c++')
        if not compiler:
            self.skipTest('host C++ compiler unavailable')
        source = r'''
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include "game/frontend/Animation.h"
#include "game/frontend/AnimationDef.h"
#include "game/frontend/sprite/InstancedSprite.h"
#include "scene/actor/Instanced.h"
#include "scene/actor/Sound.h"
#include "scene/Scene.h"
#include "types/Sound.h"
#include "engine/Engine.h"
#include "audio/Audio.h"
#include "ui/PresentationTrace.h"
// Dependency boundaries: no asset loading, rendering, SDL device, or engine
// threads. Actual Animation, Instanced scene storage, Timer, Sound and audio
// removal ownership are compiled below. Only the clock and asset supplier are
// controlled. The test does not implement frame advancement or tracing.
static long clock_ms = 1000;
namespace std::chrono {
system_clock::time_point system_clock::now() noexcept {
 return time_point(milliseconds(clock_ms));
}
}
namespace common {
Class::Class() {}
const std::string Class::GetNamespace() const { return ""; }
const std::string& Class::GetLocalName() const { return m_name; }
}
namespace scene {
Camera* Scene::GetCamera() const { return nullptr; }
const instance_positions_t& Scene::GetWorldInstancePositions() const { return m_game_instance_positions; }
}
static game::frontend::instanced_sprites_t asset_frames;
static size_t asset_duration = 30, source_reads = 0;
static types::Sound pcm;
namespace game::frontend {
AnimationDef::AnimationDef(sprite::InstancedSpriteManager*, const backend::animation::Def*)
 : m_id("synthetic-animation"), m_sprites(asset_frames), m_duration_ms(asset_duration) {}
AnimationDef::~AnimationDef() {}
const instanced_sprites_t& AnimationDef::GetSprites() { return m_sprites; }
const std::string& AnimationDef::GetId() const { ++source_reads; return m_id; }
const size_t AnimationDef::GetDurationMs() const { return m_duration_ms; }
const types::Sound* AnimationDef::GetSound() { return &pcm; }
}
namespace engine {
Engine::Engine(config::Config*, error_handler::ErrorHandler*, const std::vector<logger::Logger*>&,
 resource::ResourceManager*, loader::font::FontLoader*, loader::texture::TextureLoader*,
 loader::sound::SoundLoader*, loader::txt::TXTLoaders*, scheduler::Scheduler*, input::Input*,
 graphics::Graphics*, audio::Audio* audio, network::Network*, game::backend::Game*) : m_audio(audio) {}
Engine::~Engine() {}
}
engine::Engine* g_engine = nullptr;
class AudioFixture : public audio::Audio {
public:
 size_t added = 0, removed = 0;
 void AddActor(scene::actor::Sound*) override { ++added; }
 void RemoveActor(scene::actor::Sound*) override { ++removed; }
};
static void dump() { std::cout << ui::presentation::Get().Drain() << '\n'; }
int main() {
 using namespace game::frontend;
 AudioFixture audio;
 engine::Engine engine(nullptr,nullptr,{},nullptr,nullptr,nullptr,nullptr,nullptr,
                       nullptr,nullptr,nullptr,&audio,nullptr,nullptr);
 g_engine=&engine;
 pcm.m_name="synthetic-pcm";pcm.m_buffer_size=32;
 pcm.m_buffer=static_cast<unsigned char*>(malloc(pcm.m_buffer_size));memset(pcm.m_buffer,1,pcm.m_buffer_size);
 scene::actor::Instanced first(new scene::actor::Actor(scene::actor::Actor::TYPE_SPRITE,"frame0"));
 scene::actor::Instanced second(new scene::actor::Actor(scene::actor::Actor::TYPE_SPRITE,"frame1"));
 scene::actor::Instanced third(new scene::actor::Actor(scene::actor::Actor::TYPE_SPRITE,"frame2"));
 sprite::InstancedSprite f0{},f1{},f2{};f0.actor=&first;f1.actor=&second;f2.actor=&third;
 asset_frames={&f0,&f1,&f2};AnimationDef def(nullptr,nullptr);
 auto& observer=ui::presentation::Get();
 // Disabled construction, progress and retirement must not query trace source.
 { Animation disabled(1,&def,{1,2,3});clock_ms+=100;disabled.Iterate(); }
 dump();std::cout<<"{\"source_reads\":"<<source_reads<<"}\n";
 // Actual AddInstance/RemoveInstance and native timer catch-up, all three frames.
 observer.Start();
 auto* complete=new Animation(2,&def,{0.0000001f,-2.25f,3.5f});
 std::cout<<"{\"first_live\":"<<(first.HasInstance(2)?"true":"false")<<"}\n";
 clock_ms+=100;complete->Iterate();complete->Iterate();
 std::cout<<"{\"finished\":"<<(complete->IsFinished()?"true":"false")
          <<",\"last_live\":"<<(third.HasInstance(2)?"true":"false")<<"}\n";
 delete complete;dump();
 // Two overlapping same-source instances have distinct playback identities.
 observer.Start();
 auto* a=new Animation(7,&def,{4,5,6});auto* b=new Animation(7,&def,{4,5,6});
 delete a;delete b;dump();
 // Survives an epoch and progresses: retain partial history, never invent start.
 observer.Stop();auto* early=new Animation(8,&def,{7,8,9});
 observer.Start();clock_ms+=10;early->Iterate();dump();
 observer.Start();delete early;dump();
 // Audio ownership remains balanced through the real removal path.
 std::cout<<"{\"added\":"<<audio.added<<",\"removed\":"<<audio.removed<<"}\n";
}
'''
        sources = ['game/frontend/Animation.cpp', 'scene/actor/Instanced.cpp',
                   'scene/actor/Sound.cpp', 'scene/actor/Actor.cpp', 'scene/Entity.cpp',
                   'scene/actor/Cache.cpp', 'util/Timer.cpp', 'audio/Audio.cpp',
                   'types/Sound.cpp', 'types/Matrix44.cpp', 'types/Buffer.cpp', 'types/Vec3.cpp']
        with tempfile.TemporaryDirectory(prefix='presentation-animation-') as directory:
            src = Path(directory)/'test.cpp'; src.write_text(source)
            exe = Path(directory)/'test'
            build = subprocess.run([compiler, '-std=c++23', '-DFASTDEBUG', '-O1', '-pthread',
                                    '-ffunction-sections', '-fdata-sections', '-I'+str(ROOT/'src'), str(src),
                                    *[str(ROOT/'src'/p) for p in sources], '-Wl,--gc-sections', '-o', str(exe)],
                                   capture_output=True, text=True)
            self.assertEqual(build.returncode, 0, build.stderr)
            run = subprocess.run([str(exe)], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
        rows = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual(rows[0]['events'], [])
        with self.assertRaisesRegex(ProtocolError, 'observer disabled'):
            RawRecorder().ingest(rows[0])
        # Each Start is a distinct native epoch. Feed complete, unfiltered real
        # producer batches (including the independent Sound records) through the
        # production consumer, proving the approved wire and lazy histories fit.
        reduced = []
        for index in (4, 5, 6, 7):
            recorder = RawRecorder()
            recorder.ingest(rows[index])
            self.assertTrue(all(value is False for value in recorder.checkpoint_coverage().values()))
            reduced.append(recorder.checkpoint())
            # Controlled input fences frame this actual native producer batch.
            # Payloads/identities remain unchanged; only execution ordinals shift.
            # No native seal or device-output evidence is invented by the fixture.
            plan = dict(fixture=dict(requested_coverage=list(DOMAINS)),
                        actions=[dict(id='launch', kind='launch')],
                        checkpoints=[dict(id='done', after_action='launch')])
            events = [dict(kind='semantic.protocol', target='trace', data=dict(version=2)),
                      dict(kind='trace.protocol', target='trace', data=dict(version=1, physical_os_complete=False)),
                      dict(kind='trace.action', target='trace', data=dict(op=1, action=1, checkpoint=0, nonce=0))]
            events += deepcopy(rows[index]['events'])
            events += [dict(kind='trace.action', target='trace', data=dict(op=2, action=1, checkpoint=0, nonce=1)),
                       dict(kind='trace.checkpoint', target='trace', data=dict(op=3, action=1, checkpoint=1, nonce=2))]
            for sequence, event in enumerate(events, 1):
                event['seq'] = sequence
            capture = dict(schema='glsmac.presentation.raw.v1', input_plan=plan,
                           batches=[dict(enabled=True, dropped=0, events=events)],
                           input_checkpoints=[dict(id='done', after_action='launch', checkpoint=1)])
            report = audit_capture(capture, project_capture(capture, plan))
            self.assertTrue(report['valid'])
            self.assertFalse(report['transport_complete'])
            self.assertFalse(report['exhaustive_coverage_complete'])
        for index in (0, 1, 3):
            self.assertFalse(any(item['type'] == 'animation' for item in reduced[index]['media'].values()))
        surviving = [item for item in reduced[2]['media'].values() if item['type'] == 'animation']
        self.assertEqual(len(surviving), 1)
        self.assertEqual((surviving[0]['history'], surviving[0]['frame_index'], surviving[0]['present']),
                         ('partial', 1, True))
        self.assertEqual(rows[1], {'source_reads': 0})
        self.assertEqual(rows[2], {'first_live': True})
        self.assertEqual(rows[3], {'finished': True, 'last_live': False})

        def animation_events(batch):
            self.assertEqual(batch['dropped'], 0)
            targets = {e['target'] for e in batch['events']
                       if e['kind'] == 'media.create' and e['data']['type'] == 'animation'}
            return [e for e in batch['events'] if e['target'] in targets]

        events = animation_events(rows[4])
        self.assertEqual([e['kind'] for e in events],
                         ['media.create', 'media.start', 'media.frame', 'media.frame',
                          'media.frame', 'media.frame', 'media.frame', 'media.frame',
                          'media.end', 'media.destroy'])
        birth = events[0]['data']
        self.assertEqual(set(birth), {'type', 'source', 'duration_ms', 'frame_count',
                                     'x', 'y', 'z', 'evidence', 'history'})
        self.assertEqual((birth['type'], birth['source'], birth['duration_ms'], birth['frame_count']),
                         ('animation', 'synthetic-animation', 30, 3))
        self.assertEqual((birth['x'], birth['y'], birth['z']), (1.00000001e-7, -2.25, 3.5))
        self.assertEqual(birth['history'], 'from-construction')
        self.assertEqual(birth['evidence'], 'native-registration')
        frames = [e['data'] for e in events if e['kind'] == 'media.frame']
        self.assertEqual([(f['frame_index'], f['present']) for f in frames],
                         [(0, True), (0, False), (1, True), (1, False), (2, True), (2, False)])
        for added, removed in zip(frames[::2], frames[1::2]):
            self.assertEqual(added['scene_instance_id'], removed['scene_instance_id'])
        self.assertTrue(all(e['data']['evidence'] == 'scene-instance' for e in events[1:]))

        overlap = animation_events(rows[5])
        births = [e for e in overlap if e['kind'] == 'media.create']
        self.assertEqual(len(births), 2)
        self.assertNotEqual(births[0]['target'], births[1]['target'])
        for birth in births:
            one = [e for e in overlap if e['target'] == birth['target']]
            self.assertEqual([e['kind'] for e in one],
                             ['media.create', 'media.start', 'media.frame', 'media.frame',
                              'media.stop', 'media.destroy'])
            self.assertEqual(one[-2]['data']['reason'], 'cancelled')
        lazy = animation_events(rows[6])
        self.assertEqual([e['kind'] for e in lazy], ['media.create', 'media.frame', 'media.frame'])
        self.assertEqual(lazy[0]['data']['history'], 'partial')
        self.assertEqual([(e['data']['frame_index'], e['data']['present']) for e in lazy[1:]],
                         [(0, False), (1, True)])
        retired = animation_events(rows[7])
        self.assertEqual([e['kind'] for e in retired],
                         ['media.create', 'media.frame', 'media.stop', 'media.destroy'])
        self.assertEqual(retired[0]['data']['history'], 'partial')
        self.assertEqual(retired[0]['target'], lazy[0]['target'])
        self.assertEqual(rows[8], {'added': 5, 'removed': 5})


if __name__ == '__main__':
    unittest.main()
