#!/usr/bin/env python3
"""Replay native production starvation processing and actual popup controls."""
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
from ui import starvation_dialog_contract as contract
from ui.headless import gse_literal
from ui.starvation_dialog_inputs import declarations

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native starvation execution failed: ' + text[-2500:])
    rows, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(STARVE_.*)$', line)
        if not match: continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'STARVE_CASE':
            if len(parts) != 2 or current is not None or len(rows) >= len(cases) or parts[1] != cases[len(rows)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered starvation case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan starvation marker')
        elif marker == 'STARVE_STATE':
            if len(parts) != 4 or state is not None or parts[1] != str(len(current['output']['trace'])) or parts[2] not in ('0', '1') or parts[3] not in ('notice', 'base', 'map'):
                raise ProtocolError('Invalid or reordered starvation checkpoint')
            state = {'after_action': int(parts[1]) - 1, 'year_delta': int(parts[2]), 'screen': parts[3], 'units': [], 'dialog': None}
            if parts[3] == 'notice': state['dialog'] = {'caption': None, 'body': [], 'choices': [], 'selected': None, 'buttons': []}
        elif marker == 'STARVE_BASE':
            if state is None or 'base' in state or len(parts) != 6 or any(not re.fullmatch(r'0|[1-9][0-9]*', p) for p in parts[1:]):
                raise ProtocolError('Invalid or duplicate starvation citizens')
            state['base'] = dict(zip(('population', 'workers', 'doctors', 'worked_tiles', 'owned_count'), map(int, parts[1:])))
        elif marker == 'STARVE_UNIT':
            if state is None or len(parts) != 4 or parts[1] not in ('scout', 'former') or parts[2] not in ('0', '1', '2') or parts[3] not in ('0', '1', '2', '3'):
                raise ProtocolError('Invalid native starvation companion')
            state['units'].append({'role': parts[1], 'order_code': int(parts[2]), 'movement_spent': int(parts[3])})
        elif marker in ('STARVE_NAME', 'STARVE_CAPTION', 'STARVE_BODY', 'STARVE_CHOICE', 'STARVE_SELECTED', 'STARVE_BUTTON'):
            if state is None or state['dialog'] is None or len(parts) != 2 or not parts[1]: raise ProtocolError('Invalid starvation notification marker')
            dialog = state['dialog']; value = ' '.join(parts[1].replace('’', "'").split()).upper()
            if marker == 'STARVE_NAME':
                if 'native_name' in state: raise ProtocolError('Duplicate starvation native name')
                state['native_name'] = value
            elif marker == 'STARVE_CAPTION':
                if dialog['caption'] is not None: raise ProtocolError('Duplicate starvation caption')
                dialog['caption'] = value
            elif marker == 'STARVE_BODY': dialog['body'].append(value)
            elif marker == 'STARVE_CHOICE': dialog['choices'].append(value)
            elif marker == 'STARVE_BUTTON': dialog['buttons'].append(value)
            else:
                if dialog['selected'] is not None or parts[1] not in ('0', '1'): raise ProtocolError('Invalid starvation highlight')
                dialog['selected'] = int(parts[1])
        elif marker == 'STARVE_STATE_DONE':
            if len(parts) != 1 or state is None: raise ProtocolError('Orphan starvation checkpoint end')
            if state['dialog'] is not None:
                if 'native_name' not in state or not state['dialog']['body']: raise ProtocolError('Missing starvation body/name')
                name = state.pop('native_name'); state['dialog']['body'] = ' '.join(state['dialog']['body']).replace(name, '{BASE}')
            # Validate each checkpoint before admitting it to a completed trace.
            contract.validate_output({'trace': [dict(state, after_action=-1)]}, [])
            current['output']['trace'].append(state); state = None
        elif marker == 'STARVE_CASE_DONE':
            if len(parts) != 1 or state is not None: raise ProtocolError('Incomplete starvation case')
            contract.validate_output(current['output'], cases[len(rows)]['input']['actions'])
            rows.append(current); current = None
        elif marker == 'STARVE_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]): raise ProtocolError('Missing native starvation failure reason')
            rows.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = state = None
        else:
            raise ProtocolError('Unknown native starvation marker')
    if current is not None or state is not None or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('Missing native starvation cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_starvation_dialog_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/starvation-dialog-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported: contract.validate_input(case['input'])
    if len(supported) > 5: raise ProtocolError('Starvation adapter accepts five cases per worker')
    runtime = args.runtime.resolve(); hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve()); template = args.template.read_text()
    script = 'GLSMAC_data/tests/starvation_dialog_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Starvation probe shadows an existing test')
    inputs = []
    for case in supported:
        data = dict(case['input'], id=case['id'])
        data['sources'] = [{'name': name, 'source': source} for name, source in declarations(data['text_profile']).items()]
        data['has_popup'] = int('GLSMAC_data/default/ui/parts/game/popup/starvation.gls.js' in snapshot)
        inputs.append(data)
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    snapshot[script] = 'const starvation_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-starvation-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical({'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('Starvation worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-starvation-dialog', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['native units/citizens and production preparation controls', 'native AdvanceTurn and production queued growth',
                                 'production popup controls and installed-text parser/consumer'],
                    'mocked': ['declared synthetic initial world and component definitions', 'display and resource yields',
                               'frontend delivery and transport acknowledgements', 'rendering/audio omitted']},
                   [next(rows) if case['algorithm'] == contract.ALGORITHM else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown starvation dialog contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native starvation candidate failed:', error, file=sys.stderr); sys.exit(1)
