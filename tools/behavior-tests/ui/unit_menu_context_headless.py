#!/usr/bin/env python3
"""Observe Action rows after initial native Tab navigation without supplying effects."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, canonical, load_request, write_response
from ui import unit_menu_context_contract as contract
from ui.unit_menu_context_inputs import declarations
from ui.ingame_menu_headless import parse_candidate
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_unit_menu_context_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/unit-menu-context-headless.log')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 12:
        raise ProtocolError('Unit-menu adapter accepts twelve supported cases per request')
    if not supported:
        write_response(dict(name='glsmac-unit-menu-context', kind='candidate', candidate_executed=False),
                       [dict(id=case['id'], status='unsupported', reason='Unknown unit-menu contract') for case in cases])
        return
    runtime = args.runtime.resolve()
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve())
    template = args.template.read_text()
    script = 'GLSMAC_data/tests/unit_menu_context_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Unit-menu probe shadows an existing test')
    inputs = []
    for case in supported:
        item = dict(case['input'], id=case['id'])
        item['sources'] = [dict(name=name, source=source) for name, source in declarations(item['text_profile']).items()]
        inputs.append(item)
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    # Each batch keeps the same declared native worlds/actions and guards, but
    # releases its GSE state before starting another isolated four-case worker.
    logs, parsed = [], []
    for offset in range(0, len(inputs), 4):
        batch = supported[offset:offset + 4]
        snapshot[script] = 'const unit_menu_context_inputs = ' + gse_literal(inputs[offset:offset + 4]) + ';\n' + template
        with tempfile.TemporaryDirectory(prefix='glsmac-unit-menu-context-') as temporary:
            source = Path(temporary) / 'scripts.json'
            source.write_text(canonical(snapshot))
            process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                     input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                                     text=True, capture_output=True, timeout=240, cwd=ROOT)
        logs.append(process.stdout + process.stderr)
        args.log.parent.mkdir(parents=True, exist_ok=True)
        args.log.write_text('\n'.join(logs))
        if process.returncode or any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
            raise ProtocolError('Unit-menu worker failed or runtime changed: ' + str(args.log))
        observed = parse_candidate(process.stdout, batch)
        for result, case in zip(observed, batch, strict=True):
            if result['status'] == 'ok':
                contract.validate_output(result['output'], case['input']['actions'])
        parsed.extend(observed)
    results = iter(parsed)
    write_response(dict(name='glsmac-unit-menu-context', kind='candidate', target='wasm-gse', rendering=False,
                        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
                        executed=['production game UI startup and mounted MENU/header/source-row click callbacks',
                                  'native installed-text parser with declared synthetic source profiles',
                                  'production key callbacks and shared native Tab navigation',
                                  'shipped event validators/apply handlers and native readiness/selection delivery',
                                  'mounted menu labels, separators and declared text-color palette',
                                  'authoritative native city/citizen/resources/global membership and unit orders/movement/selection'],
                        mocked=['declared city/resources, synthetic installed text and native 16x16 world',
                                'scene nodes/art/audio and explicit keyboard/click delivery',
                                'synchronous frontend command/selection notifications and bounded UI timer delivery',
                                'production class declaration capture; geometry, focus, hover and pixels omitted']),
                   [next(results) if case['algorithm'] == contract.ALGORITHM else
                    dict(id=case['id'], status='unsupported', reason='Unknown unit-menu contract') for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native unit-menu candidate failed:', error, file=sys.stderr)
        sys.exit(1)
