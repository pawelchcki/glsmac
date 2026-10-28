"""Public protocol models and separately optional retained Sea mutations.

These tests never run a game. Public model counts are not private capture or
original-game evidence. Set TERRAFORM_SEA_HEIGHT_CAPTURE for retained mutations.
"""
import copy
import importlib.util
import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).parent
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value

sea = load('sea_audit', ROOT / 'state_trace/terraform_sea_height_browser_audit.py')
land_models = load('land_protocol_models', ROOT / 'test_terraform_height_browser_audit.py')


def model():
    """Uniform240 land around one authored deep tile: corner means55 after.

    AFTER values are independent literals. The real capture has varied centers;
    its expected means are independently computed from its own BEFORE values.
    """
    records, report = land_models.protocol_fixture()
    before = copy.deepcopy(next(v for k, v, _ in records if k == 'TH_NATIVE')['world'])
    tiles = before['terrain_trace']['tiles']; points = set(tiles)
    offsets = dict(zip(sea.DIRECTIONS, [(-2, 0), (-1, -1), (0, -2), (1, -1), (2, 0), (1, 1), (0, 2), (-1, 1)]))
    touched_vertices = {(7, 8), (8, 7), (9, 8), (8, 9)}
    for tile in tiles.values():
        x, y = tile['x'], tile['y']
        tile['neighbors'] = {name: {'x': (x + dx) % 16, 'y': y + dy} if f'{(x + dx) % 16},{y + dy}' in points else None for name, (dx, dy) in offsets.items()}
        tile['elevation']['center'] = -1460 if (x, y) == (8, 8) else 240
        for corner in sea.height.CORNERS:
            tile['elevation'][corner] = -185 if sea.vertex(x, y, corner, 16) in touched_vertices else 240
        water = (x, y) == (8, 8)
        tile.update(is_water=water, is_land=not water)
        tile['native_type']['domain'] = 'sea' if water else 'land'
        tile['native_height_band'] = {'below_coast': water, 'below_ocean': water, 'below_trench': False}
        tile['imported'].update(source_elevation=tile['elevation']['center'], source_water=water, source_corners=[tile['elevation'][c] for c in sea.height.CORNERS])
    actor = before['units'][-1]; actor.update(x=8, y=8, movement=4.0)
    detail = before['terrain_trace']['unit_details']['u8']
    detail.update(definition_id='SeaFormers', movement_kind='sea', can_terraform=True, home_base_id=1,
                  terraforming_recovery={'active': False, 'x': 0, 'y': 0}, nominal_mp_per_turn=4.0)
    for q in detail['quotes'].values():
        if q is not None: q.update(movement_kind='sea', nominal_mp_per_turn=4.0)
    detail['quotes']['E']['destination'] = {'x': 10, 'y': 8}
    for i in range(7):
        before['terrain_trace']['base_details'][f'b{i + 1}']['production'] = {'choice_id': 'FORMERS', 'minerals': 4 if i == 0 else 0, 'last_processed_turn': 1}
        before['bases'][i]['resources']['minerals'] = 4 if i == 0 else 0
    after = copy.deepcopy(before)
    after['units'][-1]['movement'] = 0.0
    after['terrain_trace']['unit_details']['u8']['moved_this_turn'] = True
    for q in after['terrain_trace']['unit_details']['u8']['quotes'].values():
        if q is not None: q.update(allowed_now=False, reason='Unit is out of moves')
    after['terrain_trace']['player_details']['p0']['energy']['credits'] = 9
    after['terrain_trace']['player_details']['p0']['energy_revision'] = 2
    for name, tile in after['terrain_trace']['tiles'].items():
        changed = False
        for corner in sea.height.CORNERS:
            if sea.vertex(tile['x'], tile['y'], corner, 16) in touched_vertices:
                tile['elevation'][corner] = 55; changed = True
        if changed:
            tile['terrain_epoch'] = 1
            tile['canonical'].update(active=True, elevation=tile['elevation']['center'], is_water=tile['is_water'])
    target = after['terrain_trace']['tiles']['8,8']
    target['elevation']['center'] = -500; target['canonical']['elevation'] = -500
    target['imported'].update(active=False, source_corners=None, source_elevation=None, source_water=None)
    target['native_height_band']['below_ocean'] = False
    # Model the known radius3 source identity order without constructing AFTER
    # from the implementation under test.
    queue, seen, baseline = [(8, 8, 0)], {(8, 8)}, []
    for x, y, distance in queue:
        tile = tiles[f'{x},{y}']
        # Native getter identity precedes the observer's four additions.
        baseline.append({key: copy.deepcopy(value) for key, value in tile.items() if key not in sea.EXTRA_TILE_FIELDS})
        if distance < 3:
            for dx, dy in offsets.values():
                point = ((x + dx) % 16, y + dy)
                if point not in seen:
                    seen.add(point); queue.append((*point, distance + 1))
    identity = {'unit_id': 8, 'owner': 0, 'definition': 'SeaFormers', 'health': 1.0, 'movement': 4.0, 'moved': False,
                'order': 'NO_ORDERS', 'work': detail['work'], 'recovery': detail['terraforming_recovery'], 'automation': detail['automation'], 'home': 1}
    quote = {'version': 1, 'supported': True, 'reason': '', 'action': 'raise', 'resuming': False, 'paid_fee': 0,
             'mode': 'functional_approximation', 'policy': sea.POLICY, 'fee_policy': sea.FEE_POLICY, 'unit_id': 8, 'owner': 0,
             'turn': 1, 'x': 8, 'y': 8, 'source_elevation': -1460, 'source_water': True, 'destination_elevation': -500,
             'destination_water': True, 'base_fee': 1, 'fee': 1, 'credits': 10,
             'plan': [{'x': 8, 'y': 8, 'canonical': {'elevation': -500, 'is_water': True}}],
             'unit_identity': json.dumps(identity), 'terrain_identity': json.dumps({'version': 1, 'policy': sea.POLICY, 'fee_policy': sea.FEE_POLICY, 'tiles': baseline})}
    inputs = {'actor': 8, 'definition': 'SeaFormers', 'can_terraform': True, 'policy': {'version': 1, 'ignore_technologies': True},
              'starting_credits': 10, 'faction_bonus': 0, 'energy': copy.deepcopy(before['terrain_trace']['player_details']['p0']['energy']), 'raise_rule': {'sea': {'id': 'raise', 'source_row': 16,
              'name': 'Raise Sea Floor', 'order': 'Terraform UP', 'turns': 1, 'enabled': True}}}
    changed = []
    for kind, value, line in records:
        if kind == 'TH_INPUTS': value = copy.deepcopy(inputs)
        if kind == 'TH_NATIVE':
            i = value['query'] - 1; value['world'] = copy.deepcopy(after if i == 5 else before)
            value['ui'].update(selected=8 if i < 5 else None, x=8, y=8, movement=4.0 if i < 5 else 0.0, movement_bits=1082130432 if i < 5 else 0)
            if i > 0: value['ui']['height_presentation']['quote'] = copy.deepcopy(quote)
            if value['ui']['dialog'] is not None:
                value['ui']['dialog'] = {'fee': 1, 'reserves': 10, 'caption': 'Planetary Ecologist',
                    'source_lines': ['It will cost $NUM0 credits to {raise} this area;', 'our current reserves are $NUM1 credits.'],
                    'lines': ['It will cost 1 credits to raise this area;', 'our current reserves are 10 credits.'],
                    'source_choices': ['Cancel action.', 'Expend $NUM0 credits.'], 'choices': ['Cancel action.', 'Expend 1 credits.']}
        if kind == 'TH_NATIVE': value['world']['terrain_trace']['ui'] = copy.deepcopy(value['ui'])
        if kind == 'TH_RECEIPT': value['event_id'] = 'model-height-accepted'
        changed.append((kind, value, 100 if kind == 'TH_INPUTS' else line + 100 if kind in ('TH_NATIVE', 'TH_TRACE', 'TH_RECEIPT') else line))
    changed.append(('TH_EXIT_REQUEST', None, max(line for _, _, line in changed) + 1))
    report.update(native_input=copy.deepcopy(inputs), actual_sea_row={'id': 'raise', 'label': 'Terraform UP', 'enabled': True},
                  expected_effect_from_live_quote=copy.deepcopy(quote), traversal={'home_port_before': sea.height.node_projection(detail['quotes']['E'])})
    for item, packet in zip(report['native_snapshots'], [v for k, v, _ in changed if k == 'TH_NATIVE']): item['observation'] = sea.height.node_projection(packet)
    report['height_receipt'] = copy.deepcopy(next(v for k, v, _ in changed if k == 'TH_RECEIPT'))
    recipe = {'id': 'SeaFormers', 'choice': 'SEA_FORMERS', 'movement_type': 'water', 'chassis_cost': 2, 'weapon_cost': 6, 'armor_cost': 1, 'rows': 5, 'weapon_mode': 9}
    states = [{'base_id': i + 1, 'owner': i, 'population': 1, 'production': {'choice_id': 'FORMERS', 'minerals': 4 if i == 0 else 0, 'last_processed_turn': 1}} for i in range(7)]
    setup = {'actor': 8, 'home_id': 1, 'base_states': states, 'declared': {'recipe': recipe, 'resumed_choice': 'FORMERS'}}
    declaration = {'version': 2, 'base_id': 1, 'owner': 0, 'recipe': copy.deepcopy(recipe), 'choice_id': 'SEA_FORMERS',
                   'population_cost': 0, 'cost': 40, 'stock': 43, 'population': 1, 'turn': 1}
    account = {'version': 2, 'choice_id': 'SEA_FORMERS', 'population_cost': 0, 'population': 1,
               'observed_choice_cost': 40, 'requested_stock': 43, 'source_recipe': recipe, 'actual_prefill': {'choice_id': 'SEA_FORMERS', 'minerals': 43, 'last_processed_turn': 0}, 'owner': 0, 'turn': 1, 'base_id': 1}
    preturn = {'turn': 1, 'home_id': 1, 'bases': [dict(row, eligible=i == 0, intake={'MINERALS': 1, 'NUTRIENTS': 2}, consumption={'MINERALS': 0, 'NUTRIENTS': 2},
        production={'choice_id': 'SEA_FORMERS' if i == 0 else 'FORMERS', 'minerals': 43 if i == 0 else 0, 'last_processed_turn': 0 if i == 0 else 1}) for i, row in enumerate(states)]}
    birth = {'production': {'choice_id': '', 'minerals': 4, 'last_processed_turn': 1}, 'unit_id': 8, 'home_id': 1, 'home_population': 1,
             'definition': 'SeaFormers', 'is_water': True, 'can_terraform': True, 'x': 8, 'y': 8, 'health': 1.0, 'movement': 4.0}
    prefix = [('TH_SEA_DECLARED', declaration, 0), ('TH_SEA_ACCOUNTING', account, 1), ('TH_SEA_PRETURN', preturn, 2), ('TH_SEA_BIRTH', birth, 3)]
    for i in range(9):
        name = 'process_base_production' if i == 0 else ('process_base_growth' if i < 8 else 'set_base_production')
        data = {'turn_id': 1, 'minerals': 1} if i == 0 else ({'turn_id': 1} if i < 8 else {'choice_id': 'FORMERS'})
        prefix.append(('TH_RECEIPT', {'name': name, 'event_id': f'model-bootstrap-{i}', 'success': True, 'caller': 0, 'data': data}, i + 4))
    prefix.append(('TH_SEA_SETUP', setup, 13)); report['sea_setup'] = copy.deepcopy(setup)
    return prefix + changed, report


class DomainMutations:
    def setUp(self): self.records, self.report = copy.deepcopy(self.original)
    def packets(self): return [v for k, v, _ in self.records if k == 'TH_NATIVE']
    def quote(self): return self.packets()[1]['ui']['height_presentation']['quote']
    def sync(self):
        for item, packet in zip(self.report['native_snapshots'], self.packets()): item['observation'] = sea.height.node_projection(packet)
        self.report['native_input'] = sea.height.node_projection(next(v for k, v, _ in self.records if k == 'TH_INPUTS'))
        self.report['expected_effect_from_live_quote'] = sea.height.node_projection(self.quote())
        self.report['height_receipt'] = next(v for k, v, _ in self.records if k == 'TH_RECEIPT' and v['name'] == 'unit_terraform')
    def reject(self):
        self.sync()
        with self.assertRaises((AssertionError, KeyError, TypeError)): sea.audit_records(self.records, self.report)
    def set_quote(self, key, value):
        for packet in self.packets()[1:]: packet['ui']['height_presentation']['quote'][key] = copy.deepcopy(value)
    def test_valid_typed_world_is_readonly(self):
        before = copy.deepcopy((self.records, self.report)); result = sea.audit_records(self.records, self.report)
        self.assertEqual(result['native_float_fields'], 96); self.assertEqual(result['fee'], 1)
        self.assertEqual(result['per_world'], {'players': 7, 'units': 8, 'bases': 7, 'tiles': 128})
        self.assertEqual(result['observed_worlds'], 6); self.assertEqual(result['complete_worlds'], 0)
        self.assertFalse(result['entity_detail_identity']['supported'])
        self.assertEqual(result['browser_cases_audited'], 0); self.assertTrue(sea.height.equal(before, (self.records, self.report)))
    def test_coherent_foreign_actor_and_remote_position_are_rejected(self):
        # All six native worlds and their reported copies agree. A matching
        # report must not turn a foreign actor or remote position into payer0.
        for field, value in [('owner', 'p1'), ('x', 10), ('y', 10)]:
            self.setUp()
            for packet in self.packets():
                next(unit for unit in packet['world']['units'] if unit['raw_id'] == 8)[field] = value
            self.reject()
    def test_coherent_funding_cannot_contradict_native_energy(self):
        for field, value in [('starting_credits', 999), ('faction_bonus', 3),
                             ('energy', {'credits': 123, 'initialized': True, 'last_income_turn': 0})]:
            self.setUp()
            next(value for kind, value, _ in self.records if kind == 'TH_INPUTS')[field] = copy.deepcopy(value)
            self.reject()
    def test_coherent_uninitialized_or_precredited_energy_is_not_the_authored_input(self):
        for field, value in [('initialized', False), ('last_income_turn', 1), ('last_income_turn', False)]:
            self.setUp()
            for packet in self.packets():
                owner = next(player['id'] for player in packet['world']['players'] if player['raw_id'] == 0)
                packet['world']['terrain_trace']['player_details'][owner]['energy'][field] = value
            next(row for kind, row, _ in self.records if kind == 'TH_INPUTS')['energy'][field] = value
            self.reject()
    def test_query_carrier_stays_inside_each_native_checkpoint(self):
        for query in (1, 6):
            self.setUp()
            fence = self.report['native_snapshots'][query - 1]['query_after_native_key']
            index = next(i for i, (kind, value, _) in enumerate(self.records)
                         if kind == 'TH_TRACE' and any(event['seq'] == fence for event in value['events']))
            kind, value, _ = self.records[index]
            # Last query must precede the real exit marker, not merely appear
            # somewhere after its native snapshot. The first must follow its
            # own Native packet, not an earlier carrier.
            boundary = next(line for kind, _, line in self.records if kind == 'TH_EXIT_REQUEST') if query == 6 else next(line for kind, value, line in self.records if kind == 'TH_NATIVE' and value['query'] == query)
            self.records[index] = kind, value, boundary + 1 if query == 6 else boundary - 1
            self.reject()
    def test_wrong_land_domain_actor_fee_or_source_policy_rejects(self):
        for key, value in [('source_water', False), ('destination_water', False), ('unit_id', 1), ('owner', 1), ('action', 'lower'), ('fee', 2), ('credits', 9), ('destination_elevation', -1500), ('policy', 'unknown')]:
            self.setUp(); self.set_quote(key, value); self.reject()
    def test_quote_plan_and_terrain_epoch_are_not_the_oracle(self):
        self.set_quote('plan', [{'x': 8, 'y': 8, 'canonical': {'elevation': -600, 'is_water': True}}]); self.reject()
        self.setUp(); identity = json.loads(self.quote()['terrain_identity']); identity['tiles'][0]['terrain_epoch'] += 1
        self.set_quote('terrain_identity', json.dumps(identity)); self.reject()
    def test_wrong_native_unit_identity_and_metadata(self):
        identity = json.loads(self.quote()['unit_identity']); identity['definition'] = 'Formers'; self.set_quote('unit_identity', json.dumps(identity)); self.reject()
        self.setUp(); next(v for k, v, _ in self.records if k == 'TH_INPUTS')['raise_rule']['sea']['name'] = 'Raise Land'; self.reject()
    def test_geometry_within_range_still_must_equal_source_mean(self):
        self.packets()[-1]['world']['terrain_trace']['tiles']['8,8']['elevation']['left'] += 1; self.reject()
    def test_epoch_canonical_neighbor_and_band_exact_values(self):
        for change in ('epoch', 'center', 'band'):
            self.setUp(); tile = self.packets()[-1]['world']['terrain_trace']['tiles']['8,8']
            if change == 'epoch': tile['terrain_epoch'] += 1
            if change == 'center': tile['canonical']['elevation'] = -600
            if change == 'band': tile['native_height_band']['below_ocean'] = True
            self.reject()
    def test_other_owners_unknown_fields_and_signed_zero_unchanged(self):
        self.packets()[-1]['world']['units'][0]['health'] = 0.5; self.reject()
        self.setUp(); self.packets()[-1]['world']['terrain_trace']['player_details'][next(p['id'] for p in self.packets()[0]['world']['players'] if p['raw_id'] == 1)]['extra'] = 'unexpected'; self.reject()
        self.setUp()
        for row in self.packets(): row['world']['terrain_trace']['tiles']['0,0']['extra_signed_zero'] = -0.0
        self.packets()[-1]['world']['terrain_trace']['tiles']['0,0']['extra_signed_zero'] = 0.0; self.reject()
    def test_float_token_and_roundtrip_bits_are_required(self):
        self.packets()[-1]['world']['units'][-1]['movement'] = 0; self.reject()
        self.setUp()
        for row in self.packets(): row['world']['units'][0]['health'] = 0.1
        self.reject()
    def test_first_five_quote_cancel_draft_are_pure(self):
        self.packets()[2]['world']['units'][0]['health'] = 0.5; self.reject()
    def test_bool_revision_or_source_policy_is_not_native_int(self):
        for row in self.packets()[:5]: row['world']['terrain_trace']['player_details'][next(p['id'] for p in row['world']['players'] if p['raw_id'] == 0)]['energy_revision'] = True
        self.reject()
    def test_modal_source_choice_and_receipt_binding(self):
        self.packets()[1]['ui']['dialog']['choices'][1] = 'Expend 2 credits.'; self.reject()
        self.setUp(); next(v for k, v, _ in self.records if k == 'TH_RECEIPT' and v['name'] == 'unit_terraform')['data']['unit_id'] = 1; self.reject()
    def test_missing_foreign_player_or_tile(self):
        for row in self.packets(): row['world']['players'].pop()
        self.reject()


class BootstrapMutations:
    def setUp(self): self.records, self.report = copy.deepcopy(self.original)
    def row(self, kind): return next(v for k, v, _ in self.records if k == kind)
    def reject(self):
        self.report['sea_setup'] = sea.height.node_projection(self.row('TH_SEA_SETUP'))
        with self.assertRaises((AssertionError, KeyError, TypeError)): sea.validate_bootstrap(self.records, self.report)
    def test_valid_accounting(self):
        result = sea.validate_bootstrap(self.records, self.report)
        self.assertEqual((result['native_choice_cost'], result['native_prefill'], result['income'], result['overflow']), (40, 43, 1, 4))
    def test_native_price_prefill_recipe_and_credit_not_assumed(self):
        for key, value in [('observed_choice_cost', 80), ('requested_stock', 83)]:
            self.setUp(); self.row('TH_SEA_ACCOUNTING')[key] = value; self.reject()
        self.setUp(); self.row('TH_SEA_PRETURN')['bases'][0]['intake']['MINERALS'] = True; self.reject()
    def test_wrong_base_identity_clock_or_overflow(self):
        self.row('TH_SEA_SETUP')['base_states'][-1]['base_id'] = 90; self.reject()
        self.setUp(); self.row('TH_SEA_PRETURN')['bases'][1]['production']['last_processed_turn'] = 0; self.reject()
        self.setUp(); self.row('TH_SEA_BIRTH')['production']['minerals'] = 3; self.reject()
    def test_missing_growth_or_early_resumption_is_not_ready(self):
        self.records.pop(next(i for i, (k, v, _) in enumerate(self.records) if k == 'TH_RECEIPT' and v['name'] == 'process_base_growth')); self.reject()
        self.setUp(); index = next(i for i, (k, v, _) in enumerate(self.records) if k == 'TH_RECEIPT' and v['name'] == 'set_base_production')
        kind, value, _ = self.records[index]; self.records[index] = kind, value, 0; self.reject()


class PublicSeaDomainTests(DomainMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.original = model()

    def test_exhaust_native_receipts_across_the_entire_observed_flow(self):
        for name in ('move_unit', 'advance_turn', 'unknown_action'):
            for line in (115, 154, 156, 162, 170):
                with self.subTest(name=name, line=line):
                    records, report = model()
                    records.append(('TH_RECEIPT', {'name': name, 'event_id': 'extra-opaque-token',
                        'caller': 0, 'success': True, 'data': {'unit_id': 8}}, line))
                    with self.assertRaisesRegex(AssertionError, 'Unexpected native completion'):
                        sea.audit_records(records, report)

    def test_startup_envelopes_and_final_completion_order_are_checked(self):
        for key, value in (('caller', True), ('success', 1), ('success', False), ('data', []),
                           ('event_id', 'model-height-accepted'), ('name', '')):
            with self.subTest(key=key, value=value):
                records, report = model()
                next(v for k, v, _ in records if k == 'TH_RECEIPT')[key] = value
                with self.assertRaises(AssertionError): sea.audit_records(records, report)
        records, report = model()
        records = [(k, v, 159 if k == 'TH_EXIT_REQUEST' else line) for k, v, line in records]
        with self.assertRaises(AssertionError): sea.audit_records(records, report)

class PublicSeaParserTests(unittest.TestCase):
    def test_semantic_markers_and_exit_require_a_complete_gse_record(self):
        for name in ('TH_NATIVE', 'TH_SEA_SETUP', 'TH_INPUTS', 'TH_RECEIPT'):
            self.assertEqual(sea.parse_records(('noise' + name + '|{}\n').encode()), [])
            self.assertEqual(sea.parse_records(('    [/height-snapshot/GLSMAC_data/default/browser_height_main.gls.js:144:1] ' + name + '|{}\n').encode()), [(name, {}, 0)])
        self.assertEqual(sea.parse_records(b'noiseTH_EXIT_REQUEST\n'), [])
        self.assertEqual(sea.parse_records(b'    [/height-snapshot/GLSMAC_data/default/game/world/browser_height.gls.js:35:4] TH_SEA_ACCOUNTING|{}\n'), [('TH_SEA_ACCOUNTING', {}, 0)])

    def test_cli_interleaving_does_not_replace_a_completed_result(self):
        import contextlib, io, sys, tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'derived.json'
            winner = '{"winner":"first audit 🧭"}\n'.encode()
            def other_writer_wins(*args):
                self.assertFalse(output.exists(), 'Interleaving occurs after the initial exists check')
                output.write_bytes(winner)
                return {'winner': 'later audit'}
            argv = ['sea-audit', '--artifacts', folder, '--source-root', folder, '--output', str(output)]
            with patch.object(sys, 'argv', argv), patch.object(sea, 'audit_artifacts', side_effect=other_writer_wins), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(FileExistsError): sea.main()
            self.assertEqual(output.read_bytes(), winner, 'The exclusive-create winner must remain byte-for-byte immutable')

    def test_cli_creates_new_utf8_result_and_rejects_existing_output(self):
        import contextlib, io, sys, tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'derived.json'
            result = {'scope': 'public Unicode 🧭 model', 'complete_browser_cases_audited': 0}
            argv = ['sea-audit', '--artifacts', folder, '--source-root', folder, '--output', str(output)]
            with patch.object(sys, 'argv', argv), patch.object(sea, 'audit_artifacts', return_value=result) as read_audit, contextlib.redirect_stdout(io.StringIO()):
                sea.main(); self.assertEqual(json.loads(output.read_text(encoding='utf8')), result)
                before = output.read_bytes()
                with self.assertRaises(AssertionError): sea.main()
                self.assertEqual(read_audit.call_count, 1, 'Known existing output must fail before expensive raw replay')
                self.assertEqual(output.read_bytes(), before)

    def test_validation_dependency_changes_are_bound_without_changing_auditor_hashes(self):
        import hashlib, tempfile
        from unittest.mock import patch
        keys = ('state_trace/terrain_observation.py', 'state_trace/schema.py', 'protocol.py', 'fast.py')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in (*keys, 'state_trace/terraform_sea_height_browser_audit.py', 'state_trace/terraform_height_browser_audit.py'):
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('declared ' + name)
            shared = root / 'state_trace/terraform_height_browser_audit.py'
            with patch.object(sea, '__file__', str(root / 'state_trace/terraform_sea_height_browser_audit.py')), patch.object(sea, 'SHARED', shared), patch.object(sea.height.terrain_schema, '__file__', str(root / keys[0])):
                before = sea.validation_identity()
                expected = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in keys}
                self.assertEqual(before['source_validation_dependencies_sha256'], expected)
                for name in keys:
                    path = root / name; original = path.read_bytes(); path.write_bytes(original + b' changed acceptance')
                    after = sea.validation_identity()
                    self.assertEqual(after['auditor_sha256'], before['auditor_sha256'])
                    self.assertEqual(after['shared_height_auditor_sha256'], before['shared_height_auditor_sha256'])
                    changed = {key for key in keys if after['source_validation_dependencies_sha256'][key] != before['source_validation_dependencies_sha256'][key]}
                    self.assertEqual(changed, {name}, 'Every imported validator must affect the emitted implementation binding')
                    self.assertEqual(after['source_validation_dependencies_sha256'][name], hashlib.sha256(path.read_bytes()).hexdigest())
                    path.write_bytes(original)

    def test_exit_marker_is_retained_for_the_last_query_interval(self):
        self.assertEqual(sea.parse_records(b'prefix\nTH_EXIT_REQUEST\n'), [('TH_EXIT_REQUEST', None, 1)])

class PublicSeaBootstrapTests(BootstrapMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.original = model()

    def test_pre_restore_declaration_is_required_unique_exact_and_early(self):
        for change in ('missing', 'duplicate', 'late', 'unknown_field', 'missing_field'):
            with self.subTest(change=change):
                self.setUp()
                index = next(i for i, (kind, _, _) in enumerate(self.records) if kind == 'TH_SEA_DECLARED')
                kind, value, line = self.records[index]
                if change == 'missing': self.records.pop(index)
                if change == 'duplicate': self.records.append((kind, copy.deepcopy(value), line))
                if change == 'late': self.records[index] = kind, value, 2
                if change == 'unknown_field': value['unobserved'] = True
                if change == 'missing_field': value.pop('cost')
                self.reject()

    def test_declared_native_values_cannot_contradict_source_or_accounting(self):
        for key, value in (('version', 1), ('base_id', True), ('owner', False), ('choice_id', 'FORMERS'),
                           ('population_cost', False), ('cost', 40.0), ('stock', 83),
                           ('population', True), ('turn', True), ('recipe', {'id': 'Formers'})):
            with self.subTest(key=key, value=value):
                self.setUp(); self.row('TH_SEA_DECLARED')[key] = value; self.reject()
        for key, value in (('version', 1), ('choice_id', 'FORMERS'), ('population_cost', 1), ('population', 2)):
            with self.subTest(accounting=key):
                self.setUp(); self.row('TH_SEA_ACCOUNTING')[key] = value; self.reject()

    def test_coherent_choice_replacement_cannot_become_its_own_source_oracle(self):
        for choice in (123, 'FORMERS'):
            with self.subTest(choice=choice):
                self.setUp()
                self.row('TH_SEA_SETUP')['declared']['recipe']['choice'] = choice
                declaration = self.row('TH_SEA_DECLARED')
                declaration['recipe']['choice'] = declaration['choice_id'] = choice
                accounting = self.row('TH_SEA_ACCOUNTING')
                accounting['source_recipe']['choice'] = accounting['choice_id'] = choice
                accounting['actual_prefill']['choice_id'] = choice
                next(base for base in self.row('TH_SEA_PRETURN')['bases'] if base['owner'] == 0)['production']['choice_id'] = choice
                self.reject()

    def test_declaration_is_bound_to_the_before_input_and_native_home(self):
        self.row('TH_INPUTS')['actor'] = 9; self.reject()
        self.setUp()
        self.row('TH_NATIVE')['world']['bases'][0]['population'] = 2; self.reject()
        self.setUp()
        self.records = [(k, v, 12 if k == 'TH_INPUTS' else line) for k, v, line in self.records]
        self.reject()


@unittest.skipUnless(os.environ.get('TERRAFORM_SEA_HEIGHT_CAPTURE'), 'Private retained capture is separate from public checks')
class RetainedSeaDomainTests(DomainMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = Path(os.environ['TERRAFORM_SEA_HEIGHT_CAPTURE']); cls.original = sea.parse_records((directory / 'application.log').read_bytes()), json.loads((directory / 'report.json').read_bytes())
    def test_full_retained_artifact_source_geometry_and_external_proof(self):
        result = sea.audit_artifacts(Path(os.environ['TERRAFORM_SEA_HEIGHT_CAPTURE']), Path(os.environ['TERRAFORM_SEA_SOURCE_ROOT']))
        self.assertEqual(result['changed_fields'], 71)
        self.assertEqual(result['browser_cases_audited'], 0)
        self.assertEqual(result['complete_browser_cases_audited'], 0)
        self.assertEqual(result['bounded_state_receipt_cases_audited'], 0)
        self.assertEqual(result['status'], 'observations-only-readonly-audit')
        self.assertFalse(result['finalization']['exact_callback_message_identity']['supported'])
        self.assertEqual(result['raw_sha256'], '191a6ffcf96f896ad8b7a0e009446bb406092133229461497492d6e6ccd7bb98')
        self.assertEqual({item['native_Int_height'] for item in result['source_vertex_means']}, {38, 42, 43, 47})

@unittest.skipUnless(os.environ.get('TERRAFORM_SEA_HEIGHT_CAPTURE'), 'Private retained capture is separate from public checks')
class RetainedSeaBootstrapTests(BootstrapMutations, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = Path(os.environ['TERRAFORM_SEA_HEIGHT_CAPTURE']); cls.original = sea.parse_records((directory / 'application.log').read_bytes()), json.loads((directory / 'report.json').read_bytes())

class PublicSeaOptimizationGuardTests(unittest.TestCase):
    def sources(self):
        return [('terraform_sea_height_browser_audit.py', 'Sea auditor'),
                ('terraform_sea_height_prepare.py', 'Sea preflight'),
                ('terraform_sea_height_run.py', 'Sea outer runner')]

    def call(self, path, args, optimize=None):
        import os, subprocess, sys
        env = os.environ.copy(); env.pop('PYTHONOPTIMIZE', None)
        if optimize is not None: env['PYTHONOPTIMIZE'] = optimize
        return subprocess.run([sys.executable, *args, str(path), '--help'], capture_output=True, text=True, env=env)

    def test_normal_direct_clis_keep_help_without_launching_anything(self):
        for name, _ in self.sources():
            result = self.call(ROOT / 'state_trace' / name, [])
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('usage:', result.stdout)

    def test_O_and_OO_direct_file_guards_run_before_parser_or_credit(self):
        for name, label in self.sources():
            for mode in ('-O', '-OO'):
                result = self.call(ROOT / 'state_trace' / name, [mode])
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(label + ' refuses optimized Python', result.stderr)
                self.assertNotIn('usage:', result.stdout)

    def test_optimized_environment_direct_clis_fail_closed(self):
        for name, label in self.sources():
            result = self.call(ROOT / 'state_trace' / name, [], optimize='2')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(label + ' refuses optimized Python', result.stderr)

    def test_optimized_imports_fail_at_their_own_module_entry(self):
        import os, subprocess, sys
        env = os.environ.copy(); env.pop('PYTHONOPTIMIZE', None)
        for name, label in self.sources():
            path = ROOT / 'state_trace' / name
            code = 'import runpy; runpy.run_path(' + repr(str(path)) + ', run_name="guard_import_probe")'
            for mode in ('-O', '-OO'):
                result = subprocess.run([sys.executable, mode, '-c', code], capture_output=True, text=True, env=env)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(label + ' refuses optimized Python', result.stderr)


class PublicSeaPortableEnvelopeTests(unittest.TestCase):
    """Real prepare/Node OS wait + SYNTHETIC report; never a game or case pass."""
    @classmethod
    def setUpClass(cls):
        import hashlib
        import tempfile
        import subprocess
        from pathlib import Path
        cls.folder = tempfile.TemporaryDirectory()
        cls.tools = load('public_sea_runner_models', ROOT / 'test_terraform_sea_height_runner.py')
        config, expected = cls.tools.public_source(cls.folder.name)
        source = Path(config['source_root']); cls.source = source
        report, raw, chunks, _ = land_models.finalization_fixture()
        # The actual child below is a tiny Node metadata writer, not the
        # candidate browser fixture. All native/UI facts remain public models.
        payload = {'report': report, 'raw': raw.decode('utf8'), 'chunks': chunks}
        program = r"""
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const seed='1651011033:1377505029:3019448108:3247278135';
const test={timeout:180000};
const data=PAYLOAD;
const out=process.env.TERRAFORM_SEA_HEIGHT_ARTIFACTS_DIR,p=JSON.parse(readFileSync(out+'/preflight.json'));
const r=data.report,f=p.pins.source.files,hash=x=>createHash('sha256').update(x).digest('hex');
Object.assign(r,{candidate_executed:true,sea_menu_contract_version:3,host_head:p.pins.source.head,
 native_source_tree:p.pins.source.native_tree,default_tree:p.pins.source.default_tree,
 runtime_js_sha256:p.pins.runtime['GLSMAC.js'],runtime_wasm_sha256:p.pins.runtime['GLSMAC.wasm'],seed_requested:seed,
 map_sha256:p.inputs.map_sha256,declared_input:{...p.inputs.declared,bases:7,units:8,normal_source_funding:true}});
for(const[field,name]of Object.entries({driver_sha256:'terraform-sea-height-browser.test.mjs',height_observation_sha256:'terraform-height-observation.mjs',
 sea_observation_sha256:'terraform-sea-height-observation.mjs',sea_input_sha256:'terraform-sea-height-inputs.mjs',
 observer_sha256:'fixtures/terraform-sea-height-main.gls.js',world_input_sha256:'fixtures/terraform-sea-height-world.gls.js'}))r[field]=f['tools/wasm-tests/'+name];
r.shared_helpers_sha256=Object.fromEntries(['browser-log-cursor.mjs','browser-native-log-hook.mjs','runtime-fetch-barrier.mjs','terraform-browser-geometry.mjs','terraform-browser-pointer.mjs'].map(n=>[n,f['tools/wasm-tests/'+n]]));
r.web_sha256=Object.fromEntries(['index.html','bootstrap.js','asset-store.js'].map(n=>[n,p.pins.web[n]]));
const helperNames=['_state_trace_observer','_terrain_trace_observer','_terraform_cooperation_observer'];
r.observer_helpers_sha256=hash(JSON.stringify(Object.fromEntries(helperNames.map(n=>[n,readFileSync(p.config.source_root+'/GLSMAC_data/tests/'+n+'.gls.js','utf8')]))));
r.production_default_sha256=hash(JSON.stringify(Object.fromEntries(Object.keys(p.pins.source.default_files).filter(n=>n.endsWith('.gls.js')).sort().map(n=>['GLSMAC_data/default/'+n,readFileSync(p.config.source_root+'/GLSMAC_data/default/'+n,'utf8')]))));
r.source_override={reads:1,original_sha256:p.expected.rules,rate_one_sha256:p.inputs.executed_rules_sha256,
 bytes:readFileSync(out+'/executed-rules.txt').length,rows:p.inputs.override_table};
writeFileSync(out+'/report.json',JSON.stringify(r));writeFileSync(out+'/application.log',data.raw);
writeFileSync(out+'/application-log-chunks.jsonl',data.chunks.map(x=>JSON.stringify(x)).join('\n')+'\n');
""".replace('PAYLOAD', json.dumps(payload))
        (source / cls.tools.prep.DRIVER).write_text(program)
        controls = source / 'tools/wasm-tests/terraform-sea-height-inputs.mjs'
        controls.write_text(controls.read_text().replace('version:2,players:7,', "version:2,width:16,height:16,players:7,actor:{x:8,y:8},port:{x:10,y:8},action:'raise',"))
        for name in ('index.html', 'asset-store.js'): (Path(config['web']) / name).write_text('public web bytes only')
        subprocess.run(['git', 'add', cls.tools.prep.DRIVER, 'tools/wasm-tests/terraform-sea-height-inputs.mjs'], cwd=source, check=True)
        subprocess.run(['git', '-c', 'user.name=Public fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic portable protocol writer'], cwd=source, check=True)
        expected['head'] = cls.tools.prep.git(source, 'rev-parse', 'HEAD')
        cls.prepared = cls.tools.prep.prepare(config, expected)
        cls.directory = Path(config['output'])
        completion, code = cls.tools.runner.execute(cls.directory / 'preflight.json', cls.tools.prep.sha(cls.directory / 'preflight.json'))
        assert code == 0 and completion['actual_os_node_exit_code'] == 0, (completion, (cls.directory / 'driver.log').read_text()[-2000:])
        cls.original = {path.name: path.read_bytes() for path in cls.directory.iterdir() if path.is_file()}

    @classmethod
    def tearDownClass(cls): cls.folder.cleanup()

    def setUp(self):
        self.preflight = json.loads(self.original['preflight.json'])
        self.report = json.loads(self.original['report.json'])
        self.completion = json.loads(self.original['portable-external-completion.json'])

    def tearDown(self):
        for path in self.directory.iterdir():
            if path.name not in self.original and path.is_file(): path.unlink()
        for name, data in self.original.items(): (self.directory / name).write_bytes(data)

    def save(self):
        for name, value in [('preflight.json', self.preflight), ('report.json', self.report), ('portable-external-completion.json', self.completion)]:
            (self.directory / name).write_bytes(self.tools.prep.encoded(value))
        # This is public model data: rebind ordinary byte references so the
        # semantic mutation, not an incidental whitespace hash, must reject.
        self.completion['preflight_sha256'] = self.tools.prep.sha(self.directory / 'preflight.json')
        self.completion['report_sha256'] = self.tools.prep.sha(self.directory / 'report.json')
        (self.directory / 'portable-external-completion.json').write_bytes(self.tools.prep.encoded(self.completion))
        claim = json.loads(self.original['execution-claim.json']); claim['preflight_sha256'] = self.completion['preflight_sha256']
        (self.directory / 'execution-claim.json').write_bytes(self.tools.prep.encoded(claim))

    def audit_envelope(self):
        sea.validate_provenance(self.directory, self.report, self.source)
        return sea.validate_outer(self.directory, self.report, self.original['application.log'])

    def reject(self):
        self.save()
        with self.assertRaises((AssertionError, KeyError, TypeError, FileNotFoundError)):
            self.audit_envelope()

    def test_real_prepare_executor_and_auditor_abi_compose_without_full_credit(self):
        result = self.audit_envelope()
        self.assertTrue(result['bounded_process_witness_supported'])
        self.assertEqual(result['external_node_os_exit'], 0)
        self.assertFalse(result['supported'])  # No minted tool session/chunk.
        self.assertTrue(self.completion['owned_group_absent'])
        self.assertEqual(self.completion['complete_browser_cases'], 0)
        finalization = sea.height.validate_finalization(self.report, self.original['application.log'],
            [json.loads(line) for line in self.original['application-log-chunks.jsonl'].decode().splitlines()],
            sea.parse_records(self.original['application.log']))
        credit = sea.classify_evidence(finalization, result)
        self.assertEqual(credit['complete_browser_cases_audited'], 0)
        self.assertEqual(credit['execution_cases_audited'], 0)
        self.assertEqual(credit['bounded_state_receipt_cases_audited'], 0)
        self.assertEqual(credit['status'], 'observations-only-readonly-audit')

    def test_candidate_flag_false_or_integer_never_means_true(self):
        for value in (False, 1):
            self.setUp(); self.report['candidate_executed'] = value; self.reject()

    def test_app_zero_does_not_hide_os_failure_missing_wait_or_cleanup(self):
        for field, value in [('actual_os_node_exit_code', 1), ('actual_os_process_exit_code', 1),
                             ('actual_wait_returned', False), ('owned_group_absent', False),
                             ('forced_cleanup', True), ('subreaper_restored', False), ('postpins_match', False),
                             ('ownership_supported', False), ('known_owned_identities_absent', False),
                             ('unresolved_adopted_children', [{'pid': 1}]), ('ownership_unsupported_reasons', ['unknown'])]:
            self.setUp(); self.completion[field] = value; self.reject()
        for field in ('actual_wait_returned', 'owned_group_absent', 'ownership_supported', 'known_owned_identities_absent',
                      'unresolved_adopted_children', 'ownership_unsupported_reasons'):
            self.setUp(); self.completion.pop(field); self.reject()

    def test_malformed_kinds_and_fictional_tool_receipt_reject(self):
        self.preflight['kind'] = 'unknown'; self.reject()
        self.setUp(); self.completion['kind'] = 'sea-height-v3-genuine-external-outcome'; self.reject()
        self.setUp(); self.completion['external_tool_receipt'] = {'supported': True, 'session_id': 52401, 'chunk_id': '60a1a5'}; self.reject()
        self.tearDown(); self.setUp()
        (self.directory / 'portable-external-completion.json').unlink()
        (self.directory / 'raw-outcome.json').write_text(json.dumps({'kind': 'sea-height-v3-genuine-external-outcome', 'session_id': 52401}))
        with self.assertRaises(FileNotFoundError): self.audit_envelope()

    def test_coherent_map_summary_tampering_cannot_replace_source_derivation(self):
        import hashlib
        changed = (self.directory / 'declared-map.MP').read_bytes() + b'not authored by source'
        (self.directory / 'declared-map.MP').write_bytes(changed)
        new = hashlib.sha256(changed).hexdigest()
        self.preflight['prepared_files']['declared-map.MP'] = new
        self.preflight['inputs']['map_sha256'] = self.report['map_sha256'] = new
        self.reject()

    def test_source_path_escape_and_unlisted_prepared_file_reject(self):
        self.preflight['config']['source_root'] = str(self.source / '..' / self.source.name)
        self.reject()
        self.setUp(); self.preflight['prepared_files']['../outside'] = '0' * 64; self.reject()

    def test_source_manifest_and_observed_override_flags_are_not_trusted_summaries(self):
        self.preflight['pins']['source']['files']['../../outside'] = '0' * 64; self.reject()
        for value in (0, True):
            self.setUp(); self.report['source_override']['reads'] = value; self.reject()


if __name__ == '__main__': unittest.main()
