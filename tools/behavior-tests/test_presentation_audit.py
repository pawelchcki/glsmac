"""Accounting audits use synthetic candidate evidence, never original answers."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from protocol import ProtocolError
from state_trace.presentation import CLOCK, DOMAINS, SemanticRecorder
from state_trace.presentation_audit import audit_capture, main
from state_trace.presentation_projector import project_capture
from test_presentation_projector import fixture as projector_fixture


def fixture():
    inputs, capture, add = projector_fixture()
    capture['input_plan'] = inputs
    return inputs, capture, add


def empty_capture():
    inputs = dict(fixture={'requested_coverage': list(DOMAINS)},
                  actions=[dict(id='launch', kind='launch')],
                  checkpoints=[dict(id='done', after_action='launch')])
    rows = [dict(seq=1, target='trace', kind='semantic.protocol', data={'version': 2}),
            dict(seq=2, target='trace', kind='trace.protocol', data={'version': 1, 'physical_os_complete': False}),
            dict(seq=3, target='trace', kind='trace.action', data={'op': 1, 'action': 1, 'checkpoint': 0, 'nonce': 0}),
            dict(seq=4, target='trace', kind='trace.action', data={'op': 2, 'action': 1, 'checkpoint': 0, 'nonce': 1}),
            dict(seq=5, target='trace', kind='trace.checkpoint', data={'op': 3, 'checkpoint': 1, 'action': 1, 'nonce': 2})]
    capture = dict(schema='glsmac.presentation.raw.v1', batches=[dict(enabled=True, dropped=0, events=rows)],
                   input_plan=inputs, input_checkpoints=[dict(id='done', after_action='launch', checkpoint=1)])
    return inputs, capture, rows


def attributed_capture():
    inputs, capture, rows = empty_capture()
    inputs['actions'].extend([dict(id='second', kind='key.press'), dict(id='third', kind='key.press')])
    inputs['checkpoints'].extend([dict(id='second-done', after_action='second'), dict(id='third-done', after_action='third')])
    capture['input_checkpoints'].extend([dict(id='second-done', after_action='second', checkpoint=2),
                                        dict(id='third-done', after_action='third', checkpoint=3)])
    additions = [
        ('trace.action', 'trace', dict(op=1, action=2, checkpoint=0, nonce=3)),
        ('node.create', 'control', dict(parent=None, tag='$button')),
        ('semantic.role', 'control', dict(role='button', source='', constructor=True)),
        ('trace.action', 'trace', dict(op=2, action=2, checkpoint=0, nonce=4)),
        ('trace.checkpoint', 'trace', dict(op=3, action=2, checkpoint=2, nonce=5)),
        ('trace.action', 'trace', dict(op=1, action=3, checkpoint=0, nonce=6)),
        ('node.show', 'control', {}),
        ('trace.action', 'trace', dict(op=2, action=3, checkpoint=0, nonce=7)),
        ('trace.checkpoint', 'trace', dict(op=3, action=3, checkpoint=3, nonce=8)),
        ('node.hide', 'control', {})]
    for kind, target, data in additions:
        rows.append(dict(seq=len(rows) + 1, kind=kind, target=target, data=data))
    return capture, project_capture(capture, inputs)


def animation_capture():
    inputs, capture, rows = empty_capture()
    rows[3:3] = [
        dict(kind='media.create', target='animation', data=dict(type='animation', source='synthetic',
             duration_ms=300, frame_count=3, x=1.0, y=2.0, z=0.0, evidence='native-registration', history='from-construction')),
        dict(kind='media.start', target='animation', data=dict(evidence='scene-instance')),
        dict(kind='media.frame', target='animation', data=dict(evidence='scene-instance', frame_index=0, scene_instance_id=7, present=True))]
    for sequence, event in enumerate(rows, 1): event['seq'] = sequence
    return capture, project_capture(capture, inputs)


def reconstruct(projection):
    """Make altered canonical events and their snapshots internally consistent."""
    resequence(projection)
    reducer = SemanticRecorder()
    for state in [point['state']['presentation'] for point in projection['checkpoints']] + [projection['diagnostics']['tail_presentation']]:
        for event in state['events']:
            reducer.record(event)
        snapshot = reducer.checkpoint()
        state.clear()
        state.update(snapshot)


def evidence():
    inputs, capture, _ = fixture()
    capture.update(schema='glsmac.presentation.raw.v1', clock=deepcopy(CLOCK), coverage={})
    capture['capture'] = dict(terminal_drain_observed=True, ended_at='atomic-native-seal',
                              final_event_sequence=len(capture['batches'][0]['events']),
                              final_quiet_observed=True)
    return capture, project_capture(capture, inputs)


def resequence(projection):
    sequence = 0
    for state in [point['state']['presentation'] for point in projection['checkpoints']] + [projection['diagnostics']['tail_presentation']]:
        for event in state['events']:
            sequence += 1
            event['seq'] = sequence


class AuditTests(unittest.TestCase):
    def test_coherently_altered_animation_frame_cannot_override_raw_source(self):
        capture, projection = animation_capture()
        self.assertTrue(audit_capture(capture, projection)['semantic_understood'])
        event = next(event for event in projection['checkpoints'][0]['state']['presentation']['events']
                     if event['domain'] == 'animation' and event['fields'].get('frame_index') == 0)
        event['fields']['frame_index'] = 2
        reconstruct(projection)
        with self.assertRaisesRegex(ProtocolError, 'animation.*source'):
            audit_capture(capture, projection)

    def test_animation_birth_metadata_is_bound_to_exact_raw_registration(self):
        for field, value in [('source', 'invented'), ('duration_ms', 999), ('frame_count', 99),
                             ('coordinates', {'x': 9, 'y': 2, 'z': 0}), ('history', 'partial'),
                             ('evidence', 'device'), ('role', 'invented'), ('evidence_scope', 'rendered')]:
            capture, projection = animation_capture()
            event = next(event for event in projection['checkpoints'][0]['state']['presentation']['events']
                         if event['domain'] == 'animation' and event['kind'] == 'create')
            event['fields'][field] = value
            reconstruct(projection)
            with self.subTest(field=field), self.assertRaisesRegex(ProtocolError, 'animation.*source'):
                audit_capture(capture, projection)

    def test_animation_frame_identity_presence_and_evidence_are_bound_to_raw_source(self):
        for field, value in [('scene_instance_id', 99), ('present', False), ('evidence', 'device'), ('lifecycle', 'frame-removed')]:
            capture, projection = animation_capture()
            event = next(event for event in projection['checkpoints'][0]['state']['presentation']['events']
                         if event['domain'] == 'animation' and event['fields'].get('frame_index') == 0)
            event['fields'][field] = value
            reconstruct(projection)
            with self.subTest(field=field), self.assertRaisesRegex(ProtocolError, 'animation.*source'):
                audit_capture(capture, projection)

    def test_each_typed_animation_raw_event_requires_one_canonical_transition(self):
        for corruption in ('omit-all', 'omit-start', 'omit-frame', 'duplicate-frame', 'extra-unrelated-update'):
            capture, projection = animation_capture()
            events = projection['checkpoints'][0]['state']['presentation']['events']
            start = next(event for event in events if event['domain'] == 'animation' and event['fields'].get('lifecycle') == 'started')
            frame = next(event for event in events if event['domain'] == 'animation' and event['fields'].get('lifecycle') == 'frame-submitted')
            if corruption == 'omit-all': events[:] = [event for event in events if event['domain'] != 'animation']
            elif corruption == 'omit-start': events.remove(start)
            elif corruption == 'omit-frame': events.remove(frame)
            elif corruption == 'duplicate-frame': events.insert(events.index(frame), deepcopy(frame))
            else:
                index = next(i for i, event in enumerate(events) if event['kind'] == 'observed'
                             and event['fields']['kind'] == 'trace.action' and event['fields']['data']['op'] == 2)
                events.insert(index, deepcopy(frame))
            reconstruct(projection)
            with self.subTest(corruption=corruption), self.assertRaisesRegex(ProtocolError, 'animation.*source'):
                audit_capture(capture, projection)

    def test_animation_removal_termination_and_retirement_match_raw_sources(self):
        for termination in ('stop', 'end'):
            capture, _ = animation_capture()
            rows = capture['batches'][0]['events']
            tail = [('media.frame', dict(evidence='scene-instance', frame_index=0, scene_instance_id=7, present=False))]
            if termination == 'end':
                for frame in (1, 2):
                    tail.extend([('media.frame', dict(evidence='scene-instance', frame_index=frame, scene_instance_id=7 + frame, present=True)),
                                 ('media.frame', dict(evidence='scene-instance', frame_index=frame, scene_instance_id=7 + frame, present=False))])
            tail.extend([('media.' + termination, dict(evidence='scene-instance', reason='cancelled' if termination == 'stop' else 'completed')),
                         ('media.destroy', dict(evidence='scene-instance'))])
            for kind, data in tail: rows.append(dict(seq=len(rows) + 1, kind=kind, target='animation', data=data))
            projection = project_capture(capture, capture['input_plan'])
            self.assertTrue(audit_capture(capture, projection)['valid'])
            for corruption in ('remove-index', 'remove-instance', 'termination', 'destroy'):
                altered = deepcopy(projection)
                events = altered['diagnostics']['tail_presentation']['events']
                if corruption.startswith('remove'):
                    event = next(event for event in events if event['domain'] == 'animation' and event['fields'].get('lifecycle') == 'frame-removed')
                    event['fields']['frame_index' if corruption == 'remove-index' else 'scene_instance_id'] = 0
                elif corruption == 'termination':
                    event = next(event for event in events if event['domain'] == 'animation' and event['fields'].get('lifecycle') in ('completed', 'cancelled'))
                    event['fields']['lifecycle'] = 'started'
                else:
                    event = next(event for event in events if event['domain'] == 'animation' and event['kind'] == 'destroy')
                    event['fields']['invented'] = True
                reconstruct(altered)
                with self.subTest(termination=termination, corruption=corruption), self.assertRaisesRegex(ProtocolError, 'animation.*source'):
                    audit_capture(capture, altered)

    def test_retired_transient_unavailability_remains_historical_evidence(self):
        for location in ('checkpoint', 'terminal-tail'):
            inputs, capture, rows = empty_capture()
            additions = [
                dict(kind='node.create', target='transient', data={'parent': None, 'tag': '$button'}),
                dict(kind='semantic.role', target='transient', data={'role': 'button', 'source': '', 'constructor': True}),
                dict(kind='node.destroy', target='transient', data={})]
            if location == 'checkpoint': rows[3:3] = additions
            else: rows.extend(additions)
            for sequence, event in enumerate(rows, 1): event['seq'] = sequence
            report = audit_capture(capture, project_capture(capture, inputs))
            self.assertFalse(report['unknown_events'])
            self.assertFalse(report['unknown_objects'])
            with self.subTest(location=location):
                self.assertFalse(report['semantic_understood'])
                historical = [field for field in report['unavailable_fields'] if field.get('semantic_event_sequence')]
                self.assertTrue(historical)
                self.assertTrue(all(field['raw_sequence'] > 0 for field in historical))
                self.assertTrue(all(field['identity'] == 'candidate-birth:transient' for field in historical))
                self.assertTrue(all(field['checkpoint'] == ('done' if location == 'checkpoint' else 'terminal-tail') for field in historical))

    def test_unavailable_update_history_survives_later_resolution_and_retirement(self):
        inputs, capture, rows = empty_capture()
        rows[3:3] = [
            dict(kind='node.create', target='transient', data={'parent': None, 'tag': '$button'}),
            dict(kind='semantic.role', target='transient', data={'role': 'button', 'source': '', 'constructor': True}),
            dict(kind='node.show', target='transient', data={}),
            dict(kind='node.hide', target='transient', data={}),
            dict(kind='node.destroy', target='transient', data={})]
        for sequence, event in enumerate(rows, 1): event['seq'] = sequence
        projection = project_capture(capture, inputs)
        updates = [event for event in projection['checkpoints'][0]['state']['presentation']['events']
                   if event['domain'] == 'widgets' and event['kind'] == 'update' and 'visible_local' in event['fields']]
        updates[0]['fields']['field_availability'] = {'transient-field': 'unavailable until sampled'}
        updates[-1]['fields']['field_availability'] = {'transient-field': 'actual native field'}
        reconstruct(projection)
        report = audit_capture(capture, projection)
        unavailable = [field for field in report['unavailable_fields'] if field['field'] == 'transient-field']
        self.assertEqual(len(unavailable), 1)
        self.assertEqual(unavailable[0]['semantic_event_sequence'], updates[0]['seq'])
        self.assertEqual(unavailable[0]['reason'], 'unavailable until sampled')
        self.assertFalse(report['semantic_understood'])

    def test_every_checkpoint_requires_exact_complete_boolean_coverage_keys(self):
        for corruption in ('empty', 'missing', 'unknown', 'integer'):
            capture, projection = evidence()
            coverage = projection['checkpoints'][0]['coverage']
            if corruption == 'empty': coverage.clear()
            elif corruption == 'missing': del coverage['presentation.audio.output']
            elif corruption == 'unknown': coverage['presentation.invented'] = False
            else: coverage['presentation.widgets'] = 0
            with self.subTest(corruption=corruption), self.assertRaisesRegex(ProtocolError, 'coverage'):
                audit_capture(capture, projection)

    def test_valid_semantic_actions_match_source_before_action_fence_and_in_tail(self):
        capture, projection = attributed_capture()
        self.assertTrue(audit_capture(capture, projection)['valid'])
        first = projection['checkpoints'][0]['state']['presentation']['events']
        self.assertEqual([event['after_input'] for event in first], ['initial', 'initial', 'launch', 'launch', 'launch'])
        second = projection['checkpoints'][1]['state']['presentation']['events']
        self.assertTrue(all(event['after_input'] == 'second' for event in second))
        self.assertTrue(all(event['after_input'] == 'third' for event in projection['diagnostics']['tail_presentation']['events']))

    def test_invented_after_input_rejected_for_canonical_and_observed_events(self):
        for kind in ('create', 'observed'):
            capture, projection = attributed_capture()
            event = next(event for event in projection['checkpoints'][1]['state']['presentation']['events'] if event['kind'] == kind)
            event['after_input'] = 'invented-action'
            with self.subTest(kind=kind), self.assertRaisesRegex(ProtocolError, 'after_input differs from native source action'):
                audit_capture(capture, projection)

    def test_wrong_valid_future_and_backward_after_input_rejected(self):
        for checkpoint_index, wrong in ((0, 'second'), (1, 'launch'), (1, 'third'), (2, 'second')):
            capture, projection = attributed_capture()
            event = projection['checkpoints'][checkpoint_index]['state']['presentation']['events'][-1]
            event['after_input'] = wrong
            with self.subTest(checkpoint=checkpoint_index, wrong=wrong), self.assertRaisesRegex(ProtocolError, 'after_input differs from native source action'):
                audit_capture(capture, projection)

    def test_tail_only_wrong_valid_after_input_rejected_for_every_semantic_event_kind(self):
        for kind in ('update', 'observed'):
            capture, projection = attributed_capture()
            event = next(event for event in projection['diagnostics']['tail_presentation']['events'] if event['kind'] == kind)
            event['after_input'] = 'second'
            with self.subTest(kind=kind), self.assertRaisesRegex(ProtocolError, 'after_input differs from native source action'):
                audit_capture(capture, projection)

    def test_missing_or_invalid_bound_input_plan_fails_closed(self):
        for corruption in ('missing', 'invalid-action', 'missing-named-checkpoints'):
            capture, projection = attributed_capture()
            if corruption == 'missing': del capture['input_plan']
            elif corruption == 'invalid-action': capture['input_plan']['actions'][1]['id'] = 'launch'
            else: del capture['input_plan']['checkpoints']
            with self.subTest(corruption=corruption), self.assertRaises(ProtocolError):
                audit_capture(capture, projection)

    def test_checkpoint_names_indexes_actions_and_order_match_bound_plan(self):
        for corruption in ('name', 'index', 'action', 'declaration', 'order'):
            capture, projection = attributed_capture()
            if corruption == 'name':
                capture['input_checkpoints'][1]['id'] = projection['checkpoints'][1]['id'] = 'invented'
            elif corruption == 'index':
                capture['input_checkpoints'][1]['checkpoint'] = 3
            elif corruption == 'action':
                capture['input_checkpoints'][1]['after_action'] = projection['checkpoints'][1]['after_action'] = 'third'
            elif corruption == 'declaration':
                capture['input_plan']['checkpoints'][1]['after_action'] = 'third'
            else:
                capture['input_checkpoints'][0], capture['input_checkpoints'][1] = capture['input_checkpoints'][1], capture['input_checkpoints'][0]
                projection['checkpoints'][0], projection['checkpoints'][1] = projection['checkpoints'][1], projection['checkpoints'][0]
            with self.subTest(corruption=corruption), self.assertRaises(ProtocolError):
                audit_capture(capture, projection)

    def test_native_source_action_fences_cannot_move_backward_or_skip_actions(self):
        for action in (1, 3):
            capture, projection = attributed_capture()
            event = next(event for event in capture['batches'][0]['events']
                         if event['kind'] == 'trace.action' and event['data']['op'] == 1 and event['data']['action'] == 2)
            event['data']['action'] = action
            with self.subTest(action=action), self.assertRaisesRegex(ProtocolError, 'native action begin'):
                audit_capture(capture, projection)

    def test_reconciles_all_events_births_retirements_and_unknown_transients(self):
        capture, projection = evidence()
        report = audit_capture(capture, projection)
        self.assertTrue(report['valid'])
        self.assertTrue(report['transport_complete'])
        self.assertFalse(report['semantic_understood'])
        self.assertEqual(report['status'], 'incomplete')
        self.assertEqual(report['checkpoints'][0]['native_birth_count'], 10)
        self.assertEqual(report['checkpoints'][0]['native_retired_count'], 1)
        self.assertEqual(report['checkpoints'][0]['native_live_nodes'], 9)
        self.assertEqual(report['checkpoints'][0]['raw_prefix_event_count'], len(capture['batches'][0]['events']))
        self.assertIsNotNone(report['unknown_objects']['n9']['retirement_sequence'])
        self.assertTrue(any(event['target'] == 'n9' for event in report['unknown_events']))
        self.assertTrue(any(event['kind'] == 'node.opaque' for event in report['unmapped_fields']))
        self.assertEqual(set(report['coverage']), set(DOMAINS))
        self.assertTrue(all(not channel['complete'] and channel['missing_capability_reasons']
                            for channel in report['coverage'].values()))
        self.assertFalse(report['exhaustive_coverage_complete'])
        self.assertFalse(report['rendered_output_observed'])
        self.assertEqual(report, audit_capture(deepcopy(capture), deepcopy(projection)))

    def test_quiet_and_true_declarations_cannot_promote_coverage(self):
        capture, projection = evidence()
        capture['coverage'] = {name: True for name in DOMAINS}
        projection['checkpoints'][0]['coverage'] = {'presentation.' + name: True for name in DOMAINS}
        projection['diagnostics']['coverage_complete'] = True
        report = audit_capture(capture, projection)
        self.assertFalse(report['exhaustive_coverage_complete'])
        self.assertEqual(report['status'], 'incomplete')
        self.assertTrue(all(report['declared_checkpoint_coverage']['ready'].values()))
        self.assertTrue(all(not value['complete'] for value in report['coverage'].values()))

    def test_no_channel_events_does_not_prove_complete_channel(self):
        inputs, capture, _ = empty_capture()
        report = audit_capture(capture, project_capture(capture, inputs))
        self.assertTrue(report['semantic_understood'])
        self.assertFalse(report['transport_complete'])
        self.assertTrue(all(not channel['complete'] for channel in report['coverage'].values()))

    def test_unsealed_prefix_is_valid_but_transport_incomplete(self):
        capture, projection = evidence()
        capture['capture'].update(terminal_drain_observed=False, ended_at='last-periodic-drain-only')
        report = audit_capture(capture, projection)
        self.assertFalse(report['transport_complete'])
        self.assertTrue(report['transport_gaps'])

    def test_dropped_gapped_disabled_and_incorrect_final_sequence_rejected(self):
        for corruption in ('loss', 'gap', 'disabled', 'final-sequence', 'seal'):
            capture, projection = evidence()
            if corruption == 'loss': capture['batches'][0]['dropped'] = 1
            elif corruption == 'gap': capture['batches'][0]['events'][3]['seq'] += 1
            elif corruption == 'disabled': capture['batches'][0]['enabled'] = False
            elif corruption == 'final-sequence': capture['capture']['final_event_sequence'] -= 1
            elif corruption == 'seal': capture['capture']['ended_at'] = 'periodic'
            with self.subTest(corruption=corruption), self.assertRaises(ProtocolError):
                audit_capture(capture, projection)

    def test_observation_omission_duplication_payload_change_and_disposition_domain_rejected(self):
        for corruption in ('omit', 'duplicate', 'payload', 'domain', 'identity', 'order'):
            capture, projection = evidence()
            events = projection['checkpoints'][0]['state']['presentation']['events']
            index = next(i for i, event in enumerate(events) if event['kind'] == 'observed')
            if corruption == 'omit': del events[index]
            elif corruption == 'duplicate': events.insert(index, deepcopy(events[index]))
            elif corruption == 'payload': events[index]['fields']['data']['version'] = 99
            elif corruption == 'domain': events[index]['domain'] = 'unknown'
            elif corruption == 'identity': events[index]['object_id'] = 'candidate-birth:wrong'
            elif corruption == 'order': events[index]['fields']['raw_sequence'] += 1
            resequence(projection)
            with self.subTest(corruption=corruption), self.assertRaises(ProtocolError):
                audit_capture(capture, projection)

    def test_birth_retirement_count_and_retired_unknown_omission_rejected(self):
        for corruption in ('birth', 'retirement', 'missing-birth', 'extra-birth', 'count', 'unknown', 'observed-count', 'final-watermark'):
            capture, projection = evidence()
            diag = projection['diagnostics']
            if corruption == 'birth': diag['dispositions']['n9']['birth_sequence'] += 1
            elif corruption == 'retirement': diag['dispositions']['n9']['retirement_sequence'] = None
            elif corruption == 'missing-birth': del diag['dispositions']['n9']
            elif corruption == 'extra-birth': diag['dispositions']['invented'] = deepcopy(diag['dispositions']['n9'])
            elif corruption == 'count': diag['counts']['unknown'] -= 1
            elif corruption == 'unknown': del diag['unknown_inventory']['n9']
            elif corruption == 'observed-count': diag['observed_events'] -= 1
            elif corruption == 'final-watermark': diag['source_final_sequence'] -= 1
            with self.subTest(corruption=corruption), self.assertRaises(ProtocolError):
                audit_capture(capture, projection)

    def test_semantic_snapshot_and_hidden_logical_birth_rejected(self):
        capture, projection = evidence()
        projection['checkpoints'][0]['state']['presentation']['objects']['candidate-birth:n1']['text'] = 'invented'
        with self.assertRaisesRegex(ProtocolError, 'snapshot differs'):
            audit_capture(capture, projection)
        capture, projection = evidence()
        identity = 'candidate-birth:n2'
        state = projection['checkpoints'][0]['state']['presentation']
        state['events'] = [event for event in state['events'] if not (event['object_id'] == identity and event['kind'] != 'observed')]
        del state['objects'][identity]
        del projection['diagnostics']['tail_presentation']['objects'][identity]
        resequence(projection)
        with self.assertRaisesRegex(ProtocolError, 'logical birth'):
            audit_capture(capture, projection)

    def test_logical_animation_media_and_retired_unknown_audio_are_distinct(self):
        inputs, capture, _ = fixture()
        rows = capture['batches'][0]['events']
        rows[-2:-2] = [
            dict(kind='media.create', target='animation', data=dict(type='animation', source='synthetic',
                 duration_ms=100, frame_count=2, x=0, y=0, z=0, evidence='native-registration', history='from-construction')),
            dict(kind='media.start', target='animation', data=dict(evidence='scene-instance')),
            dict(kind='media.frame', target='animation', data=dict(evidence='scene-instance', frame_index=0, scene_instance_id=1, present=True)),
            dict(kind='media.create', target='audio', data=dict(type='audio', source='synthetic.wav')),
            dict(kind='media.destroy', target='audio', data=dict(evidence='request'))]
        for sequence, event in enumerate(rows, 1): event['seq'] = sequence
        capture['schema'] = 'glsmac.presentation.raw.v1'
        report = audit_capture(capture, project_capture(capture, inputs))
        self.assertEqual(report['checkpoints'][0]['native_live_media'], 1)
        self.assertEqual(report['checkpoints'][0]['semantic_live_media'], 1)
        self.assertNotIn('animation', report['unknown_objects'])
        self.assertIsNotNone(report['unknown_objects']['audio']['retirement_sequence'])
        self.assertEqual(report['raw_event_kinds']['media.frame'], 1)
        self.assertFalse(report['coverage']['animation.frames']['complete'])
        self.assertFalse(report['rendered_output_observed'])

    def test_multi_checkpoint_prefix_counts_and_tail_preserve_all_events(self):
        inputs, capture, add = fixture()
        first_boundary = len(capture['batches'][0]['events'])
        add('node.create', 'transient', parent='n1', tag='$unexpected')
        add('node.destroy', 'transient')
        add('trace.checkpoint', op=3, action=1, checkpoint=2, nonce=3)
        second_boundary = len(capture['batches'][0]['events'])
        capture['input_checkpoints'].append(dict(id='later', after_action='launch', checkpoint=2))
        inputs['checkpoints'].append(dict(id='later', after_action='launch'))
        add('node.create', 'tail', parent='n1', tag='$unexpected')
        add('node.destroy', 'tail')
        capture['schema'] = 'glsmac.presentation.raw.v1'
        projection = project_capture(capture, inputs)
        report = audit_capture(capture, projection)
        self.assertEqual([point['raw_prefix_event_count'] for point in report['checkpoints']], [first_boundary, second_boundary])
        self.assertEqual(report['checkpoints'][1]['raw_interval_event_count'], 3)
        self.assertEqual(report['tail']['raw_interval_event_count'], 2)
        self.assertEqual(report['tail']['native_birth_count'], 12)
        self.assertEqual(report['tail']['native_retired_count'], 3)
        self.assertIn('tail', report['unknown_objects'])
        del projection['diagnostics']['tail_presentation']['events'][-1]
        with self.assertRaises(ProtocolError): audit_capture(capture, projection)

    def test_changed_or_omitted_checkpoint_watermark_and_tail_rejected(self):
        for corruption in ('omit', 'watermark', 'tail'):
            capture, projection = evidence()
            if corruption == 'omit': capture['input_checkpoints'] = []
            elif corruption == 'watermark': capture['input_checkpoints'][0]['watermark'] = 1
            elif corruption == 'tail': projection['diagnostics']['raw_tail'] = [{'invented': True}]
            with self.subTest(corruption=corruption), self.assertRaises(ProtocolError):
                audit_capture(capture, projection)

    def test_immutable_prefix_top_level_watermark_must_match_last_fence(self):
        capture, projection = evidence()
        capture['capture'].update(terminal_drain_observed=False, ended_at='acknowledged-input-barrier')
        capture['checkpoint'] = dict(id='ready', after_action='launch', watermark=len(capture['batches'][0]['events']))
        report = audit_capture(capture, projection)
        self.assertFalse(report['transport_complete'])
        self.assertEqual(report['checkpoint_prefix'], capture['checkpoint'])
        capture['checkpoint']['watermark'] -= 1
        with self.assertRaisesRegex(ProtocolError, 'prefix identity/watermark'):
            audit_capture(capture, projection)

    def test_raw_observation_json_types_are_not_coerced(self):
        capture, projection = evidence()
        observed = next(event for event in projection['checkpoints'][0]['state']['presentation']['events']
                        if event['kind'] == 'observed' and event['fields']['kind'] == 'trace.protocol')
        observed['fields']['data']['version'] = True
        with self.assertRaisesRegex(ProtocolError, 'raw payload differs'):
            audit_capture(capture, projection)

    def test_tail_only_logical_unavailable_fields_prevent_semantic_understanding(self):
        inputs, capture, rows = empty_capture()
        self.assertTrue(audit_capture(capture, project_capture(capture, inputs))['semantic_understood'])
        rows.extend([
            dict(seq=6, target='tail-widget', kind='node.create', data={'parent': None, 'tag': '$button'}),
            dict(seq=7, target='tail-widget', kind='semantic.role',
                 data={'role': 'button', 'source': '', 'constructor': True})])
        report = audit_capture(capture, project_capture(capture, inputs))
        self.assertFalse(report['unknown_events'])
        self.assertFalse(report['unknown_objects'])
        self.assertFalse(report['semantic_understood'])
        self.assertTrue(report['unavailable_fields'])
        self.assertTrue(all(field['checkpoint'] == 'terminal-tail' and field['identity'] == 'candidate-birth:tail-widget'
                            for field in report['unavailable_fields']))

    def test_cli_diagnostic_complete_gate_and_stale_result_replacement(self):
        capture, projection = evidence()
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            raw, semantic, output = [directory / name for name in ('raw.json', 'semantic.json', 'audit.json')]
            raw.write_text(json.dumps(capture)); semantic.write_text(json.dumps(projection))
            args = ['--capture', str(raw), '--projection', str(semantic), '--output', str(output)]
            self.assertEqual(main(args), 0)
            self.assertEqual(main(args + ['--require-complete']), 1)
            self.assertEqual(json.loads(output.read_text())['status'], 'incomplete')
            raw.write_text('{}')
            self.assertEqual(main(args), 2)
            report = json.loads(output.read_text())
            self.assertFalse(report['valid'])
            self.assertEqual(report['status'], 'invalid')
            self.assertNotIn('checkpoints', report)


if __name__ == '__main__':
    unittest.main()
