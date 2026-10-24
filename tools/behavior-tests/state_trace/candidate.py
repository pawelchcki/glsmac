#!/usr/bin/env python3
"""Execute complete native state traces in one immutable WASM launch per scenario.

No expected observations are accepted. Natural startup uses production scripts;
exporter-invariants is an independently declared synthetic two-player fixture.
"""
import argparse
import hashlib
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
    if isinstance(value, list):
        return '[' + ','.join(gse_literal(item) for item in value) + ']'
    if isinstance(value, dict):
        if any(not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', key) for key in value):
            raise ProtocolError('Invalid GSE input key')
        return '{' + ','.join(key + ':' + gse_literal(item) for key, item in value.items()) + '}'
    raise ProtocolError('Unsupported GSE input type')


def prepare(case, *, has_installed_sources=False):
    if case['algorithm'] != ALGORITHM:
        raise Unsupported('Unknown state trace algorithm')
    data = case['input']; validate_input(data); fixture = data['fixture']
    kind = fixture.get('kind')
    if not isinstance(kind, str) or kind not in {'natural-startup', 'exporter-invariants'}:
        raise Unsupported('Unsupported native fixture kind: ' + str(kind))
    common = {'kind', 'rng_state', 'reference_rng_seed', 'profile'}
    profile = fixture.get('profile', 'core-v1')
    if profile not in ('core-v1', 'economy-research-v1'):
        raise Unsupported('Unsupported semantic profile')
    if profile == 'economy-research-v1' and (kind != 'natural-startup' or not has_installed_sources):
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
    elif set(fixture) - common:
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
    checkpoints = [dict(id=identifier or after, after_action=after) for identifier, after in expected_plan(data)]
    return dict(fixture=fixture, actions=actions, checkpoints=checkpoints)


def parse_candidate(text, case):
    parse_output(text)
    checkpoints, diagnostics = [], []
    current = diagnostic = None
    complete = False
    configuration = {}
    economy = case['input']['fixture'].get('profile') == 'economy-research-v1'
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
            checkpoints.append(current); diagnostics.append(diagnostic); current = diagnostic = None
        else:
            raise ProtocolError('Malformed/unknown trace marker: ' + tag)
    if not complete:
        raise ProtocolError('Missing native trace completion')
    if case['input']['fixture'].get('kind') == 'natural-startup' and configuration != {'blind_research': True}:
        raise ProtocolError('Missing or incorrect observed standard native rules')
    output = dict(checkpoints=checkpoints, diagnostics=dict(checkpoints=diagnostics,
        identity_rule='first-observed owner/prototype/position plus persistent birth ordinal; native IDs never compared',
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
