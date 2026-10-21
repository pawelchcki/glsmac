#!/usr/bin/env python3
"""Replay the mounted production Rename button against native city/unit state."""
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
from ui import base_rename_contract as contract
from ui.base_rename_inputs import declarations
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def normalize(value):
    return ' '.join(value.replace('’', "'").split()).upper()


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native Rename execution failed: ' + text[-2500:])
    rows, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(RENAME_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|')
        marker = parts[0]
        if marker == 'RENAME_CASE':
            if len(parts) != 2 or current is not None or len(rows) >= len(cases) or parts[1] != cases[len(rows)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered Rename case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan Rename marker')
        elif marker == 'RENAME_STATE':
            if (state is not None or len(parts) != 5 or parts[1] != str(len(current['output']['trace']))
                    or parts[2] not in ('map', 'base', 'rename') or parts[3] != '0'
                    or parts[4] not in ('scout', 'former', 'colony', 'none')):
                raise ProtocolError('Invalid or reordered Rename checkpoint')
            state = dict(after_action=int(parts[1]) - 1, screen=parts[2], title=None, year_delta=int(parts[3]),
                         selected=None if parts[4] == 'none' else parts[4], units=[], dialog=None)
        elif marker == 'RENAME_TITLE':
            if state is None or len(parts) != 2 or state['screen'] == 'map' or state['title'] is not None:
                raise ProtocolError('Invalid or duplicate management title')
            state['title'] = normalize(parts[1])
        elif marker == 'RENAME_NAME':
            if state is None or len(parts) != 2 or 'base' in state:
                raise ProtocolError('Invalid or duplicate native Rename name')
            state['base'] = {'name': parts[1]}
        elif marker == 'RENAME_BASE':
            if (state is None or 'base' not in state or len(state['base']) != 1 or len(parts) != 6
                    or any(not re.fullmatch(r'0|[1-9][0-9]*', p) for p in parts[1:])):
                raise ProtocolError('Invalid or duplicate Rename citizens')
            state['base'].update(zip(('population', 'workers', 'doctors', 'worked_tiles', 'owned_count'), map(int, parts[1:])))
        elif marker == 'RENAME_UNIT':
            if (state is None or len(parts) != 4 or parts[1] not in ('scout', 'former', 'colony')
                    or parts[2] not in ('0', '1', '2') or parts[3] not in ('0', '1', '2', '3')):
                raise ProtocolError('Invalid native Rename companion')
            state['units'].append(dict(role=parts[1], order_code=int(parts[2]), movement_spent=int(parts[3])))
        elif marker in ('RENAME_CAPTION', 'RENAME_PROMPT', 'RENAME_LABEL', 'RENAME_VALUE', 'RENAME_BUTTON'):
            if state is None or state['screen'] != 'rename' or len(parts) != 2:
                raise ProtocolError('Invalid actual Rename dialog marker')
            if state['dialog'] is None:
                state['dialog'] = {'buttons': []}
            key = marker.removeprefix('RENAME_').lower()
            if key == 'button':
                state['dialog']['buttons'].append(normalize(parts[1]))
            else:
                if key in state['dialog']:
                    raise ProtocolError('Duplicate actual Rename dialog text')
                state['dialog'][key] = normalize(parts[1])
        elif marker == 'RENAME_STATE_DONE':
            if len(parts) != 1 or state is None:
                raise ProtocolError('Orphan Rename checkpoint end')
            contract.validate_output({'trace': [dict(state, after_action=-1)]}, [])
            current['output']['trace'].append(state)
            state = None
        elif marker == 'RENAME_CASE_DONE':
            if len(parts) != 1 or state is not None:
                raise ProtocolError('Incomplete Rename case')
            contract.validate_output(current['output'], cases[len(rows)]['input']['actions'])
            rows.append(current)
            current = None
        elif marker == 'RENAME_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('Missing native Rename failure reason')
            rows.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:])))
            current = state = None
        else:
            raise ProtocolError('Unknown native Rename marker')
    if current is not None or state is not None or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('Missing native Rename cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_base_rename_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/base-rename-headless.log')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 11:
        raise ProtocolError('Rename adapter accepts eleven cases per worker')
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve())
    template = args.template.read_text()
    script = 'GLSMAC_data/tests/base_rename_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Rename probe shadows an existing test')
    inputs = []
    for case in supported:
        item = dict(case['input'], id=case['id'])
        item['actions'] = [dict(action, keys=list(action['edit'])) if isinstance(action, dict) else action for action in item['actions']]
        item['sources'] = [dict(name=name, source=source) for name, source in declarations(item['text_profile']).items()]
        inputs.append(item)
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    snapshot[script] = 'const rename_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-base-rename-') as temporary:
        source = Path(temporary) / 'scripts.json'
        source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != value for p, value in hashes.items()):
        raise ProtocolError('Rename worker failed or runtime changed: ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response(dict(name='glsmac-base-rename', kind='candidate', target='wasm-gse', rendering=False,
                        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
                        executed=['mounted production Rename controls and installed Script/labels parser', 'shared native InputState raw keys and production field maximum',
                                  'authoritative native rename event, ordinary base notifications and title refresh', 'full production management sections and title',
                                  'native city name/citizen/ownership/position/membership guards', 'native companion units and selection'],
                        mocked=['declared initial city name/citizens/resources, synthetic installed text and 16x16 geometry',
                                'scene nodes/art/audio, explicit click transport and synchronous frontend acknowledgements',
                                'raw key delivery into shared production native InputState; native rendering/focus omitted']),
                   [next(rows) if case['algorithm'] == contract.ALGORITHM else
                    dict(id=case['id'], status='unsupported', reason='Unknown Rename contract') for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native Rename candidate failed:', error, file=sys.stderr)
        sys.exit(1)
