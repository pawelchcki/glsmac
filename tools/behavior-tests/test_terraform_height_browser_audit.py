"""Protocol regressions; optional retained browser artifacts are read-only.

TERRAFORM_HEIGHT_CAPTURE=/path/to/accepted/artifacts runs the same mutations
against all six actual retained packets, in addition to asset-free protocol data.
Neither test family executes a game or establishes new native/browser coverage.
"""
import copy
import importlib.util
import json
import os
import hashlib
import tempfile
import subprocess
import sys
from pathlib import Path
import unittest
from state_trace import terrain_observation as terrain_schema
import struct
import zlib

MODULE_PATH = Path(__file__).parent / 'state_trace/terraform_height_browser_audit.py'
spec = importlib.util.spec_from_file_location('height_audit', MODULE_PATH)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def paid_fixture_world(before, plan, actor_id, payer):
    """Synthetic Native-shaped effect from explicit fixture patches, not audit output."""
    after = copy.deepcopy(before)
    next(u for u in after['units'] if u['id'] == actor_id)['movement'] = 0.0
    detail = after['terrain_trace']['unit_details'][actor_id]
    detail['moved_this_turn'] = True
    for quote in detail['quotes'].values():
        if quote is not None: quote.update(allowed_now=False, reason='Unit is out of moves')
    after['terrain_trace']['player_details'][payer]['energy']['credits'] -= 4
    after['terrain_trace']['player_details'][payer]['energy_revision'] += 1
    tiles = before['terrain_trace']['tiles']
    changes = {(p['x'], p['y']): p['canonical'] for p in plan}
    offsets = {'left': (-1, 0), 'top': (0, -1), 'right': (1, 0), 'bottom': (0, 1)}
    vertices = {((x + dx) % 16, y + dy) for x, y in changes for dx, dy in offsets.values()}
    for key, tile in after['terrain_trace']['tiles'].items():
        x, y = tile['x'], tile['y']; changed = False
        for name, (dx, dy) in offsets.items():
            vx, vy = (x + dx) % 16, y + dy
            if (vx, vy) not in vertices: continue
            centers = [((vx - 1) % 16, vy), (vx, vy - 1), ((vx + 1) % 16, vy), (vx, vy + 1)]
            values = [changes.get((cx, cy), {}).get('elevation', tiles[f'{cx},{cy}']['elevation']['center']) for cx, cy in centers]
            value = sum(values) // 4
            changed |= value != tile['elevation'][name]
            tile['elevation'][name] = value
        patch = changes.get((x, y))
        if patch is None and not changed: continue
        tile['terrain_epoch'] += 1
        tile['canonical'].update(active=True, elevation=patch['elevation'] if patch else tiles[key]['elevation']['center'], is_water=False)
        if patch:
            tile['elevation']['center'] = patch['elevation']
            tile['imported'].update(active=False, source_corners=None, source_elevation=None, source_water=None)
    return after


def protocol_fixture():
    """Synthetic schema inputs only, never an original/candidate observation."""
    players = [{'id': f'p{i}', 'raw_id': i, 'faction': 'GAIANS' if i == 0 else f'other{i}'} for i in range(7)]
    units = [{'id': f'u{i}', 'raw_id': i, 'owner': f'p{(i - 1) % 7}', 'x': 8, 'y': 8, 'movement': 1.0, 'health': 1.0, 'order': 'NO_ORDERS', 'morale': 2, 'prototype': 'formers' if i in (2, 8) else 'scout-patrol'} for i in range(1, 9)]
    units[-1]['owner'] = 'p0'
    bases = [{'id': f'b{i}', 'raw_id': i, 'owner': f'p{i - 1}', 'x': 8, 'y': 8, 'population': 1,
              'jobs': {'workers': 0, 'doctors': 1}, 'project': 'formers', 'resources': {'minerals': i - 1}, 'nutrients_native': 0} for i in range(1, 8)]
    tiles = {}
    for y in range(16):
        for x in range(y % 2, 16, 2):
            tiles[f'{x},{y}'] = {'x': x, 'y': y, 'elevation': {'center': 240, **{name: 240 for name in audit.CORNERS}},
                'neighbors': {}, 'terrain_epoch': 0, 'canonical': {'active': False, 'elevation': None, 'is_water': None},
                'imported': {'active': True, 'source_elevation': 240, 'source_water': False, 'source_corners': [240] * 4},
                'is_land': True, 'is_water': False, 'native_type': {'domain': 'land', 'rockiness': 'flat', 'moisture': 'arid'},
                'native_height_band': {name: False for name in audit.BANDS}}
    directions = dict(zip(('W', 'NW', 'N', 'NE', 'E', 'SE', 'S', 'SW'),
                          ((-2, 0), (-1, -1), (0, -2), (1, -1), (2, 0), (1, 1), (0, 2), (-1, 1))))
    for tile in tiles.values():
        x, y = tile['x'], tile['y']
        tile['neighbors'] = {name: {'x': (x + dx) % 16, 'y': y + dy} if 0 <= y + dy < 16 else None
                             for name, (dx, dy) in directions.items()}
    for tile in tiles.values():
        tile.update(version=1, width=16, height=16, rockiness=1, moisture=1, bonus=0, locked=False,
            features_raw=0, features={name: False for name in terrain_schema.FEATURES},
            terraforming_raw=0, terraforming={name: False for name in terrain_schema.IMPROVEMENTS},
            terraforming_owners={name: -1 for name in terrain_schema.IMPROVEMENTS},
            resources={p['id']: {'ENERGY': 0, 'MINERALS': 0, 'NUTRIENTS': 0} for p in players})
    unit_details = {}
    for unit in units:
        quotes = {}
        for direction, destination in tiles['8,8']['neighbors'].items():
            quotes[direction] = None if destination is None else {
                'source': {'x': 8, 'y': 8}, 'destination': copy.deepcopy(destination), 'movement_kind': 'land',
                'nominal_mp_per_turn': 1.0, 'allowed_now': True, 'reason': None, 'quoted_step_cost_mp': 1.0,
                'zero_cost_quote': False, 'quoted_tiles_per_turn': 1.0, 'policy_quote_version': 1,
                'policy_quote': {'road_rate': 3, 'base_cost': 1.0, 'after_cost': 0.0, 'total_cost': 1.0}}
        unit_details[unit['id']] = {'definition_id': 'Formers' if unit['prototype'] == 'formers' else 'ScoutPatrol',
            'morale_set': 'STANDARD', 'movement_kind': 'land', 'nominal_mp_per_turn': 1.0,
            'can_terraform': unit['prototype'] == 'formers', 'moved_this_turn': False, 'quotes': quotes,
            'work': {'action': '', 'active': False, 'work_units': 0, 'required_work': 0, 'last_turn': 0,
                     'previous_work_units': 0, 'previous_movement': -0.0, 'previous_moved': False, 'tile_x': 0, 'tile_y': 0},
            'automation': {'version': 2, 'command': '', 'phase': 0, **{name: 0 for name in ('epoch', 'owner', 'issued_turn', 'last_turn', 'target_x', 'target_y', 'origin_x', 'origin_y', 'cursor')}},
            'home_base_id': 0, 'terraforming_recovery': {'active': False, 'x': 0, 'y': 0},
            'cooperative_work': {'supported': True, 'native_schema_version': 2, 'reason': None, 'state': None},
            'combat': {'kind': 'conventional', 'offense': 1, 'defense': 1, 'reactor': 1}}
    base_details = {b['id']: {'name': 'Declared ' + b['id'],
        'production': {'choice_id': 'FORMERS', 'minerals': b['resources']['minerals'], 'last_processed_turn': 1},
        'intake': {'ENERGY': 2, 'MINERALS': 1, 'NUTRIENTS': 2}, 'consumption': {'ENERGY': 0, 'MINERALS': 0, 'NUTRIENTS': 2},
        'nutrients_present': True, 'nutrients': 0, 'citizens': [{'id': b['raw_id'], 'type': 'DOCTOR', 'worked_tile': None}],
        'worked_tiles': [], 'facilities': {}} for b in bases}
    capabilities = {name: True for name in ('all_players', 'terrain_height', 'terrain_type', 'terrain_resources',
        'traverse_quotes', 'canonical_height', 'energy_initialization', 'automation_context', 'automation_phase',
        'home_identity', 'improvement_owners', 'terrain_epoch', 'paid_height_work', 'naval_recovery',
        'energy_revision', 'cooperative_work', 'ui')}
    trace = {'schema': 'game.terrain_observation.v4', 'elevation_units': 'native-engine-elevation',
             'terrain_units': {'rockiness': 'native-enum-0-none-1-flat-2-rolling-3-rocky', 'moisture': 'native-enum-0-none-1-arid-2-moist-3-rainy',
                               'original_raw_height_class': 'unsupported', 'original_raw_rockiness': 'unsupported'}, 'coverage': {**capabilities, 'animation_timing': False, 'audio': False, 'original_height_byte': False}, 'policy': {'version': 1, 'ignore_technologies': True}, 'ui': {}, 'tiles': tiles, 'unit_details': unit_details,
             'player_details': {p['id']: {'raw_id': p['raw_id'], 'role': 'declared', 'name': 'Player ' + p['id'], 'identity': ['declared'] * 6, 'energy': {'credits': 10, 'initialized': True, 'last_income_turn': 0}, 'energy_revision': 1} for p in players},
             'base_details': base_details}
    research = [{'player': p['id'], 'owned_tech_ids': [p['raw_id']], 'target_id': -1, 'accumulated': 0} for p in players]
    world = {'research': research, 'width': 16, 'height': 16, 'turn': 1, 'players': players, 'units': units, 'bases': bases, 'terrain_trace': trace}
    quote = {'version': 1, 'supported': True, 'action': 'raise', 'resuming': False, 'paid_fee': 0, 'base_fee': 4, 'fee': 4, 'credits': 10,
             'mode': 'functional_approximation', 'policy': 'application.band-slope-height.v1', 'fee_policy': 'application.band-fee.v1',
             'unit_id': 8, 'owner': 0, 'turn': 1, 'x': 8, 'y': 8, 'source_elevation': 240, 'source_water': False,
             'destination_elevation': 1500, 'destination_water': False,
             'plan': [{'x': 8 + dx, 'y': 8 + dy, 'canonical': {'elevation': 1500 if dx == dy == 0 else 500, 'is_water': False}}
                      for dx, dy in ((0, 0), (-2, 0), (-1, -1), (0, -2), (1, -1), (2, 0), (1, 1), (0, 2), (-1, 1))]}
    packets = []
    for i in range(6):
        ui = {'actor': 8, 'owner': 0, 'turn': 1, 'session': 0 if i == 0 else 1, 'dialog_generation': (0, 1, 2, 3, 3, 4)[i],
              'height_stage': audit.STAGES[i], 'modal': audit.SCOPES[i] == 'height', 'popup_id': 'terraforming_height' if audit.SCOPES[i] == 'height' else None,
              'sliding': False, 'hiding': False, 'native_pending': False, 'tile_locked': False, 'pending': None, 'choice': 1 if i >= 4 else 0,
              'height_presentation': None if i == 0 else {'stage': audit.STAGES[i], 'quote': copy.deepcopy(quote)},
              'movement': 1.0, 'movement_bits': 1065353216, 'dialog': {'fee': 4, 'reserves': 10} if audit.SCOPES[i] == 'height' else None}
        request = {key: ui[key] for key in ('actor', 'owner', 'turn', 'session', 'dialog_generation')}
        request.update(query=i + 1, scope=audit.SCOPES[i])
        packets.append({'query': i + 1, 'query_owner': request, 'ui': ui, 'world': copy.deepcopy(world)})
    final = packets[-1]
    final['ui'].update(movement=0.0, movement_bits=0)
    final['world'] = paid_fixture_world(world, quote['plan'], 'u8', 'p0')
    for packet in packets: packet['world']['terrain_trace']['ui'] = copy.deepcopy(packet['ui'])
    receipt = {'name': 'unit_terraform', 'event_id': '0_68', 'caller': 0, 'success': True, 'data': {'unit_id': 8, 'action': 'raise', 'confirmed_height': True}}
    inputs = {'policy': {'version': 1, 'ignore_technologies': True}, 'actor': 8, 'can_terraform': True, 'raise_rule': {'turns': 1},
              'starting_credits': 10, 'faction_bonus': 0, 'energy': {'credits': 10, 'initialized': True, 'last_income_turn': 0}}
    events = []
    for i in range(6):
        fence = (i + 1) * 3
        events.extend([{'seq': fence - 2, 'kind': 'input.ingress', 'data': {'ingress': i, 'type': 'keydown'}},
                       {'seq': fence - 1, 'kind': 'input.dispatch', 'data': {'ingress': i, 'phase': 'begin', 'type': 'keydown', 'code': 'P', 'modifiers': 6}},
                       {'seq': fence, 'kind': 'input.dispatch', 'data': {'ingress': i, 'phase': 'end', 'handled': True}}])
    records = [('TH_INPUTS', inputs, 0)]
    for i, row in enumerate(packets):
        records.append(('TH_NATIVE', row, (i + 1) * 10))
        records.append(('TH_TRACE', {'enabled': True, 'dropped': 0, 'events': events[i * 3:(i + 1) * 3]}, (i + 1) * 10 + 1))
    records.append(('TH_RECEIPT', receipt, 55))
    report = {'candidate_executed': True, 'native_input': copy.deepcopy(inputs), 'height_receipt': copy.deepcopy(receipt),
              'native_snapshots': [{'checkpoint': name, 'query_after_native_key': (i + 1) * 3,
                                    'observation': audit.node_projection(row)} for i, (name, row) in enumerate(zip(audit.CHECKPOINTS, packets))]}
    return records, report


class AuditMutations:
    def setUp(self):
        self.records, self.report = copy.deepcopy(self.original)

    def packets(self):
        return [value for kind, value, _ in self.records if kind == 'TH_NATIVE']

    def sync_report(self, sync_ui=True):
        for item, row in zip(self.report['native_snapshots'], self.packets()):
            if sync_ui: row['world']['terrain_trace']['ui'] = copy.deepcopy(row['ui'])
            item['observation'] = audit.node_projection(row)
        receipt = next((value for kind, value, _ in self.records if kind == 'TH_RECEIPT'), None)
        if receipt is not None:
            self.report['height_receipt'] = copy.deepcopy(receipt)

    def reject(self, sync_ui=True):
        # Update the reported copy as well: semantic checks must reject facts,
        # not merely a stale hash or a report/raw mismatch.
        self.sync_report(sync_ui)
        with self.assertRaises((AssertionError, KeyError, TypeError)):
            audit.audit_records(self.records, self.report)

    def test_native_confirmation_receipt_is_bool_not_integer_one(self):
        receipt = next(value for kind, value, _ in self.records if kind == 'TH_RECEIPT')
        receipt['data']['confirmed_height'] = 1
        self.reject()

    def test_valid_capture_and_readonly_inputs(self):
        before = copy.deepcopy((self.records, self.report))
        result = audit.audit_records(self.records, self.report)
        self.assertEqual(result['per_world'], {'players': 7, 'units': 8, 'bases': 7, 'tiles': 128})
        self.assertEqual(result['native_float_unit_fields_checked'], 96)
        self.assertTrue(audit.equal(before, (self.records, self.report)))

    def test_native_detail_echo_gaps_are_not_complete_entity_worlds(self):
        result = audit.audit_records(self.records, self.report)
        self.assertEqual(result['observed_worlds'], 6)
        self.assertEqual(result['complete_worlds'], 0)
        self.assertFalse(result['entity_detail_identity']['supported'])

    def test_reject_swapped_native_unit_and_base_detail_mirrors(self):
        for domain in ('units', 'bases'):
            self.setUp()
            for packet in self.packets():
                rows = packet['world'][domain]
                details = packet['world']['terrain_trace']['unit_details' if domain == 'units' else 'base_details']
                # Native rows remain untouched; swap their detail observations.
                a, b = rows[0]['id'], rows[1]['id']
                details[a], details[b] = details[b], details[a]
            if domain == 'bases':
                state = self.packets()[0]['world']
                signature = lambda row: (row['resources'], row['project'], row['population'], row['jobs'], row['nutrients_native'])
                if signature(state['bases'][0]) == signature(state['bases'][1]):
                    # The retained v4 schema has no raw base handle echo.
                    # An indistinguishable swap must stay unsupported rather
                    # than inventing an identity or promising rejection.
                    self.sync_report()
                    result = audit.audit_records(self.records, self.report)
                    self.assertEqual(result['complete_worlds'], 0)
                    self.assertFalse(result['entity_detail_identity']['supported'])
                    continue
            self.reject()

    def test_reject_contradictory_duplicate_ui_before_dropping_projection(self):
        for key, value in (('selected', 999), ('modal', 'not-a-native-bool'), ('owner', 6)):
            self.setUp()
            for packet in self.packets(): packet['world']['terrain_trace']['ui'][key] = value
            self.reject(sync_ui=False)

    def test_reject_remote_full_tile_schema_corruption(self):
        changes = (lambda t: t['elevation'].update(center=True), lambda t: t['elevation'].update(left='height'),
                   lambda t: t.update(is_water=1), lambda t: t.update(rockiness=4),
                   lambda t: t['features'].update(river=1), lambda t: t['neighbors'].update(E={'x': 16, 'y': 0}),
                   lambda t: t['canonical'].update(active=1), lambda t: t['imported'].update(source_water=0),
                   lambda t: t['terraforming_owners'].update(road=True),
                   lambda t: next(iter(t['resources'].values())).update(ENERGY=False),
                   lambda t: t.update(unknown_native_field=0))
        for mutate in changes:
            self.setUp()
            for packet in self.packets(): mutate(packet['world']['terrain_trace']['tiles']['0,0'])
            self.reject()

    def test_reject_candidate_execution_flag_before_any_case_credit(self):
        for value in (False, None, 1, 0, 'true'):
            self.setUp(); self.report['candidate_executed'] = value
            with self.assertRaisesRegex(AssertionError, 'Actual candidate execution'):
                audit.audit_records(self.records, self.report)
        self.setUp(); self.report.pop('candidate_executed')
        with self.assertRaisesRegex(AssertionError, 'Actual candidate execution'):
            audit.audit_records(self.records, self.report)

    def test_reject_coherent_quote_and_paid_world_with_wrong_fixed_footprint(self):
        for variant in ('one-patch', 'remote-patch', 'wrong-slope', 'missing-patch'):
            self.setUp(); before = self.packets()[0]['world']
            actor = next(u for u in before['units'] if u['raw_id'] == 8)
            quote = copy.deepcopy(self.packets()[1]['ui']['height_presentation']['quote'])
            if variant == 'one-patch': quote['plan'] = quote['plan'][:1]
            if variant == 'remote-patch': quote['plan'] = quote['plan'][:1] + [{'x': 2, 'y': 2, 'canonical': {'elevation': 500, 'is_water': False}}]
            if variant == 'wrong-slope': quote['plan'][1]['canonical']['elevation'] += 1
            if variant == 'missing-patch': quote['plan'].pop()
            for packet in self.packets()[1:]: packet['ui']['height_presentation']['quote'] = copy.deepcopy(quote)
            self.packets()[-1]['world'] = paid_fixture_world(before, quote['plan'], actor['id'], actor['owner'])
            self.reject()

    def test_reject_changed_shared_corner_inside_allowed_region(self):
        tile = self.packets()[-1]['world']['terrain_trace']['tiles']['8,8']
        tile['elevation']['left'] += 1
        self.reject()

    def test_reject_swapped_checkpoints(self):
        indexes = [i for i, row in enumerate(self.records) if row[0] == 'TH_NATIVE']
        left, right = indexes[1:3]
        self.records[left], self.records[right] = self.records[right], self.records[left]
        self.reject()

    def test_reject_duplicate_query(self):
        self.packets()[2]['query'] = 2
        self.reject()

    def test_reject_wrong_scope(self):
        self.packets()[1]['query_owner']['scope'] = 'root'
        self.reject()

    def test_reject_wrong_stage(self):
        self.packets()[2]['ui']['height_stage'] = 'submitted'
        self.reject()

    def test_reject_stale_owner(self):
        self.packets()[3]['query_owner']['owner'] = 1
        self.reject()

    def test_reject_foreign_actor_even_with_all_seven_owner_coverage(self):
        for packet in self.packets():
            next(row for row in packet['world']['units'] if row['raw_id'] == 8)['owner'] = next(row['id'] for row in packet['world']['players'] if row['raw_id'] == 1)
        self.reject()

    def test_reject_remote_actor_and_funding_contradictions(self):
        for packet in self.packets():
            actor = next(row for row in packet['world']['units'] if row['raw_id'] == 8); actor.update(x=0, y=0)
        self.reject()
        self.setUp()
        source = next(value for kind, value, _ in self.records if kind == 'TH_INPUTS')
        source.update(starting_credits=999, faction_bonus=3, energy={'credits': 123, 'initialized': True, 'last_income_turn': 0})
        self.report['native_input'] = copy.deepcopy(source); self.reject()

    def test_reject_relocated_p_carrier_without_changing_its_events(self):
        fence = self.report['native_snapshots'][0]['query_after_native_key']
        index = next(i for i, (kind, packet, _) in enumerate(self.records) if kind == 'TH_TRACE' and any(event['seq'] == fence for event in packet['events']))
        kind, packet, _ = self.records[index]
        first_native = next(line for name, _, line in self.records if name == 'TH_NATIVE')
        self.records[index] = kind, packet, first_native - 1
        self.reject()
        self.setUp()
        fence = self.report['native_snapshots'][0]['query_after_native_key']
        index = next(i for i, (kind, packet, _) in enumerate(self.records) if kind == 'TH_TRACE' and any(event['seq'] == fence for event in packet['events']))
        kind, packet, _ = self.records[index]
        next_native = [line for name, _, line in self.records if name == 'TH_NATIVE'][1]
        self.records[index] = kind, packet, next_native + 1
        self.reject()

    def test_reject_missing_or_wrong_native_key(self):
        for kind, value, _ in self.records:
            if kind == 'TH_TRACE':
                begins = [e for e in value['events'] if e['kind'] == 'input.dispatch' and e['data'].get('phase') == 'begin' and e['data'].get('code') == 'P']
                if begins:
                    begins[0]['data']['code'] = 'Q'
                    break
        self.reject()

    def test_reject_disabled_lossy_or_wrong_type_trace(self):
        for field, value in [('enabled', False), ('dropped', 1), ('dropped', False)]:
            self.setUp()
            next(v for k, v, _ in self.records if k == 'TH_TRACE')[field] = value
            self.reject()

    def test_reject_duplicate_reordered_and_gapped_trace_without_dict_overwrite(self):
        for change in ('duplicate', 'reorder', 'gap'):
            self.setUp(); events = next(v for k, v, _ in self.records if k == 'TH_TRACE')['events']
            if change == 'duplicate': events.insert(1, copy.deepcopy(events[0]))
            if change == 'reorder': events[0], events[1] = events[1], events[0]
            if change == 'gap': events.append({'seq': events[-1]['seq'] + 2, 'kind': 'model-gap', 'data': {}})
            self.reject()

    def test_reject_bool_payer_revision_before_arithmetic(self):
        for row in self.packets()[:5]:
            payer = next(p['id'] for p in row['world']['players'] if p['raw_id'] == 0)
            row['world']['terrain_trace']['player_details'][payer]['energy_revision'] = True
        self.reject()

    def test_reject_untyped_energy_fields_for_every_nonpayer(self):
        for raw_id in range(1, 7):
            for key, value in (('credits', True), ('credits', 10.0), ('initialized', 1), ('last_income_turn', False), ('last_income_turn', 0.0)):
                self.setUp()
                for packet in self.packets():
                    state = packet['world']; player = next(p for p in state['players'] if p['raw_id'] == raw_id)
                    state['terrain_trace']['player_details'][player['id']]['energy'][key] = value
                self.reject()

    def test_reject_nonint_foreign_revision_even_when_unchanged(self):
        for row in self.packets():
            foreign = next(p['id'] for p in row['world']['players'] if p['raw_id'] == 1)
            row['world']['terrain_trace']['player_details'][foreign]['energy_revision'] = 1.0
        self.reject()

    def test_reject_reduced_or_misbound_research_projection(self):
        for mutation in ('missing', 'short', 'duplicate-player', 'foreign-player', 'bool-target', 'float-science'):
            self.setUp()
            for packet in self.packets():
                state = packet['world']
                if mutation == 'missing': state.pop('research')
                elif mutation == 'short': state['research'].pop()
                elif mutation == 'duplicate-player': state['research'][1]['player'] = state['research'][0]['player']
                elif mutation == 'foreign-player': state['research'][1]['player'] = 'unknown-player'
                elif mutation == 'bool-target': state['research'][1]['target_id'] = False
                else: state['research'][1]['accumulated'] = 0.0
            self.reject()

    def test_reject_missing_or_changed_schema_and_units_in_every_world(self):
        for field in ('schema', 'elevation_units', 'terrain_units'):
            for missing in (True, False):
                self.setUp()
                for packet in self.packets():
                    trace = packet['world']['terrain_trace']
                    if missing: trace.pop(field)
                    elif field == 'terrain_units': trace[field]['rockiness'] = 'different-enum'
                    else: trace[field] = 'unknown-schema-or-units'
                self.reject()

    def test_reject_swapped_or_wrong_type_native_player_detail_identity(self):
        for mutation in ('swap', 'bool', 'float'):
            self.setUp()
            for packet in self.packets():
                state = packet['world']; details = state['terrain_trace']['player_details']
                players = {p['raw_id']: p['id'] for p in state['players']}
                if mutation == 'swap': details[players[1]], details[players[2]] = details[players[2]], details[players[1]]
                else: details[players[1]]['raw_id'] = True if mutation == 'bool' else 1.0
            self.reject()

    def test_reject_inputs_relocated_after_checkpoint_or_actions(self):
        native_lines = [line for kind, _, line in self.records if kind == 'TH_NATIVE']
        for line in (native_lines[0], native_lines[0] + 1, native_lines[-1] + 100):
            self.setUp()
            self.records = [(kind, value, line if kind == 'TH_INPUTS' else old_line) for kind, value, old_line in self.records]
            self.reject()

    def test_reject_missing_world_policy(self):
        self.packets()[1]['world']['terrain_trace'].pop('policy')
        self.reject()

    def test_reject_changed_world_policy(self):
        for policy in ({'version': 1, 'ignore_technologies': False}, {'version': 2, 'ignore_technologies': True}, {'version': True, 'ignore_technologies': True}, {'version': 1, 'ignore_technologies': 1}):
            with self.subTest(policy=policy):
                self.setUp()
                for row in self.packets(): row['world']['terrain_trace']['policy'] = policy.copy()
                self.reject()

    def test_reject_different_actual_input_policy(self):
        for kind, value, _ in self.records:
            if kind == 'TH_INPUTS': value['policy']['ignore_technologies'] = False
        self.report['native_input']['policy']['ignore_technologies'] = False
        self.reject()

    def test_reject_missing_or_unsupported_native_capabilities(self):
        for capability in (None, 'paid_height_work', 'cooperative_work', 'ui'):
            self.setUp()
            for packet in self.packets():
                if capability is None: packet['world']['terrain_trace'].pop('coverage')
                else: packet['world']['terrain_trace']['coverage'][capability] = False
            self.reject()
        self.setUp()
        for packet in self.packets(): packet['world']['terrain_trace']['coverage']['paid_height_work'] = 1
        self.reject()

    def test_reject_missing_actual_coverage(self):
        for field in ('players', 'units', 'bases', 'tiles'):
            with self.subTest(field=field):
                self.setUp()
                for row in self.packets():
                    if field == 'tiles': row['world']['terrain_trace']['tiles'].pop('0,0')
                    else: row['world'][field].pop()
                self.reject()

    def test_reject_duplicate_identity(self):
        for row in self.packets(): row['world']['units'][0]['raw_id'] = row['world']['units'][1]['raw_id']
        self.reject()

    def test_reject_unknown_band_field_change(self):
        for row in self.packets(): row['world']['terrain_trace']['tiles']['8,8']['native_height_band']['future_field'] = False
        self.packets()[-1]['world']['terrain_trace']['tiles']['8,8']['native_height_band']['future_field'] = True
        self.reject()

    def test_reject_wrong_known_band(self):
        self.packets()[-1]['world']['terrain_trace']['tiles']['8,8']['native_height_band']['below_ocean'] = True
        self.reject()

    def test_reject_arbitrary_epoch(self):
        self.packets()[-1]['world']['terrain_trace']['tiles']['8,8']['terrain_epoch'] += 3
        self.reject()

    def test_reject_wrong_canonical_target(self):
        self.packets()[-1]['world']['terrain_trace']['tiles']['8,8']['canonical']['elevation'] += 1
        self.reject()

    def test_reject_wrong_canonical_pin(self):
        base, final = self.packets()[0], self.packets()[-1]
        patches = {f"{p['x']},{p['y']}" for p in self.packets()[1]['ui']['height_presentation']['quote']['plan']}
        key = next(key for key, tile in final['world']['terrain_trace']['tiles'].items()
                   if key not in patches and tile['canonical']['active'] and not base['world']['terrain_trace']['tiles'][key]['canonical']['active'])
        final['world']['terrain_trace']['tiles'][key]['canonical']['is_water'] = True
        self.reject()

    def test_reject_wrong_energy_revision(self):
        payer = next(p['id'] for p in self.packets()[0]['world']['players'] if p['raw_id'] == 0)
        self.packets()[-1]['world']['terrain_trace']['player_details'][payer]['energy_revision'] += 3
        self.reject()

    def test_reject_wrong_policy_quote_fee(self):
        for row in self.packets()[1:]: row['ui']['height_presentation']['quote']['base_fee'] += 1
        self.reject()

    def test_reject_wrong_raw_receipt_identity(self):
        for field, value in [('name', 'move_unit'), ('caller', 1), ('event_id', ''), ('success', False)]:
            with self.subTest(field=field):
                self.setUp()
                receipt = next(value for kind, value, _ in self.records if kind == 'TH_RECEIPT' and value['name'] == 'unit_terraform')
                receipt[field] = value
                # Actual logs contain other receipts: sync only the payment report.
                self.report['height_receipt'] = copy.deepcopy(receipt)
                for item, row in zip(self.report['native_snapshots'], self.packets()): item['observation'] = audit.node_projection(row)
                with self.assertRaises((AssertionError, KeyError, TypeError)): audit.audit_records(self.records, self.report)

    def test_reject_wrong_raw_receipt_payload(self):
        for field, value in [('unit_id', 9), ('action', 'lower'), ('confirmed_height', False)]:
            with self.subTest(field=field):
                self.setUp()
                receipt = next(value for kind, value, _ in self.records if kind == 'TH_RECEIPT' and value['name'] == 'unit_terraform')
                receipt['data'][field] = value
                self.report['height_receipt'] = copy.deepcopy(receipt)
                with self.assertRaises((AssertionError, KeyError, TypeError)): audit.audit_records(self.records, self.report)

    def test_reject_report_only_receipt(self):
        self.report['height_receipt']['event_id'] = 'invented'
        with self.assertRaises(AssertionError): audit.audit_records(self.records, self.report)

    def test_reject_ack_outside_draft_completion(self):
        index = next(i for i, (kind, value, _) in enumerate(self.records) if kind == 'TH_RECEIPT' and value['name'] == 'unit_terraform')
        kind, value, _ = self.records[index]
        self.records[index] = (kind, value, -1)
        self.report['height_receipt'] = copy.deepcopy(value)
        with self.assertRaises(AssertionError): audit.audit_records(self.records, self.report)

    def test_reject_integral_float_coercion(self):
        self.packets()[-1]['world']['units'][0]['health'] = 1
        self.reject()

    def test_reject_signed_zero_loss(self):
        final = self.packets()[-1]
        actor = next(row for row in final['world']['units'] if row['raw_id'] == 8)
        actor['movement'] = -0.0
        final['ui'].update(movement=-0.0, movement_bits=2147483648)
        self.reject()


class ProtocolAuditTests(AuditMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = protocol_fixture()

    def test_checked_native_fields_remain_observations_without_case_credit(self):
        result = audit.audit_records(self.records, self.report)
        self.assertEqual(result['observed_worlds'], 6)
        self.assertEqual(result['typed_pure_checkpoints'], 5)
        self.assertGreater(result['parsed_native_world_changed_fields'], 0)
        self.assertEqual(result['native_float_unit_fields_checked'], 96)
        self.assertEqual(result['native_receipts']['observed_completions'], 1)
        self.assertEqual(result['complete_worlds'], 0)
        self.assertTrue(result['status'].startswith('observations-only-'))
        self.assertFalse(result['compile_attribution_verified'])
        self.assertFalse(result['public_retained_replay_available'])
        for key in ('native_cases_added', 'browser_cases_audited', 'native_capture_field_cases_audited'):
            self.assertEqual(result[key], 0)

    def test_unreported_native_completion_cannot_leave_final_snapshot_stale(self):
        for name in ('move_unit', 'advance_turn', 'unknown_action'):
            for line in (15, 54, 56, 64, 71):
                with self.subTest(name=name, line=line):
                    records, report = protocol_fixture()
                    records.extend([('TH_EXIT_REQUEST', None, 70), ('TH_RECEIPT', {
                        'name': name, 'event_id': 'opaque-extra', 'caller': 0, 'success': True,
                        'data': {'unit_id': 8}}, line)])
                    with self.assertRaisesRegex(AssertionError, 'Unexpected native completion'):
                        audit.audit_records(records, report)

    def test_startup_receipts_are_preserved_before_observed_flow(self):
        records, report = protocol_fixture()
        records.extend([('TH_RECEIPT', {'name': 'spawn_unit', 'event_id': 'opaque-startup',
            'caller': 0, 'success': True, 'data': {'type': 'Formers'}}, 1), ('TH_EXIT_REQUEST', None, 70)])
        result = audit.audit_records(records, report)
        self.assertEqual(result['native_receipts'], {'total': 2, 'startup_before_first_checkpoint': 1,
                                                   'observed_completions': 1, 'unexpected_completions': 0})

    def test_all_receipt_envelopes_and_final_completion_order_are_checked(self):
        for key, value in (('caller', True), ('success', 1), ('success', False),
                           ('data', []), ('event_id', '0_68'), ('name', '')):
            with self.subTest(key=key, value=value):
                records, report = protocol_fixture()
                startup = {'name': 'spawn_unit', 'event_id': 'opaque-startup', 'caller': 0,
                           'success': True, 'data': {'type': 'Formers'}}
                startup[key] = value
                records.append(('TH_RECEIPT', startup, 1))
                with self.assertRaises(AssertionError): audit.audit_records(records, report)
        records, report = protocol_fixture()
        records.append(('TH_EXIT_REQUEST', None, 59))
        with self.assertRaises(AssertionError): audit.audit_records(records, report)


@unittest.skipUnless(os.environ.get('TERRAFORM_HEIGHT_CAPTURE'), 'Set TERRAFORM_HEIGHT_CAPTURE for retained actual six-packet mutation replay')
class ActualCaptureAuditTests(AuditMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = Path(os.environ['TERRAFORM_HEIGHT_CAPTURE'])
        cls.original = (audit.parse_records((cls.directory / 'application.log').read_bytes()), json.loads((cls.directory / 'report.json').read_bytes()))

    def sync_report(self, sync_ui=True):
        super().sync_report(sync_ui)
        self.report['height_receipt'] = copy.deepcopy(next(value for kind, value, _ in self.records if kind == 'TH_RECEIPT' and value['name'] == 'unit_terraform'))

    def test_exact_retained_artifact_audit(self):
        result = audit.audit_artifacts(self.directory)
        self.assertEqual(result['parsed_native_world_changed_fields'], 229)
        self.assertEqual(result['browser_cases_audited'], 0)
        self.assertEqual(result['complete_browser_cases_audited'], 0)
        self.assertEqual(result['bounded_state_receipt_cases_audited'], 0)
        self.assertEqual(result['execution_cases_audited'], 0)
        self.assertEqual(result['native_capture_field_cases_audited'], 0)
        self.assertTrue(result['external_node_exit']['supported'])
        self.assertEqual(result['status'], 'observations-only-readonly-audit')
        self.assertFalse(result['finalization']['exact_callback_message_identity']['supported'])
        self.assertEqual(result['raw_bytes'], 14465994)
        self.assertEqual(result['raw_sha256'], '7877baed15b88c2700f3042fe5c31f64c6ee66517dcef04541c1ced832bad473')


def finalization_fixture():
    """Synthetic metadata envelope; never claimed to be a real engine run."""
    records, report = protocol_fixture()
    exit_events = [{'seq': 19, 'kind': 'input.ingress', 'data': {'ingress': 7, 'type': 'keydown'}},
                   {'seq': 20, 'kind': 'input.dispatch', 'data': {'ingress': 7, 'phase': 'begin', 'type': 'keydown', 'code': 'Q', 'modifiers': 6}},
                   {'seq': 21, 'kind': 'input.dispatch', 'data': {'ingress': 7, 'phase': 'end', 'handled': True}}]
    records.append(('TH_TRACE', {'enabled': True, 'dropped': 0, 'events': exit_events}, 65))
    lines = []
    for kind, value, _ in sorted(records, key=lambda row: row[2]):
        encoded = json.dumps(json.dumps(value)) if kind == 'TH_TRACE' else json.dumps(value)
        lines.append(kind + '|' + encoded)
    text = chr(10).join(lines) + chr(10) + 'TH_EXIT_REQUEST' + chr(10)
    raw = text.encode()
    records = audit.parse_records(raw)
    length = audit.utf16_length(text)
    calls, offset = [], 0
    for line in text.splitlines(keepends=True):
        size = audit.utf16_length(line)
        calls.append({'sequence': len(calls) + 1, 'channel': 'stdout', 'before_utf16': offset, 'after_utf16': offset + size,
                      'message_utf16': size - 1, 'message': line[:-1], 'observed_ms': 1.0, 'runtime_out_bound': True,
                      'runtime_err_bound': True, 'runtime_callMain_present': True})
        offset += size
    callback = {'installed_before_runtime_capture': True, 'initial_text': '', 'initial_utf16': 0,
                'calls': calls, 'first_callback': {**calls[0], 'message': text.splitlines()[0]},
                'original_source': 'protocol log function', 'stdout_source': 'protocol stdout', 'stderr_source': 'protocol stderr'}
    barrier = {'kind': 'main', 'fetch_id': 'main-fetch', 'network_id': 'main-network', 'frame_id': 'frame',
               'continued': True, 'before_unmodified_runtime_response': True, 'continuation_acknowledged_node_ms': 2.0,
               'ack': {'installed_before_runtime_capture': True, 'original_source': callback['original_source'],
                       'stdout_source': callback['stdout_source'], 'stderr_source': callback['stderr_source']}}
    workers = [{'kind': 'worker', 'fetch_id': f'fetch{i}', 'network_id': f'target{i}', 'target_id': f'target{i}',
                'frame_id': 'frame', 'continued': True, 'continued_without_frame_lookup': True,
                'continuation_acknowledged_node_ms': 3.0} for i in range(8)]
    config = {'installations': 1, 'barrier': barrier, 'callbacks': callback, 'worker_requests': workers,
              'original_log_source_sha256': hashlib.sha256(callback['original_source'].encode()).hexdigest(),
              'protocol_events': [{'kind': 'continue-acknowledged', 'role': {key: row[key] for key in ('kind', 'fetch_id', 'network_id', 'frame_id')}} for row in [barrier] + workers]}
    digest = hashlib.sha256(raw).hexdigest()
    chunks = [{'start_utf16': 0, 'end_utf16': length, 'text': text}]
    report.update(status='passed', native_raw_exit_code=0, native_exit={'body_state': 'exited', 'status_text': 'GLSMAC exited (0).', 'raw_code': 0},
                  browser_errors=[], errors=[], native_log_configuration=config,
                  log_transport={'sealed': True, 'partial': False, 'settled_failure': None, 'unread_tail': False,
                                 'raw_sha256': digest, 'joined_chunk_sha256': digest, 'retained_utf8': len(raw), 'retained_utf16': length,
                                 'reads': [{'start_utf16': 0, 'end_utf16': length, 'transferred_utf16': length, 'transferred_utf8': len(raw)}]})
    return report, raw, chunks, records


class FinalizationMutations:
    def setUp(self):
        self.report, self.raw, self.chunks, self.records = copy.deepcopy(self.original_final)

    def reject(self):
        with self.assertRaises((AssertionError, KeyError, TypeError)):
            audit.validate_finalization(self.report, self.raw, self.chunks, self.records)

    def test_finalization_valid_and_native_fields_alone_never_claim_full_browser(self):
        result = audit.validate_finalization(self.report, self.raw, self.chunks, self.records)
        self.assertTrue(result['native_exit_verified'])
        self.assertEqual(audit.audit_records(self.records, self.report)['browser_cases_audited'], 0)

    def test_reject_missing_or_false_seal(self):
        self.report['log_transport'].pop('sealed')
        self.reject()
        self.setUp(); self.report['log_transport']['sealed'] = False; self.reject()

    def test_reject_unknown_tail_and_settled_error(self):
        for field, value in [('unread_tail', 'unknown'), ('settled_failure', 'late read failure'), ('partial', True)]:
            with self.subTest(field=field):
                self.setUp(); self.report['log_transport'][field] = value; self.reject()

    def test_reject_native_exit_only_report_or_nonzero_status(self):
        self.report.pop('native_exit'); self.reject()
        self.setUp(); self.report['native_exit']['status_text'] = 'GLSMAC exited (1).'; self.reject()
        self.setUp(); self.report['native_raw_exit_code'] = 1; self.reject()

    def test_reject_late_fatal_raw_suffix_even_with_rebound_hash(self):
        self.raw += b'TH_ERROR|late native failure\n'
        self.report['log_transport']['raw_sha256'] = hashlib.sha256(self.raw).hexdigest()
        self.report['log_transport']['joined_chunk_sha256'] = hashlib.sha256(self.raw).hexdigest()
        self.reject()

    def test_reject_browser_or_barrier_error(self):
        self.report['browser_errors'].append('late browser error'); self.reject()
        self.setUp(); self.report['native_log_configuration']['protocol_events'].append({'kind': 'rejected', 'error': 'late barrier failure'}); self.reject()

    def test_reject_missing_main_ack(self):
        self.report['native_log_configuration']['barrier'].pop('continued'); self.reject()

    def test_reject_missing_worker_or_failed_worker_ack(self):
        self.report['native_log_configuration']['worker_requests'].pop(); self.reject()
        self.setUp(); self.report['native_log_configuration']['worker_requests'][0]['continued'] = False; self.reject()

    def test_reject_unlinked_cdp_ack(self):
        config = self.report['native_log_configuration']
        event = next(row for row in config['protocol_events'] if row['kind'] == 'continue-acknowledged' and row['role']['kind'] == 'worker')
        event['role']['network_id'] = 'wrong-network'
        self.reject()

    def test_reject_first_capture_binding_mismatch(self):
        for field in ('runtime_out_bound', 'runtime_err_bound', 'runtime_callMain_present'):
            with self.subTest(field=field):
                self.setUp(); self.report['native_log_configuration']['callbacks']['first_callback'][field] = False; self.reject()

    def test_reject_chunk_offset_or_length_mismatch(self):
        self.chunks[-1]['end_utf16'] += 1; self.reject()
        self.setUp(); self.report['log_transport']['retained_utf8'] += 1; self.reject()

    def test_reject_missing_middle_callback_even_after_resequencing(self):
        calls = self.report['native_log_configuration']['callbacks']['calls']
        calls.pop(len(calls) // 2)
        for i, call in enumerate(calls): call['sequence'] = i + 1
        self.reject()

    def test_reject_uncovered_callback_tail(self):
        self.report['native_log_configuration']['callbacks']['calls'].pop()
        self.reject()

    def test_reject_exit_trace_carrier_after_fixture_exit_marker(self):
        exit_line = next(i for i, line in enumerate(self.raw.decode().splitlines()) if 'TH_EXIT_REQUEST' in line)
        self.records = [(kind, value, exit_line + 1 if kind == 'TH_TRACE' and any(e['data'].get('code') == 'Q' for e in value['events']) else line)
                        for kind, value, line in self.records]
        self.reject()

    def test_reject_missing_actual_q_dispatch(self):
        for kind, value, _ in self.records:
            if kind == 'TH_TRACE':
                for event in value['events']:
                    if event['kind'] == 'input.dispatch' and event['data'].get('code') == 'Q': event['data']['code'] = 'X'
        self.reject()


class ProtocolFinalizationTests(FinalizationMutations, unittest.TestCase):
    def test_reported_capabilities_and_os_receipt_cannot_create_passing_case_credit(self):
        for execution in (False, True):
            for callbacks in (False, True):
                for entities in (False, True):
                    with self.subTest(execution=execution, callbacks=callbacks, entities=entities):
                        external = {'supported': execution, 'receipt_verification': 'public-model-only'}
                        original = copy.deepcopy(external)
                        result = audit.classify_browser_credit(
                            {'exact_callback_message_identity': {'supported': callbacks}},
                            external, {'supported': entities})
                        for key in ('native_cases_added', 'native_capture_field_cases_audited',
                                    'browser_cases_audited', 'complete_browser_cases_audited',
                                    'execution_cases_audited', 'bounded_state_receipt_cases_audited',
                                    'bounded_journal_field_cases_audited'):
                            self.assertEqual(result[key], 0, key)
                        self.assertFalse(result['compile_attribution_verified'])
                        self.assertFalse(result['public_retained_replay_available'])
                        self.assertEqual(result['status'], 'observations-only-readonly-audit')
                        self.assertEqual(external, original, 'Independent receipt observations must remain unchanged')


    def test_semantic_json_records_require_exact_source_framing(self):
        for kind, value in (('TH_INPUTS', {'policy': 'model'}), ('TH_NATIVE', {'world': 'model'}),
                            ('TH_RECEIPT', {'event_id': 'opaque'}), ('TH_TRACE', json.dumps({'events': []})),
                            ('TH_HEADERS', []), ('TH_ROWS', [])):
            encoded = kind + '|' + json.dumps(value)
            for prefix in ('', '    [/height-snapshot/GLSMAC_data/default/browser_height_main.gls.js:129:6] '):
                self.assertEqual(audit.parse_records((prefix + encoded + '\n').encode()), [(kind, json.loads(value) if kind == 'TH_TRACE' else value, 0)])
            for prefix in ('noise', 'prefix:', '    [other.gls.js:129:6] '):
                self.assertEqual(audit.parse_records((prefix + encoded + '\n').encode()), [])
            with self.assertRaises(ValueError): audit.parse_records((encoded + ' trailing-noise\n').encode())

    def test_exit_request_must_be_a_complete_permitted_record(self):
        for marker in ('noise:TH_EXIT_REQUEST', 'TH_EXIT_REQUEST suffix', 'TH_EXIT_REQUEST|{}',
                       '    [other-source.gls.js:132:27] TH_EXIT_REQUEST'):
            self.setUp()
            text = self.raw.decode().replace('\nTH_EXIT_REQUEST\n', '\n' + marker + '\n')
            self.raw = text.encode()
            self.records = audit.parse_records(self.raw)
            length = audit.utf16_length(text)
            self.chunks = [{'start_utf16': 0, 'end_utf16': length, 'text': text}]
            digest = hashlib.sha256(self.raw).hexdigest()
            self.report['log_transport'].update(raw_sha256=digest, joined_chunk_sha256=digest,
                retained_utf8=len(self.raw), retained_utf16=length,
                reads=[{'start_utf16': 0, 'end_utf16': length, 'transferred_utf16': length, 'transferred_utf8': len(self.raw)}])
            offset = 0
            calls = self.report['native_log_configuration']['callbacks']['calls']
            for call, line in zip(calls, text.splitlines(keepends=True)):
                size = audit.utf16_length(line)
                call.update(before_utf16=offset, after_utf16=offset + size, message_utf16=size - 1, message=line[:-1])
                offset += size
            self.assertEqual(offset, length)
            self.reject()

    def test_exact_gse_exit_record_and_synthetic_standalone_record(self):
        for line in ('TH_EXIT_REQUEST',
                     '    [/height-snapshot/GLSMAC_data/default/browser_height_main.gls.js:132:27] TH_EXIT_REQUEST',
                     '    [/height-snapshot/GLSMAC_data/default/browser_height_main.gls.js:144:27] TH_EXIT_REQUEST'):
            self.assertEqual(audit.parse_records((line + '\n').encode()), [('TH_EXIT_REQUEST', None, 0)])

    def test_modern_callback_messages_bind_each_interval(self):
        result = audit.validate_finalization(self.report, self.raw, self.chunks, self.records)
        self.assertTrue(result['exact_callback_message_identity']['supported'])
        self.assertEqual(audit.classify_browser_credit(result, {'supported': True})['complete_browser_cases_audited'], 0)
        # Complete callback messages do not supply absent native detail identities.
        calls = self.report['native_log_configuration']['callbacks']['calls']
        calls[1]['message'] = 'changed message'
        self.reject()

    def test_modern_callback_absorption_is_rejected(self):
        calls = self.report['native_log_configuration']['callbacks']['calls']
        calls[1]['after_utf16'] = calls[2]['after_utf16']
        calls[1]['message_utf16'] = calls[1]['after_utf16'] - calls[1]['before_utf16'] - 1
        calls.pop(2)
        for i, call in enumerate(calls): call['sequence'] = i + 1
        self.reject()

    def test_modern_digest_binding_rejects_modified_payload(self):
        calls = self.report['native_log_configuration']['callbacks']['calls']
        for call in calls:
            call['message_utf16le_sha256'] = hashlib.sha256(call.pop('message').encode('utf-16-le')).hexdigest()
        first = self.report['native_log_configuration']['callbacks']['first_callback']
        first['message_utf16le_sha256'] = calls[0]['message_utf16le_sha256']
        self.assertTrue(audit.validate_finalization(self.report, self.raw, self.chunks, self.records)['exact_callback_message_identity']['supported'])
        calls[1]['message_utf16le_sha256'] = '0' * 64
        self.reject()

    def test_legacy_offset_only_journal_is_not_complete_callback_identity(self):
        for call in self.report['native_log_configuration']['callbacks']['calls']: call.pop('message', None)
        result = audit.validate_finalization(self.report, self.raw, self.chunks, self.records)
        self.assertFalse(result['exact_callback_message_identity']['supported'])
        credit = audit.classify_browser_credit(result, {'supported': True})
        self.assertEqual(credit['complete_browser_cases_audited'], 0)
        self.assertEqual(credit['browser_cases_audited'], 0)
        self.assertEqual(credit['bounded_state_receipt_cases_audited'], 0)
        self.assertTrue(credit['status'].startswith('observations-only-'))
        calls = self.report['native_log_configuration']['callbacks']['calls']
        # Source-only legacy metadata can absorb one omitted entry. Preserve
        # the fact that even contiguous offsets cannot prove callback identity.
        calls[1]['after_utf16'] = calls[2]['after_utf16']
        calls[1]['message_utf16'] = calls[1]['after_utf16'] - calls[1]['before_utf16'] - 1
        calls.pop(2)
        for i, call in enumerate(calls): call['sequence'] = i + 1
        self.assertFalse(audit.validate_finalization(self.report, self.raw, self.chunks, self.records)['exact_callback_message_identity']['supported'])

    @classmethod
    def setUpClass(cls):
        cls.original_final = finalization_fixture()


@unittest.skipUnless(os.environ.get('TERRAFORM_HEIGHT_CAPTURE'), 'Set capture for actual envelope mutation replay')
class ActualFinalizationTests(FinalizationMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = Path(os.environ['TERRAFORM_HEIGHT_CAPTURE'])
        raw = (directory / 'application.log').read_bytes()
        cls.original_final = (json.loads((directory / 'report.json').read_bytes()), raw,
            [json.loads(line) for line in (directory / 'application-log-chunks.jsonl').read_text().splitlines() if line], audit.parse_records(raw))

    def test_legacy_preflight_rejects_unknown_or_missing_renamed_kind(self):
        directory = Path(os.environ['TERRAFORM_HEIGHT_CAPTURE'])
        encoded = (directory / 'preflight.json').read_bytes(); preflight = json.loads(encoded)
        native_input = next(value for kind, value, _ in self.records if kind == 'TH_INPUTS')
        self.assertTrue(audit.validate_preflight(directory, preflight, encoded, self.report, native_input).startswith('historical-'))
        for value in (None, 'unknown.v99'):
            changed = copy.deepcopy(preflight); changed['kind'] = value; changed_bytes = json.dumps(changed).encode()
            with self.assertRaises((AssertionError, KeyError)): audit.validate_preflight(directory, changed, changed_bytes, self.report, native_input)

    def test_legacy_preflight_binds_available_report_source_seed_and_live_rule(self):
        directory = Path(os.environ['TERRAFORM_HEIGHT_CAPTURE'])
        encoded = (directory / 'preflight.json').read_bytes(); preflight = json.loads(encoded)
        for field in ('seed_requested', 'driver_sha256', 'observer_sha256', 'world_input_sha256', 'height_observation_sha256'):
            with self.subTest(field=field):
                report = copy.deepcopy(self.report); report[field] = 'wrong source'
                native_input = next(value for kind, value, _ in self.records if kind == 'TH_INPUTS')
                with self.assertRaises((AssertionError, KeyError)): audit.validate_preflight(directory, preflight, encoded, report, native_input)
        native_input = copy.deepcopy(next(value for kind, value, _ in self.records if kind == 'TH_INPUTS'))
        native_input['raise_rule']['sea']['name'] = 'invented name'
        with self.assertRaises(AssertionError): audit.validate_preflight(directory, preflight, encoded, self.report, native_input)

    def test_legacy_outer_completion_cannot_be_reused_for_other_capture(self):
        directory = Path(os.environ['TERRAFORM_HEIGHT_CAPTURE']); bindings = copy.deepcopy(audit.LEGACY_CAPTURE_BINDINGS)
        self.assertTrue(audit.validate_external_exit(directory / 'raw-outcome.json', self.report['native_exit'], bindings)['supported'])
        bindings['report_sha256'] = '0' * 64
        with self.assertRaises(AssertionError): audit.validate_external_exit(directory / 'raw-outcome.json', self.report['native_exit'], bindings)


def keyboard_route_fixture():
    """Public model of physical modifier/command edges; never runtime proof."""
    events, receipts, snapshots = [], [], []
    def emit(kind, data):
        event = {'seq': len(events) + 1, 'kind': kind, 'target': 'input', 'data': data}
        events.append(event)
        return copy.deepcopy(event)
    ingress_id = 0
    for index, code in enumerate(['K'] + ['P'] * 6 + ['Q']):
        receipt = {'shortcut': 'Control+Alt+' + code.lower()}
        scan = {'K': 14, 'P': 19, 'Q': 20}[code]
        for offset, (edge, keycode, scancode, rawmods, normalized, mods) in enumerate([
            ('keydown', 1073742048, 224, 64, 'CTRL', 2), ('keydown', 1073742050, 226, 320, 'ALT', 6),
            ('keydown', ord(code.lower()), scan, 320, code, 6), ('keyup', ord(code.lower()), scan, 320, code, 6),
            ('keyup', 1073742050, 226, 64, 'ALT', 2), ('keyup', 1073742048, 224, 0, 'CTRL', 0)]):
            ingress_id += 1
            action = 1 if edge == 'keydown' else 2
            ingress = emit('input.ingress', {'ingress': ingress_id, 'type': edge, 'keycode': keycode, 'scancode': scancode,
                'modifiers': rawmods, 'repeat': 0, 'sdl_type': 768 if action == 1 else 769, 'action': action})
            begin = emit('input.dispatch', {'phase': 'begin', 'ingress': ingress_id, 'type': edge, 'code': normalized, 'modifiers': mods, 'action': action})
            end = emit('input.dispatch', {'phase': 'end', 'ingress': ingress_id, 'handled': True})
            if offset == 2:
                receipt.update(ingress=ingress, begin=begin, end=end)
                if 1 <= index <= 6: snapshots.append({'query_after_native_key': end['seq']})
        receipts.append(receipt)
    return [('TH_TRACE', {'enabled': True, 'dropped': 0, 'events': events}, 0)], {'processed_keys': receipts, 'native_snapshots': snapshots}


class ProtocolKeyboardRouteTests(unittest.TestCase):
    def test_exact_eight_shortcuts_and_all_modifier_edges(self):
        records, report = keyboard_route_fixture()
        self.assertEqual(audit.validate_keyboard_route(records, report)['raw_key_edges_exhausted'], 48)

    def test_unreported_enter_between_clicks_is_rejected(self):
        records, report = keyboard_route_fixture()
        events = records[0][1]['events']
        events.append({'seq': len(events) + 1, 'kind': 'input.ingress', 'data': {'type': 'keydown', 'keycode': 13, 'ingress': 1000}})
        with self.assertRaises(AssertionError): audit.validate_keyboard_route(records, report)

    def test_wrong_modifiers_repeated_keys_or_fabricated_receipt_rejected(self):
        for change in ('modifiers', 'repeat', 'bool_id', 'wrong_receipt', 'wrong_query', 'missing_release', 'extra_dispatch'):
            records, report = keyboard_route_fixture()
            events = records[0][1]['events']
            if change == 'modifiers': events[0]['data']['modifiers'] = 0
            if change == 'repeat': events[0]['data']['repeat'] = 1
            if change == 'bool_id': events[0]['data']['ingress'] = True
            if change == 'wrong_receipt': report['processed_keys'][0]['end']['data']['handled'] = False
            if change == 'wrong_query': report['native_snapshots'][0]['query_after_native_key'] += 1
            if change == 'missing_release': events[-3]['data']['type'] = 'other'
            if change == 'extra_dispatch': events.append({'seq': len(events) + 1, 'kind': 'input.dispatch', 'data': {'phase': 'begin', 'type': 'keydown', 'code': 'ENTER', 'ingress': 999}})
            with self.assertRaises((AssertionError, KeyError, TypeError)): audit.validate_keyboard_route(records, report)


class ExternalOutcomeTests(unittest.TestCase):
    def test_missing_unknown_wrongrun_nonzero_and_unreaped_external_result(self):
        native = {'body_state': 'exited', 'status_text': 'GLSMAC exited (0).', 'raw_code': 0}
        bindings = {key: 'a' * 64 for key in ('raw_sha256', 'report_sha256', 'preflight_sha256')}; bindings['host_head'] = 'b' * 40
        data = {'kind': 'terraform-height-external-process-outcome.v1', 'version': 1, 'capture_bindings': bindings,
                'status': 'exited', 'raw_process_exit': 0, 'tool_session_id': 123, 'tool_completion_chunk_id': 'actual-chunk',
                'tool_completion_result': {'chunk_id': 'actual-chunk', 'exit_code': 0}, 'source': 'protocol-only external-launcher metadata',
                'command': 'node --test tools/wasm-tests/terraform-height-browser.test.mjs', 'native_exit': native, 'browser_server_driver_reaped': True}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'outcome.json'
            self.assertFalse(audit.validate_external_exit(path, native, bindings)['supported'])
            path.write_text(json.dumps(data)); external = audit.validate_external_exit(path, native, bindings)
            self.assertFalse(external['supported'], 'Caller-authored session/chunk JSON is not an independent process witness')
            credit = audit.classify_browser_credit({'exact_callback_message_identity': {'supported': True}}, external)
            self.assertEqual(credit['execution_cases_audited'], 0); self.assertEqual(credit['complete_browser_cases_audited'], 0)
            for change in (lambda d: d.update(kind='unknown'), lambda d: d['capture_bindings'].update(raw_sha256='wrong'),
                           lambda d: d.update(raw_process_exit=1), lambda d: d['tool_completion_result'].update(exit_code=1),
                           lambda d: d.pop('tool_completion_result'), lambda d: d.update(browser_server_driver_reaped=False),
                           lambda d: d.update(command="echo 'node --test tools/wasm-tests/terraform-height-browser.test.mjs'"),
                           lambda d: d.update(command='node --test tools/wasm-tests/terraform-height-browser.test.mjs; echo success'),
                           lambda d: d.update(command='node --test tools/wasm-tests/other.test.mjs')):
                mutated = copy.deepcopy(data); change(mutated); path.write_text(json.dumps(mutated))
                with self.assertRaises((AssertionError, KeyError, TypeError)): audit.validate_external_exit(path, native, bindings)

class DerivedOutputTests(unittest.TestCase):
    """Deterministic writer interleaving only; no game or retained capture."""
    def invoke(self, directory, output, perform):
        import contextlib
        import io
        from unittest.mock import patch
        argv = ['height-audit', '--artifacts', str(directory)]
        if output is not None: argv += ['--output', str(output)]
        with patch.object(sys, 'argv', argv), patch.object(audit, 'audit_artifacts', side_effect=perform), contextlib.redirect_stdout(io.StringIO()):
            audit.main()

    def test_existing_explicit_or_default_result_rejects_before_audit(self):
        for explicit in (False, True):
            with self.subTest(explicit=explicit), tempfile.TemporaryDirectory() as folder:
                directory = Path(folder); path = directory / ('new.json' if explicit else 'raw-typed-audit.json')
                path.write_bytes(b'original retained result\n'); calls = []
                with self.assertRaises(FileExistsError):
                    self.invoke(directory, path if explicit else None, lambda *a: calls.append(a) or {'status': 'synthetic'})
                self.assertEqual(calls, [])
                self.assertEqual(path.read_bytes(), b'original retained result\n')

    def test_other_writer_during_audit_keeps_its_exact_result(self):
        for explicit in (False, True):
            with self.subTest(explicit=explicit), tempfile.TemporaryDirectory() as folder:
                directory = Path(folder); path = directory / ('new.json' if explicit else 'raw-typed-audit.json')
                def intervening_writer(*args):
                    path.write_bytes(b'first writer immutable result\n')
                    return {'status': 'synthetic later writer'}
                with self.assertRaises(FileExistsError):
                    self.invoke(directory, path if explicit else None, intervening_writer)
                self.assertEqual(path.read_bytes(), b'first writer immutable result\n')

    def test_fresh_result_is_written_once(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder); output = directory / 'fresh.json'
            self.invoke(directory, output, lambda *a: {'status': 'synthetic writer model', 'native_cases_added': 0})
            self.assertEqual(json.loads(output.read_text()), {'status': 'synthetic writer model', 'native_cases_added': 0})


def pointer_route_fixture():
    """Asset-free model of the same eight native widget/input protocol steps."""
    records, report = protocol_fixture()
    records = [row for row in records if row[0] != 'TH_TRACE']
    report['native_input']['raise_rule']['order'] = 'Terraform UP'
    for kind, value, _ in records:
        if kind == 'TH_INPUTS': value['raise_rule']['order'] = 'Terraform UP'
        if kind == 'TH_NATIVE':
            value['ui']['viewport'] = {'width': 1024, 'height': 768}
            if value['ui']['dialog'] is not None:
                value['ui']['dialog'].update(choices=['Cancel action.', 'Expend 4 credits.'], source_choices=['Cancel action.', 'Expend $NUM0 credits.'])
    events, pointers, allocated = [], [], set()
    ingress = 0
    bounds = {'area': 'effective', 'left': 20, 'top': 10, 'right': 100, 'bottom': 30, 'zindex': 0.5}

    def emit(kind, target, data):
        event = {'seq': len(events) + 1, 'kind': kind, 'target': target, 'data': data}
        events.append(event)
        return copy.deepcopy(event)

    def query(checkpoint):
        nonlocal ingress
        ingress += 1
        emit('input.ingress', 'input', {'type': 'keydown', 'ingress': ingress})
        emit('input.dispatch', 'input', {'phase': 'begin', 'type': 'keydown', 'code': 'P', 'modifiers': 6, 'ingress': ingress})
        end = emit('input.dispatch', 'input', {'phase': 'end', 'handled': True, 'ingress': ingress})
        report['native_snapshots'][checkpoint]['query_after_native_key'] = end['seq']

    def click(target, role, source, label):
        nonlocal ingress
        if target not in allocated:
            emit('node.create', target, {'tag': '$button', 'parent': None})
            emit('node.property', target, {'key': 'text', 'value': label})
            emit('node.property', target, {'key': 'color', 'value': 'enabled-color'})
            if role: emit('semantic.role', target, {'role': role, 'source': source})
            emit('semantic.geometry', target, copy.deepcopy(bounds))
            emit('node.show', target, {})
            allocated.add(target)
        fence = events[-1]['seq']
        item = {'id': target, 'label': label, 'bounds': copy.deepcopy(bounds), 'x': 60, 'y': 20}
        if role: item.update(role=role, source=source)
        receipt = {'fence': fence, 'target': item, 'viewport': {'width': 1024, 'height': 768},
                   'canvas_css_rect': {'x': 0, 'y': 0, 'width': 1024, 'height': 768}, 'css': {'x': 60, 'y': 20}}
        receipt['hover'] = emit('input.ui-transition', target, {'type': 'mouseover', 'x': 60, 'y': 20})
        for stem, event_type in [('down', 'mousedown'), ('up', 'mouseup')]:
            ingress += 1
            data = {'type': event_type, 'ingress': ingress, 'button': 1, 'x': 60, 'y': 20}
            receipt[stem + '_ingress'] = emit('input.ingress', 'input', copy.deepcopy(data))
            receipt[stem] = emit('input.dispatch', 'input', {**data, 'phase': 'begin'})
            receipt['down_end' if stem == 'down' else 'end'] = emit('input.dispatch', 'input', {'phase': 'end', 'ingress': ingress, 'handled': True})
        pointers.append(receipt)

    query(0)
    click('menu', None, None, 'MENU'); click('header', 'terraform-header', 'left_menu_terraform', 'TERRAFORM')
    click('raise', 'terraform-row', 'raise', 'Terraform UP'); query(1)
    click('cancel-ok', 'terraform-height-ok', 'confirm', 'OK'); query(2)
    emit('node.destroy', 'cancel-ok', {})
    click('header', 'terraform-header', 'left_menu_terraform', 'TERRAFORM'); click('raise', 'terraform-row', 'raise', 'Terraform UP'); query(3)
    click('expend', 'terraform-height-choice', '1', 'Expend 4 credits.'); query(4)
    click('confirm-ok', 'terraform-height-ok', 'confirm', 'OK'); query(5)
    records.extend([('TH_HEADERS', [{'id': 'left_menu_terraform', 'label': 'TERRAFORM'}], 0),
                    ('TH_ROWS', [{'id': 'raise', 'label': 'Terraform UP', 'enabled': True}], 0),
                    ('TH_TRACE', {'enabled': True, 'dropped': 0, 'events': events}, 1)])
    report['processed_pointers'] = pointers
    return records, report


class PointerRouteMutations:
    def setUp(self):
        self.records, self.report = copy.deepcopy(self.original_route)

    def reject(self):
        with self.assertRaises((AssertionError, KeyError, TypeError)):
            audit.validate_pointer_route(self.records, self.report)

    def mutate_actual_receipt(self, index, key, field, value):
        row = self.report['processed_pointers'][index][key]
        row['data'][field] = value
        actual = next(event for kind, packet, _ in self.records if kind == 'TH_TRACE' for event in packet['events'] if event['seq'] == row['seq'])
        actual['data'][field] = value

    def test_valid_exact_physical_route_is_readonly(self):
        before = copy.deepcopy((self.records, self.report))
        self.assertEqual(audit.validate_pointer_route(self.records, self.report)['physical_clicks_verified'], 8)
        self.assertTrue(audit.equal(before, (self.records, self.report)))

    def insert_target_event(self, pointer, edge, kind, data):
        receipt = self.report['processed_pointers'][pointer]
        cut, target = receipt[edge]['seq'], receipt['target']['id']
        selected = next(packet for name, packet, _ in self.records if name == 'TH_TRACE' and any(e['seq'] == cut for e in packet['events']))
        for name, packet, _ in self.records:
            if name == 'TH_TRACE':
                for event in packet['events']:
                    if event['seq'] >= cut: event['seq'] += 1
        selected['events'].append({'seq': cut, 'target': target, 'kind': kind, 'data': data})
        selected['events'].sort(key=lambda event: event['seq'])
        for item in self.report['processed_pointers']:
            if item['fence'] >= cut: item['fence'] += 1
            for key in ('hover', 'down_ingress', 'down', 'down_end', 'up_ingress', 'up', 'end'):
                if item[key]['seq'] >= cut: item[key]['seq'] += 1
        for item in self.report['native_snapshots']:
            if item['query_after_native_key'] >= cut: item['query_after_native_key'] += 1
        for item in self.report.get('processed_keys', []):
            for key in ('ingress', 'begin', 'end'):
                if item[key]['seq'] >= cut: item[key]['seq'] += 1

    def test_reject_widget_hidden_destroyed_or_disabled_before_actual_click_edges(self):
        for edge in ('hover', 'down', 'up'):
            for kind, data in (('node.hide', {}), ('node.destroy', {}), ('node.property', {'key': 'color', 'value': 'black'})):
                self.setUp()
                pointer = 7 if kind == 'node.destroy' else 2
                receipt = self.report['processed_pointers'][pointer]
                target = receipt['target']['id']
                colors = [event['data']['value'] for name, packet, _ in self.records if name == 'TH_TRACE'
                          for event in packet['events'] if event['seq'] <= receipt['fence'] and event.get('target') == target
                          and event['kind'] == 'node.property' and event['data']['key'] == 'color']
                self.insert_target_event(pointer, edge, kind, data)
                # Restore the first row only after its mouseup begins. This
                # isolates the in-click anomaly from any later reopen check.
                if kind == 'node.hide': self.insert_target_event(pointer, 'end', 'node.show', {})
                if kind == 'node.property': self.insert_target_event(pointer, 'end', 'node.property', {'key': 'color', 'value': colors[-1]})
                self.reject()

    def test_mouseup_handler_may_hide_its_widget_before_dispatch_end(self):
        self.insert_target_event(7, 'end', 'node.hide', {})
        self.assertEqual(audit.validate_pointer_route(self.records, self.report)['physical_clicks_verified'], 8)

    def test_reject_missing_empty_or_reordered_physical_route(self):
        self.report['processed_pointers'] = []; self.reject()
        self.setUp(); self.report['processed_pointers'].pop(); self.reject()
        self.setUp(); rows = self.report['processed_pointers']; rows[2], rows[3] = rows[3], rows[2]; self.reject()

    def test_reject_same_label_wrong_action_and_wrong_effective_bounds(self):
        self.report['processed_pointers'][2]['target']['source'] = 'lower'; self.reject()
        self.setUp(); self.report['processed_pointers'][2]['target']['bounds']['left'] += 1; self.reject()

    def test_reject_mouseout_or_wrong_hover_node_with_report_and_raw_rebound(self):
        self.mutate_actual_receipt(2, 'hover', 'type', 'mouseout'); self.reject()
        self.setUp()
        hover = self.report['processed_pointers'][2]['hover']; seq = hover['seq']; hover['target'] = self.report['processed_pointers'][0]['target']['id']
        next(e for k, p, _ in self.records if k == 'TH_TRACE' for e in p['events'] if e['seq'] == seq)['target'] = hover['target']
        self.reject()

    def test_reject_wrong_ingress_point_or_incomplete_mouseup_even_with_raw_rebound(self):
        self.mutate_actual_receipt(2, 'up_ingress', 'ingress', 999999); self.reject()
        self.setUp(); self.mutate_actual_receipt(2, 'end', 'handled', False); self.reject()
        self.setUp(); self.mutate_actual_receipt(2, 'up', 'x', -10); self.reject()

    def test_reject_css_conversion_wrong_phase_and_query_window(self):
        self.report['processed_pointers'][0]['css']['x'] += 1; self.reject()
        self.setUp(); self.mutate_actual_receipt(2, 'up', 'type', 'mousedown'); self.reject()
        self.setUp(); self.report['processed_pointers'][3]['fence'] = 0; self.reject()

    def test_reject_wrong_expend_choice_or_disabled_source_row(self):
        self.report['processed_pointers'][6]['target']['source'] = '0'; self.reject()
        self.setUp()
        for kind, rows, _ in self.records:
            if kind == 'TH_ROWS':
                for row in rows:
                    if row['id'] == 'raise': row['enabled'] = False
        self.reject()

    def test_reject_extra_unreported_raw_button_action(self):
        packets = [value for kind, value, _ in self.records if kind == 'TH_TRACE']
        last = packets[-1]['events'][-1]['seq']
        packets[-1]['events'].append({'seq': last + 1, 'kind': 'input.ingress', 'target': 'input',
                                    'data': {'type': 'mousedown', 'button': 1, 'x': 1, 'y': 1, 'ingress': 9000}})
        self.reject()

    def test_reject_duplicate_untyped_pointer_dispatch_completion(self):
        packets = [value for kind, value, _ in self.records if kind == 'TH_TRACE']
        duplicate = copy.deepcopy(self.report['processed_pointers'][2]['end'])
        duplicate['seq'] = packets[-1]['events'][-1]['seq'] + 1
        self.assertNotIn('type', duplicate['data'], 'Real dispatch END has no mouse type')
        packets[-1]['events'].append(duplicate)
        self.reject()

    def test_reject_native_disabled_widget_despite_enabled_source_packet(self):
        target = self.report['processed_pointers'][2]['target']['id']
        for kind, packet, _ in self.records:
            if kind == 'TH_TRACE':
                for event in packet['events']:
                    if event.get('target') == target and event['kind'] == 'node.property' and event['data']['key'] == 'color': event['data']['value'] = 'black'
        self.reject()

    def test_reject_bool_buttons_and_dispatch_ingress_despite_numeric_equality(self):
        for stem in ('down', 'up'):
            self.setUp()
            self.mutate_actual_receipt(2, stem + '_ingress', 'button', True)
            self.mutate_actual_receipt(2, stem, 'button', True)
            self.reject()
            self.setUp()
            # Keep the actual/report copies coherent: the Int ingress1 and
            # Bool dispatch IDs compare equal in Python but have distinct
            # native types. Equality must not accept that counterexample.
            self.mutate_actual_receipt(2, stem + '_ingress', 'ingress', 1)
            self.mutate_actual_receipt(2, stem, 'ingress', True)
            self.mutate_actual_receipt(2, 'down_end' if stem == 'down' else 'end', 'ingress', True)
            self.reject()


class ProtocolPointerRouteTests(PointerRouteMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.original_route = pointer_route_fixture()


@unittest.skipUnless(os.environ.get('TERRAFORM_HEIGHT_CAPTURE'), 'Set capture for actual native pointer-route mutations')
class ActualPointerRouteTests(PointerRouteMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = Path(os.environ['TERRAFORM_HEIGHT_CAPTURE'])
        cls.original_route = (audit.parse_records((directory / 'application.log').read_bytes()), json.loads((directory / 'report.json').read_bytes()))


class PreflightSchemaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        sha = lambda value: hashlib.sha256(value).hexdigest()
        main, world = b'protocol main input', b'protocol world input'
        self.map = bytearray(8379); self.map[:11] = b'TERRANMAP\0\x1a'
        for offset, value in [(15, 16), (19, 16), (35, 128)]: self.map[offset:offset + 4] = value.to_bytes(4, 'little')
        for name, data in [('fixture-main.gls.js', main), ('fixture-world.gls.js', world), ('fixture-map.MP', self.map)]: (self.directory / name).write_bytes(data)
        shared = {name: sha(name.encode()) for name in ('browser-log-cursor.mjs', 'browser-native-log-hook.mjs', 'runtime-fetch-barrier.mjs', 'terraform-browser-geometry.mjs', 'terraform-browser-pointer.mjs')}
        files = {'tools/wasm-tests/' + name: value for name, value in shared.items()}
        files.update({'tools/wasm-tests/terraform-height-observation.mjs': 'a' * 64, 'tools/wasm-tests/fixtures/terraform-height-main.gls.js': sha(main),
                      'tools/wasm-tests/terraform-browser-inputs.mjs': 'b' * 64, 'executed_node_driver': 'c' * 64, 'preflight_producer': 'd' * 64, 'tools/wasm-tests/terraform-height-preflight.mjs': 'd' * 64, 'tools/serve-wasm.py': '4' * 64, 'tools/wasm_assets.py': '5' * 64,
                      'tools/wasm-tests/fixtures/terraform-controls-world.gls.js': 'e' * 64,
                      'GLSMAC_data/tests/_state_trace_observer.gls.js': 'f' * 64, 'GLSMAC_data/tests/_terrain_trace_observer.gls.js': '1' * 64,
                      'GLSMAC_data/tests/_terraform_cooperation_observer.gls.js': '2' * 64})
        self.pref = {'version': 1, 'kind': 'terraform-height-producer-preflight.v1', 'candidate_executed': False, 'phase': 'before-native-launch',
                     'head': 'a' * 40, 'native_tree': 'b' * 40, 'default_tree': 'c' * 40, 'runtime': {'js': 'd' * 64, 'wasm': 'e' * 64},
                     'original_rules_sha256': 'f' * 64, 'executed_rules_sha256': '1' * 64, 'source_sha256': files,
                     'input_sha256': {'main': sha(main), 'world': sha(world), 'map': sha(self.map), 'helpers': '2' * 64},
                     'production_default_sha256': '3' * 64, 'declared_map': {'width': 16, 'height': 16, 'tiles': 128, 'bytes': 8379},
                     'seed_requested': '1651011033:1377505029:3019448108:3247278135', 'browser_budget_ms': 180000,
                     'runtime_build_binding': {'schema': 'native-source-runtime.v1', 'compile_attribution_verified': False, 'provenance_sha256': '6' * 64, 'source_head': '7' * 40, 'native_tree': 'b' * 40, 'runtime': {'GLSMAC.js': 'd' * 64, 'GLSMAC.wasm': 'e' * 64}, 'scope': 'Declared native source/runtime consistency; compile attribution unverified; Default scripts separately captured'},
                     'native_policy_observation': 'not available before launch; require actual TH_INPUTS and every retained native world in the auditor',
                     'override_table': [{'row': i, 'field': 'shared_turns', 'field_index': 4, 'old': 12, 'new': 1, 'applies_to': ['land', 'sea'], 'land_name': f'Land {i}', 'sea_name': f'Sea {i}', 'land_prerequisite': 'None', 'sea_prerequisite': 'None'} for i in range(20)]}
        self.report = {'host_head': self.pref['head'], 'native_source_tree': self.pref['native_tree'], 'default_tree': self.pref['default_tree'],
                       'runtime_js_sha256': self.pref['runtime']['js'], 'runtime_wasm_sha256': self.pref['runtime']['wasm'],
                       'source_override': {'original_sha256': self.pref['original_rules_sha256'], 'rate_one_sha256': self.pref['executed_rules_sha256'],
                                           'reads': 1, 'original_manifest_id': audit.CAPTURE_MANIFESTS[0], 'manifest_id': audit.CAPTURE_MANIFESTS[1]},
                       'seed_requested': self.pref['seed_requested'], 'production_default_sha256': self.pref['production_default_sha256'],
                       'observer_sha256': sha(main), 'world_input_sha256': sha(world), 'observer_helpers_sha256': '2' * 64,
                       'driver_sha256': files['executed_node_driver'], 'height_observation_sha256': files['tools/wasm-tests/terraform-height-observation.mjs'],
                       'shared_helpers_sha256': shared}
        self.native = {'raise_rule': {'source_row': 16, 'id': 'raise', 'name': 'Land 16', 'prerequisite': 'None', 'turns': 1, 'sea': {'name': 'Sea 16', 'prerequisite': 'None', 'turns': 1}}}

    def validate(self):
        encoded = json.dumps(self.pref).encode()
        self.report['preflight_sha256'] = hashlib.sha256(encoded).hexdigest()
        return audit.validate_preflight(self.directory, self.pref, encoded, self.report, self.native)

    def test_explicit_v1_complete_binding(self):
        self.assertEqual(self.validate(), 'terraform-height-producer-preflight.v1')

    def test_unknown_null_or_missing_kind_never_falls_back(self):
        for kind in ('unknown.v9', None, 'missing'):
            with self.subTest(kind=kind):
                self.setUp()
                if kind == 'missing': self.pref.pop('kind')
                else: self.pref['kind'] = kind
                with self.assertRaises((AssertionError, KeyError)): self.validate()

    def test_v1_binds_digest_seed_files_and_mandatory_sources(self):
        for mutate in (lambda x: x.report.update(seed_requested='wrong'), lambda x: x.pref['source_sha256'].pop('preflight_producer'), lambda x: x.pref['source_sha256'].pop('tools/wasm_assets.py'),
                       lambda x: x.report.update(shared_helpers_sha256={}), lambda x: (x.directory / 'fixture-world.gls.js').write_bytes(b'wrong input')):
            with self.subTest(mutate=mutate):
                self.setUp(); mutate(self)
                with self.assertRaises((AssertionError, KeyError)): self.validate()
        self.setUp(); encoded = json.dumps(self.pref).encode(); self.report['preflight_sha256'] = '0' * 64
        with self.assertRaises(AssertionError): audit.validate_preflight(self.directory, self.pref, encoded, self.report, self.native)

    def test_future_preflight_binds_its_executed_module_and_server_source(self):
        for mutation in ('missing-server', 'missing-preflight', 'different-preflight'):
            self.setUp()
            files = self.pref['source_sha256']
            if mutation == 'missing-server': files.pop('tools/serve-wasm.py')
            elif mutation == 'missing-preflight': files.pop('tools/wasm-tests/terraform-height-preflight.mjs')
            else: files['tools/wasm-tests/terraform-height-preflight.mjs'] = '9' * 64
            with self.assertRaises((AssertionError, KeyError)): self.validate()

    def test_modern_runtime_source_binding_cannot_be_absent_or_mismatched(self):
        for change in ('missing', 'wrong-tree', 'wrong-js', 'bad-source', 'wrong-schema', 'false-compile-credit', 'missing-compile-scope'):
            self.setUp()
            if change == 'missing': self.pref.pop('runtime_build_binding')
            elif change == 'wrong-tree': self.pref['runtime_build_binding']['native_tree'] = 'f' * 40
            elif change == 'wrong-js': self.pref['runtime_build_binding']['runtime']['GLSMAC.js'] = '9' * 64
            elif change == 'bad-source': self.pref['runtime_build_binding']['source_head'] = 'not a Git object'
            elif change == 'false-compile-credit': self.pref['runtime_build_binding']['compile_attribution_verified'] = True
            elif change == 'missing-compile-scope': self.pref['runtime_build_binding'].pop('compile_attribution_verified')
            else: self.pref['runtime_build_binding']['schema'] = 'unknown'
            with self.assertRaises((AssertionError, KeyError)): self.validate()

    def test_actual_override_load_and_manifest_identity_are_required(self):
        for key, value in [('reads', 0), ('reads', True), ('original_manifest_id', 'f' * 64), ('manifest_id', '0' * 64)]:
            self.setUp(); self.report['source_override'][key] = value
            with self.assertRaises(AssertionError): self.validate()


def png_model(width=3, height=2, row_filter=0, bad_zlib=False):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    rows = bytes([row_filter]) + b'\x10\x20\x30' * width
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', b'invalid-zlib' if bad_zlib else zlib.compress(rows * height)) + chunk(b'IEND', b'')


class FrameFileTests(unittest.TestCase):
    def test_all_five_actual_digests_and_decoded_clip_required(self):
        names = ['before-height', 'raise-quote', 'raise-cancel', 'raise-payment-draft', 'raise-paid-completion']
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); captures = []
            for name in names:
                data = png_model()
                (root / (name + '.png')).write_bytes(data)
                captures.append({'name': name, 'sha256': hashlib.sha256(data).hexdigest()})
            report = {'captures': captures, 'processed_pointers': [{'canvas_css_rect': {'x': 0, 'y': 0, 'width': 3, 'height': 2}}],
                      'rendered_readiness': {'width': 3, 'height': 2}}
            self.assertEqual(audit.validate_frames(root, report)['retained_frame_digests_verified'], 5)
            target = root / (names[2] + '.png'); original = target.read_bytes(); target.unlink()
            with self.assertRaises(FileNotFoundError): audit.validate_frames(root, report)
            for bad in (original + b'changed', b'\x89PNG\r\n\x1a\n', png_model(4, 2), png_model(row_filter=5), png_model(bad_zlib=True), original[:-1]):
                target.write_bytes(bad)
                # Rebound digest must not disguise an invalid image.
                report['captures'][2]['sha256'] = hashlib.sha256(bad).hexdigest()
                with self.assertRaises((AssertionError, zlib.error)): audit.validate_frames(root, report)

    def test_png_filters_are_actually_decoded(self):
        first = audit.decode_frame_png(png_model(row_filter=0), (3, 2))
        for filter_mode in (1, 2, 3, 4):
            result = audit.decode_frame_png(png_model(row_filter=filter_mode), (3, 2))
            self.assertEqual(result['decoded_pixel_bytes'], 18)
            self.assertNotEqual(result['decoded_pixels_sha256'], first['decoded_pixels_sha256'])


class InterpreterModeTests(unittest.TestCase):
    def probe(self, args, optimize=None):
        env = dict(os.environ); env.pop('PYTHONOPTIMIZE', None)
        if optimize is not None: env['PYTHONOPTIMIZE'] = optimize
        return subprocess.run([sys.executable, *args], cwd=MODULE_PATH.parent.parent, env=env,
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)

    def rejected(self, result):
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Height capture audit requires non-optimized Python', result.stderr)

    def test_optimized_file_cli_fails_before_acceptance(self):
        for flag in ('-O', '-OO'):
            self.rejected(self.probe([flag, str(MODULE_PATH), '--help']))

    def test_optimized_module_and_import_fail_before_acceptance(self):
        self.rejected(self.probe(['-O', '-m', 'state_trace.terraform_height_browser_audit', '--help']))
        self.rejected(self.probe(['-O', '-c', 'from state_trace import terraform_height_browser_audit']))

    def test_environment_optimization_rejected_normal_cli_preserved(self):
        self.rejected(self.probe([str(MODULE_PATH), '--help'], optimize='2'))
        self.assertEqual(self.probe([str(MODULE_PATH), '--help']).returncode, 0)


if __name__ == '__main__':
    unittest.main()
