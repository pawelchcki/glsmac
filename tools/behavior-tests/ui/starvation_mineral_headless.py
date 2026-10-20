#!/usr/bin/env python3
"""Replay native mineral processing through actual preparation, turn and notice controls."""
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
from ui import starvation_mineral_contract as contract
from ui.headless import gse_literal
from ui.starvation_dialog_inputs import declarations

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native mineral execution failed: ' + text[-2500:])
    rows, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(MINERAL_.*)$', line)
        if not match: continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'MINERAL_CASE':
            if len(parts) != 2 or current is not None or len(rows) >= len(cases) or parts[1] != cases[len(rows)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered mineral case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan mineral marker')
        elif marker == 'MINERAL_STATE':
            if len(parts) != 8 or state is not None or any(not re.fullmatch(r'0|[1-9][0-9]*', p) for p in parts[2:]):
                raise ProtocolError('Malformed mineral checkpoint')
            state = dict(zip(('year_delta', 'population', 'workers', 'doctors', 'worked_tiles', 'minerals'), map(int, parts[2:])))
            state.update(stage=parts[1], units=[])
        elif marker == 'MINERAL_UNIT':
            if state is None or len(parts) != 4 or parts[1] not in ('scout', 'former', 'colony') or parts[2] not in ('0', '1', '2') or parts[3] not in ('0', '1', '2', '3'):
                raise ProtocolError('Malformed native mineral companion')
            state['units'].append({'role': parts[1], 'order_code': int(parts[2]), 'movement_spent': int(parts[3])})
        elif marker == 'MINERAL_STATE_DONE':
            if len(parts) != 1 or state is None: raise ProtocolError('Orphan mineral checkpoint end')
            current['output']['trace'].append(state); state = None
        elif marker == 'MINERAL_CASE_DONE':
            if len(parts) != 1 or state is not None: raise ProtocolError('Incomplete mineral case')
            contract.validate_output(current['output'], cases[len(rows)]['input']['mode'])
            rows.append(current); current = None
        elif marker == 'MINERAL_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]): raise ProtocolError('Missing mineral failure reason')
            rows.append({'id': current['id'], 'status': 'error', 'reason': '|'.join(parts[1:])}); current = state = None
        else:
            raise ProtocolError('Unknown native mineral marker')
    if current is not None or state is not None or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('Missing native mineral cases')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_starvation_mineral_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/starvation-mineral-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported: contract.validate_input(case['input'])
    if len(supported) > 2: raise ProtocolError('Mineral adapter accepts two cases per worker')
    runtime = args.runtime.resolve(); hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve()); template = args.template.read_text()
    script = 'GLSMAC_data/tests/starvation_mineral_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Starvation probe shadows an existing test')
    inputs = []
    for case in supported:
        data = dict(case['input'], id=case['id'])
        data['sources'] = [{'name': name, 'source': source} for name, source in declarations('default').items()]
        inputs.append(data)
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    snapshot[script] = 'const mineral_inputs = ' + gse_literal(inputs) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-mineral-') as temporary:
        source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical({'runtime': str(runtime), 'snapshot': str(source), 'script': script, 'prefix': temporary}),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('Starvation worker failed or runtime changed; inspect ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response({'name': 'glsmac-starvation-mineral', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['native units/citizens and production preparation controls', 'native AdvanceTurn, mineral production and queued growth with real pending confirmation',
                                 'production popup controls and installed-text parser/consumer'],
                    'mocked': ['declared 4x4 native world and synthetic component/text inputs; non-completing project price', 'display and icon drawing',
                               'frontend delivery and transport acknowledgements', 'rendering/audio omitted']},
                   [next(rows) if case['algorithm'] == contract.ALGORITHM else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown starvation dialog contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native starvation candidate failed:', error, file=sys.stderr); sys.exit(1)
