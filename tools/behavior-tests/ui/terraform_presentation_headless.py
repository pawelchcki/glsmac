#!/usr/bin/env python3
"""Project actual mounted Terraform presentation across native navigation."""
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
from ui import terraform_presentation_contract as contract
from ui.terraform_presentation_inputs import declarations
from ui.headless import gse_literal
from ui.ingame_menu_headless import tone
from ui.ingame_menu_contract import normalize

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Terraform presentation native execution failed: ' + text[-2500:])
    results, current, state = [], None, None
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(TPRESENT_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'TPRESENT_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Unknown, duplicate or reordered presentation case')
            current = dict(id=parts[1], status='ok', output={'trace': []})
        elif current is None:
            raise ProtocolError('Orphan Terraform presentation marker')
        elif marker == 'TPRESENT_STATE':
            if (state is not None or len(parts) != 5 or parts[1] != str(len(current['output']['trace']))
                    or parts[2] != '0' or parts[3] not in ('none', 'scout', 'former', 'colony')
                    or parts[4] not in ('true', 'false')):
                raise ProtocolError('Incomplete or reordered native presentation checkpoint')
            state = dict(year_delta=int(parts[2]), selected=None if parts[3] == 'none' else parts[3],
                         menu=None if parts[4] == 'false' else dict(headers=[], child=None))
        elif marker == 'TPRESENT_HEADER':
            if (state is None or state['menu'] is None or len(parts) != 4 or state['menu']['child'] is not None
                    or parts[1] != str(len(state['menu']['headers'])) or len(state['menu']['headers']) >= 9
                    or parts[2] not in ('true', 'false')):
                raise ProtocolError('Invalid or reordered mounted header')
            state['menu']['headers'].append(dict(label=normalize(parts[3]), active=parts[2] == 'true'))
        elif marker == 'TPRESENT_CHILD':
            if (state is None or state['menu'] is None or len(parts) != 2 or parts[1] != '5'
                    or len(state['menu']['headers']) != 9 or state['menu']['child'] is not None):
                raise ProtocolError('Invalid or duplicate mounted Terraform child')
            state['menu']['child'] = dict(header_index=int(parts[1]), rows=[])
        elif marker in ('TPRESENT_ROW', 'TPRESENT_SEPARATOR'):
            if state is None or state['menu'] is None or state['menu']['child'] is None:
                raise ProtocolError('Orphan mounted Terraform row')
            if marker == 'TPRESENT_SEPARATOR' and len(parts) == 1:
                row = dict(separator=True)
            elif marker == 'TPRESENT_ROW' and len(parts) == 3:
                row = dict(label=normalize(parts[2]), tone=tone(parts[1]))
            else:
                raise ProtocolError('Malformed mounted Terraform row')
            state['menu']['child']['rows'].append(row)
        elif marker == 'TPRESENT_STATE_DONE':
            if len(parts) != 1 or state is None:
                raise ProtocolError('Orphan native presentation checkpoint end')
            contract.validate_output(dict(trace=[state]), [])
            current['output']['trace'].append(state); state = None
        elif marker == 'TPRESENT_DONE':
            if len(parts) != 1 or state is not None:
                raise ProtocolError('Incomplete Terraform presentation case')
            contract.validate_output(current['output'], cases[len(results)]['input']['actions'])
            results.append(current); current = None
        elif marker == 'TPRESENT_ERROR':
            if len(parts) < 2 or not '|'.join(parts[1:]):
                raise ProtocolError('Native presentation failure lacks a reason')
            results.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:]))); current = state = None
        else:
            raise ProtocolError('Unknown Terraform presentation marker')
    if current is not None or state is not None or [row['id'] for row in results] != [case['id'] for case in cases]:
        raise ProtocolError('Missing Terraform presentation cases or completion')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', ROOT / 'build/wasm/bin')) / 'GLSMAC.js')
    parser.add_argument('--scripts-root', type=Path, default=Path(os.environ.get('WASM_SCRIPTS_ROOT', ROOT)))
    parser.add_argument('--template', type=Path, default=DIRECTORY / '_terraform_presentation_headless.gls.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/terraform-presentation-headless.log')
    args = parser.parse_args()
    cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported:
        contract.validate_input(case['input'])
    if len(supported) > 3:
        raise ProtocolError('Terraform presentation adapter accepts at most three cases')
    if not supported:
        write_response(dict(name='glsmac-terraform-presentation', kind='candidate', candidate_executed=False),
                       [dict(id=case['id'], status='unsupported', reason='Unknown Terraform presentation contract') for case in cases])
        return
    runtime = args.runtime.resolve()
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime, runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot(args.scripts_root.resolve()); template = args.template.read_text()
    script = 'GLSMAC_data/tests/terraform_presentation_headless_probe.gls.js'
    if script in snapshot:
        raise ProtocolError('Terraform presentation probe shadows an existing script')
    inputs = []
    for case in supported:
        item = dict(case['input'], id=case['id'])
        item['sources'] = [dict(name=name, source=source) for name, source in declarations(item['text_profile']).items()]
        inputs.append(item)
    digest = hashlib.sha256((canonical(snapshot) + template + canonical(inputs)).encode()).hexdigest()
    # Bound this mounted/native batch to the three declared source profiles.
    logs, parsed = [], []
    for offset in range(0, len(inputs), 3):
        snapshot[script] = 'const terraform_presentation_inputs = ' + gse_literal(inputs[offset:offset + 3]) + ';\n' + template
        with tempfile.TemporaryDirectory(prefix='glsmac-terraform-presentation-') as temporary:
            source = Path(temporary) / 'scripts.json'; source.write_text(canonical(snapshot))
            process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                input=canonical(dict(runtime=str(runtime), snapshot=str(source), script=script, prefix=temporary)),
                text=True, capture_output=True, timeout=180, cwd=ROOT)
        logs.append(process.stdout + process.stderr)
        args.log.parent.mkdir(parents=True, exist_ok=True); args.log.write_text('\n'.join(logs))
        if process.returncode or any(hashlib.sha256(p.read_bytes()).hexdigest() != value for p, value in hashes.items()):
            raise ProtocolError('Terraform presentation worker failed or runtime changed: ' + str(args.log))
        parsed.extend(parse_candidate(process.stdout, supported[offset:offset + 3]))
    results = iter(parsed)
    write_response(dict(name='glsmac-terraform-presentation', kind='candidate', target='wasm-gse', rendering=False,
        assets_required=False, runtime_sha256=hashes[runtime.with_suffix('.wasm')], scripts_sha256=digest,
        executed=['production UI startup and mounted MENU/header/Escape/Tab callbacks',
                  'native text parser and production TERRAIN work-rule consumer',
                  'actual visible header/row text, resolved style palette and native unit navigation',
                  'native city/citizen/companion guards and actual root/child visibility'],
        mocked=['declared city/resources, flat-arid Former tile and spread native 16x16 layout',
                'scene nodes/art/audio, direct pointer/key delivery and bounded timer delivery',
                'frontend event transport/selection notifications; geometry, hover and pixels omitted']),
        [next(results) if case['algorithm'] == contract.ALGORITHM else
         dict(id=case['id'], status='unsupported', reason='Unknown Terraform presentation contract') for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, ProtocolError, subprocess.SubprocessError) as error:
        print('Terraform presentation candidate failed:', error, file=sys.stderr)
        sys.exit(1)
