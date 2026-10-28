"""Corrupted declared schema packets; no original/native execution claim."""
from copy import deepcopy
import unittest
from protocol import ProtocolError
from state_trace import terrain_observation as t


def packet():
    owners = ['player:' + str(i) for i in range(1, 8)]
    tiles = {}
    for x, y in ((0, 0), (1, 1)):
        tiles[f'{x},{y}'] = dict(version=1, x=x, y=y, width=2, height=2,
            neighbors={direction: dict(x=x, y=y) for direction in t.DIRECTIONS},
            elevation=dict(center=212, left=64, top=64, right=64, bottom=64),
            is_land=True, is_water=False, moisture=1, rockiness=1, bonus=0, locked=False,
            native_type=dict(domain='land', moisture='arid', rockiness='flat'),
            features_raw=0, features={name: False for name in t.FEATURES},
            terraforming_raw=0, terraforming={name: False for name in t.IMPROVEMENTS},
            imported=dict(active=False, source_elevation=None, source_water=None, source_corners=None),
            resources={owner: dict(NUTRIENTS=1, MINERALS=1, ENERGY=0) for owner in owners},
            native_height_band=dict(below_coast=False, below_ocean=False, below_trench=False))
    return dict(turn=1, width=2, height=2,
        players=[dict(id=owner, raw_id=i, faction='declared') for i, owner in enumerate(owners)],
        units=[], bases=[], research=[dict(player=owner, owned_tech_ids=[], target_id=-1, accumulated=0) for owner in owners],
        terrain_trace=dict(schema=t.SCHEMA, elevation_units='native-engine-elevation', terrain_units=deepcopy(t.TERRAIN_UNITS), tiles=tiles,
            unit_details={}, base_details={}, player_details={owner: dict(raw_id=i, role='declared', name='Declared',
                identity=['Declared'] * 6, energy=dict(credits=0, last_income_turn=0)) for i, owner in enumerate(owners)},
            ui=None, coverage={name: name not in {'ui', 'animation_timing', 'audio', 'original_height_byte', 'canonical_height', 'energy_initialization', 'automation_context', 'automation_phase', 'home_identity', 'improvement_owners', 'terrain_epoch', 'paid_height_work', 'naval_recovery', 'energy_revision'} for name in t.COVERAGE},
            policy=dict(version=1, ignore_technologies=True)))


class TerrainSchemaTests(unittest.TestCase):
    def test_schema_validation_does_not_invent_ui_or_original_height_byte_coverage(self):
        value = packet(); self.assertIs(t.validate_snapshot(value), value)
        self.assertFalse(value['terrain_trace']['coverage']['original_height_byte'])
        self.assertFalse(value['terrain_trace']['coverage']['ui'])

    def test_v2_is_readable_without_fabricating_v3_capabilities(self):
        value = packet(); trace = value['terrain_trace']; trace['schema'] = t.LEGACY_SCHEMA
        trace['coverage'] = {key: trace['coverage'][key] for key in t.LEGACY_COVERAGE}
        self.assertIs(t.validate_snapshot(value), value)
        trace['coverage']['terrain_epoch'] = False
        with self.assertRaises(ProtocolError): t.validate_snapshot(value)

    def test_native_epoch_revision_capability_requires_every_actual_field(self):
        value = packet(); trace = value['terrain_trace']
        trace['coverage']['terrain_epoch'] = trace['coverage']['energy_revision'] = True
        for tile in trace['tiles'].values(): tile['terrain_epoch'] = 17
        for owner in trace['player_details'].values(): owner['energy_revision'] = 4
        self.assertIs(t.validate_snapshot(value), value)
        for kind in ('missing-tile', 'wrong-type', 'missing-opponent', 'hidden-capability'):
            broken = deepcopy(value); trace = broken['terrain_trace']
            if kind == 'missing-tile': del trace['tiles']['1,1']['terrain_epoch']
            elif kind == 'wrong-type': trace['tiles']['1,1']['terrain_epoch'] = False
            elif kind == 'missing-opponent': del trace['player_details']['player:7']['energy_revision']
            else: trace['coverage']['terrain_epoch'] = False
            with self.subTest(kind=kind), self.assertRaises(ProtocolError): t.validate_snapshot(broken)

    def test_missing_duplicate_or_hidden_opponent_state_fails(self):
        for change in ('roster', 'raw-id', 'details', 'research', 'resources'):
            value = packet()
            if change == 'roster': value['players'].pop()
            elif change == 'raw-id': value['players'][-1]['raw_id'] = 0
            elif change == 'details': del value['terrain_trace']['player_details']['player:7']
            elif change == 'research': value['research'][-1]['player'] = 'player:1'
            else: del value['terrain_trace']['tiles']['1,1']['resources']['player:7']
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_snapshot(value)

    def test_missing_extra_wrong_coordinate_and_wrap_neighbor_fail(self):
        for change in ('missing', 'extra', 'coordinate', 'neighbor', 'version'):
            value = packet(); tiles = value['terrain_trace']['tiles']
            if change == 'missing': del tiles['1,1']
            elif change == 'extra': tiles['2,0'] = deepcopy(tiles['0,0'])
            elif change == 'coordinate': tiles['1,1']['x'] = 0
            elif change == 'neighbor': tiles['0,0']['neighbors']['E'] = dict(x=2, y=0)
            else: tiles['0,0']['version'] = True
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_snapshot(value)

    def test_exact_height_flags_resources_import_provenance_and_class_types(self):
        for change in ('height', 'raw-flag', 'flag-type', 'resources', 'imported', 'band', 'land-sea', 'lock'):
            value = packet(); tile = value['terrain_trace']['tiles']['0,0']
            if change == 'height': del tile['elevation']['left']
            elif change == 'raw-flag': tile['features_raw'] = 1
            elif change == 'flag-type': tile['terraforming']['mag_tube'] = 0
            elif change == 'resources': tile['resources']['player:7']['ENERGY'] = False
            elif change == 'imported': tile['imported']['source_elevation'] = 0
            elif change == 'band': tile['native_height_band']['below_ocean'] = True
            elif change == 'land-sea': tile['is_water'] = True
            else: tile['locked'] = 0
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_snapshot(value)

    def test_unknown_raw_bits_are_retained_and_complete_changed_tile_list_reports_them(self):
        before = packet(); after = deepcopy(before)
        after['terrain_trace']['tiles']['1,1']['features_raw'] = 0x8000
        self.assertEqual(t.observed_deltas(before, after)['tiles'], ['1,1'])
        self.assertEqual(after['terrain_trace']['tiles']['1,1']['features_raw'], 0x8000)

    def test_engine_rockiness_is_not_original_raw_rockiness(self):
        value = packet(); tile = value['terrain_trace']['tiles']['0,0']
        tile['rockiness'] = 3; tile['native_type']['rockiness'] = 'rocky'
        self.assertIs(t.validate_snapshot(value), value)
        for change in ('label', 'units', 'enum'):
            broken = deepcopy(value)
            if change == 'label': broken['terrain_trace']['tiles']['0,0']['native_type']['rockiness'] = 'rolling'
            elif change == 'units': broken['terrain_trace']['terrain_units']['rockiness'] = 'original-raw'
            else: broken['terrain_trace']['tiles']['0,0']['rockiness'] = 4
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_snapshot(broken)

    def test_native_construction_owners_do_not_invent_original_territory(self):
        value = packet(); data = value['terrain_trace']; data['coverage']['improvement_owners'] = True
        for tile in data['tiles'].values(): tile['terraforming_owners'] = {flag: -1 for flag in t.IMPROVEMENTS}
        self.assertIs(t.validate_snapshot(value), value)
        tile = data['tiles']['0,0']; tile['terraforming_raw'] = 1; tile['terraforming']['road'] = True; tile['terraforming_owners']['road'] = 0
        self.assertIs(t.validate_snapshot(value), value)
        for change in ('missing', 'type', 'slot', 'absent-flag', 'hidden-capability'):
            broken = deepcopy(value); tile = broken['terrain_trace']['tiles']['0,0']
            if change == 'missing': del tile['terraforming_owners']['airbase']
            elif change == 'type': tile['terraforming_owners']['road'] = False
            elif change == 'slot': tile['terraforming_owners']['road'] = 8
            elif change == 'absent-flag': tile['terraforming_owners']['airbase'] = 1
            else: broken['terrain_trace']['coverage']['improvement_owners'] = False
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_snapshot(broken)

    def test_policy_balances_and_ui_coverage_are_explicit(self):
        for change in ('policy-type', 'policy-missing', 'balance', 'ui', 'coverage'):
            value = packet(); data = value['terrain_trace']
            if change == 'policy-type': data['policy']['ignore_technologies'] = 1
            elif change == 'policy-missing': del data['policy']
            elif change == 'balance': del data['player_details']['player:7']['energy']['credits']
            elif change == 'ui': data['coverage']['ui'] = True
            else: del data['coverage']['animation_timing']
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_snapshot(value)

    def test_optional_native_capabilities_must_be_complete_and_exact(self):
        value = packet(); trace = value['terrain_trace']
        trace['coverage']['canonical_height'] = True
        trace['coverage']['energy_initialization'] = True
        for tile in trace['tiles'].values():
            tile['canonical'] = dict(active=False, elevation=None, is_water=None)
        for owner in trace['player_details'].values(): owner['energy']['initialized'] = False
        self.assertIs(t.validate_snapshot(value), value)
        tile = trace['tiles']['0,0']; tile['canonical'] = dict(active=True, elevation=212, is_water=False)
        self.assertIs(t.validate_snapshot(value), value)
        for change in ('missing-tile', 'height', 'class', 'inactive-value', 'stamp', 'missing-owner', 'hidden-capability'):
            broken = deepcopy(value); data = broken['terrain_trace']
            if change == 'missing-tile': del data['tiles']['1,1']['canonical']
            elif change == 'height': data['tiles']['0,0']['canonical']['elevation'] = 64
            elif change == 'class': data['tiles']['0,0']['canonical']['is_water'] = True
            elif change == 'inactive-value': data['tiles']['1,1']['canonical']['elevation'] = 0
            elif change == 'stamp': data['player_details']['player:7']['energy']['initialized'] = 0
            elif change == 'missing-owner': del data['player_details']['player:7']['energy']['initialized']
            else: data['coverage']['canonical_height'] = False
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_snapshot(broken)

    def test_missing_entity_details_are_not_an_empty_pass(self):
        for domain in ('units', 'bases'):
            value = packet(); entity = dict(id='declared', raw_id=0, owner='player:7', x=0, y=0)
            entity.update(dict(prototype='declared') if domain == 'units' else dict(population=1))
            value[domain].append(entity)
            with self.subTest(domain=domain), self.assertRaises(ProtocolError): t.validate_snapshot(value)

    def test_zero_cost_quote_has_finite_typed_fields_and_no_fake_infinite_speed(self):
        original = dict(source=dict(x=0, y=0), destination=dict(x=1, y=1), movement_kind='land', nominal_mp_per_turn=1.0,
            policy_quote_version=1,
            allowed_now=True, reason=None, quoted_step_cost_mp=0.0, zero_cost_quote=True, quoted_tiles_per_turn=None,
            policy_quote=dict(road_rate=0, base_cost=0.0, after_cost=0.0, total_cost=0.0))
        self.assertIs(t.validate_quote(original, 2, 2, 'quote'), original)
        for change in ('infinity', 'nonfinite', 'reason', 'integer', 'zero-marker'):
            value = deepcopy(original)
            if change == 'infinity': value['quoted_tiles_per_turn'] = float('inf')
            elif change == 'nonfinite': value['policy_quote']['total_cost'] = float('nan')
            elif change == 'reason': value['reason'] = 'Not allowed'
            elif change == 'integer': value['nominal_mp_per_turn'] = 1
            else: value['zero_cost_quote'] = False
            with self.subTest(change=change), self.assertRaises(ProtocolError): t.validate_quote(value, 2, 2, 'quote')

    def test_own_and_later_opponent_balances_are_attributable(self):
        before = packet(); after = deepcopy(before)
        after['terrain_trace']['player_details']['player:1']['energy']['credits'] = 12
        after['terrain_trace']['player_details']['player:7']['energy']['credits'] = 7
        result = t.observed_deltas(before, after)
        self.assertEqual(result['player_details'], ['player:1', 'player:7'])
        self.assertFalse(result['policy_changed'])


if __name__ == '__main__': unittest.main()


class CooperativeObservationSchemaTests(unittest.TestCase):
    def test_unsupported_is_distinct_from_supported_absent_state(self):
        unsupported = dict(supported=False, native_schema_version=None,
                           reason='Native work schema observation is unavailable', state=None)
        t.validate_cooperation(unsupported, 'declared')
        supported = dict(supported=True, native_schema_version=2, reason=None, state=None)
        t.validate_cooperation(supported, 'declared')
        for broken in (dict(unsupported, reason=None), dict(unsupported, state={}),
                       dict(supported, native_schema_version=None), dict(supported, native_schema_version=True),
                       dict(supported, native_schema_version=3), dict(supported, reason='missing'),
                       dict(supported, supported=1)):
            with self.subTest(broken=broken), self.assertRaises(ProtocolError):
                t.validate_cooperation(broken, 'declared')

    def test_observed_counter_types_and_native_participant_order_are_exact(self):
        observed = dict(supported=True, native_schema_version=2, reason=None,
            state=dict(version=1, policy=t.COOPERATIVE_POLICY, own_work_units=2, cohort_work_units=5,
                       required_work=10, participants=[dict(unit_id=8, work_units=2, active=True),
                                                       dict(unit_id=99, work_units=3, active=True)]))
        t.validate_cooperation(observed, 'declared')
        for change in ('float-own', 'bool-total', 'unknown-policy', 'missing-own', 'duplicate', 'unordered', 'active-int'):
            broken = deepcopy(observed); state = broken['state']
            if change == 'float-own': state['own_work_units'] = 2.0
            elif change == 'bool-total': state['cohort_work_units'] = True
            elif change == 'unknown-policy': state['policy'] = 'invented'
            elif change == 'missing-own': del state['own_work_units']
            elif change == 'duplicate': state['participants'][1]['unit_id'] = 8
            elif change == 'unordered': state['participants'].reverse()
            else: state['participants'][1]['active'] = 1
            with self.subTest(change=change), self.assertRaises(ProtocolError):
                t.validate_cooperation(broken, 'declared')

    def test_v4_does_not_claim_cooperation_from_an_empty_unit_inventory(self):
        value = packet(); trace = value['terrain_trace']; trace['schema'] = t.COOPERATIVE_SCHEMA
        trace['coverage']['cooperative_work'] = False
        self.assertIs(t.validate_snapshot(value), value)
        trace['coverage']['cooperative_work'] = True
        with self.assertRaises(ProtocolError):
            t.validate_snapshot(value)

    def test_v4_requires_explicit_capability_for_every_unit_including_opponents(self):
        # Declared transport only: actual foreign-cohort semantics require a
        # separate pinned native run of the source helper.
        from test_terrain_capture import declared_transport
        value = declared_transport()[0]['initial']; trace = value['terrain_trace']
        trace['schema'] = t.COOPERATIVE_SCHEMA; trace['coverage']['cooperative_work'] = False
        for detail in trace['unit_details'].values():
            detail['cooperative_work'] = dict(supported=False, native_schema_version=None,
                reason='Native work schema observation is unavailable', state=None)
        self.assertIs(t.validate_snapshot(value), value)
        opponent = next(unit['id'] for unit in value['units'] if unit['owner'] == 'player:7')
        for change in ('missing-opponent', 'hidden-capability', 'unversioned-data'):
            broken = deepcopy(value)
            if change == 'missing-opponent': del broken['terrain_trace']['unit_details'][opponent]['cooperative_work']
            elif change == 'hidden-capability': broken['terrain_trace']['coverage']['cooperative_work'] = True
            else: broken['terrain_trace']['schema'] = t.SCHEMA
            with self.subTest(change=change), self.assertRaises(ProtocolError):
                t.validate_snapshot(broken)

    def foreign_cohort(self):
        from test_terrain_capture import declared_transport
        value = declared_transport()[0]['initial']; trace = value['terrain_trace']
        trace['schema'] = t.COOPERATIVE_SCHEMA; trace['coverage']['cooperative_work'] = True
        for detail in trace['unit_details'].values():
            detail['cooperative_work'] = dict(supported=True, native_schema_version=2, reason=None, state=None)
        first = next(unit for unit in value['units'] if unit['owner'] == 'player:7')
        second = deepcopy(first); second.update(id='declared-paused-peer', raw_id=99, order='NO_ORDERS')
        value['units'].append(second); trace['unit_details'][second['id']] = deepcopy(trace['unit_details'][first['id']])
        participants = [dict(unit_id=first['raw_id'], work_units=2, active=True),
                        dict(unit_id=second['raw_id'], work_units=3, active=False)]
        for unit, own, active in ((first, 2, True), (second, 3, False)):
            unit['order'] = 'TERRAFORM' if active else 'NO_ORDERS'
            detail = trace['unit_details'][unit['id']]; detail['can_terraform'] = True
            detail['work'].update(action='farm', active=active, work_units=own, required_work=10, last_turn=1,
                job=dict(version=1, policy=t.COOPERATIVE_POLICY, owner=6, terrain_identity='declared-native-baseline'))
            detail['cooperative_work']['state'] = dict(version=1, policy=t.COOPERATIVE_POLICY, own_work_units=own,
                cohort_work_units=5, required_work=10, participants=deepcopy(participants))
        return value, first['id'], second['id']

    def test_foreign_counter_binding_includes_genuine_paused_contribution(self):
        value, first, second = self.foreign_cohort()
        self.assertIs(t.validate_snapshot(value), value)
        details = value['terrain_trace']['unit_details']
        self.assertEqual(details[first]['work']['work_units'], 2)
        self.assertEqual(details[first]['cooperative_work']['state']['cohort_work_units'], 5)
        self.assertFalse(details[second]['work']['active'])

    def test_missing_counter_paused_member_or_foreign_identity_cannot_be_an_empty_pass(self):
        original, first, second = self.foreign_cohort()
        for change in ('own-is-total', 'invented-total', 'participant-counter', 'paused-omitted',
                       'peer-state-hidden', 'foreign-owner', 'job-hidden', 'unknown-unit', 'control-identity'):
            broken = deepcopy(original); details = broken['terrain_trace']['unit_details']; state = details[first]['cooperative_work']['state']
            if change == 'own-is-total': details[first]['work']['work_units'] = 5
            elif change == 'invented-total': state['cohort_work_units'] = 2
            elif change == 'participant-counter': state['participants'][1]['work_units'] = 0
            elif change == 'paused-omitted':
                state['participants'].pop(); state['cohort_work_units'] = 2
                details[second]['cooperative_work']['state'] = None
            elif change == 'peer-state-hidden': details[second]['cooperative_work']['state'] = None
            elif change == 'foreign-owner': next(row for row in broken['units'] if row['id'] == second)['owner'] = 'player:1'
            elif change == 'job-hidden': del details[second]['work']['job']
            elif change == 'unknown-unit': state['participants'][1]['unit_id'] = 999
            else: details[first]['work']['job']['terrain_identity'] = 'control\nidentity'
            with self.subTest(change=change), self.assertRaises(ProtocolError):
                t.validate_snapshot(broken)
