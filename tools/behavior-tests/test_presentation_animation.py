"""Scene submission observations are explicit; they never attest rendered pixels."""
from copy import deepcopy
import unittest

from protocol import ProtocolError
from state_trace.presentation import RawRecorder
from state_trace.presentation_projector import project_capture


def fixture(history='from-construction'):
    rows = []
    def add(kind, target='m1', **data):
        rows.append(dict(seq=len(rows) + 1, kind=kind, target=target, data=data))
    add('semantic.protocol', 'trace', version=2)
    add('trace.protocol', 'trace', version=1, physical_os_complete=False)
    add('trace.action', 'trace', op=1, action=1, checkpoint=0, nonce=0)
    add('media.create', type='animation', source='synthetic-explosion', duration_ms=300,
        frame_count=3, x=1.0, y=2.0, z=0.0, evidence='native-registration', history=history)
    if history == 'from-construction':
        add('media.start', evidence='scene-instance')
    add('media.frame', evidence='scene-instance', frame_index=0, scene_instance_id=7, present=True)
    add('trace.action', 'trace', op=2, action=1, checkpoint=0, nonce=1)
    add('trace.checkpoint', 'trace', op=3, action=1, checkpoint=1, nonce=2)
    case = dict(fixture=dict(requested_coverage=['animation.requests', 'animation.frames']),
                actions=[dict(id='launch', kind='launch')], checkpoints=[dict(id='ready', after_action='launch')])
    capture = dict(batches=[dict(enabled=True, dropped=0, events=rows)],
                   input_checkpoints=[dict(id='ready', after_action='launch', checkpoint=1)])
    return case, capture, add


class AnimationTraceTests(unittest.TestCase):
    def test_explicit_animation_is_live_semantic_media_with_scene_evidence(self):
        case, capture, _ = fixture()
        output = project_capture(capture, case)
        point = output['checkpoints'][0]
        media = point['state']['presentation']['media']['candidate-birth:m1']
        self.assertEqual((media['source'], media['frame_index'], media['scene_instance_id']),
                         ('synthetic-explosion', 0, 7))
        self.assertEqual(media['evidence'], 'scene-instance')
        self.assertIn('rendered pixels unobserved', media['evidence_scope'])
        self.assertTrue(all(value is False for value in point['coverage'].values()))
        self.assertNotIn('m1', output['diagnostics']['unknown_inventory'])

    def test_frame_removal_and_completion_remain_ordered_before_retirement(self):
        case, capture, add = fixture()
        capture['batches'][0]['events'][3]['data']['frame_count'] = 1
        add('media.frame', evidence='scene-instance', frame_index=0, scene_instance_id=7, present=False)
        add('media.end', evidence='scene-instance', reason='completed')
        add('media.destroy', evidence='scene-instance')
        output = project_capture(capture, case)
        tail = output['diagnostics']['tail_presentation']
        self.assertEqual(tail['media'], {})
        updates = [event['fields'] for event in tail['events'] if event['domain'] == 'animation' and event['kind'] == 'update']
        self.assertEqual([value['lifecycle'] for value in updates], ['frame-removed', 'completed'])
        self.assertIsNone(updates[0]['frame_index'])
        raw = output['diagnostics']['raw_tail'][0]
        self.assertEqual((raw['data']['frame_index'], raw['data']['scene_instance_id']), (0, 7))
        self.assertEqual(output['diagnostics']['dispositions']['m1']['retirement_sequence'], len(capture['batches'][0]['events']))

    def test_cancellation_is_distinct_and_partial_history_never_invents_start(self):
        case, capture, add = fixture('partial')
        add('media.frame', evidence='scene-instance', frame_index=0, scene_instance_id=7, present=False)
        add('media.stop', evidence='scene-instance', reason='cancelled')
        result = project_capture(capture, case)
        events = result['checkpoints'][0]['state']['presentation']['events'] + result['diagnostics']['tail_presentation']['events']
        updates = [event['fields'] for event in events if event['domain'] == 'animation' and event['kind'] == 'update']
        self.assertFalse(any(value.get('lifecycle') == 'started' for value in updates))
        media = result['diagnostics']['tail_presentation']['media']['candidate-birth:m1']
        self.assertEqual((media['history'], media['lifecycle']), ('partial', 'cancelled'))

    def test_unclassified_audio_remains_unknown_alongside_animation(self):
        case, capture, add = fixture()
        add('media.create', 'm2', type='audio', source='unknown.wav')
        add('media.request', 'm2', evidence='request')
        result = project_capture(capture, case)
        self.assertIn('m2', result['diagnostics']['unknown_inventory'])
        self.assertNotIn('candidate-birth:m2', result['diagnostics']['tail_presentation']['media'])
        self.assertTrue(all(value is False for value in result['checkpoints'][0]['coverage'].values()))

    def test_malformed_animation_metadata_and_frames_are_rejected(self):
        _, capture, _ = fixture()
        events = capture['batches'][0]['events']
        for index, field, value in [(3, 'frame_count', True), (3, 'frame_count', 0),
                                    (3, 'duration_ms', -1), (3, 'x', None),
                                    (3, 'source', ''), (3, 'history', 'complete'),
                                    (3, 'evidence', 'device'), (5, 'frame_index', True),
                                    (5, 'frame_index', 3), (5, 'scene_instance_id', 0),
                                    (5, 'present', 1), (5, 'evidence', 'device')]:
            with self.subTest(field=field, value=value), self.assertRaises(ProtocolError):
                rows = deepcopy(events)
                rows[index]['data'][field] = value
                RawRecorder().ingest(dict(enabled=True, dropped=0, events=rows))

    def test_loss_and_reused_playback_identity_cannot_satisfy_capture(self):
        case, capture, add = fixture()
        bad = deepcopy(capture)
        bad['batches'][0]['dropped'] = 1
        with self.assertRaises(ProtocolError):
            project_capture(bad, case)
        add('media.frame', evidence='scene-instance', frame_index=0, scene_instance_id=7, present=False)
        add('media.stop', evidence='scene-instance', reason='cancelled')
        add('media.destroy', evidence='scene-instance')
        add('media.create', **capture['batches'][0]['events'][3]['data'])
        with self.assertRaisesRegex(ProtocolError, 'playback identity reused'):
            project_capture(capture, case)

    def test_full_history_rejects_removal_without_observed_submission(self):
        _, capture, _ = fixture()
        rows = capture['batches'][0]['events'][:6]
        rows[-1]['data']['present'] = False
        with self.assertRaisesRegex(ProtocolError, 'no matching submission'):
            RawRecorder().ingest(dict(enabled=True, dropped=0, events=rows))

    def test_impossible_frame_and_termination_sequences_are_rejected(self):
        def frame(index=0, identifier=7, present=True):
            return dict(evidence='scene-instance', frame_index=index, scene_instance_id=identifier, present=present)
        invalid_suffixes = [
            [('media.frame', frame())],
            [('media.frame', frame(present=False, identifier=99))],
            [('media.frame', frame(1))],
            [('media.frame', frame(present=False)), ('media.frame', frame(2))],
            [('media.frame', frame(present=False)), ('media.end', dict(evidence='scene-instance', reason='completed'))],
            [('media.frame', frame(present=False)), ('media.stop', dict(evidence='scene-instance', reason='cancelled')), ('media.frame', frame(1))],
            [('media.destroy', dict(evidence='scene-instance'))],
            [('media.frame', frame(present=False)), ('media.destroy', dict(evidence='scene-instance'))],
            [('media.start', dict(evidence='scene-instance'))],
        ]
        for suffix in invalid_suffixes:
            with self.subTest(suffix=suffix), self.assertRaises(ProtocolError):
                _, capture, add = fixture()
                rows = capture['batches'][0]['events']
                rows[:] = rows[:6]
                for kind, data in suffix:
                    add(kind, **data)
                RawRecorder().ingest(dict(enabled=True, dropped=0, events=rows))

    def test_partial_baseline_allows_first_removal_then_requires_matching_frames(self):
        _, capture, add = fixture('partial')
        rows = capture['batches'][0]['events']
        rows[:] = rows[:4]
        for index, present in [(1, False), (2, True), (2, False)]:
            add('media.frame', evidence='scene-instance', frame_index=index, scene_instance_id=9, present=present)
        add('media.end', evidence='scene-instance', reason='completed')
        add('media.destroy', evidence='scene-instance')
        recorder = RawRecorder()
        recorder.ingest(dict(enabled=True, dropped=0, events=rows))
        self.assertEqual(recorder.checkpoint()['media'], {})
