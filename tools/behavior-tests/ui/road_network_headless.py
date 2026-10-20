#!/usr/bin/env python3
"""Observe shipped road movement on native units without pixels."""
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
from ui.road_network_contract import ALGORITHM, validate_input, validate_output
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Road network native execution failed: ' + text[-2500:])
    rows, current = [], None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(NETWORK_.*)$', line)
        if not match: continue
        parts = match[1].split('|')
        if parts[0] == 'NETWORK_CASE':
            if len(parts) != 2 or current is not None or len(rows) >= len(cases) or parts[1] != cases[len(rows)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered road network case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan road network marker')
        elif parts[0] == 'NETWORK_STATE':
            if len(parts) != 10 or parts[1] != str(len(current['output']['trace'])):
                raise ProtocolError('Incomplete or reordered road network checkpoint')
            if (any(not re.fullmatch(r'0|-?[1-9][0-9]*', parts[i]) for i in (2, 3, 4, 8, 9))
                    or any(v not in ('true', 'false') for v in parts[5:8])):
                raise ProtocolError('Invalid road network scalar')
            current['output']['trace'].append({'year_delta': int(parts[2]), 'position': int(parts[3]),
                'movement_spent': int(parts[4]), 'terrain': {'base': parts[5] == 'true', 'road': parts[6] == 'true',
                'forest': parts[7] == 'true', 'moisture': int(parts[8]), 'rockiness': int(parts[9])}})
        elif parts[0] == 'NETWORK_DONE':
            if len(parts) != 1: raise ProtocolError('Invalid road network completion')
            validate_output(current['output'], cases[len(rows)]['input']['actions'])
            rows.append(current); current = None
        elif parts[0] == 'NETWORK_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]): raise ProtocolError('Missing road network failure reason')
            rows.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = None
        else:
            raise ProtocolError('Unknown road network marker')
    if current is not None or [r['id'] for r in rows] != [c['id'] for c in cases]:
        raise ProtocolError('Missing road network cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/road-network-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported: validate_input(case['input'])
    if len(supported) > 12: raise ProtocolError('Road network adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_road_network_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/road_network_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Road network probe shadows existing test')
    snapshot[script] = 'const road_network_inputs = ' + gse_literal([dict(case['input'], id=case['id']) for case in supported]) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-road-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')], input=canonical(request), text=True,
                                 capture_output=True, timeout=90, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('Road network worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-road-network', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['shipped movement handler', 'native units/tiles/animation callbacks and base construction', 'native AdvanceTurn and production turn callbacks'],
                    'mocked': ['synthetic equivalent installed inputs', 'declared two-square terrain corridor; four-wide equivalent native geometry', 'display animation acknowledgements', 'turn acknowledgements', 'display/audio omitted']},
                   [next(rows) if case['algorithm'] == ALGORITHM else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown road network contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Road network candidate failed:', error, file=sys.stderr); sys.exit(1)
