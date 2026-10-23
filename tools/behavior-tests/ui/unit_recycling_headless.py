#!/usr/bin/env python3
"""Observe Ready city unit recycling controls against native state without pixels."""
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
from ui import unit_recycling_contract as contract
from ui.unit_recycling_inputs import declarations
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
ROLES = ('scout', 'former', 'colony')


def integer(value):
    if not re.fullmatch(r'0|[1-9][0-9]*', value):
        raise ProtocolError('Invalid native Recycling-menu integer')
    return int(value)


def signed_integer(value):
    if not re.fullmatch(r'0|-?[1-9][0-9]*', value):
        raise ProtocolError('Invalid native recycling mineral delta')
    return int(value)


def visible(value):
    result = ' '.join(value.split()).upper()
    if not result or not contract.text(result):
        raise ProtocolError('Invalid actual Recycling text')
    return result


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native Recycling execution failed: ' + text[-2500:])
    results, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(RECYCLING_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'RECYCLING_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered Recycling case')
            current = dict(id=parts[1], status='ok', output=dict(trace=[]))
        elif current is None:
            raise ProtocolError('Orphan native Recycling marker')
        elif marker == 'RECYCLING_STATE':
            if len(parts) != 6 or state is not None or parts[1] != str(len(current['output']['trace'])) or parts[3] not in (*ROLES, 'none'):
                raise ProtocolError('Incomplete or reordered Recycling checkpoint')
            state = dict(year_delta=integer(parts[2]), selected=None if parts[3] == 'none' else parts[3], owned_count=integer(parts[4]), mineral_delta=signed_integer(parts[5]), units=[])
        elif marker == 'RECYCLING_UNIT':
            if state is None or len(parts) != 4 or parts[1] not in ROLES:
                raise ProtocolError('Invalid native Recycling unit')
            state['units'].append(dict(role=parts[1], order_code=integer(parts[2]), movement_spent=integer(parts[3])))
        elif marker == 'RECYCLING_MENU':
            if state is None or 'root_open' in state or len(parts) != 3 or parts[1] not in ('true', 'false') or parts[2] not in ('none', '4'):
                raise ProtocolError('Invalid native Recycling visibility')
            state.update(root_open=parts[1] == 'true', child_header=None if parts[2] == 'none' else 4)
        elif marker == 'RECYCLING_NO_DIALOG':
            if state is None or 'dialog' in state or len(parts) != 1:
                raise ProtocolError('Duplicate or orphan Recycling dialog')
            state['dialog'] = None
        elif marker == 'RECYCLING_CAPTION':
            if state is None or 'dialog' in state or len(parts) != 2:
                raise ProtocolError('Duplicate or orphan Recycling caption')
            state['dialog'] = dict(caption=visible(parts[1]), choices=[], buttons=[])
        elif marker in ('RECYCLING_BODY', 'RECYCLING_CHOICE', 'RECYCLING_SELECTED', 'RECYCLING_BUTTON'):
            if state is None or not isinstance(state.get('dialog'), dict) or len(parts) != 2:
                raise ProtocolError('Orphan actual Recycling dialog field')
            dialog = state['dialog']
            if marker in ('RECYCLING_BODY', 'RECYCLING_SELECTED'):
                field = 'body' if marker == 'RECYCLING_BODY' else 'selected'
                if field in dialog:
                    raise ProtocolError('Duplicate actual Recycling dialog field')
                dialog[field] = visible(parts[1]) if field == 'body' else integer(parts[1])
            else:
                dialog['choices' if marker == 'RECYCLING_CHOICE' else 'buttons'].append(visible(parts[1]))
        elif marker == 'RECYCLING_STATE_DONE':
            if len(parts) != 1 or state is None:
                raise ProtocolError('Incomplete native Recycling checkpoint end')
            contract.validate_output(dict(trace=[state]), [])
            current['output']['trace'].append(state); state = None
        elif marker == 'RECYCLING_CASE_DONE':
            if len(parts) != 1 or state is not None:
                raise ProtocolError('Incomplete native Recycling case end')
            contract.validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current); current = None
        elif marker == 'RECYCLING_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('Missing native Recycling failure reason')
            results.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:]))); current = state = None
        else:
            raise ProtocolError('Unknown native Recycling marker')
    if current is not None or state is not None or [r['id'] for r in results] != [c['id'] for c in cases]:
        raise ProtocolError('Missing native Recycling cases')
    return results


def prepare(case):
    return dict(deepcopy(case['input']), id=case['id'], sources=[dict(name=name, source=text)
                for name, text in declarations(case['input']['text_profile']).items()])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/unit-recycling-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 2:
        raise ProtocolError('Recycling-menu adapter accepts two supported cases per request')
    if not supported:
        write_response(dict(name='glsmac-unit-recycling', kind='candidate', candidate_executed=False),
                       [dict(id=c['id'], status='unsupported', reason='Unknown Recycling-menu contract') for c in cases])
        return
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_unit_recycling_headless.gls.js').read_text()
    script = 'GLSMAC_data/tests/unit_recycling_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Recycling-menu probe shadows an existing test')
    inputs = [prepare(case) for case in supported]
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    snapshot[script] = 'const unit_recycling_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-unit-recycling-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != value for p, value in hashes.items()):
        raise ProtocolError('Recycling-menu worker failed or runtime changed: ' + str(args.log))
    results = iter(parse_candidate(process.stdout, supported))
    write_response(dict(name='glsmac-unit-recycling', kind='candidate', target='wasm-gse', rendering=False,
                        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
                        executed=['mounted MENU/Action/source9, modal key/button callbacks and shared native Tab navigation',
                                  'declared native spread/flat-arid terrain and actual city/unit ownership/readiness',
                                  'production command handlers, native mineral delta and surviving native units with mounted dialog text/choice state'],
                        mocked=['declared native city/unit/layout inputs', 'scene geometry/art/audio',
                                'synchronous frontend notifications and timer delivery without wall-clock waiting']),
                   [next(results) if c['algorithm'] == contract.ALGORITHM else dict(id=c['id'], status='unsupported', reason='Unknown Recycling-menu contract') for c in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native Recycling-menu candidate failed:', error, file=sys.stderr); sys.exit(1)
