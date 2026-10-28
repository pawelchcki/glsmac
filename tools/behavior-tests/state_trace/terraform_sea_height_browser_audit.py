"""Read-only, typed audit of the bounded installed-source Sea Raise capture."""
if not __debug__:
    raise RuntimeError('Sea auditor refuses optimized Python: assertion checking is required')

import argparse
import base64
import shutil
import copy
import hashlib
import importlib.util
import json
import math
import re
import struct
import subprocess
from pathlib import Path

SHARED = Path(__file__).with_name('terraform_height_browser_audit.py')
spec = importlib.util.spec_from_file_location('height_capture_audit', SHARED)
height = importlib.util.module_from_spec(spec)
spec.loader.exec_module(height)
HEAD = '7d26149abbaa028b3d685f3503df7c8e195fbdec'
NATIVE = '115032ffc7f53ff7f0c3a9f997da12674e25e643'
DEFAULT = '25ef18d3222f553507291d412330262169b2e418'
JS = 'e71036c9365a3ac87bf818e7eb49fb2344077a15aa6836371a436572cedf7f82'
WASM = 'b2c7fa273042f2407335169eb4fca51f131f1f30656301d7b7573a201b28f5b7'
POLICY = 'application.band-slope-height.v1'
FEE_POLICY = 'application.band-fee.v1'
DIRECTIONS = ('W', 'NW', 'N', 'NE', 'E', 'SE', 'S', 'SW')
EXTRA_TILE_FIELDS = {'resources', 'locked', 'native_type', 'native_height_band'}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validation_identity():
    """Bind the same validation dependency set emitted by the shared auditor."""
    root = SHARED.resolve().parent.parent
    paths = (Path(height.terrain_schema.__file__).resolve(), SHARED.resolve().parent / 'schema.py',
             root / 'protocol.py', root / 'fast.py')
    return {'auditor_sha256': digest(__file__), 'shared_height_auditor_sha256': digest(SHARED),
            'source_validation_dependencies_sha256': {str(path.relative_to(root)): digest(path) for path in paths}}


def parse_records(raw):
    kinds = ('TH_NATIVE', 'TH_RECEIPT', 'TH_INPUTS', 'TH_TRACE', 'TH_HEADERS', 'TH_ROWS',
             'TH_SEA_DECLARED', 'TH_SEA_ACCOUNTING', 'TH_SEA_PRETURN', 'TH_SEA_BIRTH', 'TH_SEA_SETUP')
    world_kinds = ('TH_SEA_DECLARED', 'TH_SEA_ACCOUNTING', 'TH_SEA_PRETURN', 'TH_SEA_BIRTH')
    semantic = re.compile(height.GSE_RECORD_PREFIX + '(' + '|'.join(k for k in kinds if k not in world_kinds) + r')\|(.+)')
    world_prefix = r'(?: {4}\[/height-snapshot/GLSMAC_data/default/game/world/browser_height\.gls\.js:[1-9][0-9]*:[1-9][0-9]*\] )?'
    bootstrap = re.compile(world_prefix + '(' + '|'.join(world_kinds) + r')\|(.+)')
    records = []
    for line_number, line in enumerate(raw.decode('utf8').splitlines()):
        if height.EXIT_RECORD.fullmatch(line):
            records.append(('TH_EXIT_REQUEST', None, line_number))
        match = semantic.fullmatch(line) or bootstrap.fullmatch(line)
        if match:
            kind, encoded = match.groups()
            value = height.terrain_schema.decode_json(encoded)
            if kind == 'TH_TRACE':
                assert type(value) is str
                value = height.terrain_schema.decode_json(value)
            records.append((kind, value, line_number))
    return records


def one(records, kind):
    rows = [(value, line) for name, value, line in records if name == kind]
    assert len(rows) == 1, kind
    return rows[0]


def native_receipts(records):
    receipts = [(value, line) for kind, value, line in records if kind == 'TH_RECEIPT']
    seen = set()
    for value, _ in receipts:
        assert type(value) is dict and set(value) == {'name', 'event_id', 'caller', 'success', 'data'}, 'Different native receipt schema'
        assert type(value['name']) is str and value['name']
        assert type(value['event_id']) is str and value['event_id'] and value['event_id'] not in seen, 'Duplicate/invalid native receipt identity'
        assert type(value['caller']) is int and value['success'] is True and type(value['data']) is dict, 'Invalid/rejected native completion'
        seen.add(value['event_id'])
    return receipts


def source_plan(before, actor):
    """Existing GSE band/slope policy, computed from BEFORE centers/topology."""
    tiles = before['terrain_trace']['tiles']
    start = (actor['x'], actor['y'])
    initial = tiles[f'{start[0]},{start[1]}']
    assert type(initial['elevation']['center']) is int and initial['is_water'] is True
    destination = (initial['elevation']['center'] // 1000 + 1) * 1000 + 500
    assert -3500 <= destination < 0
    queue, seen, baseline, patches = [(*start, 0)], {start}, [], []
    for x, y, distance in queue:
        state = tiles[f'{x},{y}']
        bound = destination - distance * 1000
        if state['elevation']['center'] < bound:
            assert state['is_water'] is (bound < 0), 'This case does not support a land/sea conversion'
            patches.append({'x': x, 'y': y, 'canonical': {'elevation': bound, 'is_water': bound < 0}})
        baseline.append({key: copy.deepcopy(value) for key, value in state.items() if key not in EXTRA_TILE_FIELDS})
        if distance < 7 and destination - (distance + 1) * 1000 >= -3500:
            for direction in DIRECTIONS:
                point = state['neighbors'][direction]
                if point is not None and (point['x'], point['y']) not in seen:
                    seen.add((point['x'], point['y']))
                    queue.append((point['x'], point['y'], distance + 1))
    assert patches == [{'x': 8, 'y': 8, 'canonical': {'elevation': -500, 'is_water': True}}], 'Different bounded authored effect'
    fee = max(1, initial['elevation']['center'] // 1000 + 2) ** 2
    return patches, baseline, destination, fee


def vertex(x, y, corner, width):
    dx, dy = {'left': (-1, 0), 'top': (0, -1), 'right': (1, 0), 'bottom': (0, 1)}[corner]
    return ((x + dx) % width, y + dy)


def cpp_div(numerator, denominator):
    return (abs(numerator) // denominator) * (-1 if numerator < 0 else 1)


def expected_paid_world(before, patches, fee, actor_id, payer):
    """No AFTER/quote values enter the expected world or shared-vertex mean."""
    expected = copy.deepcopy(before)
    actor = next(row for row in expected['units'] if row['id'] == actor_id)
    actor['movement'] = 0.0
    actor['order'] = 'NO_ORDERS'
    detail = expected['terrain_trace']['unit_details'][actor_id]
    detail['moved_this_turn'] = True
    for quote in detail['quotes'].values():
        if quote is not None: quote.update(allowed_now=False, reason='Unit is out of moves')
    energy = expected['terrain_trace']['player_details'][payer]
    assert type(energy['energy_revision']) is int
    energy['energy']['credits'] -= fee
    energy['energy_revision'] += 1
    tiles = before['terrain_trace']['tiles']
    patch_map = {(p['x'], p['y']): p['canonical'] for p in patches}
    changed_vertices = {}
    for x, y in patch_map:
        # This is deliberately an interior case. No unproved polar alias model.
        assert 2 <= x < before['width'] - 2 and 2 <= y < before['height'] - 2
        for corner in height.CORNERS:
            key = vertex(x, y, corner, before['width'])
            incident = [tile for tile in tiles.values() if any(vertex(tile['x'], tile['y'], c, before['width']) == key for c in height.CORNERS)]
            assert len(incident) == 4
            total = sum(patch_map.get((tile['x'], tile['y']), {}).get('elevation', tile['elevation']['center']) for tile in incident)
            changed_vertices[key] = cpp_div(total, len(incident))
    affected = []
    for name, old in tiles.items():
        target = expected['terrain_trace']['tiles'][name]
        geometry_changed = False
        for corner in height.CORNERS:
            point = vertex(old['x'], old['y'], corner, before['width'])
            if point in changed_vertices:
                value = changed_vertices[point]
                assert type(value) is int
                geometry_changed |= value != old['elevation'][corner]
                target['elevation'][corner] = value
        patch = patch_map.get((old['x'], old['y']))
        if patch is None and not geometry_changed: continue
        affected.append(name)
        target['terrain_epoch'] = old['terrain_epoch'] + 1
        target['canonical'].update(active=True, elevation=patch['elevation'] if patch else old['elevation']['center'],
                                   is_water=patch['is_water'] if patch else old['is_water'])
        if patch:
            target['elevation']['center'] = patch['elevation']
            target['is_water'], target['is_land'] = patch['is_water'], not patch['is_water']
            target['native_type']['domain'] = 'sea' if patch['is_water'] else 'land'
            target['imported'].update(active=False, source_corners=None, source_elevation=None, source_water=None)
            for band, threshold in zip(height.BANDS, (0, -1000, -2000)):
                target['native_height_band'][band] = patch['elevation'] < threshold
    assert len(affected) == 9
    return expected, affected, changed_vertices


def audit_records(records, report):
    packets, native = height.validate_sequence(records, report)
    before, after = height.world(packets[0]), height.world(packets[-1])
    assert all(height.equal(height.world(row), before) for row in packets[:5]), 'Quote/Cancel/draft changed native state'
    inputs, _ = one(records, 'TH_INPUTS')
    assert height.equal(report['native_input'], height.node_projection(inputs))
    assert type(inputs['actor']) is int and inputs['actor'] == 8 and inputs['definition'] == 'SeaFormers' and inputs['can_terraform'] is True
    rule = inputs['raise_rule']['sea']
    assert rule['id'] == 'raise' and rule['source_row'] == 16 and rule['name'] == 'Raise Sea Floor' and rule['order'] == 'Terraform UP'
    assert type(rule['turns']) is int and rule['turns'] == 1 and rule['enabled'] is True
    actor = next(row for row in before['units'] if row['raw_id'] == 8)
    owner = next(row for row in before['players'] if row['raw_id'] == 0)
    assert actor['owner'] == owner['id'] and owner['faction'] == 'GAIANS'
    assert (actor['x'], actor['y']) == (8, 8)
    assert all(height.equal(row['ui']['x'], actor['x']) and height.equal(row['ui']['y'], actor['y']) for row in packets)
    detail = before['terrain_trace']['unit_details'][actor['id']]
    assert detail['definition_id'] == 'SeaFormers' and detail['movement_kind'] == 'sea' and detail['can_terraform'] is True and detail['home_base_id'] == 1
    assert all(row['ui']['selected'] == 8 for row in packets[:5])
    patches, baseline, destination, fee = source_plan(before, actor)
    quote = packets[1]['ui']['height_presentation']['quote']
    for row in packets[2:]: assert height.equal(row['ui']['height_presentation']['quote'], quote)
    expected_fields = {'version': 1, 'supported': True, 'action': 'raise', 'resuming': False, 'paid_fee': 0,
                       'mode': 'functional_approximation', 'policy': POLICY, 'fee_policy': FEE_POLICY,
                       'unit_id': 8, 'owner': 0, 'turn': before['turn'], 'x': 8, 'y': 8,
                       'source_elevation': before['terrain_trace']['tiles']['8,8']['elevation']['center'], 'source_water': True,
                       'destination_elevation': destination, 'destination_water': True, 'base_fee': fee, 'fee': fee,
                       'credits': before['terrain_trace']['player_details'][owner['id']]['energy']['credits'], 'plan': patches}
    assert set(quote) == set(expected_fields) | {'reason', 'terrain_identity', 'unit_identity'} and quote['reason'] == ''
    for name, value in expected_fields.items(): assert height.equal(quote[name], value), ('Quote differs from BEFORE/source policy', name)
    assert not any(name in quote for name in ('name', 'sea')), 'No invented quote name echo'
    terrain_identity = json.loads(quote['terrain_identity'])
    assert height.equal(terrain_identity, {'version': 1, 'policy': POLICY, 'fee_policy': FEE_POLICY, 'tiles': baseline})
    identity = {'unit_id': 8, 'owner': 0, 'definition': 'SeaFormers', 'health': actor['health'], 'movement': actor['movement'],
                'moved': detail['moved_this_turn'], 'order': actor['order'], 'work': detail['work'], 'recovery': detail['terraforming_recovery'],
                'automation': detail['automation'], 'home': detail['home_base_id']}
    assert height.equal(json.loads(quote['unit_identity']), identity)
    assert type(fee) is int and fee == 1
    assert height.equal(inputs['starting_credits'], 10) and height.equal(inputs['faction_bonus'], 0) and quote['credits'] == 10
    opening = before['terrain_trace']['player_details'][owner['id']]['energy']
    assert height.equal(inputs['energy'], opening)
    # The declared initialize_energy event establishes the ledger before the
    # baseline; this fixture does not run an energy-income turn.
    assert opening['initialized'] is True
    assert type(opening['last_income_turn']) is int and opening['last_income_turn'] == 0
    for row in (packets[1], packets[3], packets[4]):
        dialog = row['ui']['dialog']
        assert dialog['fee'] == fee and dialog['reserves'] == quote['credits']
        assert dialog['caption'] == 'Planetary Ecologist'
        assert dialog['source_lines'] == ['It will cost $NUM0 credits to {raise} this area;', 'our current reserves are $NUM1 credits.']
        assert dialog['lines'] == [f'It will cost {fee} credits to raise this area;', f'our current reserves are {quote["credits"]} credits.']
        assert dialog['source_choices'] == ['Cancel action.', 'Expend $NUM0 credits.']
        assert dialog['choices'] == ['Cancel action.', f'Expend {fee} credits.']
    expected, affected, vertices = expected_paid_world(before, patches, fee, actor['id'], owner['id'])
    assert height.equal(after, expected), ('Unexpected full typed native change', height.diffs(expected, after)[:8])
    assert height.equal(report['expected_effect_from_live_quote'], height.node_projection(quote))
    assert height.equal(report['actual_sea_row'], {'id': 'raise', 'label': rule['order'], 'enabled': True})
    port = [value for value in detail['quotes'].values() if value is not None and value['destination'] == {'x': 10, 'y': 8}]
    assert len(port) == 1 and port[0]['allowed_now'] is True
    assert height.equal(report['traversal']['home_port_before'], height.node_projection(port[0]))
    all_receipts = native_receipts(records)
    receipts = [(v, line) for v, line in all_receipts if v['name'] == 'unit_terraform']
    assert len(receipts) == 1
    receipt, receipt_line = receipts[0]
    assert [(v, line) for v, line in all_receipts if line >= native[0][1]] == receipts, 'Unexpected native completion after the initial checkpoint'
    assert native[4][1] < receipt_line < native[5][1]
    for kind, _, line in records:
        if kind == 'TH_EXIT_REQUEST': assert native[5][1] < line, 'Final native completion checkpoint must precede exit'
    assert height.equal(receipt, report['height_receipt']) and type(receipt['event_id']) is str and receipt['event_id']
    assert receipt['name'] == 'unit_terraform' and receipt['success'] is True and type(receipt['caller']) is int and receipt['caller'] == 0
    assert height.equal(receipt['data'], {'unit_id': 8, 'action': 'raise', 'confirmed_height': True})
    f32 = []
    for row in packets:
        for unit in row['world']['units']:
            for name in ('movement', 'health'):
                value = unit[name]
                assert type(value) is float and height.equal(value, struct.unpack('>f', struct.pack('>f', value))[0])
                f32.append({'query': row['query'], 'unit': unit['raw_id'], 'field': name, 'f32': struct.pack('>f', value).hex(), 'f64': struct.pack('>d', value).hex()})
        movement = row['ui']['movement']
        assert type(movement) is float and type(row['ui']['movement_bits']) is int
        assert int.from_bytes(struct.pack('>f', movement), 'big') == row['ui']['movement_bits']
        assert height.equal(movement, next(unit['movement'] for unit in row['world']['units'] if unit['raw_id'] == 8))
    assert [row['ui']['movement_bits'] for row in packets] == [1082130432] * 5 + [0]
    return {'status': 'observations-only-readonly-native-fields-audit', 'native_cases_added': 0, 'browser_cases_audited': 0,
            'worlds': len(packets), 'observed_worlds': len(packets), 'complete_worlds': 0,
            'entity_detail_identity': height.validate_detail_mirrors(before),
            'per_world': height.validate_coverage(packets[0]['world']), 'pure_worlds': 5,
            'changed_fields': len(height.diffs(before, after)), 'canonical_patches': patches, 'affected_tiles': affected,
            'source_vertex_means': [{'vertex': list(key), 'native_Int_height': value} for key, value in vertices.items()],
            'fee': fee, 'energy_before': quote['credits'], 'energy_after': quote['credits'] - fee,
            'revision_before': before['terrain_trace']['player_details'][owner['id']]['energy_revision'],
            'revision_after': after['terrain_trace']['player_details'][owner['id']]['energy_revision'],
            'native_float_fields': len(f32), 'unit_float_bits': f32,
            'actor_movement_bits': [row['ui']['movement_bits'] for row in packets], 'selection': [row['ui']['selected'] for row in packets],
            'scope': 'source application policy/corner Int consistency; no original or typed render-mesh vertex claim'}


def validate_bootstrap(records, report):
    declaration, declaration_line = one(records, 'TH_SEA_DECLARED')
    accounting, accounting_line = one(records, 'TH_SEA_ACCOUNTING')
    preturn, preturn_line = one(records, 'TH_SEA_PRETURN')
    birth, birth_line = one(records, 'TH_SEA_BIRTH')
    setup, setup_line = one(records, 'TH_SEA_SETUP')
    assert height.equal(report['sea_setup'], height.node_projection(setup))
    declared = setup['declared']; recipe = declared['recipe']
    # Existing installed application recipe: triad0 pricing, Foil cost2,
    # basic Formers weapon6/armor1/reactor1; Load Map/Gaian mineral factor8.
    for name, value in [('chassis_cost', 2), ('weapon_cost', 6), ('armor_cost', 1), ('rows', 5), ('weapon_mode', 9)]:
        assert type(recipe[name]) is int and recipe[name] == value
    rows = max(2, ((recipe['chassis_cost'] + 1) * recipe['weapon_cost'] + recipe['chassis_cost']) // 4)
    cost = rows * 8
    assert recipe['id'] == 'SeaFormers' and recipe['movement_type'] == 'water' and cost == 40
    assert type(recipe['choice']) is str and recipe['choice'] == 'SEA_FORMERS', 'Different source Sea production choice'
    # The world fixture prints this native choice witness BEFORE restoring
    # production, then reads/prints actual_prefill synchronously afterwards.
    # Cost/stock are independently derived above, not taken from this witness.
    assert height.equal(declaration, {'version': 2, 'base_id': 1, 'owner': 0, 'recipe': recipe,
        'choice_id': recipe['choice'], 'population_cost': 0, 'cost': cost, 'stock': cost + 3,
        'population': 1, 'turn': 1}), 'Different pre-restore native declaration'
    for key in ('version', 'base_id', 'owner', 'choice_id', 'population_cost', 'population', 'turn'):
        assert height.equal(accounting[key], declaration[key]), ('Declaration/accounting differs', key)
    assert height.equal(accounting['observed_choice_cost'], cost) and height.equal(accounting['requested_stock'], cost + 3)
    assert height.equal(accounting['actual_prefill'], {'choice_id': recipe['choice'], 'minerals': cost + 3, 'last_processed_turn': 0})
    assert height.equal(accounting['source_recipe'], recipe)
    assert height.equal(accounting['owner'], 0) and height.equal(accounting['turn'], 1)
    assert height.equal(accounting['base_id'], 1) and height.equal(setup['home_id'], 1)
    inputs, input_line = one(records, 'TH_INPUTS')
    assert declaration_line < accounting_line < preturn_line < birth_line < setup_line < input_line
    assert input_line < next(line for kind, _, line in records if kind == 'TH_NATIVE')
    assert height.equal(inputs['actor'], birth['unit_id']) and inputs['definition'] == recipe['id']
    assert preturn['turn'] == 1 and preturn['home_id'] == 1
    assert len(preturn['bases']) == len(setup['base_states']) == 7
    mapping = lambda values: sorted((v['base_id'], v['owner']) for v in values)
    assert mapping(preturn['bases']) == mapping(setup['base_states']) == [(i + 1, i) for i in range(7)]
    credits = []
    for row in preturn['bases']:
        local = row['owner'] == 0
        assert height.equal(row['population'], 1) and row['eligible'] is local
        assert height.equal(row['intake']['MINERALS'], 1) and height.equal(row['consumption']['MINERALS'], 0)
        assert height.equal(row['intake']['NUTRIENTS'], 2) and height.equal(row['consumption']['NUTRIENTS'], 2)
        assert height.equal(row['production'], {'choice_id': recipe['choice'] if local else declared['resumed_choice'], 'minerals': cost + 3 if local else 0, 'last_processed_turn': 0 if local else 1})
        if local: credits.append(max(0, row['intake']['MINERALS'] - row['consumption']['MINERALS']))
    assert credits == [1]
    overflow = cost + 3 + credits[0] - cost
    assert height.equal(birth['production'], {'choice_id': '', 'minerals': overflow, 'last_processed_turn': 1})
    assert all(height.equal(value, expected) for value, expected in [(birth['unit_id'], 8), (setup['actor'], 8), (birth['home_id'], 1), (birth['home_population'], 1)])
    assert birth['definition'] == 'SeaFormers' and birth['is_water'] is True and birth['can_terraform'] is True and (birth['x'], birth['y']) == (8, 8)
    assert type(birth['movement']) is float and birth['movement'] == 4.0 and type(birth['health']) is float and birth['health'] == 1.0
    production = [(v, line) for k, v, line in records if k == 'TH_RECEIPT' and v['name'] == 'process_base_production']
    growth = [(v, line) for k, v, line in records if k == 'TH_RECEIPT' and v['name'] == 'process_base_growth']
    resumed = [(v, line) for k, v, line in records if k == 'TH_RECEIPT' and v['name'] == 'set_base_production']
    assert len(production) == len(resumed) == 1 and len(growth) == 7
    assert birth_line < production[0][1] < growth[0][1] and all(line < resumed[0][1] < setup_line for _, line in growth)
    results = production + growth + resumed
    assert all(v['success'] is True and type(v['caller']) is int and v['caller'] == 0 and type(v['event_id']) is str for v, _ in results)
    assert len({v['event_id'] for v, _ in results}) == 9
    native_receipts(records)
    assert all(type(v['data']['turn_id']) is int and v['data']['turn_id'] == 1 for v, _ in production + growth)
    assert height.equal(production[0][0]['data']['minerals'], credits[0]) and resumed[0][0]['data']['choice_id'] == declared['resumed_choice']
    baseline = next(value for kind, value, _ in records if kind == 'TH_NATIVE')['world']
    native_owners = {player['id']: player['raw_id'] for player in baseline['players']}
    home = next(base for base in baseline['bases'] if base['raw_id'] == declaration['base_id'])
    assert height.equal(native_owners[home['owner']], declaration['owner']) and height.equal(home['population'], declaration['population'])
    assert height.equal(baseline['turn'], declaration['turn'])
    assert sorted((base['raw_id'], native_owners[base['owner']]) for base in baseline['bases']) == mapping(setup['base_states'])
    for row in setup['base_states']:
        assert height.equal(row['population'], 1)
        assert height.equal(row['production'], {'choice_id': declared['resumed_choice'], 'minerals': overflow if row['owner'] == 0 else 0, 'last_processed_turn': 1})
        base = next(base for base in baseline['bases'] if base['raw_id'] == row['base_id'])
        assert height.equal(baseline['terrain_trace']['base_details'][base['id']]['production'], row['production'])
    return {'native_choice_cost': cost, 'native_prefill': cost + 3, 'income': credits[0], 'overflow': overflow,
            'production_receipts': 1, 'growth_receipts': 7, 'scope': 'scalar receipts plus all-seven source/current-turn state; no fabricated per-base ACK echo'}


def portable_preparer():
    path = Path(__file__).with_name('terraform_sea_height_prepare.py')
    module_spec = importlib.util.spec_from_file_location('sea_portable_prepare_contract', path)
    module = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(module)
    return module


def validate_portable_provenance(directory, report, source_root, preflight, portable_node=None):
    """Explicit portable ABI, independent of the strict historical v3 branch."""
    prep = portable_preparer(); prep.validate_record(preflight)
    assert report['candidate_executed'] is True
    config = preflight['config']; source_root = Path(source_root).resolve(strict=True)
    assert Path(config['source_root']).resolve(strict=True) == source_root
    assert Path(config['output']).resolve() == directory.resolve()
    for value in config.values():
        assert type(value) is str and Path(value).is_absolute() and str(Path(value).resolve()) == value, 'Noncanonical portable input path'
    actual = prep.pins(config)
    assert height.equal(actual, preflight['pins']), 'Prepared inputs/source changed'
    expected = preflight['expected']
    for field in ('head', 'native_tree', 'default_tree'): assert actual['source'][field] == expected[field]
    for name, field in [('GLSMAC.js', 'js'), ('GLSMAC.wasm', 'wasm')]:
        assert actual['runtime'][name] == actual['web'][name] == expected[field]
    provenance = json.loads((Path(config['runtime']) / 'provenance.json').read_bytes())
    assert provenance['src_tree'] == expected['native_tree']
    assert all(provenance['runtime'][name] == actual['runtime'][name] for name in ('GLSMAC.js', 'GLSMAC.wasm'))
    tool_names = {'terraform_sea_height_prepare.py', 'terraform_sea_height_run.py'}
    assert len(preflight['tool_sources']) == 2
    assert {Path(name).name for name in preflight['tool_sources']} == tool_names
    for name, value in preflight['tool_sources'].items():
        assert Path(name).is_absolute() and '..' not in Path(name).parts
        assert value == digest(Path(__file__).with_name(Path(name).name)), 'Different portable tool version'
    prepared = {'declared-map.MP', 'executed-rules.txt', 'fixture-main.gls.js', 'fixture-world.gls.js'}
    assert set(preflight['prepared_files']) == prepared
    for name in prepared: assert digest(directory / name) == preflight['prepared_files'][name]
    # Never execute a binary selected only by untrusted JSON metadata. The
    # operator selects a local trusted Node, whose bytes must match preparation.
    node = Path(portable_node or shutil.which('node')).resolve(strict=True)
    assert digest(node) == actual['tools']['node']
    assert subprocess.check_output([str(node), '--version'], text=True, env=prep.clean_environment()).strip() == preflight['node_version']
    derived = json.loads(subprocess.check_output([str(node), '--input-type=module', '-e', prep.NODE_INPUTS,
        str(source_root), config['assets']], text=True, encoding='utf8', env=prep.clean_environment()))
    map_bytes = base64.b64decode(derived.pop('map'), validate=True)
    rules = base64.b64decode(derived.pop('executed_rules'), validate=True)
    derived.update(map_sha256=hashlib.sha256(map_bytes).hexdigest(), executed_rules_sha256=hashlib.sha256(rules).hexdigest())
    assert height.equal(derived, preflight['inputs']), 'Prepared input summary differs from source-derived bytes'
    declared = derived['declared']
    for field, value in {'version': 2, 'width': 16, 'height': 16, 'players': 7, 'actor': {'x': 8, 'y': 8},
                         'port': {'x': 10, 'y': 8}, 'action': 'raise'}.items():
        assert height.equal(declared[field], value), 'Different bounded Sea input profile'
    assert map_bytes == (directory / 'declared-map.MP').read_bytes()
    assert rules == (directory / 'executed-rules.txt').read_bytes()
    assert actual['assets']['alphax.txt'] == expected['rules']
    assert derived['executed_rules_sha256'] == expected['executed_rules']
    files = actual['source']['files']
    mapping = {'driver_sha256': 'terraform-sea-height-browser.test.mjs', 'height_observation_sha256': 'terraform-height-observation.mjs',
               'sea_observation_sha256': 'terraform-sea-height-observation.mjs', 'sea_input_sha256': 'terraform-sea-height-inputs.mjs',
               'observer_sha256': 'fixtures/terraform-sea-height-main.gls.js', 'world_input_sha256': 'fixtures/terraform-sea-height-world.gls.js'}
    for field, name in mapping.items(): assert report[field] == files['tools/wasm-tests/' + name]
    for name, field in [('fixture-main.gls.js', 'observer_sha256'), ('fixture-world.gls.js', 'world_input_sha256')]:
        assert digest(directory / name) == report[field]
    assert report['host_head'] == actual['source']['head'] and report['native_source_tree'] == actual['source']['native_tree']
    assert report['default_tree'] == actual['source']['default_tree']
    assert report['runtime_js_sha256'] == actual['runtime']['GLSMAC.js'] and report['runtime_wasm_sha256'] == actual['runtime']['GLSMAC.wasm']
    assert report['seed_requested'] == preflight['seed_requested']
    assert type(report['sea_menu_contract_version']) is int and report['sea_menu_contract_version'] == 3
    assert report['map_sha256'] == derived['map_sha256']
    assert height.equal(report['declared_input'], dict(derived['declared'], bases=7, units=8, normal_source_funding=True))
    override = report['source_override']
    assert type(override['reads']) is int and override['reads'] == 1
    assert override['original_sha256'] == actual['assets']['alphax.txt'] and override['rate_one_sha256'] == derived['executed_rules_sha256']
    assert type(override['bytes']) is int and override['bytes'] == len(rules)
    assert height.equal(override['rows'], derived['override_table'])
    shared = ['browser-log-cursor.mjs', 'browser-native-log-hook.mjs', 'runtime-fetch-barrier.mjs', 'terraform-browser-geometry.mjs', 'terraform-browser-pointer.mjs']
    assert report['shared_helpers_sha256'] == {name: files['tools/wasm-tests/' + name] for name in shared}
    assert report['web_sha256'] == {name: actual['web'][name] for name in ('index.html', 'bootstrap.js', 'asset-store.js')}
    helpers = {name: (source_root / ('GLSMAC_data/tests/' + name + '.gls.js')).read_bytes().decode('utf8')
               for name in ('_state_trace_observer', '_terrain_trace_observer', '_terraform_cooperation_observer')}
    defaults = {'GLSMAC_data/default/' + name: (source_root / 'GLSMAC_data/default' / name).read_bytes().decode('utf8')
                for name in sorted(actual['source']['default_files']) if name.endswith('.gls.js')}
    for field, value in [('observer_helpers_sha256', helpers), ('production_default_sha256', defaults)]:
        assert report[field] == hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf8')).hexdigest()
    return preflight


def validate_provenance(directory, report, source_root, portable_node=None):
    preflight = json.loads((directory / 'preflight.json').read_bytes())
    if preflight['kind'] == 'terraform-sea-portable-preflight.v1':
        return validate_portable_provenance(directory, report, source_root, preflight, portable_node)
    assert preflight['kind'] == 'terraform-sea-height-preflight.v3' and preflight['candidate_executed'] is False
    assert preflight['head'] == report['host_head'] == HEAD
    assert preflight['native_tree'] == report['native_source_tree'] == NATIVE
    assert preflight['default_tree'] == report['default_tree'] == DEFAULT
    assert preflight['runtime']['GLSMAC.js'] == report['runtime_js_sha256'] == JS
    assert preflight['runtime']['GLSMAC.wasm'] == report['runtime_wasm_sha256'] == WASM
    assert preflight['browser_budget_ms'] == 180000 and preflight['native_timeout_override'] is None
    assert preflight['sea_menu_contract_version'] == report['sea_menu_contract_version'] == 3
    assert digest(directory / 'preflight.py') == preflight['preflight_producer_sha256']
    assert preflight['seed_requested'] == report['seed_requested'] == '1651011033:1377505029:3019448108:3247278135'
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source_root, text=True).strip() == HEAD
    assert subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=source_root, text=True) == ''
    files = preflight['source_sha256']
    for name, value in {**files, **preflight['default_source_sha256']}.items(): assert digest(source_root / name) == value
    assert len(files) == 18 and len(preflight['default_source_sha256']) == 220
    mapping = {'driver_sha256': 'terraform-sea-height-browser.test.mjs', 'height_observation_sha256': 'terraform-height-observation.mjs',
               'sea_observation_sha256': 'terraform-sea-height-observation.mjs', 'sea_input_sha256': 'terraform-sea-height-inputs.mjs',
               'observer_sha256': 'fixtures/terraform-sea-height-main.gls.js', 'world_input_sha256': 'fixtures/terraform-sea-height-world.gls.js'}
    for name, file in mapping.items(): assert report[name] == files['tools/wasm-tests/' + file]
    for name, value in report['shared_helpers_sha256'].items(): assert value == files['tools/wasm-tests/' + name]
    assert digest(directory / 'fixture-main.gls.js') == report['observer_sha256'] and digest(directory / 'fixture-world.gls.js') == report['world_input_sha256']
    assert digest(directory / 'declared-map.MP') == report['map_sha256'] == preflight['inputs']['map_sha256']
    assert report['source_override']['original_sha256'] == preflight['inputs']['original_rules_sha256'] == 'bb01e3ac23793da0a46713f4851d65e63b599c24aef8300ffe45e7e57b332c42'
    assert report['source_override']['rate_one_sha256'] == preflight['inputs']['executed_rules_sha256'] == '7abf62aa4f4f562aaa86c785b67b7af2320e122cbda7901287ee3ed0ab4c5bd0'
    assert height.equal(report['source_override']['rows'], preflight['inputs']['override_table']) and len(report['source_override']['rows']) == 20
    for row in report['source_override']['rows']:
        assert row['field_index'] == 4 and row['new'] == 1 and row['applies_to'] == ['land', 'sea']
    return preflight


def validate_portable_outer(directory, report, raw, preflight):
    completion = json.loads((directory / 'portable-external-completion.json').read_bytes())
    start = json.loads((directory / 'external-start.json').read_bytes())
    claim = json.loads((directory / 'execution-claim.json').read_bytes())
    assert completion['kind'] == 'terraform-sea-portable-external-completion.v1'
    assert start['kind'] == 'terraform-sea-owned-process-completion.v1'
    assert completion['status'] == 'process-and-reported-native-exit-zero-not-complete-browser-credit'
    assert height.equal(claim, {'preflight_sha256': digest(directory / 'preflight.json'), 'argv': preflight['argv'], 'candidate_execution_requested': True})
    for field in ('actual_os_process_exit_code', 'actual_os_node_exit_code', 'native_app_exit', 'complete_browser_cases'):
        assert type(completion[field]) is int and completion[field] == 0
    for field in ('actual_wait_returned', 'owned_group_absent', 'subreaper_restored', 'postpins_match',
                  'ownership_supported', 'known_owned_identities_absent'): assert completion[field] is True
    for field in ('forced_cleanup', 'outer_timed_out'): assert completion[field] is False
    for field in ('spawn_error', 'postpins_error', 'lifecycle_error', 'report_read_error'): assert completion.get(field) is None
    assert completion['remaining_owned_identities'] == []
    assert completion['unresolved_adopted_children'] == []
    assert completion['ownership_unsupported_reasons'] == []
    assert completion['reported_status'] == report['status'] == 'passed'
    assert height.equal(completion['reported_native_exit'], report['native_exit'])
    assert height.equal(report['native_exit'], {'body_state': 'exited', 'status_text': 'GLSMAC exited (0).', 'raw_code': 0})
    assert height.equal(completion['report_input_bindings'], {'match': True, 'mismatched_fields': []})
    assert completion['source_head'] == preflight['pins']['source']['head']
    assert completion['preflight_sha256'] == digest(directory / 'preflight.json')
    assert completion['report_sha256'] == digest(directory / 'report.json')
    assert completion['application.log_sha256'] == hashlib.sha256(raw).hexdigest()
    assert completion['application-log-chunks.jsonl_sha256'] == digest(directory / 'application-log-chunks.jsonl')
    assert completion['runner_sha256'] == digest(Path(__file__).with_name('terraform_sea_height_run.py'))
    for packet in (start, completion):
        assert packet['command_argv'] == preflight['argv'] and packet['cwd'] == preflight['config']['source_root']
        assert type(packet['timeout_seconds']) is int and packet['timeout_seconds'] == preflight['outer_timeout_seconds']
        assert all(type(packet[field]) is int and packet[field] > 0 for field in ('pid', 'process_group', 'session_id'))
        assert packet['pid'] == packet['process_group'] == packet['session_id']
        assert height.finite_number(packet['started_wall_time']) and packet['started_wall_time'] > 0
        ids = packet['initial_owned_identities']
        assert ids and len({row['pid'] for row in ids}) == len(ids)
        assert all(type(row['pid']) is int and type(row['start_ticks']) is int and row['pid'] > 0 and row['start_ticks'] > 0 for row in ids)
        assert packet['pid'] in {row['pid'] for row in ids}
    for field in ('pid', 'process_group', 'session_id', 'started_wall_time', 'initial_owned_identities'):
        assert height.equal(start[field], completion[field])
    assert start['actual_os_process_exit_code'] is None and start['actual_wait_returned'] is False and start['spawn_error'] is None
    assert height.finite_number(completion['elapsed_seconds']) and completion['elapsed_seconds'] >= 0
    receipt = completion['external_tool_receipt']
    assert set(receipt) == {'supported', 'reason'} and receipt['supported'] is False
    assert type(receipt['reason']) is str and receipt['reason']
    # The same finalization checks apply; a process-summary flag is not a
    # substitute for the actual retained raw/chunk/callback/exit journal.
    chunks = [json.loads(line) for line in (directory / 'application-log-chunks.jsonl').read_text().splitlines() if line]
    height.validate_finalization(report, raw, chunks, parse_records(raw))
    return {'supported': False, 'bounded_process_witness_supported': True, 'external_node_os_exit': 0, 'native_app_exit': 0,
            'reason': 'Portable OS wait is bound, but no independently genuine external tool-level completion witness is supplied',
            'portable_completion_sha256': digest(directory / 'portable-external-completion.json')}


def validate_outer(directory, report, raw):
    preflight = json.loads((directory / 'preflight.json').read_bytes())
    if preflight['kind'] == 'terraform-sea-portable-preflight.v1':
        return validate_portable_outer(directory, report, raw, preflight)
    assert preflight['kind'] == 'terraform-sea-height-preflight.v3'
    # One genuine retained external receipt, not a fallback for new captures.
    assert digest(directory / 'raw-outcome.json') == '95ef0e7d413ffd9c11787d9034c56fd8e2eace4323c4e552d9c92a55a2c13da3'
    outcome = json.loads((directory / 'raw-outcome.json').read_bytes())
    completion = json.loads((directory / 'external-completion.json').read_bytes())
    assert outcome['kind'] == 'sea-height-v3-genuine-external-outcome' and outcome['status'] == 'exited'
    assert type(outcome['actual_os_node_exit_code']) is int and outcome['actual_os_node_exit_code'] == 0 and outcome['actual_node_wait_returned'] is True
    assert outcome['external_tool_completion'] == {'session_id': 52401, 'chunk_id': '60a1a5', 'exit_code': 0}
    assert outcome['source_head'] == HEAD and outcome['report_sha256'] == digest(directory / 'report.json')
    assert outcome['preflight_sha256'] == digest(directory / 'preflight.json') and outcome['raw_sha256'] == hashlib.sha256(raw).hexdigest()
    assert height.equal(outcome['native_exit'], report['native_exit'])
    for field in ('owned_group_absent', 'browser_server_driver_reaped', 'postpins_match', 'temporary_dependency_link_removed'): assert outcome[field] is True
    assert outcome['forced_cleanup'] is False and outcome['actual_external_driver_exit_code'] == 0
    assert completion['actual_wait_returned'] is True and type(completion['actual_os_node_exit_code']) is int and completion['actual_os_node_exit_code'] == 0
    assert completion['owned_group_absent'] is True and completion['forced_cleanup'] is False and completion['outer_timed_out'] is False
    assert outcome['external_completion_sha256'] == digest(directory / 'external-completion.json')
    assert outcome['external_driver_sha256'] == completion['external_driver_sha256'] == digest(directory / 'run-once.py')
    return {'supported': True, 'external_node_os_exit': 0, 'native_app_exit': 0, 'tool_session': 52401, 'tool_chunk': '60a1a5',
            'raw_outcome_sha256': digest(directory / 'raw-outcome.json'), 'owned_reaped_without_forced_cleanup': True}


def classify_evidence(finalization, external_exit, entity_identity=None):
    if not external_exit['supported']:
        assert external_exit['bounded_process_witness_supported'] is True
    result = height.classify_browser_credit(finalization, external_exit, entity_identity)
    return result


def audit_artifacts(directory, source_root, portable_node=None):
    directory, source_root = Path(directory), Path(source_root)
    raw = (directory / 'application.log').read_bytes()
    records = parse_records(raw)
    report = json.loads((directory / 'report.json').read_bytes())
    result = audit_records(records, report)
    result['bootstrap'] = validate_bootstrap(records, report)
    provenance = validate_provenance(directory, report, source_root, portable_node)
    chunks = [json.loads(line) for line in (directory / 'application-log-chunks.jsonl').read_text().splitlines() if line]
    result['finalization'] = height.validate_finalization(report, raw, chunks, records)
    result['pointer_route'] = height.validate_pointer_route(records, report)
    result['keyboard_route'] = height.validate_keyboard_route(records, report)
    result['external_exit'] = validate_outer(directory, report, raw)
    result['frames_decoded'] = height.validate_frames(directory, report)
    clip = [result['frames_decoded']['decoded_frames'][0][key] for key in ('width', 'height')]
    result.update(classify_evidence(result['finalization'], result['external_exit'], result['entity_detail_identity']))
    result.update(validation_identity())
    result.update(raw_bytes=len(raw), raw_sha256=hashlib.sha256(raw).hexdigest(),
                  report_sha256=digest(directory / 'report.json'), preflight_sha256=digest(directory / 'preflight.json'),
                  provenance_schema=provenance['kind'],
                  frames=5,
                  native_viewport={'width': 1024, 'height': 768}, png_clip_dimensions=list(clip),
                  unsupported=['original height/price/wording parity', 'numeric render-mesh vertices/resident Z/facing/tool frames/audio/animation',
                               'fixed camera (only viewport fixed)', 'Sea water-to-land/coast/stranded worker/lower scenarios', 'actual movement (traversal quotes only)'])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', required=True, type=Path)
    parser.add_argument('--source-root', required=True, type=Path, help='Exact clean capture source checkout; historical7d or explicit portable prepared source')
    parser.add_argument('--portable-node', type=Path, help='Operator-trusted local Node for read-only source input rederivation; defaults to PATH node, must match prepared binary')
    parser.add_argument('--output', required=True, type=Path, help='NEW derived result; original report/raw are never rewritten')
    args = parser.parse_args()
    assert not args.output.exists(), 'Keep each previous derived result immutable'
    result = audit_artifacts(args.artifacts, args.source_root, args.portable_node)
    # The early exists check is only a fast rejection. Exclusive creation is
    # the authority after replay, when another writer may already have won.
    with args.output.open('x', encoding='utf8') as output:
        output.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'unit_float_bits'}, indent=2))


if __name__ == '__main__': main()
