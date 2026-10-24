"""Presentation observer invariants. Synthetic evidence is never parity evidence."""
from copy import deepcopy
import json
import hashlib
from pathlib import Path
import shutil
import sys
import subprocess
import tempfile
import unittest

from protocol import ProtocolError
from state_trace.presentation import RawRecorder, SemanticRecorder, DOMAINS
from state_trace.compare import compare_outputs

ROOT = Path(__file__).resolve().parents[2]


class OriginalCapabilityIntegrityTests(unittest.TestCase):
    def test_original_capability_package_is_frozen_and_not_accepted_gold(self):
        directory=ROOT/'tools/behavior-tests/state_trace'
        raw_manifest=(directory/'presentation-capability-manifest.json').read_bytes()
        self.assertEqual(hashlib.sha256(raw_manifest).hexdigest(),
                         'd0456db0098bc7bc7d79531c8bfab97a48f70c5cfeb218b523f21d332d292bb1')
        manifest=json.loads(raw_manifest)
        self.assertEqual(manifest['status'],'diagnostic-only-not-reference-gold')
        for relative,digest in manifest['files'].items():
            path=Path(relative)
            self.assertFalse(path.is_absolute());self.assertNotIn('..',path.parts)
            # Original-only adapters remain opaque bytes; never import/execute.
            self.assertEqual(hashlib.sha256((directory/path).read_bytes()).hexdigest(),digest)
        proof=json.loads((directory/'presentation-original-capability-v1.json').read_text())
        self.assertIs(proof['original_executed'],True)
        self.assertIs(proof['candidate_executed'],False)
        self.assertEqual(proof['accepted_original_presentation_observations'],0)
        self.assertTrue(proof['coverage'])
        self.assertTrue(all(value is False for value in proof['coverage'].values()))


def raw(seq, kind, target='n1', **data):
    return dict(seq=seq, kind=kind, target=target, data=data)


def semantic(seq, kind, target='popup-1', domain='windows', **fields):
    return dict(seq=seq, after_input='confirm', domain=domain, kind=kind, object_id=target, fields=fields)


def state(presentation):
    return dict(turn=1, map=dict(width=16, height=16), players=[dict(id='human')], units=[], bases=[], presentation=presentation)


def compare(a, b, coverage=None):
    def output(value):
        return {'checkpoints': [dict(id='done', after_action='confirm', state=state(value), coverage=coverage or {})]}
    return compare_outputs(output(a), output(b), dict(fixture={'kind': 'synthetic'}, actions=[dict(id='confirm', kind='confirm')]))


class RecorderTests(unittest.TestCase):
    def test_transient_popup_survives_equal_final_inventory(self):
        recorder = SemanticRecorder()
        empty = recorder.checkpoint()
        recorder.record(semantic(1, 'create', role='window', text='Unexpected popup'))
        recorder.record(semantic(2, 'destroy'))
        actual = recorder.checkpoint()
        self.assertEqual(empty['objects'], actual['objects'])
        self.assertEqual(compare(empty, actual)['status'], 'mismatched')

    def test_short_overlapping_sounds_are_distinct_and_extra_fails(self):
        recorder = SemanticRecorder()
        for i in range(2):
            recorder.record(semantic(i+1, 'create', target=f'sfx-{i}', domain='sfx', source='click.wav', evidence='requested'))
        expected = recorder.checkpoint()
        actual = deepcopy(expected)
        actual['events'].pop()
        self.assertEqual(len(expected['media']), 2)
        self.assertEqual(compare(expected, actual)['status'], 'mismatched')

    def test_order_text_frame_and_source_are_exact(self):
        recorder = SemanticRecorder()
        recorder.record(semantic(1, 'create', role='label', text='Planetfall'))
        recorder.record(semantic(2, 'update', text='Base name'))
        reference = recorder.checkpoint()
        for mutate in (lambda x: x['events'].reverse(),
                       lambda x: x['objects']['popup-1'].update(text='Wrong'),
                       lambda x: x.update(media={'pod': {'source': 'wrong.flc', 'frame': 9}})):
            candidate = deepcopy(reference); mutate(candidate)
            self.assertEqual(compare(reference, candidate)['status'], 'mismatched')

    def test_unknown_widget_retained_and_never_passes(self):
        recorder = SemanticRecorder({name: True for name in DOMAINS})
        recorder.record(semantic(1, 'create', domain='unknown', native_class='MysteryWidget'))
        snapshot = recorder.checkpoint()
        self.assertEqual(snapshot['events'][0]['fields']['native_class'], 'MysteryWidget')
        self.assertEqual(compare(snapshot, snapshot, recorder.checkpoint_coverage())['status'], 'unsupported')

    def test_undefined_inventory_event_cannot_keep_complete_coverage(self):
        for domain in ('windows', 'widgets', 'animation', 'video', 'sfx', 'music'):
            with self.subTest(domain=domain):
                recorder = SemanticRecorder({name: True for name in DOMAINS})
                recorder.record(semantic(1, 'create', domain=domain, role='synthetic'))
                with self.assertRaisesRegex(ProtocolError, 'explicit unknown'):
                    recorder.record(semantic(2, 'unrecognized-kind', domain=domain, unexpected=True))
                self.assertEqual(recorder.seq, 1)
                recorder.record(semantic(2, 'unrecognized-kind', domain='unknown', native_domain=domain))
                self.assertEqual(recorder.checkpoint()['events'][-1]['kind'], 'unrecognized-kind')
                self.assertTrue(all(observed is False for observed in recorder.checkpoint_coverage().values()))

    def test_retirement_requires_observed_focus_and_modal_transitions(self):
        recorder = SemanticRecorder()
        recorder.record(semantic(1, 'create', role='window'))
        recorder.record(semantic(2, 'change', domain='focus', node='popup-1'))
        recorder.record(semantic(3, 'push', domain='modal'))
        with self.assertRaisesRegex(ProtocolError, 'focused or modal'):
            recorder.record(semantic(4, 'destroy'))
        self.assertIn('popup-1', recorder.objects)
        recorder.record(semantic(4, 'change', domain='focus', node=None))
        with self.assertRaisesRegex(ProtocolError, 'focused or modal'):
            recorder.record(semantic(5, 'destroy'))
        recorder.record(semantic(5, 'pop', domain='modal'))
        recorder.record(semantic(6, 'destroy'))
        result = recorder.checkpoint()
        self.assertEqual((result['objects'], result['focus'], result['modal_stack']), ({}, None, []))
        self.assertEqual([event['kind'] for event in result['events']], ['create', 'change', 'push', 'change', 'pop', 'destroy'])

    def test_explicit_unobserved_audio_is_not_observed_absence(self):
        recorder = SemanticRecorder()
        snapshot = recorder.checkpoint()
        self.assertEqual(snapshot['media'], {})
        self.assertFalse(recorder.checkpoint_coverage()['presentation.audio.output'])
        self.assertEqual(compare(snapshot, snapshot, recorder.checkpoint_coverage())['status'], 'unsupported')

    def test_detachment_birth_retirement_and_sequence(self):
        recorder = RawRecorder()
        birth = raw(1, 'node.create', parent=None, tag='$window')
        recorder.record(birth)
        birth['data']['tag'] = 'mutated'
        snapshot = recorder.checkpoint()
        self.assertEqual(snapshot['nodes']['n1']['tag'], '$window')
        recorder.record(raw(2, 'node.destroy'))
        self.assertIn('n1', snapshot['nodes'])
        with self.assertRaises(ProtocolError):
            recorder.record(raw(3, 'node.create', parent=None, tag='$window'))
        with self.assertRaises(ProtocolError):
            RawRecorder().record(raw(2, 'node.create', parent=None, tag='$window'))

    def test_dropped_disabled_opaque_and_invalid_parent(self):
        for batch in ({'enabled': False, 'dropped': 0, 'events': []},
                      {'enabled': True, 'dropped': 1, 'events': []}):
            with self.assertRaises(ProtocolError): RawRecorder().ingest(batch)
        with self.assertRaises(ProtocolError):
            RawRecorder().record(raw(1, 'node.create', parent='missing', tag='$window'))
        recorder = RawRecorder(); recorder.record(raw(1, 'node.create', parent=None, tag='$widget'))
        recorder.record(raw(2, 'node.opaque', key='data', type='Object'))
        self.assertEqual(recorder.checkpoint()['nodes']['n1']['opaque_properties'], {'data': 'Object'})

    def test_created_embedded_node_is_distinct_from_mount_and_detach(self):
        recorder = RawRecorder()
        recorder.record(raw(1, 'node.create', parent=None, tag='$root'))
        recorder.record(raw(2, 'node.create', target='n2', parent='n1', tag='$button'))
        self.assertFalse(recorder.checkpoint()['nodes']['n2']['attached'])
        recorder.record(raw(3, 'node.attach', target='n2', parent='n1'))
        self.assertTrue(recorder.checkpoint()['nodes']['n2']['attached'])
        recorder.record(raw(4, 'node.detach', target='n2', parent='n1'))
        detached = recorder.checkpoint()['nodes']['n2']
        self.assertFalse(detached['attached'])
        self.assertEqual(detached['parent'], 'n1')
        with self.assertRaises(ProtocolError): recorder.record(raw(5, 'node.attach', target='n2', parent='missing'))

    def test_type_switch_and_unset_replace_primitive_and_opaque_inventory(self):
        recorder = RawRecorder()
        recorder.record(raw(1, 'node.create', parent=None, tag='$text'))
        recorder.record(raw(2, 'node.opaque', key='color', type='Object'))
        recorder.record(raw(3, 'node.property', key='color', value='rgb(1,2,3)'))
        node = recorder.checkpoint()['nodes']['n1']
        self.assertEqual(node['properties']['color'], 'rgb(1,2,3)')
        self.assertNotIn('color', node['opaque_properties'])
        recorder.record(raw(4, 'node.opaque', key='color', type='Object'))
        self.assertNotIn('color', recorder.checkpoint()['nodes']['n1']['properties'])
        recorder.record(raw(5, 'node.unset', key='color'))
        node = recorder.checkpoint()['nodes']['n1']
        self.assertNotIn('color', node['properties'])
        self.assertNotIn('color', node['opaque_properties'])

    def test_shared_select_child_retains_embedded_edge_after_deglobalize(self):
        recorder = RawRecorder()
        for event in [raw(1, 'node.create', target='root', parent=None, tag='$root'),
                      raw(2, 'node.create', target='select', parent='root', tag='$select'),
                      raw(3, 'node.create', target='choices', parent='root', tag='$choicelist'),
                      raw(4, 'node.attach', target='choices', parent='select'),
                      raw(5, 'node.attach', target='choices', parent='root'),
                      raw(6, 'node.detach', target='choices', parent='root')]:
            recorder.record(event)
        node = recorder.checkpoint()['nodes']['choices']
        self.assertTrue(node['attached'])
        self.assertEqual(node['attachment_parents'], ['select'])
        self.assertEqual(node['parent'], 'root')
        recorder.record(raw(7, 'node.detach', target='choices', parent='select'))
        self.assertFalse(recorder.checkpoint()['nodes']['choices']['attached'])
        recorder.record(raw(8, 'node.destroy', target='choices'))
        recorder.record(raw(9, 'node.destroy', target='select'))

    def test_actual_native_bounded_buffer(self):
        compiler = shutil.which('g++')
        if not compiler: self.skipTest('host C++ compiler unavailable')
        source = r'''
#include "src/ui/PresentationTrace.h"
#include <iostream>
int main() {
    auto& o = ui::presentation::Get();
    o.Record("ignored", "n0"); std::cout << o.Drain() << '\n';
    o.Start(); o.Record("node.create", "n1", "{\"parent\":null,\"tag\":\"$window\"}");
    std::cout << o.Drain() << '\n';
    { ui::presentation::AudioCallbackScope scope;
      if (ui::presentation::CanRecordControl()) return 3; }
    if (!ui::presentation::CanRecordControl()) return 4;
    o.Record("node.property", "n1", "{\"key\":\"text\",\"value\":" + ui::presentation::Quote("line\n\t\"\\") + "}");
    std::cout << o.Drain() << '\n';
    for (size_t i=0; i<o.MAX_EVENTS+1; ++i) o.Record("x", "n1");
    std::cout << o.Drain() << '\n';
    std::cout << o.Drain() << '\n';
    o.Start(); o.Record("oversized", "n1", std::string(o.MAX_PAYLOAD_BYTES+1, 'x'));
    std::cout << o.Drain() << '\n';
    o.Start();
    if (o.SealRequested()) return 5;
    o.Record("node.create", "n1", "{\"parent\":null,\"tag\":\"$window\"}");
    std::cout << o.Drain() << '\n';
    o.RequestSeal();
    if (!o.SealRequested() || !o.Enabled()) return 6;
    o.Record("node.property", "n1", "{\"key\":\"pending\",\"value\":true}");
    std::cout << o.Drain(true) << '\n';
    if (o.Enabled()) return 7;
    o.Record("ignored-after-seal", "n1");
    std::cout << o.Drain() << '\n';
    o.Start();
    if (o.SealRequested() || !o.Enabled()) return 8;
    o.Record("node.create", "n1", "{\"parent\":null,\"tag\":\"$window\"}");
    std::cout << o.Drain() << '\n';
}
'''
        with tempfile.TemporaryDirectory(prefix='presentation-header-') as directory:
            src = Path(directory)/'test.cpp'; src.write_text(source)
            executable = Path(directory)/'test'
            subprocess.run([compiler, '-std=c++17', '-pthread', '-I', str(ROOT), str(src), '-o', str(executable)], check=True, capture_output=True, text=True)
            run = subprocess.run([str(executable)], check=True, capture_output=True, text=True)
        rows = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual(rows[0], dict(enabled=False, dropped=0, events=[]))
        recorder = RawRecorder(); recorder.ingest(rows[1]); recorder.ingest(rows[2])
        self.assertEqual(recorder.checkpoint()['nodes']['n1']['properties']['text'], 'line\n\t"\\')
        self.assertEqual(rows[3]['dropped'], 1)
        self.assertEqual(len(rows[3]['events']), 65536)
        self.assertEqual(rows[4]['dropped'], 1, 'loss remains sticky after drain')
        self.assertEqual(rows[5]['dropped'], 1)
        with self.assertRaises(ProtocolError): RawRecorder().ingest(rows[3])
        sealed = RawRecorder(); sealed.ingest(rows[6]); sealed.ingest(rows[7])
        self.assertTrue(sealed.checkpoint()['nodes']['n1']['properties']['pending'], 'terminal drain includes queued suffix')
        self.assertEqual(rows[7]['events'][0]['seq'], 2)
        self.assertEqual(rows[8], dict(enabled=False, dropped=0, events=[]), 'late writes cannot cross sealed boundary')
        self.assertEqual(rows[9], rows[6], 'fresh epoch clears seal request and sequence state')


class StandaloneTests(unittest.TestCase):
    def fixture(self):
        recorder = SemanticRecorder({'windows': True})
        recorder.record(dict(semantic(1, 'create', role='window', text='Menu'), after_input='launch'))
        output = {'checkpoints':[dict(id='menu', after_action='launch', state={'presentation':recorder.checkpoint()}, coverage={'presentation.windows':True})]}
        case_input = dict(fixture={'requested_coverage':['windows']}, actions=[dict(id='launch', kind='launch')], checkpoints=[dict(id='menu', after_action='launch')])
        return case_input, output

    def test_pre_world_has_no_fabricated_world_and_matches(self):
        from state_trace.presentation_schema import compare_outputs, validate_output
        inputs, output = self.fixture()
        self.assertEqual(set(output['checkpoints'][0]['state']), {'presentation'})
        validate_output(output, inputs, reference=True)
        self.assertEqual(compare_outputs(output, deepcopy(output), inputs)['status'], 'matched')

    def timeline(self, chunks):
        recorder = SemanticRecorder()
        points = []
        for point_id, after_action, event_actions in chunks:
            for after_input in event_actions:
                seq = recorder.seq + 1
                recorder.record(dict(semantic(seq, 'create', target=f'window-{seq}', role='window'), after_input=after_input))
            points.append(dict(id=point_id, after_action=after_action,
                               state={'presentation': recorder.checkpoint()}, coverage={'presentation.windows': True}))
        inputs = dict(fixture={'requested_coverage': ['windows']},
                      actions=[dict(id=action, kind='confirm') for action in ('launch', 'middle', 'finish')],
                      checkpoints=[dict(id=point['id'], after_action=point['after_action']) for point in points])
        return inputs, {'checkpoints': points}

    def test_event_action_labels_must_follow_checkpoint_intervals(self):
        from state_trace.presentation_schema import validate_output
        invalid = [
            [('menu', 'launch', ['middle'])],
            [('done', 'finish', ['middle', 'launch'])],
            [('menu', 'middle', []), ('done', 'finish', ['launch'])],
            [('menu', 'middle', ['launch']), ('done', 'finish', ['launch'])],
        ]
        for chunks in invalid:
            with self.subTest(chunks=chunks):
                inputs, output = self.timeline(chunks)
                for reference in (False, True):
                    with self.assertRaisesRegex(ProtocolError, 'action interval|action order'):
                        validate_output(output, inputs, reference=reference)

    def test_valid_multi_action_initial_and_same_action_intervals(self):
        from state_trace.presentation_schema import compare_outputs, validate_output
        valid = [
            [('done', 'finish', ['initial', 'launch', 'middle', 'finish'])],
            [('menu', 'launch', ['launch']), ('menu-again', 'launch', ['launch'])],
            [('initial', 'initial', ['initial']), ('menu', 'launch', ['initial', 'launch'])],
            [('menu', 'middle', ['launch']), ('done', 'finish', ['middle', 'finish'])],
            [('menu', 'launch', []), ('middle', 'middle', [])],
        ]
        for chunks in valid:
            with self.subTest(chunks=chunks):
                inputs, output = self.timeline(chunks)
                validate_output(output, inputs, reference=True)
                self.assertEqual(compare_outputs(output, deepcopy(output), inputs)['status'], 'matched')

    def test_undefined_kind_and_retired_references_cannot_be_accepted_reference(self):
        from state_trace.presentation_schema import validate_output
        inputs, output = self.fixture()
        output['checkpoints'][0]['state']['presentation']['events'].append(
            dict(semantic(2, 'unrecognized-kind'), after_input='launch'))
        with self.assertRaisesRegex(ProtocolError, 'explicit unknown'):
            validate_output(output, inputs, reference=True)
        recorder = SemanticRecorder()
        recorder.record(dict(semantic(1, 'create', role='window'), after_input='launch'))
        recorder.record(dict(semantic(2, 'change', domain='focus', node='popup-1'), after_input='launch'))
        recorder.record(dict(semantic(3, 'push', domain='modal'), after_input='launch'))
        state = recorder.checkpoint()
        state['events'].append(dict(semantic(4, 'destroy'), after_input='launch'))
        state['objects'].clear()
        output['checkpoints'][0]['state']['presentation'] = state
        with self.assertRaisesRegex(ProtocolError, 'focused or modal'):
            validate_output(output, inputs, reference=True)

    def test_missing_coverage_and_unexplained_inventory_cannot_pass(self):
        from state_trace.presentation_schema import compare_outputs, validate_output
        inputs, output = self.fixture()
        candidate = deepcopy(output)
        candidate['checkpoints'][0]['coverage']['presentation.windows'] = False
        self.assertEqual(compare_outputs(output, candidate, inputs)['status'], 'unsupported')
        with self.assertRaises(ProtocolError): validate_output(candidate, inputs, reference=True)
        del candidate['checkpoints'][0]['coverage']['presentation.windows']
        with self.assertRaises(ProtocolError): validate_output(candidate, inputs)
        candidate = deepcopy(output)
        candidate['checkpoints'][0]['state']['presentation']['objects']['popup-1']['text'] = 'unexplained'
        with self.assertRaises(ProtocolError): validate_output(candidate, inputs)

    def test_strict_extra_popup_even_when_destroyed_before_checkpoint(self):
        from state_trace.presentation_schema import compare_outputs
        inputs, output = self.fixture()
        candidate = deepcopy(output)
        events = candidate['checkpoints'][0]['state']['presentation']['events']
        events.append(dict(semantic(2, 'create', target='extra', role='window'), after_input='launch'))
        events.append(dict(semantic(3, 'destroy', target='extra'), after_input='launch'))
        result = compare_outputs(output, candidate, inputs)
        self.assertEqual(result['status'], 'mismatched')
        self.assertEqual(result['first_divergent_checkpoint'], 'menu')


    def test_missing_assets_remain_unsupported_without_engine_launch(self):
        import os
        env = dict(os.environ); env.pop('SMAC_ASSETS_DIR', None)
        cases = (ROOT/'tools/behavior-tests/state_trace/presentation-cases.json').read_text()
        with tempfile.TemporaryDirectory(prefix='presentation-no-assets-') as directory:
            env['PRESENTATION_ARTIFACTS'] = directory
            run = subprocess.run([sys.executable,str(ROOT/'tools/behavior-tests/state_trace/presentation_candidate.py')],input=cases,text=True,capture_output=True,env=env,check=True)
        response = json.loads(run.stdout)
        self.assertEqual([row['status'] for row in response['results']], ['unsupported','unsupported'])
        self.assertEqual(response['implementation']['captures'], {})

    def test_prelaunch_failure_replaces_stale_pass_report(self):
        from protocol import fingerprint,probe_request
        from state_trace.presentation_run import main
        inputs, output = self.fixture()
        suite = {'version':1,'cases':[{'id':'synthetic','algorithm':'presentation.trace.v1','input':inputs}]}
        request = probe_request(suite)
        reference = {'version':1,'suite_sha256':fingerprint(request),'captured_at':'2000-01-01T00:00:00+00:00','repeat':2,
                     'reference':{'name':'synthetic-only','kind':'original-executable','executable_sha256':'a'*64,'adapter_version':1},
                     'observations':[{'id':'synthetic','case_sha256':fingerprint(request['cases'][0]),'output':output}]}
        with tempfile.TemporaryDirectory(prefix='presentation-runner-') as directory:
            cases=Path(directory)/'cases.json'; record=Path(directory)/'reference.json'; report=Path(directory)/'report.json'
            cases.write_text(json.dumps(suite)); record.write_text(json.dumps(reference)); report.write_text('{"stale_pass":true}')
            code=main(['compare','--cases',str(cases),'--reference',str(record),'--command','/definitely/missing/presentation-probe','--report',str(report)])
            saved=json.loads(report.read_text())
        self.assertEqual(code,2)
        self.assertFalse(saved['candidate_executed'])
        self.assertIn('error',saved)
        self.assertNotIn('stale_pass',saved)


if __name__ == '__main__': unittest.main()
