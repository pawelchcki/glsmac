#!/usr/bin/env python3
"""Replay production B controls and actual native city/unit state without pixels."""
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
from ui import colony_join_contract as contract
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native Colony join execution failed: ' + text[-2500:])
    rows, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(JOIN_.*)$', line)
        if not match: continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'JOIN_CASE':
            if len(parts) != 2 or current is not None or len(rows) >= len(cases) or parts[1] != cases[len(rows)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered Colony join case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan Colony join marker')
        elif marker == 'JOIN_STATE':
            if len(parts) != 4 or state is not None or parts[1] != str(len(current['output']['trace'])):
                raise ProtocolError('Incomplete or reordered Colony join checkpoint')
            if not re.fullmatch(r'0|[1-9][0-9]*', parts[2]) or parts[3] not in (*contract.ROLES, 'none'):
                raise ProtocolError('Invalid Colony join checkpoint scalar')
            state = {'year_delta': int(parts[2]), 'selected': None if parts[3] == 'none' else parts[3]}
            state['units'] = []
        elif marker == 'JOIN_BASE':
            if state is None or 'base' in state or len(parts) != 7 or any(not re.fullmatch(r'0|[1-9][0-9]*', p) for p in parts[1:]):
                raise ProtocolError('Invalid or duplicate join base counters')
            state['base'] = dict(zip(('population', 'workers', 'doctors', 'worked_tiles', 'nutrients', 'minerals'), map(int, parts[1:])))
        elif marker == 'JOIN_OWNED':
            if state is None or 'base' not in state or 'owned_count' in state['base'] or len(parts) != 2 or not re.fullmatch(r'0|[1-9][0-9]*', parts[1]):
                raise ProtocolError('Invalid or duplicate owned join base count')
            state['base']['owned_count'] = int(parts[1])
        elif marker == 'JOIN_UNIT':
            if (state is None or len(parts) != 4 or parts[1] not in contract.ROLES
                    or parts[2] not in ('0', '1', '2') or parts[3] not in ('0', '1', '2', '3')):
                raise ProtocolError('Invalid native Colony join unit or protocol units')
            state['units'].append({'role': parts[1], 'order_code': int(parts[2]), 'movement_spent': int(parts[3])})
        elif marker == 'JOIN_STATE_DONE':
            if len(parts) != 1 or state is None: raise ProtocolError('Orphan Colony join checkpoint end')
            contract.validate_state(state)
            current['output']['trace'].append(state); state = None
        elif marker == 'JOIN_CASE_DONE':
            if len(parts) != 1 or state is not None: raise ProtocolError('Incomplete Colony join case end')
            case = cases[len(rows)]; contract.validate_output(current['output'], case['input']['actions'])
            rows.append(current); current = None
        elif marker == 'JOIN_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]): raise ProtocolError('Missing native Colony join failure reason')
            rows.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = state = None
        else:
            raise ProtocolError('Unknown native Colony join marker')
    if current is not None or state is not None or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('Missing native Colony join cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/colony-join-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported: contract.validate_input(case['input'])
    if len(supported) > 12: raise ProtocolError('Colony join adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve(); hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_colony_join_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/colony_join_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Colony join probe shadows an existing test')
    inputs = [dict(case['input'], id=case['id']) for case in supported]
    snapshot[script] = 'const colony_join_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-colony_join-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical({'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('Colony join worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-colony-join', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['shared production selection controller', 'actual native units and readiness',
                                 'production B and preparation controls', 'actual native base citizens, worker links and resource stores'],
                    'mocked': ['declared initial city, component inputs and geometry', 'initial Scout focus',
                               'display/transport acknowledgements', 'rendering/audio omitted']},
                   [next(rows) if case['algorithm'] == contract.ALGORITHM else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown Colony join contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native Colony join candidate failed:', error, file=sys.stderr); sys.exit(1)
