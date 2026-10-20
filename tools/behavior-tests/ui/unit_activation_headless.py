#!/usr/bin/env python3
"""Execute actual activation controls with native units, without rendering."""
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
from ui.headless import gse_literal
from ui.unit_activation_contract import ALGORITHM, ROLES, validate_input, validate_output, validate_state

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Activation native execution failed: ' + text[-2500:])
    rows, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(ACT_.*)$', line)
        if not match: continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'ACT_CASE':
            if (len(parts) != 2 or current is not None or len(rows) >= len(cases)
                    or parts[1] != cases[len(rows)]['id']):
                raise ProtocolError('Unknown, duplicate or reordered activation case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan activation marker')
        elif marker == 'ACT_STATE':
            if (len(parts) != 4 or state is not None or parts[1] != str(len(current['output']['trace']))
                    or parts[2] != '0' or parts[3] not in (*ROLES, 'none')):
                raise ProtocolError('Incomplete, invalid or reordered activation checkpoint')
            state = {'year_delta': 0, 'selected': None if parts[3] == 'none' else parts[3], 'units': []}
        elif marker in ('ACT_CLOSED', 'ACT_PICKER'):
            if state is None or 'picker' in state or len(parts) != (1 if marker == 'ACT_CLOSED' else 2):
                raise ProtocolError('Duplicate or invalid activation picker state')
            state['picker'] = None if marker == 'ACT_CLOSED' else {'caption': ' '.join(parts[1].split()).upper(), 'choices': [], 'selected': None}
        elif marker == 'ACT_CHOICE':
            if (state is None or state.get('picker') is None or len(parts) != 4 or parts[1] not in ROLES
                    or state['picker']['selected'] is not None):
                raise ProtocolError('Unexpected activation row')
            name, label = (' '.join(p.split()).upper() for p in parts[2:])
            if not name or not label.endswith(name):
                raise ProtocolError('Activation row text does not show its actual native definition')
            state['picker']['choices'].append(parts[1])
        elif marker == 'ACT_HIGHLIGHT':
            if (state is None or state.get('picker') is None or len(parts) != 2
                    or state['picker']['selected'] is not None or parts[1] not in state['picker']['choices']):
                raise ProtocolError('Unexpected or duplicate activation highlight')
            state['picker']['selected'] = parts[1]
        elif marker == 'ACT_UNIT':
            if (state is None or len(parts) != 4 or parts[1] not in ROLES or parts[2] not in ('none', 'hold')
                    or not re.fullmatch(r'0|[1-9][0-9]*', parts[3])):
                raise ProtocolError('Invalid native activation unit')
            state['units'].append({'role': parts[1], 'order': parts[2], 'movement_spent': int(parts[3])})
        elif marker == 'ACT_STATE_DONE':
            if len(parts) != 1 or state is None: raise ProtocolError('Orphan activation state end')
            validate_state(state); current['output']['trace'].append(state); state = None
        elif marker == 'ACT_CASE_DONE':
            if len(parts) != 1 or state is not None: raise ProtocolError('Incomplete activation case')
            case = cases[len(rows)]; validate_output(current['output'], case['input']['actions'])
            rows.append(current); current = None
        elif marker == 'ACT_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]): raise ProtocolError('Missing activation failure reason')
            rows.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = state = None
        else:
            raise ProtocolError('Unknown activation marker')
    if current is not None or state is not None or [r['id'] for r in rows] != [c['id'] for c in cases]:
        raise ProtocolError('Missing or unfinished activation cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/unit-activation-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [c for c in cases if c['algorithm'] == ALGORITHM]
    for case in supported: validate_input(case['input'])
    if len(supported) > 12: raise ProtocolError('Activation adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve(); hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_unit_activation_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/unit_activation_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Activation probe shadows a shipped test')
    inputs = [dict(c['input'], id=c['id']) for c in supported]
    snapshot[script] = 'const activation_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-activation-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical({'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}),
                                 capture_output=True, text=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('Activation worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-unit-activation', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['production activation controls and popup', 'native parsed installed-dialog input',
                                 'actual native units, orders and shared selection controller'],
                    'mocked': ['equivalent synthetic starting world/component declarations', 'display/audio omitted',
                               'transport acknowledgements and frontend delivery']},
                   [next(rows) if c['algorithm'] == ALGORITHM else {'id': c['id'], 'status': 'unsupported', 'reason': 'unknown activation contract'} for c in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native activation candidate failed:', error, file=sys.stderr); sys.exit(1)
