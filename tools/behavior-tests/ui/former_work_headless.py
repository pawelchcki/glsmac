#!/usr/bin/env python3
"""Observe production Former commands on native units/tiles without rendering."""
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
from ui.former_work_contract import ALGORITHM, validate_input, validate_output
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Former native execution failed: ' + text[-2500:])
    results, current = [], None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(WORK_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|')
        if parts[0] == 'WORK_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('unknown, duplicate or reordered Former case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('orphan Former marker')
        elif parts[0] == 'WORK_STATE':
            if len(parts) != 10 or parts[1] != str(len(current['output']['trace'])):
                raise ProtocolError('incomplete or reordered Former checkpoint')
            if any(not re.fullmatch(r'0|[1-9][0-9]*', parts[i]) for i in (2, 4, 5)) or any(value not in ('true', 'false') for value in parts[6:]):
                raise ProtocolError('invalid Former checkpoint scalar')
            current['output']['trace'].append({'year_delta': int(parts[2]), 'order': parts[3],
                'movement_spent': int(parts[4]), 'work_units': int(parts[5]),
                'terrain': dict(zip(('road', 'farm', 'mine', 'forest'), (v == 'true' for v in parts[6:])))})
        elif parts[0] == 'WORK_DONE':
            if len(parts) != 1:
                raise ProtocolError('invalid Former completion')
            validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current); current = None
        elif parts[0] == 'WORK_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('missing Former failure reason')
            results.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = None
        else:
            raise ProtocolError('unknown Former marker')
    if current is not None or [r['id'] for r in results] != [c['id'] for c in cases]:
        raise ProtocolError('missing Former cases')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/former-work-headless.log')
    args = parser.parse_args()
    cases = load_request()['cases']; supported = [c for c in cases if c['algorithm'] == ALGORITHM]
    for case in supported:
        validate_input(case['input'])
    if len(supported) > 12:
        raise ProtocolError('Former adapter accepts at most twelve cases per worker')
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_former_work_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/former_work_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Former probe shadows an existing test')
    snapshot[script] = 'const former_inputs = ' + gse_literal([dict(c['input'], id=c['id']) for c in supported]) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-former-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        request = {'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')], input=canonical(request),
                                 text=True, capture_output=True, timeout=90, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('Former worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-former-work', 'kind': 'candidate', 'target': 'wasm-gse', 'rendering': False,
                    'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')], 'scripts_sha256': digest,
                    'executed': ['installed-text parser and production consumers', 'native unit/tile managers', 'production work/activation commands', 'native AdvanceTurn and production work callbacks'],
                    'mocked': ['synthetic equivalent component/action inputs', 'flat arid native fixture and initial Former placement', 'explicit turn acknowledgements', 'display/audio omitted']},
                   [next(rows) if c['algorithm'] == ALGORITHM else {'id': c['id'], 'status': 'unsupported', 'reason': 'unknown Former contract'} for c in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Former candidate failed:', error, file=sys.stderr); sys.exit(1)
