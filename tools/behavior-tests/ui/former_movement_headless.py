#!/usr/bin/env python3
"""Observe shipped movement/work handlers on native units without pixels."""
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
from ui.former_movement_contract import ALGORITHM, validate_input, validate_output
from ui.former_work_headless import parse_candidate as parse_work
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    converted, positions, current = [], {}, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(MOVE_.*)$', line)
        if not match:
            converted.append(line); continue
        parts = match[1].split('|')
        if parts[0] == 'MOVE_CASE':
            if len(parts) != 2 or parts[1] in positions:
                raise ProtocolError('Invalid road movement case')
            current = parts[1]; positions[current] = []
        elif parts[0] == 'MOVE_STATE':
            if len(parts) != 11 or current is None or not re.fullmatch(r'0|-?[1-9][0-9]*', parts[-1]):
                raise ProtocolError('Invalid road movement position')
            positions[current].append(int(parts.pop()))
        converted.append('|'.join(parts).replace('MOVE_', 'WORK_', 1))
    rows = parse_work('\n'.join(converted), cases)
    for row, case in zip(rows, cases, strict=True):
        if row['status'] == 'ok':
            for state, position in zip(row['output']['trace'], positions[row['id']], strict=True):
                state['position'] = position
            validate_output(row['output'], case['input']['actions'])
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/former-movement-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == ALGORITHM]
    for case in supported: validate_input(case['input'])
    if len(supported) > 12: raise ProtocolError('Road movement adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_former_movement_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/former_movement_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Road movement probe shadows existing test')
    snapshot[script] = 'const former_movement_inputs = ' + gse_literal([dict(case['input'], id=case['id']) for case in supported]) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-road-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')], input=canonical(request), text=True,
                                 capture_output=True, timeout=90, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('Road movement worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-former-road-movement', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['shipped movement/work/activation handlers', 'native units/tiles/animation callbacks', 'native AdvanceTurn and production turn callbacks'],
                    'mocked': ['synthetic equivalent installed inputs', 'initial two-road flat arid world', 'display animation acknowledgements', 'turn acknowledgements', 'display/audio omitted']},
                   [next(rows) if case['algorithm'] == ALGORITHM else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown road movement contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Road movement candidate failed:', error, file=sys.stderr); sys.exit(1)
