#!/usr/bin/env python3
"""Execute complete native state traces in one immutable WASM launch per scenario.

No expected observations are accepted. Natural startup uses production scripts;
exporter-invariants is an independently declared synthetic two-player fixture.
"""
import argparse
import hashlib
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot, parse_output
from protocol import ProtocolError, canonical, load_request, write_response
from state_trace.schema import ALGORITHM, expected_plan, validate_input, validate_output

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
_ADAPTER_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
ACTIONS = {'snapshot', 'hold-unit', 'hold-all-ready-human-units', 'end-turn', 'move-unit', 'fixture-remove-unit', 'fixture-move-unit'}
DIRECTIONS = {'E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'}


class Unsupported(ValueError):
    pass


def gse_literal(value):
    if isinstance(value, str):
        if any(ord(char) < 32 and char not in '\n\t' for char in value):
            raise ProtocolError('GSE inputs require printable text or newlines')
        return "'" + value.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"
    if type(value) is bool:
        return 'true' if value else 'false'
    if value is None:
        return 'null'
    if type(value) is int:
        if not -(2**63) <= value < 2**63:
            raise ProtocolError('GSE integer exceeds signed 64-bit range')
        return str(value) if value >= 0 else '(0 - ' + str(-value) + ')'
    if type(value) is float:
        if not math.isfinite(value):
            raise ProtocolError('GSE inputs require finite floats')
        text = repr(value)
        if not re.fullmatch(r'-?\d+\.\d+(?:[eE][+-]?\d+)?', text):
            raise ProtocolError('Unsupported GSE float encoding')
        if abs(value) > 3.402823466e+38:
            raise ProtocolError('GSE float exceeds 32-bit range')
        return text if not text.startswith('-') else '(0 - ' + text[1:] + ')'
    if isinstance(value, list):
        return '[' + ','.join(gse_literal(item) for item in value) + ']'
    if isinstance(value, dict):
        if any(not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', key) for key in value):
            raise ProtocolError('Invalid GSE input key')
        return '{' + ','.join(key + ':' + gse_literal(item) for key, item in value.items()) + '}'
    raise ProtocolError('Unsupported GSE input type')


EXPLICIT_FACTIONS = ('GAIANS', 'HIVE', 'UNIV', 'MORGAN', 'SPARTANS', 'BELIEVE', 'PEACE')
EXPLICIT_PLAYER_IDS = tuple('player:' + str(slot) for slot in range(1, 8))
EXPLICIT_ACTIONS = {'snapshot', 'move-unit', 'hold-unit', 'hold-all-ready-human-units', 'end-turn'}
EXPLICIT_UNIT_ORDERS = {'NO_ORDERS': 'none', 'HOLD': 'hold'}


def _validate_explicit_world(fixture, has_installed_sources):
    """Strict gate for the frozen explicit seven-player initial world.

    Every declared initial control the script can realize faithfully is
    passed through; controls outside the verified vocabulary are rejected
    here rather than ignored or coerced by the script.
    """
    profile = fixture.get('profile')
    if profile != 'economy-research-v1':
        raise Unsupported('explicit-world requires the economy-research-v1 profile')
    if not has_installed_sources:
        raise Unsupported('economy-research-v1 requires --assets installed text sources and full production startup; synthetic/default technology state is not agreement')
    fields = {'width', 'height', 'terrain', 'turn', 'difficulty', 'rules', 'blind_research',
        'calling_player', 'selected_player', 'selected_unit', 'players', 'bases', 'units'}
    common = {'kind', 'rng_state', 'reference_rng_seed', 'profile'}
    if set(fixture) - fields - common:
        raise Unsupported('Unsupported explicit-world fixture field: ' + sorted(set(fixture) - fields - common)[0])
    if any(type(fixture[key]) is not int or not 4 <= fixture[key] <= 256 for key in ('width', 'height')) or fixture['width'] % 2:
        raise ProtocolError('Native fixture dimensions require even width and 4..256 bounds')
    if not isinstance(fixture['terrain'], str) or fixture['terrain'] not in {'flat-arid', 'flat-moist', 'flat-rainy'}:
        raise Unsupported('Unsupported terrain')
    if type(fixture.get('turn')) is not int:
        raise ProtocolError('explicit-world turn must be an integer')
    if fixture['turn'] != 1:
        raise Unsupported('explicit-world supports only the declared turn-1 initial world')
    if not isinstance(fixture.get('difficulty'), str) or fixture['difficulty'] not in {'Citizen', 'Specialist', 'Talent', 'Librarian', 'Thinker', 'Transcend'}:
        raise Unsupported('Unsupported difficulty')
    if fixture.get('rules') != 'standard':
        raise Unsupported('explicit-world requires standard rules')
    if fixture.get('blind_research') is not True:
        raise Unsupported('explicit-world requires declared Blind Research')
    if fixture.get('calling_player') != 'player:1' or fixture.get('selected_player') != 'player:1':
        raise Unsupported('explicit-world requires calling and selected player:1')
    if fixture.get('selected_unit') != 'scout-p1':
        raise Unsupported('explicit-world requires selected unit scout-p1')
    players = fixture.get('players')
    if not isinstance(players, list) or len(players) != 7:
        raise Unsupported('explicit-world requires the complete seven-player roster')
    seen_factions = set()
    for index, player in enumerate(players):
        if not isinstance(player, dict) or set(player) != {'id', 'faction', 'is_human', 'research'}:
            raise ProtocolError('explicit-world player requires exactly id/faction/is_human/research')
        if player['id'] != EXPLICIT_PLAYER_IDS[index]:
            raise Unsupported('explicit-world players must be player:1..player:7 in slot order')
        if player['faction'] not in EXPLICIT_FACTIONS or player['faction'] in seen_factions:
            raise Unsupported('explicit-world requires the seven canonical stock factions exactly once')
        seen_factions.add(player['faction'])
        if player['is_human'] is not (index == 0):
            raise Unsupported('explicit-world requires only player:1 human')
        research = player['research']
        if not isinstance(research, dict) or set(research) != {'owned_tech_ids', 'target_id', 'accumulated'}:
            raise ProtocolError('explicit-world research requires exactly owned_tech_ids/target_id/accumulated')
        if research['owned_tech_ids'] != [6] or research['target_id'] != -1 or research['accumulated'] != 0:
            raise Unsupported('explicit-world supports only owned tech [6], no target and zero science')
    if set(seen_factions) != set(EXPLICIT_FACTIONS):
        raise Unsupported('explicit-world requires the seven canonical stock factions exactly once')
    bases = fixture.get('bases')
    if not isinstance(bases, list) or len(bases) != 7:
        raise Unsupported('explicit-world requires seven declared bases')
    base_positions = {}
    for index, base in enumerate(bases):
        identifier = 'base-p' + str(index + 1)
        if not isinstance(base, dict) or set(base) != {'id', 'owner', 'x', 'y', 'population', 'jobs', 'resources', 'raw_nutrients', 'project', 'facilities'}:
            raise ProtocolError('explicit-world base requires exactly id/owner/x/y/population/jobs/resources/raw_nutrients/project/facilities')
        if base['id'] != identifier:
            raise Unsupported('explicit-world bases must be base-p1..base-p7 in slot order')
        if base['owner'] != EXPLICIT_PLAYER_IDS[index]:
            raise Unsupported('explicit-world base ' + identifier + ' must be owned by ' + EXPLICIT_PLAYER_IDS[index])
        if (type(base['x']) is not int or type(base['y']) is not int or not 0 <= base['x'] < fixture['width']
                or not 0 <= base['y'] < fixture['height'] or base['x'] % 2 != base['y'] % 2):
            raise ProtocolError('explicit-world base ' + identifier + ' has invalid coordinates')
        if (base['x'], base['y']) in base_positions:
            raise Unsupported('explicit-world bases must occupy distinct tiles')
        base_positions[(base['x'], base['y'])] = identifier
        if base['population'] != 1:
            raise Unsupported('explicit-world supports only population-1 initial bases')
        if not isinstance(base['jobs'], dict) or base['jobs'] != {'workers': 0, 'doctors': 1}:
            raise Unsupported('explicit-world supports only one initial Doctor and no Workers')
        if not isinstance(base['resources'], dict) or base['resources'] != {'minerals': 3}:
            raise Unsupported('explicit-world supports only the declared 3-mineral store')
        if base['raw_nutrients'] != 0:
            raise Unsupported('explicit-world supports only a zero raw nutrient counter')
        if base['project'] != 'colony-pod':
            raise Unsupported('explicit-world supports only the Colony Pod initial project')
        if base['facilities'] != ['headquarters']:
            raise Unsupported('explicit-world supports only the Headquarters initial facility')
    units = fixture.get('units')
    if not isinstance(units, list) or len(units) != 7:
        raise Unsupported('explicit-world requires seven declared scouts')
    for index, unit in enumerate(units):
        identifier = 'scout-p' + str(index + 1)
        if not isinstance(unit, dict) or set(unit) != {'id', 'owner', 'x', 'y', 'prototype', 'health', 'morale', 'movement', 'order', 'home_base'}:
            raise ProtocolError('explicit-world unit requires exactly id/owner/x/y/prototype/health/morale/movement/order/home_base')
        if unit['id'] != identifier:
            raise Unsupported('explicit-world units must be scout-p1..scout-p7 in slot order')
        if unit['owner'] != EXPLICIT_PLAYER_IDS[index]:
            raise Unsupported('explicit-world unit ' + identifier + ' must be owned by ' + EXPLICIT_PLAYER_IDS[index])
        if (unit['x'], unit['y']) != next(position for position, name in base_positions.items() if name == 'base-p' + str(index + 1)):
            raise Unsupported('explicit-world unit ' + identifier + ' must start on its base center')
        if unit['prototype'] != 'scout-patrol':
            raise Unsupported('explicit-world supports only Scout Patrol initial units')
        if type(unit['health']) is not float or unit['health'] != 1.0:
            raise Unsupported('explicit-world supports only full-health 1.0 initial units')
        if unit['morale'] != 'disciplined':
            raise Unsupported('explicit-world supports only disciplined initial morale')
        if unit['movement'] != 'full':
            raise Unsupported('explicit-world supports only full-movement initial units')
        if unit['order'] != 'none':
            raise Unsupported('explicit-world supports only orderless initial units')
        if unit['home_base'] is not None:
            raise Unsupported('explicit-world supports only homeless initial units')


def prepare(case, *, has_installed_sources=False):
    if case['algorithm'] != ALGORITHM:
        raise Unsupported('Unknown state trace algorithm')
    data = case['input']; validate_input(data); fixture = data['fixture']
    kind = fixture.get('kind')
    if not isinstance(kind, str) or kind not in {'natural-startup', 'exporter-invariants', 'explicit-world'}:
        raise Unsupported('Unsupported native fixture kind: ' + str(kind))
    common = {'kind', 'rng_state', 'reference_rng_seed', 'profile'}
    profile = fixture.get('profile', 'core-v1')
    if profile not in ('core-v1', 'economy-research-v1'):
        raise Unsupported('Unsupported semantic profile')
    if kind == 'explicit-world':
        _validate_explicit_world(fixture, has_installed_sources)
    elif profile == 'economy-research-v1' and (kind != 'natural-startup' or not has_installed_sources):
        raise Unsupported('economy-research-v1 requires --assets installed text sources and full production startup; synthetic/default technology state is not agreement')
    if 'reference_rng_seed' in fixture and (type(fixture['reference_rng_seed']) is not int or not 0 <= fixture['reference_rng_seed'] <= 2**32 - 1):
        raise ProtocolError('reference_rng_seed requires an unsigned 32-bit integer')
    if kind == 'natural-startup':
        fields = {'width', 'height', 'terrain', 'faction', 'difficulty'}
        ignored = {'faction_set', 'rules', 'stock_text', 'pause_at_end', 'tutorials'}
        if set(fixture) - fields - common - ignored or fields - set(fixture):
            raise Unsupported('Native natural-startup fixture requires width,height,terrain,faction,difficulty; seed is not a native RNG state')
        if any(type(fixture[key]) is not int or not 4 <= fixture[key] <= 256 for key in ('width', 'height')) or fixture['width'] % 2:
            raise ProtocolError('Native fixture dimensions require even width and 4..256 bounds')
        if not isinstance(fixture['terrain'], str) or fixture['terrain'] not in {'flat-arid', 'flat-moist', 'flat-rainy'}:
            raise Unsupported('Unsupported terrain')
        if not isinstance(fixture['faction'], str) or fixture['faction'] not in {'GAIANS', 'HIVE', 'UNIV', 'MORGAN', 'SPARTANS', 'BELIEVE', 'PEACE'}:
            raise Unsupported('Unsupported faction')
        if not isinstance(fixture['difficulty'], str) or fixture['difficulty'] not in {'Citizen', 'Specialist', 'Talent', 'Librarian', 'Thinker', 'Transcend'}:
            raise Unsupported('Unsupported difficulty')
        settings = {'faction_set': 'original-seven', 'rules': 'standard', 'stock_text': True, 'pause_at_end': True, 'tutorials': False}
        if any(key in fixture and (type(fixture[key]) is not type(default) or fixture[key] != default) for key, default in settings.items()):
            raise Unsupported('Unsupported natural startup presentation/rules setting')
    elif kind == 'exporter-invariants' and set(fixture) - common:
        raise Unsupported('Exporter invariant fixture accepts only kind/rng_state')
    rng = fixture.get('rng_state')
    if rng is not None and (not isinstance(rng, str) or not re.fullmatch(r'[0-9]+(:[0-9]+){3}', rng) or any(int(part) > 2**32 - 1 for part in rng.split(':'))):
        raise ProtocolError('rng_state requires four unsigned 32-bit decimal words')
    actions = []
    for action in data['actions']:
        action = dict(action, args=dict(action.get('args', {})))
        if action['id'] == 'initial':
            raise ProtocolError('Action id initial is reserved for startup observations')
        kind = action['kind']; args = action['args']
        if kind not in ACTIONS:
            raise Unsupported('Unsupported native action: ' + kind)
        required = {'unit', 'x', 'y'} if kind == 'fixture-move-unit' else {'unit'} if kind in {'hold-unit', 'fixture-remove-unit'} else {'unit', 'direction'} if kind == 'move-unit' else set()
        if set(args) != required or ('unit' in args and (not isinstance(args['unit'], str) or not args['unit'])):
            raise ProtocolError('Invalid arguments for action: ' + kind)
        if kind == 'fixture-move-unit' and any(type(args[key]) is not int or not 0 <= args[key] < 16 for key in ('x', 'y')):
            raise ProtocolError('Synthetic movement coordinates require integers within 16x16')
        if kind == 'move-unit' and (not isinstance(args['direction'], str) or args['direction'] not in DIRECTIONS):
            raise ProtocolError('Invalid native movement direction')
        if kind.startswith('fixture-') and fixture['kind'] != 'exporter-invariants':
            raise Unsupported('Fixture mutation is only valid in independent exporter invariants')
        if fixture['kind'] == 'exporter-invariants' and kind not in {'snapshot', 'fixture-remove-unit', 'fixture-move-unit'}:
            raise Unsupported('Synthetic exporter fixture does not install turn/order production mechanics')
        actions.append(action)
    if fixture['kind'] == 'explicit-world':
        declared_units = {unit['id'] for unit in fixture['units']}
        for action in actions:
            if action['kind'] not in EXPLICIT_ACTIONS:
                raise Unsupported('Unsupported explicit-world action: ' + action['kind'])
            if action['kind'] in {'move-unit', 'hold-unit'} and action['args']['unit'] not in declared_units:
                raise Unsupported('explicit-world action addresses an undeclared unit: ' + action['args']['unit'])
    checkpoints = [dict(id=identifier or after, after_action=after) for identifier, after in expected_plan(data)]
    return dict(fixture=fixture, actions=actions, checkpoints=checkpoints)


def parse_candidate(text, case):
    parse_output(text)
    checkpoints, diagnostics = [], []
    current = diagnostic = detail = None
    complete = False
    configuration = {}
    economy = case['input']['fixture'].get('profile') == 'economy-research-v1'
    explicit = case['input']['fixture'].get('kind') == 'explicit-world'
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(TRACE_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        parts = match[1].split('|'); tag = parts.pop(0)
        if complete:
            raise ProtocolError('Late trace marker')
        if tag == 'TRACE_CONFIG':
            if current is not None or len(parts) != 2 or parts[0] in configuration or parts[0] != 'blind_research' or parts[1] not in ('true', 'false'):
                raise ProtocolError('Malformed or duplicate native configuration marker')
            configuration[parts[0]] = parts[1] == 'true'
        elif tag == 'TRACE_CHECK':
            if current is not None or len(parts) != 5:
                raise ProtocolError('Malformed checkpoint marker')
            identifier, after, turn, width, height = parts
            current = dict(id=identifier, after_action=after, state=dict(turn=int(turn), map=dict(width=int(width), height=int(height)), players=[], units=[], bases=[]))
            diagnostic = dict(id=identifier, players=[], units=[], bases=[])
            detail = {}
            if economy:
                current['state']['research'] = {}
        elif tag == 'TRACE_COMPLETE':
            if parts or current is not None:
                raise ProtocolError('Incomplete trace')
            complete = True
        elif current is None:
            raise ProtocolError('Orphan trace marker')
        elif tag == 'TRACE_PLAYER' and len(parts) == 3:
            identifier, faction, raw = parts
            current['state']['players'].append(dict(id=identifier, faction=faction))
            diagnostic['players'].append(dict(id=identifier, native_id=int(raw)))
        elif tag == 'TRACE_UNIT' and len(parts) == 8:
            identifier, owner, x, y, proto, raw, movement, order = parts
            current['state']['units'].append(dict(id=identifier, owner=owner, x=int(x), y=int(y), prototype=proto))
            diagnostic['units'].append(dict(id=identifier, native_id=int(raw), movement_native=float(movement), order_native=order))
        elif tag == 'TRACE_UNITDETAIL' and explicit and len(parts) == 3:
            identifier, health, morale = parts
            if identifier in detail or identifier not in {row['id'] for row in current['state']['units']}:
                raise ProtocolError('Unknown or duplicate unit detail marker')
            try:
                detail[identifier] = (float(health), int(morale))
            except ValueError:
                raise ProtocolError('Malformed unit detail marker')
        elif tag == 'TRACE_BASE' and len(parts) == 6:
            identifier, owner, x, y, population, raw = parts
            current['state']['bases'].append(dict(id=identifier, owner=owner, x=int(x), y=int(y), population=int(population)))
            diagnostic['bases'].append(dict(id=identifier, native_id=int(raw)))
        elif tag == 'TRACE_BASEECONOMY' and economy and len(parts) == 6:
            identifier, minerals, project, workers, doctors, nutrients = parts
            rows = [row for row in current['state']['bases'] if row['id'] == identifier]
            if len(rows) != 1 or 'resources' in rows[0]:
                raise ProtocolError('Unknown or duplicate base economy marker')
            rows[0].update(resources=dict(minerals=int(minerals)), project=project, jobs=dict(workers=int(workers), doctors=int(doctors)))
            next(row for row in diagnostic['bases'] if row['id'] == identifier)['nutrients_native'] = nutrients
        elif tag == 'TRACE_RESEARCH' and economy and len(parts) == 4:
            player, target, science, owned = parts
            if player in current['state']['research'] or player not in {row['id'] for row in current['state']['players']}:
                raise ProtocolError('Unknown or duplicate research owner')
            current['state']['research'][player] = dict(owned_tech_ids=[int(part) for part in owned.split(',')] if owned else [], target_id=int(target), accumulated=int(science))
        elif tag == 'TRACE_END' and not parts:
            if economy and (len(current['state']['research']) != len(current['state']['players']) or any(set(row) != {'id','owner','x','y','population','resources','project','jobs'} for row in current['state']['bases'])):
                raise ProtocolError('Incomplete economy/research native collection')
            if explicit:
                if set(detail) != {row['id'] for row in current['state']['units']}:
                    raise ProtocolError('Incomplete explicit unit detail collection')
                native_orders = {row['id']: row['order_native'] for row in diagnostic['units']}
                for row in current['state']['units']:
                    token = native_orders[row['id']]
                    if token not in EXPLICIT_UNIT_ORDERS:
                        raise Unsupported('Unverified explicit-world unit order: ' + token)
                    row['order'] = EXPLICIT_UNIT_ORDERS[token]
                for identifier, (health, morale) in detail.items():
                    next(row for row in diagnostic['units'] if row['id'] == identifier).update(health_native=health, morale_native=morale)
            checkpoints.append(current); diagnostics.append(diagnostic); current = diagnostic = detail = None
        else:
            raise ProtocolError('Malformed/unknown trace marker: ' + tag)
    if not complete:
        raise ProtocolError('Missing native trace completion')
    if case['input']['fixture'].get('kind') in ('natural-startup', 'explicit-world') and configuration != {'blind_research': True}:
        raise ProtocolError('Missing or incorrect observed standard native rules')
    if explicit:
        fixture = case['input']['fixture']
        for point in checkpoints:
            if point['id'] == 'initial' and (point['state']['turn'] != fixture['turn']
                    or point['state']['map'] != {'width': fixture['width'], 'height': fixture['height']}):
                raise ProtocolError('Explicit initial checkpoint does not match the declared world')
    output = dict(checkpoints=checkpoints, diagnostics=dict(checkpoints=diagnostics,
        identity_rule='declared factory-handle bindings for explicit-world; first-observed owner/prototype/position plus persistent birth ordinal otherwise; native IDs never compared',
        full_map=True, native_configuration=configuration, optional_domains={'economy': 'observed in economy-research-v1' if economy else 'not in frozen core profile', 'research': 'observed in economy-research-v1' if economy else 'not in frozen core profile', 'movement_orders': 'native diagnostics only; cross-engine units unverified'}))
    validate_output(output, case['input'])
    return output


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replay_case(case, runtime, timeout=60, node='node', log=None, *, sources=None, execution_log=None):
    prepared = prepare(case, has_installed_sources=bool(sources))
    runtime = Path(runtime).resolve(); artifacts = [runtime, runtime.with_suffix('.wasm'), DIRECTORY / 'candidate_worker.cjs']
    hashes = {str(path): digest(path) for path in artifacts}
    snapshot = create_snapshot(ROOT)
    production_scripts_hash = hashlib.sha256(canonical(snapshot).encode()).hexdigest()
    native_source_hash = hashlib.sha256(canonical({path.relative_to(ROOT).as_posix(): digest(path) for path in sorted((ROOT / 'src').rglob('*')) if path.is_file() and path.suffix in {'.cpp', '.h'}}).encode()).hexdigest()
    template = (DIRECTORY / '_candidate.gls.js').read_text()
    template_hash = hashlib.sha256(template.encode()).hexdigest()
    script = 'GLSMAC_data/tests/state_trace_candidate_probe.gls.js'
    snapshot[script] = 'const trace_input = ' + gse_literal(prepared) + ';\nconst trace_sources = ' + gse_literal(sources or []) + ';\n' + template
    source_hash = hashlib.sha256(canonical(snapshot).encode()).hexdigest()
    execution = dict(case_id=case['id'], candidate_executed=False, runtime_js_sha256=hashes[str(runtime)], runtime_wasm_sha256=hashes[str(runtime.with_suffix('.wasm'))], scripts_sha256=source_hash, production_scripts_sha256=production_scripts_hash, native_source_sha256=native_source_hash, source_sha256=hashlib.sha256(canonical(sources or []).encode()).hexdigest(), profile=prepared['fixture'].get('profile', 'core-v1'))
    if execution_log is not None:
        execution_log.append(execution)
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix='glsmac-state-trace-') as temporary:
        scripts = Path(temporary) / 'scripts.json'; scripts.write_text(canonical(snapshot))
        try:
            process = subprocess.run([node, str(DIRECTORY / 'candidate_worker.cjs')],
                input=canonical(dict(runtime=str(runtime), snapshot=str(scripts), script=script, prefix=temporary, rng_state=prepared['fixture'].get('rng_state'))),
                text=True, capture_output=True, cwd=ROOT, timeout=timeout)
            execution.update(candidate_executed=True, duration_s=round(time.perf_counter()-started, 6), status='completed' if process.returncode == 0 else 'worker-failed')
        except subprocess.TimeoutExpired as error:
            if log:
                captured = lambda value: value.decode('utf-8', errors='replace') if isinstance(value, bytes) else (value or '')
                Path(log).parent.mkdir(parents=True, exist_ok=True)
                Path(log).write_text(captured(error.stdout) + captured(error.stderr))
            execution.update(candidate_executed=True, duration_s=round(time.perf_counter()-started, 6), status='timeout')
            raise
    output = process.stdout + process.stderr
    if log:
        Path(log).parent.mkdir(parents=True, exist_ok=True); Path(log).write_text(output)
    if any(digest(Path(path)) != value for path, value in hashes.items()):
        raise ProtocolError('Immutable runtime changed during trace')
    unsupported = re.search(r'(?:^|\] )TRACE_UNSUPPORTED\|([^\n]+)', output, re.MULTILINE)
    if unsupported:
        raise Unsupported(unsupported[1])
    if process.returncode:
        raise ProtocolError('Native trace worker failed: ' + output[-3000:])
    result = parse_candidate(output, case)
    metadata = dict(name='glsmac-native-state-trace', kind='candidate', target='wasm-gse',
        runtime_js_sha256=hashes[str(runtime)], runtime_wasm_sha256=hashes[str(runtime.with_suffix('.wasm'))],
        scripts_sha256=source_hash, production_scripts_sha256=production_scripts_hash, native_source_sha256=native_source_hash,
        adapter_sha256=_ADAPTER_SHA256, template_sha256=template_hash, worker_sha256=hashes[str(DIRECTORY / 'candidate_worker.cjs')],
        candidate_executed=True, launches=1, duration_s=round(time.perf_counter()-started, 6),
        source_profile='installed text/full production configure/declared flat terrain' if sources else 'synthetic startup sources/flat declared terrain; bounded first-city mechanics exclude technology/research initialization',
        source_sha256=execution['source_sha256'], semantic_profile=execution['profile'],
        rng='native controlled state' if prepared['fixture'].get('rng_state') else 'uncontrolled native RNG')
    execution.update(status='ok')
    return metadata, result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--timeout', type=float, default=60)
    parser.add_argument('--node', default=os.environ.get('NODE', 'node'))
    parser.add_argument('--log', type=Path)
    parser.add_argument('--assets', type=Path, help='optional installed SMAC text directory; required for economy-research-v1')
    args = parser.parse_args(argv)
    if not 0 < args.timeout <= 300:
        raise ProtocolError('timeout must be within (0,300]')
    request = load_request(); results = []; runs = []; executions = []
    sources = None
    if args.assets:
        from ui.research_headless import installed_sources
        sources = installed_sources(args.assets.resolve())
    for case in request['cases']:
        log = args.log
        if log and len(request['cases']) > 1:
            log = log.with_name(log.stem + '-' + case['id'] + log.suffix)
        try:
            metadata, output = replay_case(case, args.runtime, args.timeout, args.node, log, sources=sources, execution_log=executions)
            runs.append(metadata); results.append(dict(id=case['id'], status='ok', output=output))
        except Unsupported as error:
            if executions and executions[-1]['case_id'] == case['id']:
                executions[-1].update(status='unsupported', reason=str(error))
            results.append(dict(id=case['id'], status='unsupported', reason=str(error)))
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            if executions and executions[-1]['case_id'] == case['id']:
                executions[-1].update(status='error', reason=str(error))
            results.append(dict(id=case['id'], status='error', reason=str(error)))
    write_response(dict(name='glsmac-native-state-trace', kind='candidate', candidate_executed=any(row['candidate_executed'] for row in executions), native_launches=sum(row['candidate_executed'] for row in executions), scenarios=runs, executions=executions), results)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print('State trace candidate failed: ' + str(error), file=sys.stderr); sys.exit(2)
