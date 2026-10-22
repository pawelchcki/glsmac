#!/usr/bin/env python3
"""Observe native Colony founding through mounted Action controls and text input."""
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
from ui import colony_found_menu_contract as contract
from ui.colony_found_menu_inputs import declarations
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
ROLES = ('scout', 'former', 'colony')


def integer(value):
    if not re.fullmatch(r'0|[1-9][0-9]*', value):
        raise ProtocolError('Invalid native founding integer')
    return int(value)


def visible(value):
    return ' '.join(value.split()).upper()


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native founding execution did not complete: ' + text[-2500:])
    results, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(FOUND_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'FOUND_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered founding case')
            current = dict(id=parts[1], status='ok', output=dict(trace=[]))
        elif current is None:
            raise ProtocolError('Orphan native founding marker')
        elif marker == 'FOUND_STATE':
            if len(parts) != 5 or state is not None or parts[1] != str(len(current['output']['trace'])) or parts[3] not in (*ROLES, 'none'):
                raise ProtocolError('Incomplete or reordered founding checkpoint')
            state = dict(year_delta=integer(parts[2]), selected=None if parts[3] == 'none' else parts[3],
                         owned_count=integer(parts[4]), units=[])
        elif marker in ('FOUND_BASE', 'FOUND_NO_BASE'):
            if state is None or 'new_base' in state:
                raise ProtocolError('Orphan or duplicate native new city')
            if marker == 'FOUND_NO_BASE' and len(parts) == 1:
                state['new_base'] = None
            elif marker == 'FOUND_BASE' and len(parts) == 6:
                state['new_base'] = dict(name=parts[1], **dict(zip(('population', 'workers', 'doctors', 'worked_tiles'), map(integer, parts[2:]))))
            else:
                raise ProtocolError('Invalid native new city fields')
        elif marker == 'FOUND_UNIT':
            if state is None or len(parts) != 4 or parts[1] not in ROLES:
                raise ProtocolError('Invalid native founding unit')
            state['units'].append(dict(role=parts[1], order_code=integer(parts[2]), movement_spent=integer(parts[3])))
        elif marker == 'FOUND_MENU':
            if state is None or 'root_open' in state or len(parts) != 3 or parts[1] not in ('true', 'false') or parts[2] not in ('none', '4'):
                raise ProtocolError('Invalid native founding menu visibility')
            state.update(root_open=parts[1] == 'true', child_header=None if parts[2] == 'none' else 4)
        elif marker == 'FOUND_NO_DIALOG':
            if state is None or 'dialog' in state or len(parts) != 1:
                raise ProtocolError('Invalid or duplicate native empty dialog')
            state['dialog'] = None
        elif marker == 'FOUND_CAPTION':
            if state is None or 'dialog' in state or len(parts) != 2:
                raise ProtocolError('Invalid or duplicate native dialog caption')
            state['dialog'] = dict(caption=visible(parts[1]), buttons=[])
        elif marker in ('FOUND_LABEL', 'FOUND_VALUE', 'FOUND_BUTTON'):
            if state is None or not isinstance(state.get('dialog'), dict) or len(parts) != 2:
                raise ProtocolError('Orphan native founding dialog field')
            dialog = state['dialog']
            if marker == 'FOUND_BUTTON':
                dialog['buttons'].append(visible(parts[1]))
            else:
                field = 'label' if marker == 'FOUND_LABEL' else 'value'
                if field in dialog:
                    raise ProtocolError('Duplicate native founding dialog field')
                dialog[field] = visible(parts[1])
        elif marker == 'FOUND_STATE_DONE':
            if len(parts) != 1 or state is None:
                raise ProtocolError('Incomplete native founding checkpoint end')
            contract.validate_output(dict(trace=[state]), [])
            current['output']['trace'].append(state); state = None
        elif marker == 'FOUND_CASE_DONE':
            if len(parts) != 1 or state is not None:
                raise ProtocolError('Incomplete native founding case end')
            contract.validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current); current = None
        elif marker == 'FOUND_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('Missing native founding failure reason')
            results.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:]))); current = state = None
        else:
            raise ProtocolError('Unknown native founding marker')
    if current is not None or state is not None or [r['id'] for r in results] != [c['id'] for c in cases]:
        raise ProtocolError('Missing native founding cases')
    return results


def prepare(case):
    data = deepcopy(case['input'])
    for action in data['actions']:
        if isinstance(action, dict) and 'edit' in action:
            action['keys'] = list(action['edit'])
    return dict(data, id=case['id'], sources=[dict(name=name, source=text)
                for name, text in declarations(data['text_profile']).items()])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/colony-found-menu-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 2:
        raise ProtocolError('Founding adapter accepts two supported cases per request')
    if not supported:
        write_response(dict(name='glsmac-colony-found-menu', kind='candidate', candidate_executed=False),
                       [dict(id=c['id'], status='unsupported', reason='Unknown founding menu contract') for c in cases])
        return
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(); template = (DIRECTORY / '_colony_found_menu_headless.gls.js').read_text()
    script = 'GLSMAC_data/tests/colony_found_menu_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Founding probe shadows an existing test')
    inputs = [prepare(case) for case in supported]
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    snapshot[script] = 'const colony_found_menu_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-colony-found-menu-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != value for p, value in hashes.items()):
        raise ProtocolError('Founding worker failed or runtime changed: ' + str(args.log))
    results = iter(parse_candidate(process.stdout, supported))
    write_response(dict(name='glsmac-colony-found-menu', kind='candidate', target='wasm-gse', rendering=False,
                        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
                        executed=['native declared name pool installed before players/city', 'mounted MENU/Action/source0 controls',
                                  'actual native InputState editing and production dialog callbacks',
                                  'production event handlers and native city/unit/selection authority'],
                        mocked=['declared distant city/unit/terrain inputs', 'scene nodes/geometry/art/audio',
                                'synchronous frontend notifications and bounded UI timers']),
                   [next(results) if c['algorithm'] == contract.ALGORITHM else dict(id=c['id'], status='unsupported', reason='Unknown founding menu contract') for c in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native founding candidate failed:', error, file=sys.stderr); sys.exit(1)
