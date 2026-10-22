#!/usr/bin/env python3
"""Click mounted Terraform controls and observe native work without supplying effects."""
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
from ui import terraform_menu_contract as contract
from ui.terraform_menu_inputs import declarations
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Terraform menu native execution failed: ' + text[-2500:])
    results, current = [], None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(TMENU_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|')
        if parts[0] == 'TMENU_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered Terraform menu case')
            current = dict(id=parts[1], status='ok', output={'trace': []})
        elif current is None:
            raise ProtocolError('Orphan Terraform menu marker')
        elif parts[0] == 'TMENU_STATE':
            if (len(parts) != 13 or parts[1] != str(len(current['output']['trace']))
                    or any(not re.fullmatch(r'0|[1-9][0-9]*', parts[i]) for i in (2, 5, 6))
                    or any(value not in ('true', 'false') for value in parts[7:12])
                    or parts[12] not in ('none', *map(str, range(9)))):
                raise ProtocolError('Incomplete, malformed or reordered Terraform menu checkpoint')
            current['output']['trace'].append(dict(year_delta=int(parts[2]), selected=None if parts[3] == 'none' else parts[3],
                order=parts[4], movement_spent=int(parts[5]), work_units=int(parts[6]),
                terrain=dict(zip(('road', 'farm', 'mine', 'forest'), (v == 'true' for v in parts[7:11]))),
                root_open=parts[11] == 'true', child_header=None if parts[12] == 'none' else int(parts[12])))
        elif parts[0] == 'TMENU_DONE':
            if len(parts) != 1:
                raise ProtocolError('Malformed Terraform menu completion')
            contract.validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current); current = None
        elif parts[0] == 'TMENU_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('Terraform menu failure has no reason')
            results.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:]))); current = None
        else:
            raise ProtocolError('Unknown Terraform menu marker')
    if current is not None or [row['id'] for row in results] != [case['id'] for case in cases]:
        raise ProtocolError('Missing Terraform menu cases or completion')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_terraform_menu_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/terraform-menu-headless.log')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 8:
        raise ProtocolError('Terraform menu adapter accepts at most eight cases')
    if not supported:
        write_response(dict(name='glsmac-terraform-menu', kind='candidate', candidate_executed=False),
                       [dict(id=case['id'], status='unsupported', reason='Unknown Terraform menu contract') for case in cases])
        return
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve()); template = args.template.read_text()
    script = 'GLSMAC_data/tests/terraform_menu_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Terraform menu probe shadows an existing script')
    inputs = []
    for case in supported:
        item = dict(case['input'], id=case['id'])
        item['sources'] = [dict(name=name, source=source) for name, source in declarations(item['text_profile']).items()]
        inputs.append(item)
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    # Separate native worlds retain substantial UI state. Bound memory with
    # fresh four-case workers, always sequential and sharing this frozen source.
    logs, parsed = [], []
    for offset in range(0, len(inputs), 4):
        snapshot[script] = 'const terraform_menu_inputs = ' + gse_literal(inputs[offset:offset + 4]) + ';\n' + template
        with tempfile.TemporaryDirectory(prefix='glsmac-terraform-menu-') as temporary:
            source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
            process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                text=True, capture_output=True, timeout=180, cwd=ROOT)
        logs.append(process.stdout + process.stderr)
        args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text('\n'.join(logs))
        if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != value for p, value in hashes.items()):
            raise ProtocolError('Terraform menu worker failed or runtime changed: ' + str(args.log))
        parsed.extend(parse_candidate(process.stdout, supported[offset:offset + 4]))
    results = iter(parsed)
    write_response(dict(name='glsmac-terraform-menu', kind='candidate', target='wasm-gse', rendering=False,
        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
        executed=['production UI startup and mounted MENU/header/terrain-row callbacks',
                  'native text parser and production TERRAIN work-rule consumer',
                  'production work handlers with native units/terrain and shared native selection',
                  'native city/citizen/companion guards and actual root/child visibility'],
        mocked=['declared city/resources, flat-arid Former tile and spread native 16x16 layout',
                'scene nodes/art/audio, direct pointer/key delivery and bounded timer delivery',
                'frontend event transport/selection notifications; geometry, hover and pixels omitted']),
        [next(results) if case['algorithm'] == contract.ALGORITHM else
         dict(id=case['id'], status='unsupported', reason='Unknown Terraform menu contract') for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Terraform menu candidate failed:', error, file=sys.stderr)
        sys.exit(1)
