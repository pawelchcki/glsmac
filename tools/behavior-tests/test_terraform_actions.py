"""Corruption checks for the complete action transport, no game emulation."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from state_trace import terraform_actions as action
from test_terrain_capture import declared_transport


def declared_wire(command='farm'):
    state = declared_transport()[0]['initial']
    actor = next(row for row in state['units'] if row['id'] == 'former')
    actor.update(id='actor', raw_id=42, order='NO_ORDERS')
    state['terrain_trace']['unit_details']['actor'] = state['terrain_trace']['unit_details'].pop('former')
    state['terrain_trace']['coverage']['ui'] = True
    state['terrain_trace']['ui'] = dict(stage='declared')
    states = {stage: deepcopy(state) for stage in action.stages(command)}
    final = states['after']
    if command not in action.COMMANDS:
        for stage in ('acknowledged', 'after'):
            current = states[stage]
            next(row for row in current['units'] if row['id'] == 'actor')['movement'] = 0.0
            for quote in current['terrain_trace']['unit_details']['actor']['quotes'].values():
                quote.update(allowed_now=False, reason='Out of moves')
            current['terrain_trace']['tiles']['0,0']['terraforming']['farm'] = True
            current['terrain_trace']['tiles']['0,0']['terraforming_raw'] = 8
    binding = dict(version=1, action=command, domain='land', automation=command in action.COMMANDS,
                   rates='declared-one-turn', treasury='authored-additive10000', actor_id=42, x=0, y=0)
    end = dict(version=1, action=command, domain='land', actor_id=42,
               lifecycle='bounded-exercise-and-cancel' if command in action.COMMANDS else 'rate-one-completed',
               final_order='NO_ORDERS', final_work=final['terrain_trace']['unit_details']['actor']['work'],
               movement=dict(arithmetic='native-float32-subtraction', actual_step_count=0, movement_before=1.0, movement_after=0.0, actual_debit_mp=1.0,
                             before=dict(x=0,y=0), after=dict(x=0,y=0)))
    lines = ['TERRAFORM_ACTION_BEGIN|' + json.dumps(binding)]
    for stage, packet in states.items():
        inventory = dict(unit_ids=[row['raw_id'] for row in packet['units']], base_ids=[row['raw_id'] for row in packet['bases']])
        header = deepcopy(packet)
        chunks = {domain: header['terrain_trace'].pop(domain) for domain in action.DOMAINS}
        lines += ['TERRAIN_NATIVE|' + stage + '|' + json.dumps(inventory),
                  'TERRAIN_STAGE_BEGIN|' + stage + '|' + json.dumps(header)]
        for domain, rows in chunks.items():
            for key, value in rows.items():
                lines.append('TERRAIN_STAGE_ROW|' + stage + '|' + json.dumps(dict(domain=domain, key=key, value=value)))
        lines.append('TERRAIN_STAGE_END|' + stage + '|' + json.dumps({domain: len(rows) for domain, rows in chunks.items()}))
    lines += ['TERRAFORM_ACTION_END|' + json.dumps(end), 'BEHAVIOR_SUMMARY 1 5', 'All tests passed.']
    return '\n'.join(lines)


class TerraformActionTransportTests(unittest.TestCase):
    def test_inventory_is_twenty_six_domain_variants_and_ten_commands(self):
        self.assertEqual(len(action.CASES), 36)
        self.assertEqual(len({row[0] for row in action.CASES}), 36)
        self.assertEqual(sum(row[2] for row in action.CASES), 7)
        self.assertNotIn('monolith', {row[1] for row in action.CASES})
        self.assertEqual(len(action.COMMANDS), 10)

    def test_every_source_case_renders_unique_complete_input_only_fixture(self):
        rendered = []
        for identity, command, water in action.CASES:
            source = action.fixture_source(command, water)
            self.assertNotIn('__ACTION__', source); self.assertNotIn('__WATER__', source); self.assertNotIn('__INITIAL_RNG__', source)
            self.assertIn(action.INITIAL_SEED, source)
            self.assertIn("const action = '" + command + "';", source)
            rendered.append(source)
        self.assertEqual(len(set(rendered)), 36)
        for command, water in (('monolith', False), ('soil_enricher', True), ('farm', 0)):
            with self.subTest(command=command, water=water), self.assertRaises(ProtocolError): action.fixture_source(command, water)

    def test_observation_counts_are_case_specific(self):
        for _, command, _ in action.CASES:
            with self.subTest(command=command):
                expected = 7 if command in ('raise', 'lower') else (5 if command in action.COMMANDS else 4)
                self.assertEqual(len(action.stages(command)), expected)
                self.assertEqual(len(set(action.stages(command))), expected)
                self.assertEqual(action.stages(command)[0], 'before')
                self.assertEqual(action.stages(command)[-1], 'after')

    def test_stage_collection_diagnostics_preserve_exact_complete_packet_audit(self):
        original = declared_wire()
        staged = '\n'.join('TEST_STAGE_BEGIN declared-observation\n' + line + '\nTEST_STAGE_END declared-observation'
                           for line in original.splitlines())
        self.assertEqual(action.audit(staged, 'farm', False), action.audit(original, 'farm', False))
        # Stage markers never excuse a missing field or owner in a packet.
        broken = staged.replace('TERRAIN_STAGE_END|after|', 'LOST_STAGE_END|after|')
        with self.assertRaises(ProtocolError):
            action.audit(broken, 'farm', False)

    def test_declared_packet_has_no_original_agreement_claim(self):
        report = action.audit(declared_wire(), 'farm', False)
        self.assertEqual(report['original_passing_cases'], 0)
        self.assertEqual(tuple(report['stages']), ('before', 'queued', 'acknowledged', 'after'))
        self.assertEqual(report['deltas']['after']['tiles'], ['0,0'])

    def test_missing_duplicate_late_chunks_and_owner_resources_fail_closed(self):
        original = declared_wire(); lines = original.splitlines()
        index = next(i for i, line in enumerate(lines) if line.startswith('TERRAIN_STAGE_ROW|after|'))
        cases = ['\n'.join(lines[:index] + lines[index + 1:]),
                 '\n'.join(lines[:index] + [lines[index]] + lines[index:]),
                 original + '\n' + lines[index], original.replace('TERRAFORM_ACTION_END|', 'UNKNOWN|')]
        for wire in cases:
            with self.subTest(tail=wire[-100:]), self.assertRaises(ProtocolError): action.audit(wire, 'farm', False)

    def test_versioned_seed_binds_declared_initial_input_to_actual_native_receipt(self):
        lines = declared_wire().splitlines()
        before_rng = '1:2:3:4'
        first = json.loads(lines[0].split('|', 1)[1])
        first.update(version=2, rng=dict(stream='native-game-shared-map-and-logic',
            initial_requested=action.INITIAL_SEED, actual_before_action=before_rng,
            terrain_input='declared-16x16-flat-arid'))
        lines[0] = 'TERRAFORM_ACTION_BEGIN|' + json.dumps(first)
        for index, line in enumerate(lines):
            if line.startswith('TERRAIN_NATIVE|'):
                prefix, stage, body = line.split('|', 2)
                value = json.loads(body); value['rng'] = before_rng
                lines[index] = prefix + '|' + stage + '|' + json.dumps(value)
        wire = '\n'.join(lines)
        report = action.audit(wire, 'farm', False)
        self.assertEqual(report['input_binding']['rng']['initial_requested'], action.INITIAL_SEED)
        for field, bad in (('initial_requested', '1:2:3:4'), ('actual_before_action', '4:3:2:1'),
                           ('terrain_input', 'generated-map'), ('stream', 'made-up-stream')):
            broken = deepcopy(first); broken['rng'][field] = bad
            with self.subTest(field=field), self.assertRaises(ProtocolError):
                action.audit(wire.replace(lines[0], 'TERRAFORM_ACTION_BEGIN|' + json.dumps(broken)), 'farm', False)

    def test_complete_packets_never_override_failed_native_shutdown(self):
        # Diagnostic packet agreement is possible even if shutdown fails after
        # the body/footer. Only the real process status can certify execution.
        wire = declared_wire() + '\nAborted(std::bad_alloc during shutdown)'
        self.assertEqual(action.audit(wire, 'farm', False)['status'], 'passed')
        execution = dict(candidate_executed=True, process_returncode=1, status='error')
        failure = action.NativeCaptureError('Native observation worker failed', execution, wire)
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with patch.object(action, 'capture_script', side_effect=failure):
                report = action.execute(Path('/declared/immutable/GLSMAC.js'),
                                        ('land:farm', 'farm', False), directory, 240)
            self.assertEqual(report['status'], 'error')
            self.assertTrue(report['candidate_executed'])
            self.assertEqual(report['execution']['process_returncode'], 1)
            self.assertEqual(report['original_passing_cases'], 0)
            self.assertEqual((directory / 'land-farm.log').read_text(), wire)
            self.assertEqual(json.loads((directory / 'land-farm.json').read_text())['status'], 'error')

    def test_actual_debit_cannot_be_replaced_by_a_quote_or_invented_step(self):
        original = declared_wire()
        for wrong in (original.replace('"actual_debit_mp": 1.0', '"actual_debit_mp": 0.0'),
                      original.replace('"actual_step_count": 0', '"actual_step_count": 1'),
                      original.replace('"movement_after": 0.0', '"movement_after": 1.0')):
            with self.subTest(tail=wrong[-100:]), self.assertRaises(ProtocolError): action.audit(wrong, 'farm', False)

    def test_wrong_actor_case_or_domain_and_false_completion_scope_are_rejected(self):
        original = declared_wire()
        for wrong in (original.replace('"actor_id": 42', '"actor_id": true'),
                      original.replace('"domain": "land"', '"domain": "sea"'),
                      original.replace('rate-one-completed', 'all-original-match'),
                      original.replace('"action": "farm"', '"action": "mine"')):
            with self.subTest(tail=wrong[-100:]), self.assertRaises(ProtocolError): action.audit(wrong, 'farm', False)


if __name__ == '__main__':
    unittest.main()
