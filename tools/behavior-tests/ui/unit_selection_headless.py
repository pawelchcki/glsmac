#!/usr/bin/env python3
"""Replay selection and wait-state observations through the production controller."""
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
from ui import unit_selection_contract as selection
from ui import unit_wait_contract as waiting
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
CONTRACTS = {selection.ALGORITHM: selection, waiting.ALGORITHM: waiting}


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native selection execution failed: ' + text[-2500:])
    rows, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(SELECT_.*)$', line)
        if not match: continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'SELECT_CASE':
            if len(parts) != 2 or current is not None or len(rows) >= len(cases) or parts[1] != cases[len(rows)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered selection case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan selection marker')
        elif marker == 'SELECT_STATE':
            if len(parts) != 4 or state is not None or parts[1] != str(len(current['output']['trace'])):
                raise ProtocolError('Incomplete or reordered selection checkpoint')
            if not re.fullmatch(r'0|[1-9][0-9]*', parts[2]) or parts[3] not in (*selection.ROLES, 'none'):
                raise ProtocolError('Invalid selection checkpoint scalar')
            state = {'year_delta': int(parts[2]), 'selected': None if parts[3] == 'none' else parts[3]}
            if cases[len(rows)]['algorithm'] == selection.ALGORITHM: state['units'] = []
        elif marker == 'SELECT_UNIT':
            if state is None or 'units' not in state or len(parts) != 6:
                raise ProtocolError('Unexpected or incomplete native selection unit')
            if any(not re.fullmatch(r'0|-?[1-9][0-9]*', parts[i]) for i in (2, 3, 5)):
                raise ProtocolError('Invalid native selection unit scalar')
            state['units'].append({'role': parts[1], 'x_delta': int(parts[2]), 'y_delta': int(parts[3]),
                                   'order': parts[4], 'movement_spent': int(parts[5])})
        elif marker == 'SELECT_DEFER':
            if (state is None or 'units' in state or 'deferred' in state or len(parts) != 4
                    or any(v not in ('true', 'false') for v in parts[1:])):
                raise ProtocolError('Unexpected, duplicate or invalid deferred flags')
            state['deferred'] = dict(zip(selection.ROLES, (v == 'true' for v in parts[1:]), strict=True))
        elif marker == 'SELECT_STATE_DONE':
            if len(parts) != 1 or state is None: raise ProtocolError('Orphan selection checkpoint end')
            contract = CONTRACTS[cases[len(rows)]['algorithm']]
            contract.validate_output({'trace': [state]}, [])
            current['output']['trace'].append(state); state = None
        elif marker == 'SELECT_CASE_DONE':
            if len(parts) != 1 or state is not None: raise ProtocolError('Incomplete selection case end')
            case = cases[len(rows)]; CONTRACTS[case['algorithm']].validate_output(current['output'], case['input']['actions'])
            rows.append(current); current = None
        elif marker == 'SELECT_CASE_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]): raise ProtocolError('Missing native selection failure reason')
            rows.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = state = None
        else:
            raise ProtocolError('Unknown native selection marker')
    if current is not None or state is not None or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('Missing native selection cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/unit-selection-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] in CONTRACTS]
    for case in supported: CONTRACTS[case['algorithm']].validate_input(case['input'])
    if len(supported) > 12: raise ProtocolError('Selection adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve(); hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_unit_selection_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/unit_selection_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Selection probe shadows an existing test')
    inputs = [dict(case['input'], id=case['id'], kind='selection' if case['algorithm'] == selection.ALGORITHM else 'wait') for case in supported]
    snapshot[script] = 'const unit_selection_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-selection-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical({'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}),
                                 text=True, capture_output=True, timeout=120, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('Selection worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-unit-selection', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['shared production selection controller', 'actual native units and readiness',
                                 'shipped Hold/Skip handlers', 'actual turn advancement and callbacks'],
                    'mocked': ['equivalent synthetic unit inputs and initial geometry', 'initial Scout focus',
                               'display/transport acknowledgements', 'rendering/audio omitted']},
                   [next(rows) if case['algorithm'] in CONTRACTS else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown selection contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native selection candidate failed:', error, file=sys.stderr); sys.exit(1)
