#!/usr/bin/env python3
"""Replay production B/base-screen controls and native city state without pixels."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, canonical, load_request, write_response
from ui import base_open_contract as contract
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native base opening execution failed: ' + text[-2500:])
    rows, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(BASEOPEN_.*)$', line)
        if not match: continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'BASEOPEN_CASE':
            if len(parts) != 2 or current is not None or len(rows) >= len(cases) or parts[1] != cases[len(rows)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered base opening case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan base opening marker')
        elif marker == 'BASEOPEN_STATE':
            if len(parts) != 6 or state is not None or parts[1] != str(len(current['output']['trace'])):
                raise ProtocolError('Incomplete or reordered base opening checkpoint')
            if not re.fullmatch(r'0|[1-9][0-9]*', parts[2]) or parts[3] not in (*contract.ROLES, 'none') or parts[4] not in ('map', 'base') or parts[5] not in ('true', 'false'):
                raise ProtocolError('Invalid base opening checkpoint scalar')
            state = {'year_delta': int(parts[2]), 'selected': None if parts[3] == 'none' else parts[3]}
            state['screen'] = parts[4]; state['title_matches_base'] = parts[5] == 'true'
            state['units'] = []
        elif marker == 'BASEOPEN_BASE':
            if state is None or 'base' in state or len(parts) != 7 or any(not re.fullmatch(r'-?[1-9][0-9]*|0' if i == 5 else r'0|[1-9][0-9]*', p) for i, p in enumerate(parts) if i > 0):
                raise ProtocolError('Invalid or duplicate join base counters')
            state['base'] = dict(zip(('population', 'workers', 'doctors', 'worked_tiles', 'nutrients', 'minerals'), map(int, parts[1:])))
        elif marker == 'BASEOPEN_OWNED':
            if state is None or 'base' not in state or 'owned_count' in state['base'] or len(parts) != 2 or not re.fullmatch(r'0|[1-9][0-9]*', parts[1]):
                raise ProtocolError('Invalid or duplicate owned join base count')
            state['base']['owned_count'] = int(parts[1])
        elif marker == 'BASEOPEN_UNIT':
            if (state is None or len(parts) != 4 or parts[1] not in contract.ROLES
                    or parts[2] not in ('0', '1', '2') or parts[3] not in ('0', '1', '2', '3')):
                raise ProtocolError('Invalid native base opening unit or protocol units')
            state['units'].append({'role': parts[1], 'order_code': int(parts[2]), 'movement_spent': int(parts[3])})
        elif marker == 'BASEOPEN_STATE_DONE':
            if len(parts) != 1 or state is None: raise ProtocolError('Orphan base opening checkpoint end')
            contract.validate_state(state)
            current['output']['trace'].append(state); state = None
        elif marker == 'BASEOPEN_CASE_DONE':
            if len(parts) != 1 or state is not None: raise ProtocolError('Incomplete base opening case end')
            case = cases[len(rows)]; contract.validate_output(current['output'], case['input']['actions'])
            rows.append(current); current = None
        elif marker == 'BASEOPEN_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]): raise ProtocolError('Missing native base opening failure reason')
            rows.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = state = None
        else:
            raise ProtocolError('Unknown native base opening marker')
    if current is not None or state is not None or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('Missing native base opening cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/base-open-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    algorithms = (contract.ALGORITHM, contract.CITIZENS_ALGORITHM)
    supported = [case for case in cases if case['algorithm'] in algorithms]
    for case in supported: contract.validate_input(case['input'])
    if len(supported) > 12: raise ProtocolError('base opening adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve(); hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve()); template = (DIRECTORY / '_base_open_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/base_open_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('base opening probe shadows an existing test')
    inputs = [dict(case['input'], id=case['id']) for case in supported]
    snapshot[script] = 'const base_open_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-base_open-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical({'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('base opening worker failed or runtime changed; inspect ' + str(args.log))
    rows = parse_candidate(process.stdout, supported)
    for case, row in zip(supported, rows, strict=True):
        if case['algorithm'] == contract.CITIZENS_ALGORITHM and row['status'] == 'ok':
            for state in row['output']['trace']:
                del state['base']['nutrients']
            contract.validate_output(row['output'], case['input']['actions'], include_nutrients=False)
    rows = iter(rows)
    write_response({'name': 'glsmac-base-open', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['shared production selection controller', 'actual native units and readiness',
                                 'production B and preparation controls', 'production base popup open/close and actual title',
                                 'actual native base citizens, worker links and signed nutrient counter'],
                    'mocked': ['declared initial city, component inputs and geometry', 'initial Scout focus',
                               'display/transport acknowledgements', 'rendering/audio omitted']},
                   [next(rows) if case['algorithm'] in algorithms else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown base opening contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native base opening candidate failed:', error, file=sys.stderr); sys.exit(1)
