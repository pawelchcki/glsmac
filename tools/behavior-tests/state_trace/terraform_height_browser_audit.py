"""Read-only audit of the bounded land-height browser capture, not a new run."""
if not __debug__:
    raise RuntimeError("Height capture audit requires non-optimized Python; assertions are acceptance gates")

import argparse
import copy
import hashlib
import json
import struct
import re
import math
import zlib
import sys
from pathlib import Path

# Reuse the reviewed v4 native schema unchanged, including all 128 tiles.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from state_trace import terrain_observation as terrain_schema

CHECKPOINTS = ('before-height', 'raise-quote', 'raise-cancel', 'raise-reopened',
               'raise-payment-draft', 'raise-paid-completion')
SCOPES = ('root', 'height', 'root', 'height', 'height', 'root')
STAGES = (None, 'pending-consent', 'cancelled', 'pending-consent', 'pending-consent', 'submitted')
BANDS = ('below_coast', 'below_ocean', 'below_trench')
CORNERS = ('left', 'top', 'right', 'bottom')
# GSE Console::print emits four spaces + source location + one space.
# This pinned fixture is mounted under the same virtual filename for land/sea;
# a bare line is also admitted by the asset-free protocol model.
GSE_RECORD_PREFIX = r'(?: {4}\[/height-snapshot/GLSMAC_data/default/browser_height_main\.gls\.js:[1-9][0-9]*:[1-9][0-9]*\] )?'
EXIT_RECORD = re.compile(GSE_RECORD_PREFIX + r'TH_EXIT_REQUEST')
SEMANTIC_RECORD = re.compile(GSE_RECORD_PREFIX + r'(TH_NATIVE|TH_RECEIPT|TH_INPUTS|TH_TRACE|TH_HEADERS|TH_ROWS)\|(.+)')


def equal(a, b):
    """Native JSON preserves integral Float tokens and the sign of zero."""
    if type(a) is not type(b):
        return False
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(equal(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
    if isinstance(a, float):
        return struct.pack('>d', a) == struct.pack('>d', b)
    return a == b


def node_projection(value):
    """Report JSON folds integral JS Numbers; it never proves native types."""
    if isinstance(value, dict):
        return {k: node_projection(v) for k, v in value.items()}
    if isinstance(value, list):
        return [node_projection(v) for v in value]
    if type(value) is float and value.is_integer():
        return int(value)
    return value


def parse_records(raw):
    records = []
    for line_number, line in enumerate(raw.decode('utf8').splitlines()):
        if EXIT_RECORD.fullmatch(line):
            records.append(('TH_EXIT_REQUEST', None, line_number))
        match = SEMANTIC_RECORD.fullmatch(line)
        if match:
            kind, encoded = match.groups()
            value = terrain_schema.decode_json(encoded)
            if kind == 'TH_TRACE':
                assert type(value) is str
                value = terrain_schema.decode_json(value)
            records.append((kind, value, line_number))
    return records


def world(row):
    assert equal(row['world']['terrain_trace']['ui'], row['ui']), 'Contradictory duplicated native UI projection'
    result = copy.deepcopy(row['world'])
    del result['terrain_trace']['ui']
    return result


def diffs(a, b, path=()):
    if type(a) is not type(b):
        return [(path, a, b)]
    if isinstance(a, dict):
        assert a.keys() == b.keys(), (path, 'key delta')
        return [d for k in a for d in diffs(a[k], b[k], path + (k,))]
    if isinstance(a, list):
        assert len(a) == len(b), (path, 'list length delta')
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in diffs(x, y, path + (i,))]
    return [] if equal(a, b) else [(path, a, b)]


def validate_coverage(state):
    # The reusable schema raises ProtocolError; keep the auditor acceptance
    # surface fail-closed without discarding or normalizing any raw field.
    try:
        terrain_schema.validate_snapshot(state)
    except terrain_schema.ProtocolError as error:
        raise AssertionError(str(error)) from error
    assert type(state['width']) is int and state['width'] == 16
    assert type(state['height']) is int and state['height'] == 16
    counts = {name: len(state[name]) for name in ('players', 'units', 'bases')}
    assert counts == {'players': 7, 'units': 8, 'bases': 7}, counts
    ids = {}
    for name in counts:
        rows = state[name]
        assert all(type(row['raw_id']) is int for row in rows)
        assert len({row['raw_id'] for row in rows}) == len(rows), (name, 'duplicate native identity')
        ids[name] = {row['id'] for row in rows}
        assert len(ids[name]) == len(rows), (name, 'duplicate logical identity')
    assert {row['raw_id'] for row in state['players']} == set(range(7))
    assert {row['owner'] for row in state['units']} == ids['players']
    assert {row['owner'] for row in state['bases']} == ids['players']
    research = state['research']
    assert type(research) is list and len(research) == len(state['players'])
    assert {row['player'] for row in research} == ids['players'], 'Incomplete/duplicate research player projection'
    for row in research:
        assert type(row['owned_tech_ids']) is list
        assert all(type(value) is int and 0 <= value < 89 for value in row['owned_tech_ids'])
        assert len(set(row['owned_tech_ids'])) == len(row['owned_tech_ids'])
        assert type(row['target_id']) is int and -1 <= row['target_id'] < 89
        assert type(row['accumulated']) is int and row['accumulated'] >= 0
    trace = state['terrain_trace']
    assert trace['schema'] == 'game.terrain_observation.v4'
    assert trace['elevation_units'] == 'native-engine-elevation'
    assert equal(trace['terrain_units'], {
        'rockiness': 'native-enum-0-none-1-flat-2-rolling-3-rocky',
        'moisture': 'native-enum-0-none-1-arid-2-moist-3-rainy',
        'original_raw_height_class': 'unsupported', 'original_raw_rockiness': 'unsupported'}), 'Unknown native terrain units'
    required = ('all_players', 'terrain_height', 'terrain_type', 'terrain_resources',
                'traverse_quotes', 'canonical_height', 'energy_initialization', 'automation_context',
                'automation_phase', 'home_identity', 'improvement_owners', 'terrain_epoch',
                'paid_height_work', 'naval_recovery', 'energy_revision', 'cooperative_work', 'ui')
    assert all(trace['coverage'][name] is True for name in required), 'Missing/unsupported native observation capability'
    for name, detail in [('players', 'player_details'), ('units', 'unit_details'), ('bases', 'base_details')]:
        assert set(trace[detail]) == ids[name], (name, 'incomplete native details')
    for player in state['players']:
        detail = trace['player_details'][player['id']]
        assert type(detail['raw_id']) is int and detail['raw_id'] == player['raw_id'], 'Misbound native player details'
        energy = detail['energy']
        assert type(energy['credits']) is int and type(energy['initialized']) is bool and type(energy['last_income_turn']) is int, 'Native player energy must retain Int/Bool/Int field types'
        assert type(detail['energy_revision']) is int and detail['energy_revision'] >= 0, 'Native energy revision must be an Int, never Bool'
    tiles = trace['tiles']
    expected = {f'{x},{y}' for y in range(16) for x in range(y % 2, 16, 2)}
    assert set(tiles) == expected, 'Incomplete native map coordinates'
    for key, tile in tiles.items():
        assert type(tile['x']) is int and type(tile['y']) is int
        assert key == f"{tile['x']},{tile['y']}"
    counts['tiles'] = len(tiles)
    validate_detail_mirrors(state)
    return counts


def validate_detail_mirrors(state):
    """Check actual available echoes, without inventing absent native handles."""
    trace = state['terrain_trace']
    prototypes = {'ColonyPod': 'colony-pod', 'Formers': 'formers', 'ScoutPatrol': 'scout-patrol', 'Scout': 'scout-patrol'}
    for unit in state['units']:
        detail = trace['unit_details'][unit['id']]
        if detail['definition_id'] in prototypes:
            assert unit['prototype'] == prototypes[detail['definition_id']], 'Native unit definition/prototype mirror differs'
        # validate_snapshot also binds all eight quote source/destination,
        # movement-kind and nominal-MP echoes to this row's actual position.
    projects = {'COLONY_POD': 'colony-pod', 'FORMERS': 'formers', 'SCOUT_PATROL': 'scout-patrol'}
    for base in state['bases']:
        detail = trace['base_details'][base['id']]
        assert equal(base['resources']['minerals'], detail['production']['minerals']), 'Native base mineral mirror differs'
        assert base['project'] == projects[detail['production']['choice_id']], 'Native base production mirror differs'
        assert equal(base['nutrients_native'], detail['nutrients'] if detail['nutrients_present'] else 'uninitialized'), 'Native base nutrient mirror differs'
        jobs = {'workers': sum(c['type'] == 'WORKER' for c in detail['citizens']),
                'doctors': sum(c['type'] == 'DOCTOR' for c in detail['citizens'])}
        assert equal(base['jobs'], jobs), 'Native base citizen/job mirror differs'
    # v4 detail objects do not contain raw_id. Matching available echoes is
    # necessary but cannot prove individual identity for otherwise equal rows.
    return {'supported': False, 'schema': 'game.terrain_observation.v4',
            'unit_mirrors_verified': len(state['units']), 'base_mirrors_verified': len(state['bases']),
            'reason': 'UNSUPPORTED: native unit/base raw identity echoes absent from v4 details; no complete entity/world credit'}


def validate_trace(records):
    """One uninterrupted native journal: Drain clears events, not sequence."""
    events, carriers = [], {}
    prior = 0
    packets = [row for row in records if row[0] == 'TH_TRACE']
    assert packets, 'Missing native presentation journal'
    for _, packet, line in packets:
        assert packet['enabled'] is True
        assert type(packet['dropped']) is int and packet['dropped'] == 0, 'Lossy native presentation journal'
        assert type(packet['events']) is list
        for event in packet['events']:
            assert type(event['seq']) is int and event['seq'] == prior + 1, 'Duplicate, missing or reordered native event'
            assert type(event['kind']) is str and type(event['data']) is dict
            prior = event['seq']
            carriers[prior] = line
            events.append(event)
    return events, carriers


def validate_sequence(records, report):
    assert report.get('candidate_executed') is True, 'Actual candidate execution must be Boolean true before case credit'
    input_records = [(value, line) for kind, value, line in records if kind == 'TH_INPUTS']
    assert len(input_records) == 1
    inputs = [input_records[0][0]]
    input_line = input_records[0][1]
    policy = inputs[0]['policy']
    assert equal(policy, {'version': 1, 'ignore_technologies': True}), 'Different actual native input policy'
    native = [(value, line) for kind, value, line in records if kind == 'TH_NATIVE']
    assert len(native) == len(CHECKPOINTS)
    reported = report['native_snapshots']
    assert len(reported) == len(CHECKPOINTS)
    trace, carriers = validate_trace(records)
    assert input_line < native[0][1], 'Actual inputs must precede the first native checkpoint'
    assert all(input_line < carriers[event['seq']] for event in trace if event['kind'] == 'input.ingress'), 'Actual inputs must precede native user input carriers'
    events = {event['seq']: event for event in trace}
    packets = []
    actor, owner, turn = native[0][0]['ui']['actor'], native[0][0]['ui']['owner'], native[0][0]['ui']['turn']
    assert all(type(v) is int for v in (actor, owner, turn))
    assert (actor, owner, turn) == (8, 0, 1), 'Different declared actor/owner/turn'
    prior_fence = -1
    for i, ((row, native_line), item) in enumerate(zip(native, reported)):
        ui, request = row['ui'], row['query_owner']
        assert equal(row['world']['terrain_trace']['ui'], ui), 'Contradictory duplicated native UI projection'
        assert type(row['query']) is int and row['query'] == i + 1
        assert item['checkpoint'] == CHECKPOINTS[i]
        assert equal(item['observation'], node_projection(row)), 'Report observation is not the retained raw packet'
        assert request['query'] == row['query'] and type(request['query']) is int
        for key in ('actor', 'owner', 'turn', 'session', 'dialog_generation'):
            assert type(ui[key]) is int and type(request[key]) is int
            assert request[key] == ui[key], ('stale request', i, key)
        assert (ui['actor'], ui['owner'], ui['turn']) == (actor, owner, turn)
        assert request['scope'] == SCOPES[i]
        assert ui['height_stage'] == STAGES[i]
        assert ui['modal'] is (SCOPES[i] == 'height')
        assert ui['popup_id'] == ('terraforming_height' if ui['modal'] else None)
        assert ui['sliding'] is False and ui['hiding'] is False
        assert ui['native_pending'] is False and ui['tile_locked'] is False and ui['pending'] is None
        assert type(ui['choice']) is int and ui['choice'] == (1 if i >= 4 else 0)
        assert ui['dialog_generation'] == (0, 1, 2, 3, 3, 4)[i]
        assert ui['session'] == (0 if i == 0 else 1)
        presentation = ui['height_presentation']
        assert (presentation is None) if i == 0 else (presentation['stage'] == STAGES[i])
        assert type(row['world']['turn']) is int and row['world']['turn'] == turn
        assert equal(row['world']['terrain_trace']['policy'], policy), 'Native world policy differs from actual input policy'
        validate_coverage(row['world'])
        fence = item['query_after_native_key']
        assert type(fence) is int and fence > prior_fence
        end = events[fence]
        assert end['kind'] == 'input.dispatch' and end['data']['phase'] == 'end' and end['data']['handled'] is True
        ingress_id = end['data']['ingress']
        begins = [e for e in events.values() if prior_fence < e['seq'] < fence and e['kind'] == 'input.dispatch'
                  and e['data'].get('phase') == 'begin' and e['data'].get('ingress') == ingress_id]
        assert len(begins) == 1
        begin = begins[0]
        assert begin['data']['type'] == 'keydown' and begin['data']['code'] == 'P' and begin['data']['modifiers'] == 6
        ingress = [e for e in events.values() if prior_fence < e['seq'] < begin['seq'] and e['kind'] == 'input.ingress'
                   and e['data'].get('type') == 'keydown' and e['data'].get('ingress') == ingress_id]
        assert len(ingress) == 1
        carrier = carriers[fence]
        assert carriers[ingress[0]['seq']] == carriers[begin['seq']] == carrier
        # This fixture emits TH_NATIVE and then drains TH_TRACE in its owned
        # timer. Input occurred earlier; its printed carrier follows Native.
        assert native_line < carrier
        upper = native[i + 1][1] if i + 1 < len(native) else next((line for kind, _, line in records if kind == 'TH_EXIT_REQUEST'), None)
        if upper is not None: assert carrier < upper, 'P journal carrier is outside its exact checkpoint interval'
        prior_fence = fence
        packets.append(row)
    return packets, native


DIRECTIONS = ('W', 'NW', 'N', 'NE', 'E', 'SE', 'S', 'SW')
NEIGHBOR_OFFSETS = ((-2, 0), (-1, -1), (0, -2), (1, -1), (2, 0), (1, 1), (0, 2), (-1, 1))


def source_raise_plan(base, actor):
    """Pinned land fixture: GSE band/slope policy from BEFORE, never quote/AFTER."""
    tiles = base['terrain_trace']['tiles']
    start = (actor['x'], actor['y'])
    initial = tiles[f'{start[0]},{start[1]}']
    assert start == (8, 8) and initial['is_water'] is False
    assert type(initial['elevation']['center']) is int
    destination = (initial['elevation']['center'] // 1000 + 1) * 1000 + 500
    assert destination == 1500, 'Different declared land-height source band'
    queue, seen, patches = [(*start, 0)], {start}, []
    for x, y, distance in queue:
        state = tiles[f'{x},{y}']
        assert type(state['elevation']['center']) is int
        bound = destination - distance * 1000
        if state['elevation']['center'] < bound:
            assert state['is_water'] is False and bound >= 0, 'Land-only case cannot certify a domain conversion'
            patches.append({'x': x, 'y': y, 'canonical': {'elevation': bound, 'is_water': False}})
        if distance < 7 and destination - (distance + 1) * 1000 >= -3500:
            for direction in DIRECTIONS:
                point = state['neighbors'][direction]
                if point is not None:
                    assert type(point['x']) is int and type(point['y']) is int
                    point = (point['x'], point['y'])
                    if point not in seen:
                        seen.add(point); queue.append((*point, distance + 1))
    # The authored interior 16x16 source map has eight distinct neighbours.
    fixed = {start, *((start[0] + dx, start[1] + dy) for dx, dy in NEIGHBOR_OFFSETS)}
    assert len(patches) == 9 and {(p['x'], p['y']) for p in patches} == fixed, 'Different fixed-fixture Raise footprint'
    region = set(fixed)
    for x, y in fixed:
        region.update((x + dx, y + dy) for dx, dy in NEIGHBOR_OFFSETS)
    observed_region = set(fixed)
    for x, y in fixed:
        observed_region.update((point['x'], point['y']) for point in tiles[f'{x},{y}']['neighbors'].values() if point is not None)
    assert len(region) == 25 and observed_region == region, 'Different fixed-fixture derived region'
    return patches, region


def shared_vertex(x, y, corner, width):
    dx, dy = {'left': (-1, 0), 'top': (0, -1), 'right': (1, 0), 'bottom': (0, 1)}[corner]
    return ((x + dx) % width, y + dy)


def expected_paid_world(base, after, quote, actor_id, payer):
    expected = copy.deepcopy(base)
    actor = next(row for row in expected['units'] if row['id'] == actor_id)
    plan, region = source_raise_plan(base, actor)
    assert equal(quote['plan'], plan), 'Live quote differs from BEFORE/source-derived Raise plan'
    actor['movement'] = 0.0
    actor['order'] = 'NO_ORDERS'
    detail = expected['terrain_trace']['unit_details'][actor_id]
    detail['moved_this_turn'] = True
    for value in detail['quotes'].values():
        if value is not None:
            value['allowed_now'] = False
            value['reason'] = 'Unit is out of moves'
    energy = expected['terrain_trace']['player_details'][payer]
    assert type(quote['fee']) is int and 0 < quote['fee'] <= energy['energy']['credits']
    energy['energy']['credits'] -= quote['fee']
    energy['energy_revision'] += 1
    patches = {f"{p['x']},{p['y']}": p for p in plan}
    tiles = base['terrain_trace']['tiles']
    changed_vertices = {}
    for patch in plan:
        x, y = patch['x'], patch['y']
        assert 2 <= x < base['width'] - 2 and 2 <= y < base['height'] - 2
        for corner in CORNERS:
            vertex = shared_vertex(x, y, corner, base['width'])
            incident = [tile for tile in tiles.values() if any(shared_vertex(tile['x'], tile['y'], c, base['width']) == vertex for c in CORNERS)]
            assert len(incident) == 4
            total = sum(patches.get(f"{tile['x']},{tile['y']}", {}).get('canonical', {}).get('elevation', tile['elevation']['center']) for tile in incident)
            # Native integer division truncates toward zero, including negatives.
            changed_vertices[vertex] = (abs(total) // 4) * (-1 if total < 0 else 1)
    affected = set()
    for key, old in tiles.items():
        target = expected['terrain_trace']['tiles'][key]
        geometry_changed = False
        for name in CORNERS:
            vertex = shared_vertex(old['x'], old['y'], name, base['width'])
            if vertex in changed_vertices:
                value = changed_vertices[vertex]
                geometry_changed |= value != old['elevation'][name]
                target['elevation'][name] = value
        patch = patches.get(key)
        if patch is None and not geometry_changed:
            continue
        affected.add((old['x'], old['y']))
        assert type(old['terrain_epoch']) is int
        target['terrain_epoch'] = old['terrain_epoch'] + 1
        target['canonical'].update(active=True,
                                   elevation=patch['canonical']['elevation'] if patch else old['elevation']['center'],
                                   is_water=patch['canonical']['is_water'] if patch else old['is_water'])
        if patch:
            elevation, water = patch['canonical']['elevation'], patch['canonical']['is_water']
            target['elevation']['center'] = elevation
            target['is_water'], target['is_land'] = water, not water
            target['native_type']['domain'] = 'sea' if water else 'land'
            target['imported'].update(active=False, source_corners=None, source_elevation=None, source_water=None)
            for name, limit in zip(BANDS, (0, -1000, -2000)):
                target['native_height_band'][name] = elevation < limit
    assert affected == region and len(affected) == 25, 'Different source-derived shared-geometry footprint'
    assert equal(after, expected), ('Unexpected exact native paid-world field/value/type', diffs(expected, after)[:8])
    return patches, {f'{x},{y}' for x, y in region}


def audit_records(records, report):
    """Callable read-only semantic audit; input mutation tests need no engine."""
    packets, native = validate_sequence(records, report)
    base, after = world(packets[0]), world(packets[-1])
    quote = packets[1]['ui']['height_presentation']['quote']
    assert all(equal(world(row), base) for row in packets[:5]), 'Quote/cancel/draft changed the native world'
    for row in packets[2:]:
        assert equal(row['ui']['height_presentation']['quote'], quote), 'Quote intent changed'
    inputs = [value for kind, value, _ in records if kind == 'TH_INPUTS']
    assert len(inputs) == 1 and equal(report['native_input'], node_projection(inputs[0]))
    assert inputs[0]['actor'] == 8 and inputs[0]['can_terraform'] is True
    assert inputs[0]['raise_rule']['turns'] == 1
    for key in ('version', 'unit_id', 'owner', 'turn', 'x', 'y', 'source_elevation', 'destination_elevation', 'fee', 'base_fee', 'paid_fee', 'credits'):
        assert type(quote[key]) is int, ('Native quote Int required', key)
    assert quote['supported'] is True and quote['action'] == 'raise' and quote['resuming'] is False and quote['paid_fee'] == 0
    assert quote['version'] == 1 and quote['mode'] == 'functional_approximation'
    assert quote['policy'] == 'application.band-slope-height.v1' and quote['fee_policy'] == 'application.band-fee.v1'
    assert (quote['unit_id'], quote['owner'], quote['turn'], quote['x'], quote['y']) == (8, 0, 1, 8, 8)
    actor = next(row for row in base['units'] if row['raw_id'] == quote['unit_id'])
    actor_id, actor_idx = actor['id'], base['units'].index(actor)
    payer_row = next(row for row in base['players'] if row['raw_id'] == quote['owner'])
    payer = payer_row['id']
    assert actor['owner'] == payer
    assert type(actor['x']) is int and type(actor['y']) is int and (actor['x'], actor['y']) == (quote['x'], quote['y'])
    assert type(inputs[0]['starting_credits']) is int and inputs[0]['starting_credits'] == 10
    assert type(inputs[0]['faction_bonus']) is int and inputs[0]['faction_bonus'] == 0
    opening = base['terrain_trace']['player_details'][payer]['energy']
    assert equal(inputs[0]['energy'], opening)
    assert type(opening['credits']) is int and opening['credits'] == inputs[0]['starting_credits'] + inputs[0]['faction_bonus']
    assert opening['initialized'] is True and type(opening['last_income_turn']) is int and opening['last_income_turn'] == 0
    source = base['terrain_trace']['tiles'][f"{quote['x']},{quote['y']}"]
    assert type(quote['source_elevation']) is int and equal(quote['source_elevation'], source['elevation']['center'])
    assert quote['source_water'] is False and source['is_water'] is False and quote['destination_water'] is False
    assert quote['destination_elevation'] == (quote['source_elevation'] // 1000 + 1) * 1000 + 500
    assert quote['base_fee'] == max(1, quote['source_elevation'] // 1000 + 2) ** 2
    # This is the bounded unmodified Gaian case, not a general faction fee oracle.
    assert payer_row['faction'] == 'GAIANS' and quote['fee'] == quote['base_fee']
    assert quote['credits'] == base['terrain_trace']['player_details'][payer]['energy']['credits']
    for row in (packets[1], packets[3], packets[4]):
        assert row['ui']['dialog']['fee'] == quote['fee'] and row['ui']['dialog']['reserves'] == quote['credits']
    patches, region = expected_paid_world(base, after, quote, actor_id, payer)
    assert patches[f"{quote['x']},{quote['y']}"]['canonical']['elevation'] == quote['destination_elevation']
    all_receipts = [(value, line) for kind, value, line in records if kind == 'TH_RECEIPT']
    event_ids = set()
    for value, _ in all_receipts:
        assert type(value) is dict and set(value) == {'name', 'event_id', 'caller', 'success', 'data'}, 'Different native receipt schema'
        assert type(value['name']) is str and value['name']
        assert type(value['event_id']) is str and value['event_id'] and value['event_id'] not in event_ids, 'Duplicate/invalid native receipt identity'
        assert type(value['caller']) is int and value['success'] is True and type(value['data']) is dict, 'Invalid/rejected native completion'
        event_ids.add(value['event_id'])
    # configure_game installs the observer before startup, so legitimate setup
    # receipts precede the first checkpoint. During/after the observed flow the
    # only native event completion is the confirmed payment; do not ignore an
    # extra completion merely because its name differs from unit_terraform.
    receipts = [(value, line) for value, line in all_receipts if value['name'] == 'unit_terraform']
    assert len(receipts) == 1
    receipt, receipt_line = receipts[0]
    assert [(value, line) for value, line in all_receipts if line >= native[0][1]] == receipts, 'Unexpected native completion after the initial checkpoint'
    assert equal(receipt, report['height_receipt']), 'Reported receipt is not the actual raw receipt'
    assert native[4][1] < receipt_line < native[5][1], 'Payment ACK is outside draft/complete sequence'
    for kind, _, line in records:
        if kind == 'TH_EXIT_REQUEST':
            assert native[5][1] < line, 'Final native completion checkpoint must precede exit'
    assert type(receipt['event_id']) is str and receipt['event_id']
    assert receipt['success'] is True and type(receipt['caller']) is int and receipt['caller'] == quote['owner']
    assert equal(receipt['data'], {'unit_id': quote['unit_id'], 'action': 'raise', 'confirmed_height': True}), 'Native scalar receipt types differ'
    assert type(receipt['data']['unit_id']) is int
    changes, categories = diffs(base, after), {}
    for path, _, _ in changes:
        category = None
        if path == ('units', actor_idx, 'movement'): category = 'actor actual MP'
        if path[:3] == ('terrain_trace', 'player_details', payer): category = 'payer fee/revision'
        if path[:3] == ('terrain_trace', 'unit_details', actor_id):
            category = 'actor moved flag' if path[3:] == ('moved_this_turn',) else 'actor exhausted movement preflight'
        if len(path) >= 4 and path[:2] == ('terrain_trace', 'tiles') and path[2] in region:
            key, tail = path[2], path[3:]
            if tail == ('terrain_epoch',): category = 'affected tile epoch'
            if len(tail) == 2 and tail[0] == 'elevation' and tail[1] in CORNERS: category = 'source-derived Native shared geometry'
            if len(tail) == 2 and tail[0] == 'canonical' and tail[1] in ('active', 'elevation', 'is_water'): category = 'native canonical write/pin'
            if key in patches:
                if tail == ('elevation', 'center'): category = 'quoted gameplay elevation'
                if len(tail) == 2 and tail[0] == 'imported': category = 'edited imported source retirement'
                if tail in [('is_land',), ('is_water',), ('native_type', 'domain')]: category = 'quoted gameplay domain'
                if len(tail) == 2 and tail[0] == 'native_height_band' and tail[1] in BANDS: category = 'derived native below-coast band'
        assert category is not None, path
        categories[category] = categories.get(category, 0) + 1
    f32 = []
    for row in packets:
        for unit in row['world']['units']:
            for key in ('movement', 'health'):
                value = unit[key]
                assert type(value) is float and struct.unpack('>f', struct.pack('>f', value))[0] == value
                f32.append({'query': row['query'], 'unit': unit['raw_id'], 'field': key, 'type': 'native Float token',
                            'f32_bits': struct.pack('>f', value).hex(), 'f64_bits': struct.pack('>d', value).hex()})
        ui = row['ui']
        assert type(ui['movement']) is float and type(ui['movement_bits']) is int
        assert int.from_bytes(struct.pack('>f', ui['movement']), 'big') == ui['movement_bits']
        assert equal(ui['movement'], next(unit['movement'] for unit in row['world']['units'] if unit['raw_id'] == ui['actor']))
    assert packets[0]['ui']['movement_bits'] == 1065353216 and packets[-1]['ui']['movement_bits'] == 0
    return {'status': 'observations-only-readonly-native-fields-audit', 'native_cases_added': 0, 'browser_cases_audited': 0, 'native_capture_field_cases_audited': 0,
            'compile_attribution_verified': False, 'public_retained_replay_available': False,
            'typed_pure_checkpoints': 5, 'complete_worlds': 0, 'observed_worlds': len(packets),
            'entity_detail_identity': validate_detail_mirrors(base), 'per_world': validate_coverage(packets[0]['world']),
            'native_receipts': {'total': len(all_receipts), 'startup_before_first_checkpoint': len(all_receipts) - 1,
                                'observed_completions': 1, 'unexpected_completions': 0},
            'parsed_native_world_changed_fields': len(changes), 'allowed_diff_categories': categories,
            'native_float_unit_fields_checked': len(f32), 'unit_float_bits': f32,
            'actor_movement_bits': [row['ui']['movement_bits'] for row in packets],
            'quote': {**{key: quote[key] for key in ('fee', 'credits', 'source_elevation', 'destination_elevation', 'source_water', 'destination_water', 'policy', 'fee_policy', 'mode')}, 'patches': len(quote['plan'])},
            'payer_before': base['terrain_trace']['player_details'][payer]['energy'], 'payer_after': after['terrain_trace']['player_details'][payer]['energy'],
            'payer_revision_before': base['terrain_trace']['player_details'][payer]['energy_revision'], 'payer_revision_after': after['terrain_trace']['player_details'][payer]['energy_revision']}


# Historical kind-less envelope is accepted only as this explicitly identified
# immutable capture, never as a generic fallback for absent/unknown schemas.
LEGACY_PREFLIGHT_SHA256 = '791b078abf2949ddb1fb2efcd322b05dc41198e6114f31aa1ad2816375264622'
LEGACY_KEYS = {'candidate_executed', 'phase', 'prior_attempt', 'head', 'native_tree', 'default_tree',
               'original_rules_sha256', 'executed_rules_sha256', 'override_table', 'source_sha256',
               'runtime', 'seed_requested', 'browser_budget_ms', 'tracked_diff'}
V1_KEYS = {'version', 'kind', 'candidate_executed', 'phase', 'head', 'native_tree', 'default_tree',
           'runtime', 'original_rules_sha256', 'executed_rules_sha256', 'override_table', 'source_sha256',
           'input_sha256', 'production_default_sha256', 'declared_map', 'seed_requested',
           'browser_budget_ms', 'native_policy_observation', 'runtime_build_binding'}
FATAL = re.compile(r'TH_ERROR|Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]', re.I)
CAPTURE_MANIFESTS = ('12743b42e275842a7ae3862572ec769c6d86f647394f0edb1ff9db6d104888e3',
                     '740c1c9f418ec24f7f6343087645cdef44fd7b85127cb297f0a453f28ea3ae10')


def validate_preflight(directory, preflight, preflight_bytes, report, native_input):
    assert equal(json.loads(preflight_bytes), preflight), 'Preflight object is not its supplied bytes'
    digest = hashlib.sha256(preflight_bytes).hexdigest()
    if 'kind' not in preflight:
        assert set(preflight) == LEGACY_KEYS and preflight['phase'] == 'prelaunch-input-binding'
        assert type(preflight['prior_attempt']) is str and preflight['prior_attempt']
        assert preflight['tracked_diff'] == ''
        assert digest == LEGACY_PREFLIGHT_SHA256, 'Unrecognized kind-less preflight; not the genuine retained legacy record'
        schema = 'historical-prelaunch-input-binding:791b078a'
        driver_key = 'tools/wasm-tests/terraform-height-browser.test.mjs'
    else:
        assert preflight['kind'] == 'terraform-height-producer-preflight.v1', 'Unknown preflight schema'
        assert set(preflight) == V1_KEYS
        assert type(preflight['version']) is int and preflight['version'] == 1
        assert preflight['phase'] == 'before-native-launch'
        assert report['preflight_sha256'] == digest
        binding = preflight['runtime_build_binding']
        assert set(binding) == {'schema', 'provenance_sha256', 'source_head', 'native_tree', 'runtime', 'scope', 'compile_attribution_verified'}
        assert binding['schema'] == 'native-source-runtime.v1'
        assert type(binding['provenance_sha256']) is str and re.fullmatch(r'[0-9a-f]{64}', binding['provenance_sha256'])
        assert type(binding['source_head']) is str and re.fullmatch(r'[0-9a-f]{40}', binding['source_head'])
        assert binding['native_tree'] == preflight['native_tree'] == report['native_source_tree']
        assert binding['runtime'] == {'GLSMAC.js': report['runtime_js_sha256'], 'GLSMAC.wasm': report['runtime_wasm_sha256']}
        assert binding['compile_attribution_verified'] is False
        assert binding['scope'] == 'Declared native source/runtime consistency; compile attribution unverified; Default scripts separately captured'
        assert preflight['production_default_sha256'] == report['production_default_sha256']
        assert preflight['native_policy_observation'] == 'not available before launch; require actual TH_INPUTS and every retained native world in the auditor'
        source = preflight['input_sha256']
        assert source['main'] == report['observer_sha256'] and source['world'] == report['world_input_sha256']
        assert source['helpers'] == report['observer_helpers_sha256']
        map_bytes = (directory / 'fixture-map.MP').read_bytes()
        assert hashlib.sha256(map_bytes).hexdigest() == source['map']
        assert map_bytes[:11] == b'TERRANMAP\0\x1a'
        assert equal(preflight['declared_map'], {'width': int.from_bytes(map_bytes[15:19], 'little'),
            'height': int.from_bytes(map_bytes[19:23], 'little'), 'tiles': int.from_bytes(map_bytes[35:39], 'little'), 'bytes': len(map_bytes)})
        assert preflight['declared_map']['width'] == 16 and preflight['declared_map']['height'] == 16 and preflight['declared_map']['tiles'] == 128
        schema = preflight['kind']
        driver_key = 'executed_node_driver'
    assert preflight['candidate_executed'] is False
    assert preflight['seed_requested'] == report['seed_requested'] == '1651011033:1377505029:3019448108:3247278135'
    assert type(preflight['browser_budget_ms']) is int and preflight['browser_budget_ms'] == 180000
    assert preflight['head'] == report['host_head'] and preflight['native_tree'] == report['native_source_tree'] and preflight['default_tree'] == report['default_tree']
    assert preflight['runtime'] == {'js': report['runtime_js_sha256'], 'wasm': report['runtime_wasm_sha256']}
    assert preflight['original_rules_sha256'] == report['source_override']['original_sha256']
    assert preflight['executed_rules_sha256'] == report['source_override']['rate_one_sha256']
    override = report['source_override']
    assert type(override['reads']) is int and override['reads'] == 1, 'No exact actual override loader response'
    # This admitted installed-data profile has two actually captured opaque
    # manifest IDs. No absent historical payload/cleanliness evidence is made up.
    assert (override['original_manifest_id'], override['manifest_id']) == CAPTURE_MANIFESTS
    files = preflight['source_sha256']
    shared = {'browser-log-cursor.mjs', 'browser-native-log-hook.mjs', 'runtime-fetch-barrier.mjs', 'terraform-browser-geometry.mjs', 'terraform-browser-pointer.mjs'}
    assert set(report['shared_helpers_sha256']) == shared
    common_sources = {'tools/wasm-tests/' + name for name in shared} | {'tools/wasm-tests/terraform-height-observation.mjs', 'tools/wasm-tests/fixtures/terraform-height-main.gls.js', 'tools/wasm-tests/terraform-browser-inputs.mjs'}
    expected_sources = common_sources | ({'tools/wasm-tests/terraform-height-browser.test.mjs'} if 'kind' not in preflight else {'executed_node_driver', 'preflight_producer', 'tools/serve-wasm.py', 'tools/wasm_assets.py', 'tools/wasm-tests/terraform-height-preflight.mjs', 'tools/wasm-tests/fixtures/terraform-controls-world.gls.js', 'GLSMAC_data/tests/_state_trace_observer.gls.js', 'GLSMAC_data/tests/_terrain_trace_observer.gls.js', 'GLSMAC_data/tests/_terraform_cooperation_observer.gls.js'})
    assert set(files) == expected_sources
    assert all(type(value) is str and re.fullmatch(r'[0-9a-f]{64}', value) for value in files.values())
    if 'kind' in preflight:
        assert files['preflight_producer'] == files['tools/wasm-tests/terraform-height-preflight.mjs'], 'Executed preflight differs from declared source'
    assert files[driver_key] == report['driver_sha256']
    assert files['tools/wasm-tests/terraform-height-observation.mjs'] == report['height_observation_sha256']
    assert files['tools/wasm-tests/fixtures/terraform-height-main.gls.js'] == report['observer_sha256']
    for name, digest in report['shared_helpers_sha256'].items():
        assert files['tools/wasm-tests/' + name] == digest, ('Executed helper mismatch', name)
    for name, field in [('fixture-main.gls.js', 'observer_sha256'), ('fixture-world.gls.js', 'world_input_sha256')]:
        assert hashlib.sha256((directory / name).read_bytes()).hexdigest() == report[field]
    rows = preflight['override_table']
    assert len(rows) == 20
    legacy = 'kind' not in preflight
    for i, row in enumerate(rows):
        assert type(row['source_row' if legacy else 'row']) is int and row['source_row' if legacy else 'row'] == i
        assert row['field'] == 'shared_turns' and type(row['field_index']) is int and row['field_index'] == 4
        assert row['applies_to'] == ['land', 'sea']
        assert row['new'] == ('1' if legacy else 1) and type(row['new']) is (str if legacy else int)
        assert type(row['old']) is (str if legacy else int)
    raised = rows[16]
    rule = native_input['raise_rule']
    assert type(rule['source_row']) is int and rule['source_row'] == 16 and rule['id'] == 'raise'
    assert type(rule['turns']) is int and type(rule['sea']['turns']) is int and rule['turns'] == 1 and rule['sea']['turns'] == 1
    assert raised['name' if legacy else 'land_name'] == rule['name']
    assert raised['sea_name'] == rule['sea']['name']
    assert raised['prerequisite_unchanged' if legacy else 'land_prerequisite'] == rule['prerequisite']
    if not legacy:
        assert raised['sea_prerequisite'] == rule['sea']['prerequisite']
    return schema


def utf16_length(text):
    return len(text.encode('utf-16-le', 'surrogatepass')) // 2


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_finalization(report, raw, chunks, records):
    text = raw.decode('utf8')
    assert report['status'] == 'passed' and type(report['native_raw_exit_code']) is int and report['native_raw_exit_code'] == 0
    assert equal(report['native_exit'], {'body_state': 'exited', 'status_text': 'GLSMAC exited (0).', 'raw_code': 0})
    assert report['browser_errors'] == [] and report['errors'] == []
    for name in ('log_capture_error', 'hook_capture_error', 'browser_close_error', 'final_artifact_error'):
        assert report.get(name) is None, (name, report.get(name))
    assert FATAL.search(text) is None, 'Fatal error in complete sealed raw, including final suffix'
    transport = report['log_transport']
    assert transport['sealed'] is True and transport['partial'] is False
    assert transport['settled_failure'] is None and transport['unread_tail'] is False
    digest = hashlib.sha256(raw).hexdigest()
    assert transport['raw_sha256'] == transport['joined_chunk_sha256'] == digest
    assert type(transport['retained_utf8']) is int and transport['retained_utf8'] == len(raw)
    assert type(transport['retained_utf16']) is int and transport['retained_utf16'] == utf16_length(text)
    offset = 0
    for chunk in chunks:
        assert type(chunk['start_utf16']) is int and type(chunk['end_utf16']) is int
        assert chunk['start_utf16'] == offset and chunk['end_utf16'] == offset + utf16_length(chunk['text'])
        offset = chunk['end_utf16']
    joined = ''.join(chunk['text'] for chunk in chunks)
    # JSONL may divide one UTF16 surrogate pair; combine it losslessly before
    # UTF8 comparison, rather than encoding each half independently.
    joined = joined.encode('utf-16-le', 'surrogatepass').decode('utf-16-le')
    assert joined.encode('utf8') == raw and offset == utf16_length(text)
    text16 = text.encode('utf-16-le')
    read_offset = 0
    for read in transport['reads']:
        assert type(read['start_utf16']) is int and type(read['end_utf16']) is int
        assert read['start_utf16'] == read_offset and read['end_utf16'] >= read_offset
        assert type(read['transferred_utf16']) is int and read['transferred_utf16'] == read['end_utf16'] - read_offset
        fragment = text16[read_offset * 2:read['end_utf16'] * 2].decode('utf-16-le', 'surrogatepass')
        assert type(read['transferred_utf8']) is int and read['transferred_utf8'] == len(fragment.encode('utf8', 'surrogatepass'))
        read_offset = read['end_utf16']
    assert read_offset == offset
    config = report['native_log_configuration']
    assert type(config['installations']) is int and config['installations'] == 1
    barrier, callbacks = config['barrier'], config['callbacks']
    assert barrier['kind'] == 'main' and barrier['continued'] is True and barrier['before_unmodified_runtime_response'] is True
    assert finite_number(barrier['continuation_acknowledged_node_ms'])
    assert barrier['ack']['installed_before_runtime_capture'] is True
    assert callbacks['installed_before_runtime_capture'] is True
    assert callbacks['original_source'] == barrier['ack']['original_source']
    assert hashlib.sha256(callbacks['original_source'].encode()).hexdigest() == config['original_log_source_sha256']
    for name in ('stdout_source', 'stderr_source'):
        assert callbacks[name] == barrier['ack'][name]
    first = callbacks['first_callback']
    assert first['sequence'] == 1 and type(first['sequence']) is int
    assert first['runtime_out_bound'] is True and first['runtime_err_bound'] is True and first['runtime_callMain_present'] is True
    # This pinned successful bootstrap has no direct-log bypass: initial text
    # is empty, onExit only updates status, and every received character is
    # covered by an actual recorded Module.print/printErr append. A future
    # genuine bypass needs a separately supported contract, not fake callbacks.
    assert type(callbacks['initial_utf16']) is int and callbacks['initial_utf16'] == 0
    assert callbacks['initial_text'] == ''
    position, message_bindings = 0, 0
    text16 = text.encode('utf-16-le')
    assert callbacks['calls']
    for i, call in enumerate(callbacks['calls']):
        assert type(call['sequence']) is int and call['sequence'] == i + 1
        assert call['channel'] in ('stdout', 'stderr')
        assert call['runtime_out_bound'] is True and call['runtime_err_bound'] is True and call['runtime_callMain_present'] is True
        assert type(call['before_utf16']) is int and type(call['after_utf16']) is int
        assert position == call['before_utf16'] < call['after_utf16'] <= offset, 'Uncovered native callback interval'
        assert type(call['message_utf16']) is int and call['message_utf16'] == call['after_utf16'] - call['before_utf16'] - 1
        assert text16[(call['after_utf16'] - 1) * 2:call['after_utf16'] * 2] == b'\n\0'
        payload = text16[call['before_utf16'] * 2:(call['after_utf16'] - 1) * 2]
        bound = False
        if 'message' in call:
            assert type(call['message']) is str and call['message'].encode('utf-16-le', 'surrogatepass') == payload, 'Different callback message'
            bound = True
        if 'message_utf16le_sha256' in call:
            assert type(call['message_utf16le_sha256']) is str and re.fullmatch(r'[0-9a-f]{64}', call['message_utf16le_sha256'])
            assert hashlib.sha256(payload).hexdigest() == call['message_utf16le_sha256'], 'Different callback message digest'
            bound = True
        message_bindings += bound
        position = call['after_utf16']
    assert position == offset, 'Uncovered final callback suffix'
    assert all(equal(first[key], value) for key, value in callbacks['calls'][0].items())
    assert first['message'] == text16[first['before_utf16'] * 2:(first['after_utf16'] - 1) * 2].decode('utf-16-le')
    workers = config['worker_requests']
    assert len(workers) == 8, 'This pinned v6 runtime requires all eight actual pthread continuations'
    assert len({worker['fetch_id'] for worker in workers}) == len(workers)
    assert len({worker['target_id'] for worker in workers}) == len(workers)
    assert all(event['kind'] != 'rejected' for event in config['protocol_events'])
    for role in [barrier] + workers:
        assert role['continued'] is True and finite_number(role['continuation_acknowledged_node_ms'])
        if role is not barrier:
            assert role['kind'] == 'worker' and role['continued_without_frame_lookup'] is True
            assert role['frame_id'] == barrier['frame_id'] and role['network_id'] == role['target_id']
        acknowledgements = [event for event in config['protocol_events'] if event['kind'] == 'continue-acknowledged'
                            and all(event['role'].get(key) == role[key] for key in ('kind', 'fetch_id', 'network_id', 'frame_id'))]
        assert len(acknowledgements) == 1, 'No exact actual CDP continuation ACK'
    events, carriers = validate_trace(records)
    last_query = report['native_snapshots'][-1]['query_after_native_key']
    qbegins = [event for event in events if event['seq'] > last_query and event['kind'] == 'input.dispatch'
               and event['data'].get('phase') == 'begin' and event['data'].get('type') == 'keydown'
               and event['data'].get('code') == 'Q' and event['data'].get('modifiers') == 6]
    assert len(qbegins) == 1
    begin = qbegins[0]
    ingresses = [event for event in events if last_query < event['seq'] < begin['seq'] and event['kind'] == 'input.ingress'
                 and event['data'].get('type') == 'keydown' and event['data'].get('ingress') == begin['data']['ingress']]
    ends = [event for event in events if event['seq'] > begin['seq'] and event['kind'] == 'input.dispatch' and event['data'].get('phase') == 'end'
            and event['data'].get('ingress') == begin['data']['ingress'] and event['data'].get('handled') is True]
    assert len(ingresses) == len(ends) == 1
    exit_lines = [i for i, line in enumerate(text.splitlines()) if EXIT_RECORD.fullmatch(line)]
    last_native_line = max(line for kind, _, line in records if kind == 'TH_NATIVE')
    assert len(exit_lines) == 1 and exit_lines[0] > last_native_line
    # Fixture-specific: its owned timer drains on line131, then prints the
    # exit marker on132. This is not a universal dispatch-vs-exit guarantee.
    assert all(last_native_line < carriers[event['seq']] < exit_lines[0] for event in [ingresses[0], begin, ends[0]])
    return {'sealed_complete': True, 'native_exit_verified': True, 'actual_main_ack': True,
            'actual_worker_acks': len(workers), 'actual_exit_key_and_request': True, 'full_raw_fatal_scan': 'clean',
            'callback_metadata_intervals': len(callbacks['calls']), 'callback_utf16_covered': position,
            'exact_callback_message_identity': {'supported': message_bindings == len(callbacks['calls']),
                'verified_messages': message_bindings,
                'scope': 'per-call UTF16 message or digest binding' if message_bindings == len(callbacks['calls']) else
                         'UNSUPPORTED: legacy offset-only metadata cannot prove exact callback message identities/count; sealed-byte journal remains bounded evidence'},
            'lossless_trace_packets': sum(kind == 'TH_TRACE' for kind, _, _ in records), 'unique_contiguous_trace_events': len(events),
            'exit_order_scope': 'this fixture drains Q ingress/begin/end before its owned-timer TH_EXIT_REQUEST'}


LEGACY_OUTER_SHA256 = '6ab902e12ee6a6d0f3a4a4f52868a0bf5232a00ea408475ddbba1afd2850673d'
LEGACY_CAPTURE_BINDINGS = {
    'raw_sha256': '7877baed15b88c2700f3042fe5c31f64c6ee66517dcef04541c1ced832bad473',
    'report_sha256': '7f196c8f5de67e76355f3f49cff0ac20a4a4f3ef35fc7021c90d993f73f76f3c',
    'preflight_sha256': LEGACY_PREFLIGHT_SHA256,
    'host_head': 'bc8a3e4a113456cce2ada80e7a56d0872911d8a0',
}


def validate_pointer_route(records, report):
    """Replay the producer's eight physical clicks, not just resulting worlds."""
    events, carriers = validate_trace(records)
    event_map = {event['seq']: event for event in events}
    packets = [value for kind, value, _ in records if kind == 'TH_NATIVE']
    pointers = report['processed_pointers']
    assert len(pointers) == 8, 'The bounded menu/Cancel/reopen/draft/confirm route requires eight actual clicks'
    headers = [value for kind, value, _ in records if kind == 'TH_HEADERS']
    assert len(headers) == 1
    header = [row for row in headers[0] if row['id'] == 'left_menu_terraform']
    assert len(header) == 1 and header[0]['label'] == 'TERRAFORM'
    command = report['native_input']['raise_rule']['order']
    assert command == 'Terraform UP', 'Different installed command template for this pinned profile'
    draft_label = packets[4]['ui']['dialog']['choices'][1]
    assert packets[4]['ui']['dialog']['source_choices'] == ['Cancel action.', 'Expend $NUM0 credits.']
    assert draft_label == f"Expend {packets[4]['ui']['height_presentation']['quote']['fee']} credits."
    expected = [(None, None, 'MENU', 0), ('terraform-header', 'left_menu_terraform', header[0]['label'], 0),
                ('terraform-row', 'raise', command, 0), ('terraform-height-ok', 'confirm', 'OK', 1),
                ('terraform-header', 'left_menu_terraform', header[0]['label'], 2), ('terraform-row', 'raise', command, 2),
                ('terraform-height-choice', '1', draft_label, 3), ('terraform-height-ok', 'confirm', 'OK', 4)]
    nodes, index, prior_end, used_buttons = {}, 0, 0, set()

    def ingest(event):
        target, kind, data = event.get('target'), event['kind'], event['data']
        if type(target) is not str:
            return
        if kind == 'node.destroy':
            nodes.pop(target, None)
            return
        node = nodes.setdefault(target, {'properties': {}})
        if kind == 'node.create':
            node.update(tag=data['tag'], parent=data['parent'], visible=False)
        if kind == 'node.attach': node['parent'] = data['parent']
        if kind == 'semantic.role': node.update(role=data['role'], source=data['source'])
        if kind == 'node.property': node['properties'][data['key']] = data['value']
        if kind == 'semantic.geometry' and data['area'] == 'effective': node['effective'] = data
        if kind == 'node.show': node['visible'] = True
        if kind == 'node.hide': node['visible'] = False

    def ancestors(target):
        seen = set()
        while target is not None:
            assert target not in seen and target in nodes, 'Stale/cyclic native widget ancestry'
            seen.add(target)
            yield target
            target = nodes[target].get('parent')

    def visible(target):
        return all(nodes[item].get('visible') is not False for item in ancestors(target))

    def inside(point, bounds):
        return all(finite_number(point[key]) for key in ('x', 'y')) and bounds['left'] <= point['x'] < bounds['right'] and bounds['top'] <= point['y'] < bounds['bottom']

    for receipt, (role, source, label, checkpoint) in zip(pointers, expected):
        fence = receipt['fence']
        assert type(fence) is int and fence >= report['native_snapshots'][checkpoint]['query_after_native_key'] and fence >= prior_end
        while index < len(events) and events[index]['seq'] <= fence:
            ingest(events[index]); index += 1
        target = receipt['target']
        assert target.get('role') == role and target.get('source') == source and target['label'] == label
        candidates = [key for key, node in nodes.items() if node.get('tag') == '$button' and
                      ((node.get('role') == role and node.get('source') == source) if role else (node['properties'].get('text') == label and visible(key)))]
        assert candidates == [target['id']], 'Different/ambiguous actual semantic widget'
        node = nodes[target['id']]
        assert node['properties']['text'] == label and visible(target['id'])
        if role == 'terraform-row': assert type(node['properties']['color']) is str and node['properties']['color'] != 'black'
        bounds = node['effective']
        assert equal(target['bounds'], node_projection(bounds)), 'Pointer target is not the retained native effective geometry'
        viewport = receipt['viewport']
        assert equal(viewport, node_projection(packets[checkpoint]['ui']['viewport']))
        assert all(finite_number(bounds[key]) for key in ('left', 'top', 'right', 'bottom'))
        assert 0 <= bounds['left'] < bounds['right'] <= viewport['width'] and 0 <= bounds['top'] < bounds['bottom'] <= viewport['height']
        assert finite_number(target['x']) and target['x'] == (bounds['left'] + bounds['right']) / 2
        assert finite_number(target['y']) and target['y'] == (bounds['top'] + bounds['bottom']) / 2
        box = receipt['canvas_css_rect']
        assert all(finite_number(box[key]) for key in ('x', 'y', 'width', 'height')) and box['width'] > 0 and box['height'] > 0
        for axis, dimension in [('x', 'width'), ('y', 'height')]:
            assert finite_number(receipt['css'][axis]) and receipt['css'][axis] == box[axis] + box[dimension] * target[axis] / viewport[dimension]
        matched = {}
        order = ['hover', 'down_ingress', 'down', 'down_end', 'up_ingress', 'up', 'end']
        prior = fence
        for name in order:
            recorded = receipt[name]
            assert type(recorded['seq']) is int and recorded['seq'] > prior
            actual = event_map[recorded['seq']]
            assert equal(recorded, node_projection(actual)), 'Reported pointer receipt is not its actual native journal event'
            matched[name] = actual; prior = actual['seq']
        # Replay changes between the sampling fence and the actual input
        # edges. Check BEFORE dispatch: mouseup may legitimately hide/destroy
        # the widget from its click handler before the dispatch END record.
        for edge in ('hover', 'down', 'up'):
            actual = matched[edge]
            while index < len(events) and events[index]['seq'] < actual['seq']:
                ingest(events[index]); index += 1
            assert target['id'] in nodes, 'Click target no longer exists'
            live = nodes[target['id']]
            assert live.get('tag') == '$button' and live['properties']['text'] == label and visible(target['id']), 'Click target became hidden or changed before input'
            if role:
                assert live.get('role') == role and live.get('source') == source
            if role == 'terraform-row':
                assert type(live['properties']['color']) is str and live['properties']['color'] != 'black', 'Terraform target became disabled before input'
            assert equal(live['effective'], bounds), 'Click geometry changed after its sampling fence'
            if edge == 'hover':
                assert actual['kind'] == 'input.ui-transition' and actual['data']['type'] == 'mouseover'
                assert target['id'] in ancestors(actual['target']) and inside(actual['data'], bounds)
        for stem, event_type in [('down', 'mousedown'), ('up', 'mouseup')]:
            ingress, begin, end = matched[stem + '_ingress'], matched[stem], matched['down_end' if stem == 'down' else 'end']
            assert ingress['kind'] == 'input.ingress' and ingress['data']['type'] == event_type
            assert begin['kind'] == 'input.dispatch' and begin['data']['phase'] == 'begin' and begin['data']['type'] == event_type
            assert end['kind'] == 'input.dispatch' and end['data']['phase'] == 'end' and end['data']['handled'] is True
            assert all(type(event['data']['ingress']) is int for event in [ingress, begin, end])
            assert ingress['data']['ingress'] == begin['data']['ingress'] == end['data']['ingress']
            assert type(ingress['data']['button']) is int and type(begin['data']['button']) is int
            assert ingress['data']['button'] == begin['data']['button'] == 1
            assert inside(begin['data'], bounds)
            assert (ingress['data']['x'], ingress['data']['y']) == (begin['data']['x'], begin['data']['y'])
            # End packets intentionally have no mouse type: join by the
            # actual Int ingress, then exhaust every matching completion.
            associated = [event for event in events if event['kind'] in ('input.ingress', 'input.dispatch')
                          and type(event['data'].get('ingress')) is int and event['data']['ingress'] == ingress['data']['ingress']]
            assert {event['seq'] for event in associated} == {ingress['seq'], begin['seq'], end['seq']}, 'Pointer ingress requires exactly one begin/end pair'
            used_buttons.update((ingress['seq'], begin['seq'], end['seq']))
        assert (matched['down']['data']['x'], matched['down']['data']['y']) == (matched['up']['data']['x'], matched['up']['data']['y'])
        next_query = report['native_snapshots'][checkpoint + 1]['query_after_native_key']
        query_ingress = event_map[next_query]['data']['ingress']
        next_ingress = [event for event in events if event['kind'] == 'input.ingress' and event['data'].get('ingress') == query_ingress]
        assert len(next_ingress) == 1 and matched['end']['seq'] < next_ingress[0]['seq'], 'Click did not complete before its fresh query input'
        prior_end = matched['end']['seq']
        if role == 'terraform-row':
            rows = [value for kind, value, line in records if kind == 'TH_ROWS' and line <= carriers[fence]]
            assert rows
            row = [item for item in rows[-1] if item['id'] == 'raise']
            assert len(row) == 1 and row[0]['enabled'] is True and row[0]['label'] == label
    pointer_ids = {event['data']['ingress'] for event in events if event['kind'] in ('input.ingress', 'input.dispatch')
                   and event['data'].get('type') in ('mousedown', 'mouseup')
                   and type(event['data'].get('ingress')) is int}
    actual_buttons = {event['seq'] for event in events if event['kind'] in ('input.ingress', 'input.dispatch')
                      and (event['data'].get('type') in ('mousedown', 'mouseup') or
                           (type(event['data'].get('ingress')) is int and event['data']['ingress'] in pointer_ids))}
    assert actual_buttons == used_buttons, 'Unreported or unused native pointer button action'
    return {'physical_clicks_verified': len(pointers), 'raw_button_actions_exhausted': True,
            'scope': 'MENU/terraform/raise/Cancel/reopen/Expend/confirm; actual native geometry and input receipts'}


def validate_keyboard_route(records, report):
    """Exact eight physical Ctrl+Alt shortcuts, including modifier/up edges."""
    events, _ = validate_trace(records)
    event_map = {event['seq']: event for event in events}
    ingresses = [event for event in events if event['kind'] == 'input.ingress' and event['data'].get('type') in ('keydown', 'keyup')]
    assert len(ingresses) == 48, 'Unexpected/unreported native keyboard edge'
    receipts = report['processed_keys']
    assert len(receipts) == 8
    commands = ['K'] + ['P'] * 6 + ['Q']
    scan = {'K': 14, 'P': 19, 'Q': 20}
    used, previous = set(), 0
    for index, (code, receipt) in enumerate(zip(commands, receipts)):
        assert receipt['shortcut'] == 'Control+Alt+' + code.lower()
        edges = [('keydown', 1073742048, 224, 64, 'CTRL', 2),
                 ('keydown', 1073742050, 226, 320, 'ALT', 6),
                 ('keydown', ord(code.lower()), scan[code], 320, code, 6),
                 ('keyup', ord(code.lower()), scan[code], 320, code, 6),
                 ('keyup', 1073742050, 226, 64, 'ALT', 2),
                 ('keyup', 1073742048, 224, 0, 'CTRL', 0)]
        for offset, (edge, keycode, scancode, raw_modifiers, dispatch_code, modifiers) in enumerate(edges):
            ingress = ingresses[index * 6 + offset]
            data = ingress['data']
            assert ingress['seq'] > previous
            assert data['type'] == edge
            expected = {'ingress': data['ingress'], 'keycode': keycode, 'scancode': scancode,
                        'modifiers': raw_modifiers, 'repeat': 0, 'sdl_type': 768 if edge == 'keydown' else 769}
            assert all(type(data[name]) is int and data[name] == value for name, value in expected.items()), 'Different raw SDL keyboard edge'
            begins = [event for event in events if event['kind'] == 'input.dispatch' and event['data'].get('phase') == 'begin'
                      and type(event['data'].get('ingress')) is int and event['data']['ingress'] == data['ingress']]
            ends = [event for event in events if event['kind'] == 'input.dispatch' and event['data'].get('phase') == 'end'
                    and type(event['data'].get('ingress')) is int and event['data']['ingress'] == data['ingress']]
            assert len(begins) == len(ends) == 1
            begin, end = begins[0], ends[0]
            assert ingress['seq'] < begin['seq'] < end['seq']
            assert begin['data']['type'] == edge and begin['data']['code'] == dispatch_code
            assert type(begin['data']['modifiers']) is int and begin['data']['modifiers'] == modifiers
            assert type(data['action']) is int and data['action'] >= 0
            assert type(begin['data']['action']) is int and begin['data']['action'] == data['action']
            assert type(end['data']['handled']) is bool
            if offset == 2:
                assert end['data']['handled'] is True
                for name, actual in [('ingress', ingress), ('begin', begin), ('end', end)]:
                    assert type(receipt[name]['seq']) is int and equal(receipt[name], node_projection(actual)), 'Keyboard receipt is not its actual native event'
                if 1 <= index <= 6:
                    assert end['seq'] == report['native_snapshots'][index - 1]['query_after_native_key']
            used.update((ingress['seq'], begin['seq'], end['seq']))
            previous = end['seq']
    keyboard_ids = {event['data']['ingress'] for event in ingresses}
    all_keyboard = {event['seq'] for event in events if (event['kind'] == 'input.ingress' and event['data'].get('type') in ('keydown', 'keyup'))
                    or (event['kind'] == 'input.dispatch' and (event['data'].get('type') in ('keydown', 'keyup') or
                        (event['data'].get('phase') == 'end' and event['data'].get('ingress') in keyboard_ids)))}
    assert all_keyboard == used, 'Unreported keyboard ingress/dispatch'
    return {'shortcuts_verified': 8, 'raw_key_edges_exhausted': 48,
            'scope': 'exact K/six P/Q Ctrl+Alt command and modifier/down/up sequence; no additional key actions'}


def decode_frame_png(data, expected_size):
    """Decode this capture's noninterlaced 8-bit RGB/RGBA PNGs, bounded by size."""
    assert data.startswith(b'\x89PNG\r\n\x1a\n')
    offset, kinds, compressed, dimensions = 8, [], bytearray(), None
    while offset < len(data):
        assert offset + 12 <= len(data), 'Truncated PNG chunk'
        size, kind = struct.unpack('>I4s', data[offset:offset + 8])
        stop = offset + 12 + size
        assert stop <= len(data), 'Truncated PNG payload'
        payload = data[offset + 8:stop - 4]
        assert zlib.crc32(kind + payload) & 0xffffffff == struct.unpack('>I', data[stop - 4:stop])[0], 'PNG CRC mismatch'
        assert not kinds or kind != b'IHDR'
        if not kinds:
            assert kind == b'IHDR' and size == 13
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            dimensions = (width, height)
            assert dimensions == expected_size, 'Frame dimensions differ from the retained canvas clip'
            assert depth == 8 and color in (2, 6) and compression == filtering == interlace == 0, 'Unsupported PNG encoding'
            channels = 3 if color == 2 else 4
        elif kind == b'IDAT':
            assert kinds[-1] in (b'IHDR', b'IDAT') or (b'IDAT' not in kinds), 'Noncontiguous IDAT'
            compressed.extend(payload)
        elif kind == b'IEND':
            assert size == 0 and b'IDAT' in kinds and stop == len(data)
        else:
            assert kind[0] & 32, 'Unknown critical PNG chunk'
        kinds.append(kind); offset = stop
    assert kinds and kinds[-1] == b'IEND' and dimensions is not None
    width, height = dimensions
    stride = width * channels
    expected_bytes = height * (stride + 1)
    inflater = zlib.decompressobj()
    filtered = inflater.decompress(bytes(compressed), expected_bytes + 1)
    assert len(filtered) == expected_bytes and inflater.eof and not inflater.unconsumed_tail and not inflater.unused_data, 'Invalid/truncated PNG zlib data'
    previous, pixels = bytearray(stride), hashlib.sha256()
    for y in range(height):
        row = filtered[y * (stride + 1):(y + 1) * (stride + 1)]
        mode, current = row[0], bytearray(row[1:])
        assert mode in range(5), 'Invalid PNG scanline filter'
        if mode:
            for x in range(stride):
                a = current[x - channels] if x >= channels else 0
                b = previous[x]
                c = previous[x - channels] if x >= channels else 0
                if mode == 1: predictor = a
                elif mode == 2: predictor = b
                elif mode == 3: predictor = (a + b) // 2
                else:
                    prediction = a + b - c
                    pa, pb, pc = abs(prediction - a), abs(prediction - b), abs(prediction - c)
                    predictor = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                current[x] = (current[x] + predictor) & 255
        pixels.update(current); previous = current
    return {'width': width, 'height': height, 'decoded_pixel_bytes': height * stride, 'decoded_pixels_sha256': pixels.hexdigest()}


def validate_frames(directory, report):
    names = ['before-height', 'raise-quote', 'raise-cancel', 'raise-payment-draft', 'raise-paid-completion']
    assert [row['name'] for row in report['captures']] == names
    box = report['processed_pointers'][0]['canvas_css_rect']
    assert all(finite_number(box[key]) for key in ('x', 'y', 'width', 'height'))
    assert box['width'] > 0 and box['height'] > 0
    clip = tuple(math.ceil(box[axis] + box[size] - 1e-3) - math.floor(box[axis] + 1e-3)
                 for axis, size in [('x', 'width'), ('y', 'height')])
    assert all(type(value) is int and 0 < value <= 4096 for value in clip)
    ready = report['rendered_readiness']
    assert type(ready['width']) is int and type(ready['height']) is int
    assert clip == (ready['width'], ready['height'])
    decoded = []
    for row in report['captures']:
        assert type(row['sha256']) is str and re.fullmatch(r'[0-9a-f]{64}', row['sha256'])
        data = (Path(directory) / (row['name'] + '.png')).read_bytes()
        assert hashlib.sha256(data).hexdigest() == row['sha256'], 'Different/missing retained frame'
        decoded.append(decode_frame_png(data, clip))
    return {'retained_frame_digests_verified': 5, 'decoded_frames': decoded,
            'scope': 'actual decoded RGB/RGBA file bytes and retained canvas clip; no original pixels/pose/mesh agreement'}


def validate_external_exit(path, native_exit, capture_bindings):
    if not path.exists():
        return {'supported': False, 'reason': 'External Node process completion not supplied; never inferred from native status or TAP'}
    encoded = path.read_bytes()
    digest = hashlib.sha256(encoded).hexdigest()
    data = json.loads(encoded)
    if 'kind' not in data:
        assert digest == LEGACY_OUTER_SHA256, 'Unknown kind-less external process witness'
        assert data['tool_session_id'] == 40314 and data['tool_completion_chunk_id'] == '0ae251'
        assert equal(capture_bindings, LEGACY_CAPTURE_BINDINGS), 'Historical outer completion belongs to a different capture'
    else:
        assert data['kind'] == 'terraform-height-external-process-outcome.v1', 'Unknown external outcome schema'
        assert equal(data['capture_bindings'], capture_bindings), 'External completion belongs to a different capture'
    assert type(data['version']) is int and data['version'] == 1
    assert data['status'] == 'exited' and type(data['raw_process_exit']) is int and data['raw_process_exit'] == 0
    assert type(data['tool_session_id']) is int and type(data['tool_completion_chunk_id']) is str and data['tool_completion_chunk_id']
    assert type(data['command']) is str
    if 'kind' in data:
        assert data['command'] in ('node --test tools/wasm-tests/terraform-height-browser.test.mjs',
                                   'node --test --test-concurrency=1 tools/wasm-tests/terraform-height-browser.test.mjs'), 'Unsupported external invocation'
    else:
        assert data['command'], 'Legacy invocation is bound by its exact recognized outcome digest'
    assert type(data['source']) is str and data['source']
    completion = data['tool_completion_result']
    assert type(completion['exit_code']) is int and completion['exit_code'] == 0
    assert completion['chunk_id'] == data['tool_completion_chunk_id']
    assert data['browser_server_driver_reaped'] is True and equal(data['native_exit'], native_exit)
    if 'kind' in data:
        return {'supported': False, 'reason': 'UNSUPPORTED: self-declared v1 completion metadata has no recognized independently retained tool receipt',
                'self_reported_process_fields_valid': True, 'artifact_sha256': digest}
    return {'supported': True, 'receipt_verification': 'recognized-immutable-tool-receipt', 'external_raw_exit_code': 0, 'tool_session_id': data['tool_session_id'],
            'completion_chunk_id': data['tool_completion_chunk_id'], 'artifact_sha256': digest}


def classify_browser_credit(finalization, external, entity_identity=None):
    execution = external.get('supported') is True
    callbacks = finalization['exact_callback_message_identity']['supported'] is True
    entities = entity_identity is not None and entity_identity.get('supported') is True
    # Source/runtime hash consistency and private retained observations do not
    # authenticate compilation or supply a publicly replayable passing case.
    # Preserve independently recognized OS receipt facts in external_node_exit;
    # they must not become source-execution or fidelity case credit here.
    unsupported = ['Runtime metadata consistency is UNVERIFIED build attribution',
                   'Retained raw replay unavailable in public CI; observations are not published passing-case credit']
    if not execution: unsupported.append('Independent OS execution witness unsupported; self-declared outcome metadata is not tool evidence')
    if not callbacks: unsupported.append('exact per-callback message identity; legacy offset-only metadata cannot earn complete-browser case credit')
    if not entities: unsupported.append('native entity detail raw identity echoes absent; complete entity/world observation unsupported')
    return {'native_cases_added': 0, 'native_capture_field_cases_audited': 0,
            'browser_cases_audited': 0, 'complete_browser_cases_audited': 0,
            'execution_cases_audited': 0, 'bounded_state_receipt_cases_audited': 0,
            'bounded_journal_field_cases_audited': 0,
            'compile_attribution_verified': False, 'public_retained_replay_available': False,
            'status': 'observations-only-readonly-audit',
            'unsupported_capabilities': unsupported}


def audit_artifacts(directory, outer_outcome=None):
    directory = Path(directory)
    raw = (directory / 'application.log').read_bytes()
    report_bytes, preflight_bytes = (directory / 'report.json').read_bytes(), (directory / 'preflight.json').read_bytes()
    report, preflight = json.loads(report_bytes), json.loads(preflight_bytes)
    records = parse_records(raw)
    result = audit_records(records, report)
    native_input = next(value for kind, value, _ in records if kind == 'TH_INPUTS')
    schema = validate_preflight(directory, preflight, preflight_bytes, report, native_input)
    chunks = [json.loads(line) for line in (directory / 'application-log-chunks.jsonl').read_text().splitlines() if line]
    finalization = validate_finalization(report, raw, chunks, records)
    pointer_route = validate_pointer_route(records, report)
    keyboard_route = validate_keyboard_route(records, report)
    frames = validate_frames(directory, report)
    bindings = {'raw_sha256': hashlib.sha256(raw).hexdigest(), 'report_sha256': hashlib.sha256(report_bytes).hexdigest(),
                'preflight_sha256': hashlib.sha256(preflight_bytes).hexdigest(), 'host_head': report['host_head']}
    external = validate_external_exit(Path(outer_outcome) if outer_outcome else directory / 'raw-outcome.json', report['native_exit'], bindings)
    result.update(classify_browser_credit(finalization, external, result['entity_detail_identity']))
    result.update(raw_sha256=hashlib.sha256(raw).hexdigest(), raw_bytes=len(raw), report_sha256=hashlib.sha256(report_bytes).hexdigest(),
                  preflight_sha256=hashlib.sha256(preflight_bytes).hexdigest(), source_audit_script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  source_validation_dependencies_sha256={str(path.relative_to(Path(__file__).resolve().parent.parent)): hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in (Path(terrain_schema.__file__).resolve(), Path(__file__).resolve().parent / 'schema.py',
                                   Path(__file__).resolve().parent.parent / 'protocol.py', Path(__file__).resolve().parent.parent / 'fast.py')},
                  preflight_schema=schema, finalization=finalization, pointer_route=pointer_route, keyboard_route=keyboard_route, frames=frames, external_node_exit=external,
                  historical_cleanliness_scope='legacy tracked_diff/source bindings only; no retrospective untracked-source cleanliness receipt')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', required=True, type=Path)
    parser.add_argument('--outer-outcome', type=Path, help='Genuine external process-completion witness; defaults to artifacts/raw-outcome.json, required for full browser audit')
    parser.add_argument('--output', type=Path, help='Optional separate derived audit output; never rewrites raw capture/report')
    args = parser.parse_args()
    directory = args.artifacts
    output = args.output or directory / 'raw-typed-audit.json'
    if output.exists():
        raise FileExistsError('Keep previous derived results immutable; choose a NEW --output path')
    result = audit_artifacts(directory, args.outer_outcome)
    # A competing writer may finish during the audit. Exclusive creation keeps
    # its exact bytes instead of truncating an accepted result.
    with output.open('x', encoding='utf8') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key != 'unit_float_bits'}, indent=2))


if __name__ == '__main__':
    main()
