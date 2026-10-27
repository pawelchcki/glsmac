"""Declared transport corruption tests; these do not execute or emulate a game."""
from copy import deepcopy
import json
import unittest

from protocol import ProtocolError
from state_trace import terrain_capture as capture
from state_trace import terrain_observation as terrain
from test_terrain_observation import packet


def declared_transport():
    state = packet(); owners = [row['id'] for row in state['players']]
    # Declared transport uses the probe's complete 16x16 staggered world.
    first = deepcopy(state['terrain_trace']['tiles']['0,0']); tiles = {}
    for y in range(16):
        for x in range(y % 2, 16, 2):
            tile = deepcopy(first); tile.update(x=x, y=y, width=16, height=16)
            tiles[f'{x},{y}'] = tile
    state.update(width=16, height=16); state['terrain_trace']['tiles'] = tiles
    trace = state['terrain_trace']
    for key, tile in trace['tiles'].items():
        other = dict(x=1, y=1) if key == '0,0' else dict(x=0, y=0)
        tile['neighbors'] = {direction: deepcopy(other) for direction in terrain.DIRECTIONS}
    identities = list(capture.ACTORS) + ['other:' + str(i) for i in range(6)]
    for raw_id, identity in enumerate(identities):
        owner = owners[0] if raw_id < 3 else owners[raw_id - 2]
        state['units'].append(dict(id=identity, raw_id=raw_id, owner=owner, x=0, y=0,
                                   prototype='declared', movement=1.0, health=1.0, order=''))
        trace['unit_details'][identity] = dict(definition_id=capture.ACTORS.get(identity, 'Declared'),
            morale_set='declared', movement_kind='land', nominal_mp_per_turn=1.0,
            can_terraform=identity == 'former', moved_this_turn=False,
            work=dict(action='', work_units=0, required_work=0, last_turn=0, previous_work_units=0,
                      previous_movement=0.0, previous_moved=False, active=False, tile_x=0, tile_y=0),
            combat={}, automation=None, home_base_id=None, quotes={})
    for raw_id, owner in enumerate(owners):
        identity = 'base:' + str(raw_id)
        state['bases'].append(dict(id=identity, raw_id=raw_id, owner=owner, x=0, y=0, population=1))
        trace['base_details'][identity] = dict(name='Declared', production={}, intake={}, consumption={},
            nutrients_present=False, nutrients=None, citizens=[dict(id=raw_id, type='Declared', worked_tile=None)],
            worked_tiles=[], facilities={})

    def quote_units(snapshot):
        for unit in snapshot['units']:
            source = dict(x=unit['x'], y=unit['y']); destination = dict(x=1-unit['x'], y=1-unit['y'])
            detail = snapshot['terrain_trace']['unit_details'][unit['id']]
            detail['quotes'] = {direction: dict(source=deepcopy(source), destination=deepcopy(destination),
                movement_kind='land', nominal_mp_per_turn=1.0, allowed_now=unit['movement'] > 0.0,
                policy_quote_version=1,
                reason=None if unit['movement'] > 0.0 else 'Out of moves',
                quoted_step_cost_mp=1.0, zero_cost_quote=False, quoted_tiles_per_turn=1.0,
                policy_quote=dict(road_rate=0, base_cost=1.0, after_cost=0.0, total_cost=1.0)) for direction in terrain.DIRECTIONS}
    quote_units(state)
    stages = {'initial': deepcopy(state)}; movements = []
    for actor in capture.ACTORS:
        before = deepcopy(state); stages[actor + '-before'] = before
        unit = next(row for row in state['units'] if row['id'] == actor)
        old_detail = before['terrain_trace']['unit_details'][actor]
        unit.update(x=1, y=1, movement=0.0)
        state['terrain_trace']['unit_details'][actor]['moved_this_turn'] = True
        quote_units(state)
        stages[actor + '-during'] = deepcopy(state); stages[actor + '-after'] = deepcopy(state)
        movements.append(dict(unit_id=actor, source=dict(x=0, y=0), destination=dict(x=1, y=1),
            movement_before=1.0, movement_after=0.0, actual_debit_mp=1.0, movement_successful=True,
            actual_step_count=1, before_checkpoint=actor+'-before', after_checkpoint=actor+'-after',
            quote=deepcopy(old_detail['quotes']['E'])))
    return stages, movements


def wire(stages, movements, *, omit=(), duplicate=None, native_missing=False):
    lines = []
    for stage, state in stages.items():
        if stage in omit: continue
        bookkeeping = dict(unit_ids=[row['raw_id'] for row in state['units']],
                           base_ids=[row['raw_id'] for row in state['bases']], dangling_unit_updates=0)
        if native_missing: bookkeeping['unit_ids'].pop()
        header = deepcopy(state); domains = ('tiles', 'unit_details', 'base_details', 'player_details')
        chunks = {domain: header['terrain_trace'].pop(domain) for domain in domains}
        lines += ['TERRAIN_NATIVE|' + stage + '|' + json.dumps(bookkeeping),
                  'TERRAIN_STAGE_BEGIN|' + stage + '|' + json.dumps(header)]
        for domain, rows in chunks.items():
            for key, value in rows.items():
                lines.append('TERRAIN_STAGE_ROW|' + stage + '|' + json.dumps(dict(domain=domain, key=key, value=value)))
        lines.append('TERRAIN_STAGE_END|' + stage + '|' + json.dumps({domain: len(rows) for domain, rows in chunks.items()}))
    if duplicate: lines.append('TERRAIN_STAGE_BEGIN|' + duplicate + '|' + json.dumps(header))
    # Real commands emit their movement receipt immediately after each actor's
    # after stage. This packet builder appends them only after all captures;
    # both retain complete actual before/after records before each receipt.
    lines += ['TERRAIN_MOVEMENT|' + json.dumps(row) for row in movements]
    lines += ['TERRAIN_OBSERVATION_COMPLETE', 'BEHAVIOR_SUMMARY 1 50', 'All tests passed.']
    return '\n'.join(lines)


class TerrainCaptureTests(unittest.TestCase):
    def test_declared_packet_audit_has_zero_original_matches_and_no_full_actions_claim(self):
        report = capture.audit(wire(*declared_transport()))
        self.assertEqual(report['checkpoint_count'], 10)
        self.assertEqual(report['players_per_checkpoint'], 7)
        self.assertEqual(report['actual_movement_commands'], 3)
        self.assertFalse(report['original_comparison_executed'])
        self.assertEqual(report['original_matches'], 0)
        self.assertFalse(report['full_action_inventory_complete'])
        self.assertIn('runtime lacks native canonical_height capability', report['unsupported'])

    def test_missing_duplicate_native_registration_and_empty_results_fail_closed(self):
        stages, moves = declared_transport()
        logs = [wire(stages, moves, omit=('native-during',)), wire(stages, moves, duplicate='former-after'),
                wire(stages, moves, native_missing=True), wire(stages, []),
                wire(stages, moves).replace('TERRAIN_OBSERVATION_COMPLETE', '')]
        for log in logs:
            with self.subTest(log=log[-150:]), self.assertRaises(ProtocolError): capture.audit(log)

    def test_later_opponent_change_and_false_debit_are_not_hidden_by_summaries(self):
        for change in ('opponent', 'debit', 'position', 'result', 'ability', 'quote'):
            stages, moves = declared_transport()
            if change == 'opponent': stages['conventional-after']['terrain_trace']['player_details']['player:7']['energy']['credits'] = 99
            elif change == 'debit': moves[-1]['actual_debit_mp'] = 0.5
            elif change == 'position': moves[-1]['destination'] = dict(x=0, y=0)
            elif change == 'result': moves[-1]['actual_step_count'] = False
            elif change == 'ability': stages['native-before']['terrain_trace']['unit_details']['native']['can_terraform'] = True
            else: moves[-1]['quote']['policy_quote']['total_cost'] = 2.0
            with self.subTest(change=change), self.assertRaises(ProtocolError): capture.audit(wire(stages, moves))

    def test_opponent_foreign_occupancy_quotes_are_retained_without_hiding_native_changes(self):
        stages, moves = declared_transport()
        opponent = 'other:0'
        # The Former arrives on the opponent's observed destination. The
        # opponent's native position/budget/work remain identical throughout.
        for stage, snapshot in stages.items():
            if stage not in ('initial', 'former-before'):
                for quote in snapshot['terrain_trace']['unit_details'][opponent]['quotes'].values():
                    quote.update(allowed_now=False,
                                 reason='Destination tile contains foreign units (combat not implemented yet)')
        report = capture.audit(wire(stages, moves))
        movement = report['movement_evidence'][0]
        self.assertEqual(movement['changes']['units'], ['former'])
        self.assertEqual(movement['changes']['unit_details'], ['former', opponent])
        self.assertEqual(len(movement['derived_quote_changes']), 8)
        self.assertEqual(movement['derived_quote_changes'][0]['unit_id'], opponent)
        self.assertTrue(movement['derived_quote_changes'][0]['before']['allowed_now'])
        self.assertFalse(movement['derived_quote_changes'][0]['after']['allowed_now'])
        for corruption in ('work', 'price', 'reason', 'unaffected_destination'):
            changed = deepcopy(stages)
            detail = changed['former-after']['terrain_trace']['unit_details'][opponent]
            if corruption == 'work':
                detail['work']['last_turn'] = 1
            elif corruption == 'price':
                quote = detail['quotes']['E']
                quote['policy_quote']['base_cost'] = quote['policy_quote']['total_cost'] = 2.0
                quote['quoted_step_cost_mp'] = 2.0
                quote['quoted_tiles_per_turn'] = 0.5
            elif corruption == 'reason':
                detail['quotes']['E']['reason'] = 'Unrelated failure'
            else:
                # Foreign units remain on this source tile in both snapshots;
                # it cannot explain a newly blocked quote.
                for snapshot in changed.values():
                    snapshot['terrain_trace']['unit_details'][opponent]['quotes']['E']['destination'] = dict(x=0, y=0)
            with self.subTest(corruption=corruption), self.assertRaises(ProtocolError):
                capture.audit(wire(changed, moves))

    def test_chunk_identity_counts_and_complete_fence_are_not_optional(self):
        original = wire(*declared_transport()); lines = original.splitlines()
        index = next(i for i, line in enumerate(lines) if line.startswith('TERRAIN_STAGE_ROW|initial|'))
        row = lines[index]
        corrupt = ['\n'.join(lines[:index] + lines[index + 1:]),
                   '\n'.join(lines[:index] + [row] + lines[index:]),
                   original + '\n' + row,
                   'TERRAIN_OBSERVATION_COMPLETE\n' + original]
        for log in corrupt:
            with self.subTest(log=log[-120:]), self.assertRaises(ProtocolError): capture.audit(log)

    def test_paid_height_and_naval_recovery_are_exact_native_capabilities(self):
        snapshot = declared_transport()[0]['initial']; trace = snapshot['terrain_trace']
        trace['coverage']['paid_height_work'] = trace['coverage']['naval_recovery'] = True
        for detail in trace['unit_details'].values(): detail['terraforming_recovery'] = dict(active=False, x=0, y=0)
        worker = trace['unit_details']['former']; worker['work']['action'] = 'raise'
        row = next(row for row in snapshot['units'] if row['id'] == 'former')
        owner = next(player['raw_id'] for player in snapshot['players'] if player['id'] == row['owner'])
        worker['work']['height'] = dict(version=1, policy='application.band-slope-height.v1', fee_policy='application.band-fee.v1',
            owner=owner, issued_turn=1, fee=4, source_elevation=212, source_water=False, terrain_identity='declared sealed input')
        terrain.validate_snapshot(snapshot)
        for kind in ('missing-policy', 'wrong-owner', 'fee-type', 'hidden-paid', 'recovery-type', 'inactive-target', 'hidden-recovery'):
            broken = deepcopy(snapshot); trace = broken['terrain_trace']; worker = trace['unit_details']['former']
            if kind == 'missing-policy': del worker['work']['height']['policy']
            elif kind == 'wrong-owner': worker['work']['height']['owner'] = 99
            elif kind == 'fee-type': worker['work']['height']['fee'] = True
            elif kind == 'hidden-paid': trace['coverage']['paid_height_work'] = False
            elif kind == 'recovery-type': worker['terraforming_recovery']['active'] = 0
            elif kind == 'inactive-target': worker['terraforming_recovery']['x'] = 1
            else: trace['coverage']['naval_recovery'] = False
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): terrain.validate_snapshot(broken)

    def test_native_plan_version_and_phase_are_observed_without_v3_default_invention(self):
        snapshot = declared_transport()[0]['initial']; trace = snapshot['terrain_trace']
        trace['coverage']['automation_context'] = True; trace['coverage']['home_identity'] = True
        for detail in trace['unit_details'].values():
            detail['home_base_id'] = 0
            detail['automation'] = dict(version=1, command='', epoch=0, owner=0, issued_turn=0, last_turn=0,
                target_x=0, target_y=0, origin_x=0, origin_y=0, cursor=0)
        terrain.validate_snapshot(snapshot)
        trace['coverage']['automation_phase'] = True
        for detail in trace['unit_details'].values(): detail['automation'].update(version=2, phase=0)
        terrain.validate_snapshot(snapshot)
        for change in ('missing-phase', 'wrong-version', 'phase-type', 'hidden-phase', 'missing-home'):
            broken = deepcopy(snapshot); data = broken['terrain_trace']
            if change == 'missing-phase': del data['unit_details']['native']['automation']['phase']
            elif change == 'wrong-version': data['unit_details']['native']['automation']['version'] = 1
            elif change == 'phase-type': data['unit_details']['native']['automation']['phase'] = False
            elif change == 'hidden-phase': data['coverage']['automation_phase'] = False
            else: data['unit_details']['native']['home_base_id'] = None
            with self.subTest(change=change), self.assertRaises(ProtocolError): terrain.validate_snapshot(broken)


if __name__ == '__main__': unittest.main()
