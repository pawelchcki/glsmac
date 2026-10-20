#!/usr/bin/env python3
"""Read actual production base-resource labels without pixel rendering."""
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
from ui import base_resource_hud_contract as contract
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native resource HUD execution failed: ' + text[-2500:])
    results, current, state = [], None, None
    for line in text.splitlines():
        found = re.search(r'(?:^|\] )(HUD_.*)$', line)
        if not found:
            continue
        parts = found[1].split('|')
        marker = parts[0]
        if marker == 'HUD_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered resource HUD case')
            current = {'id': parts[1], 'status': 'ok', 'output': {'trace': []}}
        elif current is None:
            raise ProtocolError('Orphan resource HUD observation')
        elif marker == 'HUD_OPEN':
            if state is not None or len(parts) != 3 or any(not re.fullmatch(r'0|[1-9][0-9]*', v) for v in parts[1:]):
                raise ProtocolError('Invalid or incomplete resource HUD opening')
            state = dict(after_action=int(parts[1]), population=int(parts[2]), rows={}, allocation={})
        elif marker == 'HUD_RESOURCE':
            if state is None or len(parts) != 4 or parts[1] not in contract.RESOURCES or parts[1] in state['rows']:
                raise ProtocolError('Invalid or duplicate resource HUD row')
            left = re.fullmatch(r'([0-9]{3}) - ([0-9]{3})', parts[2])
            right = re.fullmatch(r'(?:= )?([+-]?[0-9]{3})', parts[3])
            if not left or not right:
                raise ProtocolError('Unrecognized actual resource label')
            state['rows'][parts[1]] = dict(intake=int(left[1]), consumption=int(left[2]), net=int(right[1]),
                                          visible_left=parts[2], visible_right=parts[3])
        elif marker == 'HUD_STATUS':
            if state is None or 'status' in state or len(parts) != 2 or not re.fullmatch(r'= [A-Z]+', parts[1]):
                raise ProtocolError('Invalid or duplicate actual resource status')
            state['status'] = parts[1][2:]
        elif marker == 'HUD_ALLOCATION':
            if state is None or len(parts) != 6 or parts[1] not in contract.ALLOCATIONS or parts[1] in state['allocation']:
                raise ProtocolError('Invalid or duplicate energy allocation row')
            percent = re.fullmatch(r'([0-9]{1,3})%', parts[2].strip())
            if not percent or any(not re.fullmatch(r'[0-9]{1,3}', v.strip()) for v in parts[3:]):
                raise ProtocolError('Unrecognized actual energy allocation label')
            state['allocation'][parts[1]] = dict(zip(('percent', 'energy', 'bonus', 'total'),
                                                     [int(percent[1]), *map(int, parts[3:])]))
        elif marker == 'HUD_OPEN_DONE':
            if len(parts) != 1 or state is None:
                raise ProtocolError('Orphan resource HUD opening end')
            contract.validate_checkpoint(state)
            current['output']['trace'].append(state)
            state = None
        elif marker == 'HUD_CASE_DONE':
            if len(parts) != 1 or state is not None:
                raise ProtocolError('Incomplete resource HUD case')
            contract.validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current)
            current = None
        else:
            raise ProtocolError('Unknown resource HUD marker')
    if current is not None or state is not None or [r['id'] for r in results] != [c['id'] for c in cases]:
        raise ProtocolError('Missing resource HUD cases')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/base-resource-hud-headless.log')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [c for c in cases if c['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 12:
        raise ProtocolError('Resource HUD adapter accepts twelve cases per worker')
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve())
    template = (DIRECTORY / '_base_resource_hud_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(snapshot) + template).encode()).hexdigest()
    script = 'GLSMAC_data/tests/base_resource_hud_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Resource HUD probe shadows an existing test')
    snapshot[script] = 'const hud_inputs = ' + gse_literal(supported) + ';\n' + template
    with tempfile.TemporaryDirectory(prefix='glsmac-base-hud-') as temporary:
        path = Path(temporary) / 'scripts.json'
        path.write_text(canonical(snapshot))
        process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                 input=canonical(dict(runtime=str(runtime), snapshot=str(path), script=script, prefix=temporary)),
                                 text=True, capture_output=True, timeout=180, cwd=ROOT)
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text(process.stdout + process.stderr)
    if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != h for p, h in hashes.items()):
        raise ProtocolError('Resource HUD worker failed or runtime changed: ' + str(args.log))
    rows = iter(parse_candidate(process.stdout, supported))
    write_response(dict(name='glsmac-base-resource-hud', kind='candidate', target='wasm-gse', rendering=False,
                        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
                        executed=['production joining and management preparation', 'native base intake and consumption',
                                  'shipped resource callback and resource/energy label updates',
                                  'actual production popup open/close and native citizens'],
                        mocked=['declared initial city and equivalent four-wide geometry', 'display nodes and transport',
                                'resource icon cell drawing omitted; actual text updates execute']),
                   [next(rows) if c['algorithm'] == contract.ALGORITHM else
                    dict(id=c['id'], status='unsupported', reason='Unknown resource HUD contract') for c in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Native resource HUD failed:', error, file=sys.stderr)
        sys.exit(1)
