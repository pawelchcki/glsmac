"""Strict native terrain observation v2; no terrain or movement rules live here.

This validates captured native data, not agreement with an original executable.
The frozen state-trace comparator can compare a separately bound projection;
missing coverage remains unsupported rather than becoming an empty match.
"""
import math
import re

from fast import parse_output
from protocol import ProtocolError, canonical, decode_json
from state_trace.schema import validate_state

SCHEMA = 'game.terrain_observation.v2'
DIRECTIONS = ('W', 'NW', 'N', 'NE', 'E', 'SE', 'S', 'SW')
FEATURES = ('river', 'monolith', 'xenofungus', 'jungle', 'uranium', 'geothermal',
            'unity_pod', 'volcano', 'sunny_mesa', 'garland_crater', 'fossil_field_ridge',
            'unity_energy', 'unity_chopper', 'unity_radar', 'dunes')
IMPROVEMENTS = ('road', 'mag_tube', 'forest', 'farm', 'soil_enricher', 'solar', 'mine',
                'condenser', 'mirror', 'borehole', 'sensor', 'bunker', 'airbase')
COVERAGE = ('all_players', 'terrain_height', 'terrain_type', 'terrain_resources',
            'traverse_quotes', 'canonical_height', 'energy_initialization', 'automation_context', 'automation_phase', 'home_identity', 'improvement_owners',
            'ui', 'animation_timing', 'audio', 'original_height_byte')
TERRAIN_UNITS = dict(rockiness='native-enum-0-none-1-flat-2-rolling-3-rocky',
                     moisture='native-enum-0-none-1-arid-2-moist-3-rainy',
                     original_raw_height_class='unsupported', original_raw_rockiness='unsupported')


def require(condition, message):
    if not condition:
        raise ProtocolError(message)


def integer(value, path, low=None):
    require(type(value) is int and (low is None or value >= low), path + ' requires an integer')


def number(value, path, low=None):
    require(type(value) is float and math.isfinite(value) and (low is None or value >= low),
            path + ' requires a finite native Float')


def fields(value, keys, path):
    require(type(value) is dict and set(value) == set(keys), path + ' fields missing/unknown')


def coordinate(value, width, height, path):
    fields(value, ('x', 'y'), path)
    x, y = value['x'], value['y']
    integer(x, path + '.x', 0); integer(y, path + '.y', 0)
    require(x < width and y < height and x % 2 == y % 2, path + ' is outside the native staggered grid')


def flags(values, raw, names, path):
    fields(values, names, path)
    integer(raw, path + '_raw', 0)
    require(raw <= 0xffff, path + '_raw exceeds native word')
    for bit, name in enumerate(names):
        require(type(values[name]) is bool and values[name] == bool(raw & (1 << bit)),
                path + '.' + name + ' differs from actual raw native bit')


def validate_quote(quote, width, height, path):
    fields(quote, ('source', 'destination', 'movement_kind', 'nominal_mp_per_turn',
                  'allowed_now', 'reason', 'quoted_step_cost_mp', 'zero_cost_quote',
                  'quoted_tiles_per_turn', 'policy_quote', 'policy_quote_version'), path)
    coordinate(quote['source'], width, height, path + '.source')
    coordinate(quote['destination'], width, height, path + '.destination')
    require(quote['movement_kind'] in ('land', 'sea', 'air', 'immovable'), path + ' movement kind invalid')
    number(quote['nominal_mp_per_turn'], path + '.nominal_mp_per_turn', 0)
    require(type(quote['allowed_now']) is bool, path + ' passability missing')
    require((quote['allowed_now'] and quote['reason'] is None) or
            (not quote['allowed_now'] and type(quote['reason']) is str and bool(quote['reason'])),
            path + ' passability/reason disagree')
    number(quote['quoted_step_cost_mp'], path + '.quoted_step_cost_mp', 0)
    require(type(quote['zero_cost_quote']) is bool and quote['zero_cost_quote'] == (quote['quoted_step_cost_mp'] == 0),
            path + ' zero-cost quote marker invalid')
    if quote['zero_cost_quote']:
        require(quote['quoted_tiles_per_turn'] is None, path + ' zero cost cannot become fake infinite speed')
    else:
        number(quote['quoted_tiles_per_turn'], path + '.quoted_tiles_per_turn', 0)
    costs = quote['policy_quote']
    require(type(quote['policy_quote_version']) is int and quote['policy_quote_version'] in (1, 2), 'Unknown movement quote policy schema')
    fields(costs, ('road_rate', 'base_cost', 'after_cost', 'total_cost') +
           (('free',) if quote['policy_quote_version'] == 2 else ()), path + '.policy_quote')
    if quote['policy_quote_version'] == 2:
        require(type(costs['free']) is bool, 'Movement free quote must be a Bool')
        if costs['free']:
            require(quote['zero_cost_quote'] and costs['road_rate'] == 0 and
                    all(costs[name] == 0.0 for name in ('base_cost', 'after_cost', 'total_cost')),
                    'Free movement quote must retain actual zero-cost native policy values')
    integer(costs['road_rate'], path + '.road_rate', 0)
    for key in ('base_cost', 'after_cost', 'total_cost'):
        number(costs[key], path + '.' + key, 0)
    return quote


def validate_snapshot(snapshot):
    fields(snapshot, ('turn', 'width', 'height', 'players', 'units', 'bases', 'research', 'terrain_trace'), 'snapshot')
    width, height = snapshot['width'], snapshot['height']
    # Reuse frozen roster/entity integrity checks without changing that wire schema.
    generic = {key: snapshot[key] for key in ('turn', 'players', 'units', 'bases')}
    generic['map'] = dict(width=width, height=height)
    validate_state(generic, 'terrain-observation')
    require(len(snapshot['players']) == 7, 'Terrain observation must capture all seven participants')
    owners = {row['id'] for row in snapshot['players']}
    raw_owners = [row.get('raw_id') for row in snapshot['players']]
    require(all(type(raw) is int for raw in raw_owners) and len(set(raw_owners)) == 7, 'Duplicate/missing raw native owner')
    for domain in ('units', 'bases'):
        raw_ids = [row.get('raw_id') for row in snapshot[domain]]
        require(all(type(raw) is int for raw in raw_ids) and len(set(raw_ids)) == len(raw_ids), 'Duplicate/missing native ' + domain)
        for row in snapshot[domain]:
            coordinate(dict(x=row['x'], y=row['y']), width, height, domain + ':' + row['id'])
    research = snapshot['research']
    require(type(research) is list and len(research) == 7 and {row.get('player') for row in research if type(row) is dict} == owners,
            'Every owner research row is required exactly once')
    for row in research:
        fields(row, ('player', 'owned_tech_ids', 'target_id', 'accumulated'), 'research')
        require(type(row['owned_tech_ids']) is list and all(type(x) is int for x in row['owned_tech_ids']) and
                len(set(row['owned_tech_ids'])) == len(row['owned_tech_ids']), 'Malformed owned technology set')
        integer(row['target_id'], 'research.target_id'); integer(row['accumulated'], 'research.accumulated')
    trace = snapshot['terrain_trace']
    fields(trace, ('schema', 'elevation_units', 'terrain_units', 'tiles', 'unit_details', 'base_details', 'player_details', 'ui', 'coverage', 'policy'), 'terrain_trace')
    require(trace['schema'] == SCHEMA and trace['elevation_units'] == 'native-engine-elevation', 'Unknown terrain observation schema/units')
    require(trace['terrain_units'] == TERRAIN_UNITS, 'Engine enums must not be relabeled as original raw bytes/classes')
    fields(trace['policy'], ('version', 'ignore_technologies'), 'policy')
    require(type(trace['policy']['version']) is int and trace['policy']['version'] == 1 and
            type(trace['policy']['ignore_technologies']) is bool, 'Actual serialized policy identity missing')
    fields(trace['coverage'], COVERAGE, 'coverage')
    require(all(type(value) is bool for value in trace['coverage'].values()), 'Coverage must be explicit booleans')
    require(trace['coverage']['all_players'], 'All-player observation cannot be omitted')
    require(type(trace['player_details']) is dict and set(trace['player_details']) == owners, 'Per-owner details omitted')
    for owner, row in trace['player_details'].items():
        fields(row, ('raw_id', 'role', 'name', 'identity', 'energy'), owner)
        require(row['raw_id'] == next(p['raw_id'] for p in snapshot['players'] if p['id'] == owner), 'Player raw identity differs')
        require(type(row['role']) is str and type(row['name']) is str and type(row['identity']) is list and
                len(row['identity']) == 6 and all(type(text) is str for text in row['identity']), 'Incomplete native player identity')
        energy_fields = ('credits', 'last_income_turn') + (('initialized',) if trace['coverage']['energy_initialization'] else ())
        fields(row['energy'], energy_fields, owner + '.energy')
        integer(row['energy']['credits'], owner + '.credits', 0)
        integer(row['energy']['last_income_turn'], owner + '.last_income_turn', 0)
        if trace['coverage']['energy_initialization']:
            require(type(row['energy']['initialized']) is bool, 'Native energy initialization stamp is not a Bool')
    tiles = trace['tiles']
    wanted = {f'{x},{y}' for y in range(height) for x in range(y % 2, width, 2)}
    require(type(tiles) is dict and set(tiles) == wanted, 'Full native world terrain is missing/extra')
    for key, tile in tiles.items():
        tile_fields = ('version', 'x', 'y', 'width', 'height', 'neighbors', 'elevation', 'is_land', 'is_water',
                      'moisture', 'rockiness', 'bonus', 'features_raw', 'features', 'terraforming_raw',
                      'terraforming', 'imported', 'resources', 'native_height_band', 'native_type', 'locked')
        fields(tile, tile_fields + (('canonical',) if trace['coverage']['canonical_height'] else ()) +
               (('terraforming_owners',) if trace['coverage']['improvement_owners'] else ()), 'tile:' + key)
        require(type(tile['version']) is int and tile['version'] == 1 and tile['width'] == width and tile['height'] == height,
                'Native terrain API version/dimensions differ')
        coordinate(dict(x=tile['x'], y=tile['y']), width, height, 'tile:' + key)
        require(key == f"{tile['x']},{tile['y']}", 'Native tile key/coordinates differ')
        fields(tile['neighbors'], DIRECTIONS, 'neighbors:' + key)
        for direction, neighbor in tile['neighbors'].items():
            if neighbor is not None: coordinate(neighbor, width, height, 'neighbor:' + key + ':' + direction)
        fields(tile['elevation'], ('center', 'left', 'top', 'right', 'bottom'), 'height:' + key)
        for name, value in tile['elevation'].items(): integer(value, 'height:' + key + ':' + name)
        require(type(tile['locked']) is bool, 'Native tile lock state missing')
        require(type(tile['is_land']) is bool and type(tile['is_water']) is bool and tile['is_land'] != tile['is_water'], 'Native land/sea class malformed')
        if trace['coverage']['canonical_height']:
            override = tile['canonical']
            fields(override, ('active', 'elevation', 'is_water'), 'canonical:' + key)
            require(type(override['active']) is bool, 'Canonical override status missing')
            if override['active']:
                integer(override['elevation'], 'canonical.elevation')
                require(type(override['is_water']) is bool and override['is_water'] == tile['is_water'] and
                        override['elevation'] == tile['elevation']['center'], 'Canonical override/raw gameplay height differ')
            else:
                require(override['elevation'] is None and override['is_water'] is None,
                        'Inactive canonical override must not invent a value')
        for name in ('moisture', 'rockiness', 'bonus'): integer(tile[name], key + ':' + name, 0)
        require(tile['moisture'] <= 3 and tile['rockiness'] <= 3, 'Unknown native moisture/rockiness enum')
        fields(tile['native_type'], ('domain', 'moisture', 'rockiness'), 'native_type:' + key)
        require(tile['native_type'] == dict(domain='sea' if tile['is_water'] else 'land',
                    moisture=('none', 'arid', 'moist', 'rainy')[tile['moisture']],
                    rockiness=('none', 'flat', 'rolling', 'rocky')[tile['rockiness']]), 'Native terrain type enum/name differ')
        flags(tile['features'], tile['features_raw'], FEATURES, 'features:' + key)
        flags(tile['terraforming'], tile['terraforming_raw'], IMPROVEMENTS, 'improvements:' + key)
        if trace['coverage']['improvement_owners']:
            fields(tile['terraforming_owners'], IMPROVEMENTS, 'improvement_owners:' + key)
            for flag, owner in tile['terraforming_owners'].items():
                require(type(owner) is int and -1 <= owner <= 7, 'Improvement construction owner is not a native slot/unknown marker')
                require(owner == -1 or tile['terraforming'][flag], 'Removed improvement retained an active construction owner')
        fields(tile['native_height_band'], ('below_coast', 'below_ocean', 'below_trench'), 'height-band:' + key)
        for name, limit in (('below_coast', 0), ('below_ocean', -1000), ('below_trench', -2000)):
            require(type(tile['native_height_band'][name]) is bool and tile['native_height_band'][name] == (tile['elevation']['center'] < limit), 'Native height band/raw value differ')
        imported = tile['imported']
        fields(imported, ('active', 'source_elevation', 'source_water', 'source_corners'), 'imported:' + key)
        require(type(imported['active']) is bool, 'Imported status missing')
        if imported['active']:
            integer(imported['source_elevation'], 'imported.center')
            require(type(imported['source_water']) is bool and type(imported['source_corners']) is list and
                    len(imported['source_corners']) == 4 and all(type(x) is int for x in imported['source_corners']), 'Imported native provenance incomplete')
        else:
            require(all(imported[name] is None for name in ('source_elevation', 'source_water', 'source_corners')), 'Inactive source provenance must be absent, not invented zeros')
        resources = tile['resources']
        require(type(resources) is dict and set(resources) == owners, 'Tile resources omit an owner')
        for owner, values in resources.items():
            require(type(values) is dict and bool(values) and all(type(name) is str and type(value) is int for name, value in values.items()), 'Incomplete native per-owner resource values')
    units = {row['id']: row for row in snapshot['units']}
    require(type(trace['unit_details']) is dict and set(trace['unit_details']) == set(units), 'Every native unit requires detail/quotes')
    for unit_id, detail in trace['unit_details'].items():
        unit = units[unit_id]
        fields(detail, ('definition_id', 'morale_set', 'movement_kind', 'nominal_mp_per_turn', 'can_terraform', 'moved_this_turn', 'work', 'automation', 'home_base_id', 'quotes', 'combat'), 'unit:' + unit_id)
        if trace['coverage']['home_identity']: integer(detail['home_base_id'], 'unit.home_base_id', 0)
        else: require(detail['home_base_id'] is None, 'Missing home capability must not invent an identity')
        if trace['coverage']['automation_context']:
            plan = detail['automation']
            fields(plan, ('version', 'command', 'epoch', 'owner', 'issued_turn', 'last_turn', 'target_x',
                          'target_y', 'origin_x', 'origin_y', 'cursor') +
                   (('phase',) if trace['coverage']['automation_phase'] else ()), 'automation:' + unit_id)
            require(type(plan['version']) is int and plan['version'] == (2 if trace['coverage']['automation_phase'] else 1) and type(plan['command']) is str,
                    'Unknown native automation schema/command type')
            if trace['coverage']['automation_phase']:
                require(type(plan['phase']) is int and plan['phase'] in (0, 1), 'Native automation phase is malformed')
            for field in ('epoch', 'owner', 'issued_turn', 'last_turn', 'target_x', 'target_y', 'origin_x', 'origin_y', 'cursor'):
                integer(plan[field], 'automation.' + field, 0)
            if plan['command']:
                owner = next(row['raw_id'] for row in snapshot['players'] if row['id'] == unit['owner'])
                require(plan['owner'] == owner and plan['epoch'] > 0 and plan['issued_turn'] > 0 and
                        unit['order'] in ('AUTOMATE', 'TERRAFORM'), 'Active native plan has a different owner/order/identity')
                coordinate(dict(x=plan['target_x'], y=plan['target_y']), width, height, 'automation.target')
                coordinate(dict(x=plan['origin_x'], y=plan['origin_y']), width, height, 'automation.origin')
            else:
                require(all(plan[field] == 0 for field in ('owner', 'issued_turn', 'last_turn', 'target_x', 'target_y', 'origin_x', 'origin_y', 'cursor')) and
                        (not trace['coverage']['automation_phase'] or plan['phase'] == 0), 'Empty native plan retained active payload')
        else:
            require(not trace['coverage']['automation_phase'], 'Missing automation API cannot expose a phase')
            require(detail['automation'] is None, 'Missing automation capability must not invent a native plan')
        require(type(detail['definition_id']) is str and bool(detail['definition_id']) and
                type(detail['morale_set']) is str and bool(detail['morale_set']), 'Native unit definition/morale identity missing')
        number(unit['movement'], unit_id + '.movement', 0); number(unit['health'], unit_id + '.health', 0)
        number(detail['nominal_mp_per_turn'], unit_id + '.nominal_mp_per_turn', 0)
        require(detail['movement_kind'] in ('land', 'sea', 'air', 'immovable') and type(detail['can_terraform']) is bool and type(detail['moved_this_turn']) is bool, 'Native unit ability/movement flags missing')
        require(type(detail['work']) is dict and type(detail['combat']) is dict, 'Native work/combat snapshot missing')
        for field in ('action', 'work_units', 'required_work', 'last_turn', 'previous_work_units',
                      'previous_movement', 'previous_moved', 'active', 'tile_x', 'tile_y'):
            require(field in detail['work'], 'Native work progress omits ' + field)
        require(type(detail['work']['action']) is str and type(detail['work']['active']) is bool, 'Native work action/lifecycle malformed')
        for field in ('work_units', 'required_work', 'last_turn', 'previous_work_units', 'tile_x', 'tile_y'):
            integer(detail['work'][field], 'work.' + field, 0)
        number(detail['work']['previous_movement'], 'work.previous_movement', 0)
        require(type(detail['work']['previous_moved']) is bool, 'Native previous-work moved flag missing')
        if detail['work']['active']:
            coordinate(dict(x=detail['work']['tile_x'], y=detail['work']['tile_y']), width, height, 'work.tile')
        fields(detail['quotes'], DIRECTIONS, 'quotes:' + unit_id)
        origin = dict(x=unit['x'], y=unit['y'])
        neighbors = tiles[f"{unit['x']},{unit['y']}"]['neighbors']
        for direction, quote in detail['quotes'].items():
            if neighbors[direction] is None:
                require(quote is None, 'Absent native neighbor has a fabricated quote')
            else:
                validate_quote(quote, width, height, unit_id + ':' + direction)
                require(quote['source'] == origin and quote['destination'] == neighbors[direction] and
                        quote['movement_kind'] == detail['movement_kind'] and quote['nominal_mp_per_turn'] == detail['nominal_mp_per_turn'], 'Quote belongs to a different native unit/edge')
    bases = {row['id']: row for row in snapshot['bases']}
    require(type(trace['base_details']) is dict and set(trace['base_details']) == set(bases), 'Every native base requires full details')
    for base_id, detail in trace['base_details'].items():
        fields(detail, ('name', 'production', 'intake', 'consumption', 'nutrients_present', 'nutrients', 'citizens', 'worked_tiles', 'facilities'), 'base:' + base_id)
        require(type(detail['name']) is str and all(type(detail[name]) is dict for name in ('production', 'intake', 'consumption', 'facilities')), 'Native city state missing')
        require(type(detail['nutrients_present']) is bool and
                (type(detail['nutrients']) is int if detail['nutrients_present'] else detail['nutrients'] is None), 'Native nutrient presence/value disagree')
        require(type(detail['citizens']) is list and len(detail['citizens']) == bases[base_id]['population'] and type(detail['worked_tiles']) is list, 'Native citizen inventory missing')
        ids = []
        for citizen in detail['citizens']:
            fields(citizen, ('id', 'type', 'worked_tile'), 'citizen')
            integer(citizen['id'], 'citizen.id'); ids.append(citizen['id'])
            require(type(citizen['type']) is str, 'Native citizen type missing')
            if citizen['worked_tile'] is not None: coordinate(citizen['worked_tile'], width, height, 'citizen.worked_tile')
        require(len(ids) == len(set(ids)), 'Duplicate native citizen identity')
        for point in detail['worked_tiles']: coordinate(point, width, height, 'worked_tile')
    require((trace['coverage']['ui'] and type(trace['ui']) is dict) or (not trace['coverage']['ui'] and trace['ui'] is None), 'UI observation/coverage disagree')
    return snapshot


def parse_snapshot(log):
    parse_output(log)
    rows = [match.group(1) for line in log.splitlines()
            if (match := re.search(r'(?:^|\] )TERRAIN_JSON\|(.*)$', line))]
    require(len(rows) == 1, 'Expected exactly one complete native terrain snapshot')
    return validate_snapshot(decode_json(rows[0]))


def observed_deltas(before, after):
    """Exhaustive differences between two actual detached native observations."""
    validate_snapshot(before); validate_snapshot(after)
    require((before['width'], before['height']) == (after['width'], after['height']), 'World changed during terrain action')
    result = {}
    for field in ('tiles', 'player_details', 'unit_details', 'base_details'):
        old, new = before['terrain_trace'][field], after['terrain_trace'][field]
        result[field] = [key for key in sorted(set(old) | set(new)) if canonical(old.get(key)) != canonical(new.get(key))]
    for domain in ('players', 'units', 'bases', 'research'):
        key = 'player' if domain == 'research' else 'id'
        old = {row[key]: row for row in before[domain]}; new = {row[key]: row for row in after[domain]}
        result[domain] = [identity for identity in sorted(set(old) | set(new)) if canonical(old.get(identity)) != canonical(new.get(identity))]
    result['policy_changed'] = before['terrain_trace']['policy'] != after['terrain_trace']['policy']
    return result
