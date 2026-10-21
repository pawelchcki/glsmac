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
from ui import starvation_notice_controls_contract as contract
from ui.starvation_dialog_headless import parse_candidate as parse_dialog_candidate
from ui.headless import gse_literal
from ui.starvation_dialog_inputs import declarations

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    rows = parse_dialog_candidate(text, cases)
    for row, case in zip(rows, cases, strict=True):
        if row['status'] == 'ok':
            contract.validate_output(row['output'], case['input']['actions'])
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_starvation_notice_controls_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/starvation-notice-controls-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported: contract.validate_input(case['input'])
    if len(supported) > 4: raise ProtocolError('Starvation adapter accepts four cases per worker')
    runtime = args.runtime.resolve(); hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve()); template = args.template.read_text()
    script = 'GLSMAC_data/tests/starvation_notice_controls_headless_probe.gls.js'
    if script in snapshot: raise ProtocolError('Starvation probe shadows an existing test')
    inputs = []
    for case in supported:
        data = dict(case['input'], id=case['id'])
        data['sources'] = [{'name': name, 'source': source} for name, source in declarations(data['text_profile']).items()]
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
    write_response({'name': 'glsmac-starvation-notice-controls', 'kind': 'candidate', 'target': 'wasm-gse',
                    'rendering': False, 'assets_required': False, 'runtime_sha256': hashes[runtime.with_suffix('.wasm')],
                    'scripts_sha256': digest,
                    'executed': ['native units/citizens and production preparation controls', 'native AdvanceTurn and production queued growth',
                                 'mounted production notice Escape, Shift+Escape and suppression click',
                                 'mounted management HUD/project and visible native-driven TURN COMPLETE',
                                 'installed-text parser/consumer'],
                    'mocked': ['declared synthetic initial world and component definitions', 'display nodes and omitted icon-cell rendering',
                               'synchronous frontend delivery and transport acknowledgements',
                               'initial ready-state delivery from native exhausted selection', 'rendering/audio omitted']},
                   [next(rows) if case['algorithm'] == contract.ALGORITHM else {'id': case['id'], 'status': 'unsupported', 'reason': 'unknown starvation dialog contract'} for case in cases])


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native starvation candidate failed:', error, file=sys.stderr); sys.exit(1)
