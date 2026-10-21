#!/usr/bin/env python3
"""Replay production in-game menu controls and observe native companion state."""
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
from ui import ingame_menu_contract as contract
from ui.ingame_menu_inputs import declarations
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def tone(color):
    """Classify actual declared candidate palette; unknown colors fail closed."""
    palette = {'rgb(176,212,235)': 'light', 'black': 'dark'}
    color = ''.join(color.lower().split())
    if color not in palette:
        raise ProtocolError('Unknown actual production menu text color: ' + color)
    return palette[color]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native in-game menu execution failed: ' + text[-2500:])
    results, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(IMENU_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|')
        marker = parts[0]
        if marker == 'IMENU_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered in-game menu case')
            current = dict(id=parts[1], status='ok', output={'trace': []})
        elif current is None:
            raise ProtocolError('Orphan in-game menu marker')
        elif marker == 'IMENU_STATE':
            if (state is not None or len(parts) != 5 or parts[1] != str(len(current['output']['trace']))
                    or parts[2] not in ('map', 'menu') or parts[3] != '0'
                    or parts[4] not in ('scout', 'former', 'colony', 'none')):
                raise ProtocolError('Invalid or reordered in-game menu checkpoint')
            state = dict(after_action=int(parts[1]) - 1, screen=parts[2], year_delta=int(parts[3]),
                         selected=None if parts[4] == 'none' else parts[4], units=[],
                         menu=None if parts[2] == 'map' else dict(headers=[], child=None))
        elif marker == 'IMENU_NAME':
            if state is None or len(parts) != 2 or 'base' in state:
                raise ProtocolError('Invalid or duplicate native menu base name')
            state['base'] = dict(name=parts[1])
        elif marker == 'IMENU_BASE':
            if (state is None or 'base' not in state or len(state['base']) != 1 or len(parts) != 6
                    or any(not re.fullmatch(r'0|[1-9][0-9]*', part) for part in parts[1:])):
                raise ProtocolError('Invalid or duplicate native menu citizens')
            state['base'].update(zip(('population', 'workers', 'doctors', 'worked_tiles', 'owned_count'), map(int, parts[1:])))
        elif marker == 'IMENU_UNIT':
            if (state is None or len(parts) != 4 or len(state['units']) >= 3
                    or parts[1] != ('scout', 'former', 'colony')[len(state['units'])]
                    or parts[2] not in ('0', '1', '2') or parts[3] not in ('0', '1', '2', '3')):
                raise ProtocolError('Invalid or reordered native menu companion')
            state['units'].append(dict(role=parts[1], order_code=int(parts[2]), movement_spent=int(parts[3])))
        elif marker == 'IMENU_HEADER':
            if (state is None or state['menu'] is None or len(parts) != 4 or state['menu']['child'] is not None
                    or len(state['menu']['headers']) >= 9 or parts[1] != str(len(state['menu']['headers']))
                    or parts[2] not in ('true', 'false')):
                raise ProtocolError('Invalid or reordered actual menu header')
            state['menu']['headers'].append(dict(label=contract.normalize(parts[3]), active=parts[2] == 'true'))
        elif marker == 'IMENU_CHILD':
            if (state is None or state['menu'] is None or len(parts) != 2
                    or len(state['menu']['headers']) != 9 or state['menu']['child'] is not None
                    or not re.fullmatch('[0-8]', parts[1])):
                raise ProtocolError('Invalid or duplicate actual child menu')
            state['menu']['child'] = dict(header_index=int(parts[1]), rows=[])
        elif marker in ('IMENU_ROW', 'IMENU_SEPARATOR'):
            if state is None or state['menu'] is None or state['menu']['child'] is None:
                raise ProtocolError('Orphan actual child menu row')
            if marker == 'IMENU_SEPARATOR' and len(parts) == 1:
                row = dict(separator=True)
            elif marker == 'IMENU_ROW' and len(parts) == 3:
                row = dict(label=contract.normalize(parts[2]), tone=tone(parts[1]))
            else:
                raise ProtocolError('Invalid actual child menu row marker')
            state['menu']['child']['rows'].append(row)
        elif marker == 'IMENU_STATE_DONE':
            if len(parts) != 1 or state is None:
                raise ProtocolError('Orphan in-game menu checkpoint end')
            contract.validate_output({'trace': [dict(state, after_action=-1)]}, [])
            current['output']['trace'].append(state)
            state = None
        elif marker == 'IMENU_CASE_DONE':
            if len(parts) != 1 or state is not None:
                raise ProtocolError('Incomplete in-game menu case')
            contract.validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current)
            current = None
        elif marker == 'IMENU_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('Missing native in-game menu failure reason')
            results.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:])))
            current = state = None
        else:
            raise ProtocolError('Unknown in-game menu marker')
    if current is not None or state is not None or [row['id'] for row in results] != [case['id'] for case in cases]:
        raise ProtocolError('Missing native in-game menu cases')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_ingame_menu_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/ingame-menus-headless.log')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 12:
        raise ProtocolError('In-game menu adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve())
    template = args.template.read_text()
    script = 'GLSMAC_data/tests/ingame_menu_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('In-game menu probe shadows an existing test')
    inputs = []
    for case in supported:
        item = dict(case['input'], id=case['id'])
        item['sources'] = [dict(name=name, source=source) for name, source in declarations(item['text_profile']).items()]
        inputs.append(item)
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    snapshot[script] = 'const ingame_menu_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-ingame-menus-') as temporary:
        source = Path(temporary) / 'scripts.json'
        source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                                 text=True, capture_output=True, timeout=240, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
        raise ProtocolError('In-game menu worker failed or runtime changed: ' + str(args.log))
    results = iter(parse_candidate(process.stdout, supported))
    write_response(dict(name='glsmac-ingame-menus', kind='candidate', target='wasm-gse', rendering=False,
                        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
                        executed=['production game UI startup, MENU/header clicks and Escape callbacks',
                                  'native installed-text parser when requested by production menu controls',
                                  'mounted header/child labels, separators and declared text-color palette',
                                  'native city/citizen/ownership/position/resources/membership guards',
                                  'native companion identities, orders, movement and selection'],
                        mocked=['declared city/resources, synthetic installed menu text and native 16x16 world',
                                'scene nodes/art/audio and explicit child-first keyboard/click delivery',
                                'production class declaration capture; geometry, focus, hover and pixel rendering omitted']),
                   [next(results) if case['algorithm'] == contract.ALGORITHM else
                    dict(id=case['id'], status='unsupported', reason='Unknown in-game menu contract') for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native in-game menu candidate failed:', error, file=sys.stderr)
        sys.exit(1)
