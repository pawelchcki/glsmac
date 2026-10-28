"""Asset-free read/exit/purity boundary checks. No Native or reference credit.

The synthetic world isolates this new evaluator from the existing strict terrain
schema validator. Every acceptance path still calls that production validator;
its real schema tests run separately and a non-mocked rejection is checked here.
"""
import copy
import hashlib
import json
import unittest
from unittest.mock import patch
from protocol import ProtocolError
from state_trace import unit_body_census_proof as proof
from test_unit_body_census import fixture as small_census, vec


def fixture():
    census = small_census(); base = copy.deepcopy(census['units'][0])
    rows, units, scalars, players, bases, details = [], [], [], [], [], {}
    for index in range(9):
        uid = index + 1
        owner = index if index < 7 else 0
        row = copy.deepcopy(base); row.update(unit_id=str(uid), manager_unit_id=str(uid), owner_id=str(owner), definition_id='ScoutPatrol')
        row['instance_state'] = 'present' if uid == 8 else ('absent' if uid == 9 else 'unallocated')
        row['unit_shown'] = uid == 8
        if uid != 8:
            del row['instance_position']; del row['instance_angle']
            if uid == 9: row['instance_id'] = '2'
            else: del row['instance_id']
        rows.append(row)
        identity = 'unit:' + str(uid)
        units.append(dict(id=identity, raw_id=uid, owner='player:' + str(owner), x=8, y=8,
                          prototype='scout-patrol', health=1.0, movement=1.0,
                          morale=1 if uid == 9 else 2, order='NO_ORDERS'))
        scalars.append(dict(unit_id=uid, owner_id=owner, id_type='Int', owner_type='Int',
                            health_type='Float', health_bits=1065353216,
                            movement_type='Float', movement_bits=1065353216))
        details[identity] = dict(definition_id='ScoutPatrol')
    census.update(known_frontend_units=9, units=rows,
                  owner_counts=[dict(owner_id=str(i), units=3 if i == 0 else 1) for i in range(7)])
    players = [dict(id='player:' + str(i), raw_id=i) for i in range(7)]
    bases = [dict(id='base:' + str(i), raw_id=i + 1, owner='player:' + str(i)) for i in range(7)]
    world = dict(width=16, height=16, players=players, bases=bases, units=units, turn=1,
                 terrain_trace=dict(unit_details=details, tiles={str(i): {} for i in range(128)}))
    ui = dict(bound_unit_id=8, rendered_unit_id=8, selected_unit_id=None)
    state = dict(event_serial=2, ui=ui, last_tile=dict(serial=1, x=8, y=8),
                 last_preview=dict(serial=2, unit_id=8))
    events = [dict(serial=1, kind='tile-select', data=dict(x=8, y=8)),
              dict(serial=2, kind='native-unit-preview', data=dict(unit_id=8))]
    result = dict(schema=proof.SCHEMA, actors=dict(a=8, b=9, owner=0), selection_fence=0, fence=2,
                  reads=2, events=events, before=copy.deepcopy(state), after=copy.deepcopy(state))
    return dict(result=result,
                checkpoints=[dict(label=label, state=copy.deepcopy(state), world=copy.deepcopy(world),
                                  native_unit_scalars=copy.deepcopy(scalars)) for label in ('before', 'after')],
                reads=[dict(ordinal=i, event_serial=2, ui=copy.deepcopy(ui), payload=json.dumps(census)) for i in (1, 2)])


def log(record):
    lines = ['UB_EVENT|' + json.dumps(event) for event in record['result']['events']]
    lines += ['UB_CHECKPOINT|' + json.dumps(record['checkpoints'][0])]
    lines += ['UB_CENSUS|' + json.dumps(read) for read in record['reads']]
    lines += ['UB_CHECKPOINT|' + json.dumps(record['checkpoints'][1]), 'UB_RESULT|' + json.dumps(record['result'])]
    return '\n'.join(lines) + '\n'


def acceptance(text):
    digest = hashlib.sha256(text.encode()).hexdigest()
    return dict(native_exit_code=0, browser_closed=True, server_reaped=True,
                log=dict(sealed=True, partial=False, raw_sha256=digest, joined_chunk_sha256=digest),
                hook=dict(main_acknowledgements=1, worker_acknowledgements=8, runtime_out_bound=True,
                          runtime_err_bound=True, runtime_callMain_present=True))


class StaticCensusProofTests(unittest.TestCase):
    def evaluate(self, record):
        text = log(record)
        with patch.object(proof.terrain_observation, 'validate_snapshot', side_effect=lambda world: world) as validator:
            result = proof.evaluate(text, acceptance(text))
            self.assertEqual(validator.call_count, 2)
            return result

    def test_synthetic_complete_static_boundary(self):
        result = self.evaluate(fixture())
        self.assertTrue(result['match']); self.assertEqual(result['selected_unit_id'], 8)
        self.assertFalse(result['candidate_executed']); self.assertEqual(result['original_passing_cases'], 0)
        self.assertFalse(result['supported']['movement_timing'])

    def test_existing_strict_terrain_schema_is_not_bypassed(self):
        text = log(fixture())  # This deliberately simplified unit-test world is not a real terrain packet.
        with self.assertRaises(ProtocolError): proof.evaluate(text, acceptance(text))

    def test_exit_close_seal_hash_or_ack_failure_reject_before_observation(self):
        text = log(fixture())
        for kind in ('exit', 'close', 'server', 'seal', 'partial', 'hash', 'worker', 'main', 'out', 'callMain'):
            control = acceptance(text)
            if kind == 'exit': control['native_exit_code'] = 1
            elif kind == 'close': control['browser_closed'] = False
            elif kind == 'server': control['server_reaped'] = False
            elif kind == 'seal': control['log']['sealed'] = False
            elif kind == 'partial': control['log']['partial'] = True
            elif kind == 'hash': control['log']['joined_chunk_sha256'] = '0' * 64
            elif kind == 'worker': control['hook']['worker_acknowledgements'] = 7
            elif kind == 'main': control['hook']['main_acknowledgements'] = True
            elif kind == 'out': control['hook']['runtime_out_bound'] = False
            else: control['hook']['runtime_callMain_present'] = False
            with self.subTest(kind=kind), patch.object(proof, 'parse') as parser, self.assertRaises(ProtocolError):
                proof.evaluate(text, control)
                parser.assert_not_called()

    def test_missing_reordered_duplicate_reads_or_post_result_event_reject(self):
        text = log(fixture()); lines = text.splitlines()
        cases = ['\n'.join(lines[:3] + lines[4:]), '\n'.join(lines[:3] + [lines[4], lines[3]] + lines[5:]),
                 text + lines[0] + '\n', text.replace('"ordinal": 2', '"ordinal": 1')]
        for value in cases:
            with self.subTest(value=value[-100:]), self.assertRaises(ProtocolError): proof.parse(value)

    def test_actual_native_callback_prefix_and_current_ui_required(self):
        for kind in ('preview', 'tile', 'stale', 'ui', 'typed-ui', 'fence', 'event-gap'):
            value = fixture()
            if kind == 'preview': value['result']['events'][1]['data']['unit_id'] = 9
            elif kind == 'tile': value['result']['events'][0]['data']['x'] = 10
            elif kind == 'stale': value['result']['selection_fence'] = 2
            elif kind == 'ui': value['reads'][0]['ui']['bound_unit_id'] = 9
            elif kind == 'typed-ui': value['reads'][0]['ui']['bound_unit_id'] = 8.0
            elif kind == 'fence': value['reads'][1]['event_serial'] = 1
            else: value['result']['events'][1]['serial'] = 3
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): self.evaluate(value)

    def test_after_checkpoint_cannot_replace_before_snapshot(self):
        value = fixture(); value['checkpoints'][0]['state']['ui']['rendered_unit_id'] = 9
        with self.assertRaises(ProtocolError): self.evaluate(value)

    def test_foreign_units_and_all_player_inventories_required(self):
        for kind in ('foreign-unit', 'owner', 'base', 'tile', 'definition'):
            value = fixture()
            if kind == 'foreign-unit': value['checkpoints'][1]['world']['units'].pop(6)
            elif kind == 'owner': value['checkpoints'][0]['world']['players'].pop()
            elif kind == 'base': value['checkpoints'][0]['world']['bases'].pop()
            elif kind == 'tile': value['checkpoints'][0]['world']['terrain_trace']['tiles'].pop('127')
            else: value['checkpoints'][1]['world']['terrain_trace']['unit_details']['unit:7']['definition_id'] = 'Former'
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): self.evaluate(value)

    def test_census_must_not_change_world_or_native_f32_bits(self):
        for kind in ('world', 'bits', 'type', 'signed-zero'):
            value = fixture()
            if kind == 'world': value['checkpoints'][1]['world']['units'][6]['order'] = 'HOLD'
            elif kind == 'bits': value['checkpoints'][1]['native_unit_scalars'][6]['health_bits'] ^= 1
            elif kind == 'type': value['checkpoints'][1]['native_unit_scalars'][6]['health_type'] = 'Int'
            else:
                value['checkpoints'][0]['world']['units'][6]['movement'] = -0.0
                value['checkpoints'][0]['native_unit_scalars'][6]['movement_bits'] = 2147483648
                value['checkpoints'][1]['world']['units'][6]['movement'] = 0.0
                value['checkpoints'][1]['native_unit_scalars'][6]['movement_bits'] = 0
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): self.evaluate(value)

    def test_missing_selected_body_unsupported_census_or_wrong_owner_reject(self):
        for kind in ('absent', 'hidden', 'owner', 'incomplete'):
            value = fixture(); packet = json.loads(value['reads'][0]['payload'])
            selected = packet['units'][7]
            if kind == 'absent':
                selected['instance_state'] = 'absent'; del selected['instance_position']; del selected['instance_angle']
            elif kind == 'hidden': selected['unit_shown'] = False
            elif kind == 'owner': selected['owner_id'] = '1'
            else: packet = dict(schema='application.unit-body-census.v1', complete=False, reason='frontend-unavailable')
            for row in value['reads']: row['payload'] = json.dumps(packet)
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): self.evaluate(value)

    def test_two_static_reads_must_match_actual_normalized_bits_and_cache_counts(self):
        for kind in ('coords', 'instance', 'cache', 'filename'):
            value = fixture(); packet = json.loads(value['reads'][1]['payload'])
            if kind == 'coords': packet['units'][7]['instance_position'] = vec(99.0, 99.0)
            elif kind == 'instance': packet['units'][7]['instance_id'] = '10'
            elif kind == 'cache': packet['cache_counts_after'] = 2
            else:
                for row in packet['units']: row['resource']['texture_filename'] = 'different.pcx'
            value['reads'][1]['payload'] = json.dumps(packet)
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): self.evaluate(value)

    def test_fatal_duplicate_json_or_error_receipt_is_not_evaluable(self):
        text = log(fixture())
        for wire in (text + '[Error] native failure', text.replace('"fence": 2', '"fence": 2,"fence": 2')):
            with self.subTest(wire=wire[-100:]), self.assertRaises(ProtocolError): proof.parse(wire)
        value = fixture()
        value['result']['events'][0] = dict(serial=1, kind='native-event-result',
                                          data=dict(name='unexpected', event_id='opaque', caller=0, success=False))
        with self.assertRaises(ProtocolError): self.evaluate(value)


if __name__ == '__main__':
    unittest.main()
