#!/usr/bin/env python3
"""Observe adjacent Colony Action controls against native state without pixels."""
import argparse
from copy import deepcopy
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
from ui import colony_near_contract as contract
from ui.colony_near_inputs import declarations
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
ROLES = ('scout', 'former', 'colony')


def integer(value):
    if not re.fullmatch(r'0|[1-9][0-9]*', value):
        raise ProtocolError('Invalid native adjacent-menu integer')
    return int(value)


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native adjacent-menu execution failed: ' + text[-2500:])
    results, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(NEAR_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'NEAR_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered adjacent-menu case')
            current = dict(id=parts[1], status='ok', output=dict(trace=[]))
        elif current is None:
            raise ProtocolError('Orphan native adjacent-menu marker')
        elif marker == 'NEAR_STATE':
            if len(parts) != 5 or state is not None or parts[1] != str(len(current['output']['trace'])) or parts[3] not in (*ROLES, 'none'):
                raise ProtocolError('Incomplete or reordered adjacent-menu checkpoint')
            state = dict(year_delta=integer(parts[2]), selected=None if parts[3] == 'none' else parts[3],
                         owned_count=integer(parts[4]), units=[])
        elif marker == 'NEAR_UNIT':
            if state is None or len(parts) != 4 or parts[1] not in ROLES:
                raise ProtocolError('Invalid native adjacent-menu unit')
            state['units'].append(dict(role=parts[1], order_code=integer(parts[2]), movement_spent=integer(parts[3])))
        elif marker == 'NEAR_MENU':
            if (state is None or 'root_open' in state or len(parts) != 4 or parts[1] not in ('true', 'false')
                    or parts[2] not in ('none', '4') or parts[3] not in ('true', 'false')):
                raise ProtocolError('Invalid native adjacent-menu visibility')
            state.update(root_open=parts[1] == 'true', child_header=None if parts[2] == 'none' else 4, dialog_open=parts[3] == 'true')
        elif marker in ('NEAR_NO_MESSAGE', 'NEAR_MESSAGE'):
            if state is None or 'message' in state:
                raise ProtocolError('Orphan or duplicate native adjacent-menu message')
            if marker == 'NEAR_NO_MESSAGE' and len(parts) == 1:
                state['message'] = None
            elif marker == 'NEAR_MESSAGE' and len(parts) == 2 and parts[1].strip():
                state['message'] = ' '.join(parts[1].split()).upper()
            else:
                raise ProtocolError('Invalid actual adjacent-menu message')
        elif marker == 'NEAR_STATE_DONE':
            if len(parts) != 1 or state is None:
                raise ProtocolError('Incomplete native adjacent-menu checkpoint end')
            contract.validate_output(dict(trace=[state]), [])
            current['output']['trace'].append(state); state = None
        elif marker == 'NEAR_CASE_DONE':
            if len(parts) != 1 or state is not None:
                raise ProtocolError('Incomplete native adjacent-menu case end')
            contract.validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current); current = None
        elif marker == 'NEAR_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('Missing native adjacent-menu failure reason')
            results.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:]))); current = state = None
        else:
            raise ProtocolError('Unknown native adjacent-menu marker')
    if current is not None or state is not None or [r['id'] for r in results] != [c['id'] for c in cases]:
        raise ProtocolError('Missing native adjacent-menu cases')
    return results


def prepare(case):
    return dict(deepcopy(case['input']), id=case['id'], sources=[dict(name=name, source=text)
                for name, text in declarations(case['input']['text_profile']).items()])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/colony-near-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 2:
        raise ProtocolError('Adjacent-menu adapter accepts two supported cases per request')
    if not supported:
        write_response(dict(name='glsmac-colony-near', kind='candidate', candidate_executed=False),
                       [dict(id=c['id'], status='unsupported', reason='Unknown adjacent-menu contract') for c in cases])
        return
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_colony_near_headless.gls.js').read_text()
    script = 'GLSMAC_data/tests/colony_near_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Adjacent-menu probe shadows an existing test')
    inputs = [prepare(case) for case in supported]
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    snapshot[script] = 'const colony_near_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-colony-near-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != value for p, value in hashes.items()):
        raise ProtocolError('Adjacent-menu worker failed or runtime changed: ' + str(args.log))
    results = iter(parse_candidate(process.stdout, supported))
    write_response(dict(name='glsmac-colony-near', kind='candidate', target='wasm-gse', rendering=False,
                        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
                        executed=['mounted MENU/Action/source0 callbacks and shared native Tab navigation',
                                  'native declared source pools, terrain and actual city/unit ownership/readiness',
                                  'production command handlers and real mounted dialog/HUD message state'],
                        mocked=['declared native city/unit/layout inputs', 'scene geometry/art/audio',
                                'synchronous frontend notifications, zero-delay callbacks and 100ms preview refresh',
                                'wall-clock waiting omitted; message fade is not advanced by a checkpoint']),
                   [next(results) if c['algorithm'] == contract.ALGORITHM else dict(id=c['id'], status='unsupported', reason='Unknown adjacent-menu contract') for c in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native adjacent-menu candidate failed:', error, file=sys.stderr); sys.exit(1)
