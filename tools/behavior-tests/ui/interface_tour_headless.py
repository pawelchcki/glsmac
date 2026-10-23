#!/usr/bin/env python3
"""Replay declared tutorial inputs through production UI and native state, asset-free."""
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
from ui import interface_tour_synthetic_contract as contract
from ui.interface_tour_inputs import declarations, label_document, tutorial_document
from ui.interface_tour_observation import classify_frames, normalized

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def gse_literal(value):
    if isinstance(value, str):
        return "'" + value.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '\\r') + "'"
    if isinstance(value, list):
        return '[' + ','.join(gse_literal(item) for item in value) + ']'
    if isinstance(value, dict) and all(re.fullmatch(r'[a-z_]+', key) for key in value):
        return '{' + ','.join(key + ':' + gse_literal(item) for key, item in value.items()) + '}'
    raise ProtocolError('Unsupported declared Tour fixture value')


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.M) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('Native Tour execution failed: ' + text[-2000:])
    results = []; current = frame = None; units = []
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(TOUR_.*)$', line)
        if not match:
            continue
        parts = match[1].split('|'); marker = parts[0]
        if marker == 'TOUR_CASE':
            if len(parts) != 2 or current is not None or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Invalid Tour case order')
            current = dict(id=parts[1], status='ok', output=dict(frames=[], completed=False, failure=None, units_unchanged=None)); units = []
        elif current is None:
            raise ProtocolError('Orphan native Tour observation')
        elif marker == 'TOUR_FRAME':
            if len(parts) != 6 or frame is not None or int(parts[1]) != len(current['output']['frames']) or any(value not in ('true', 'false') for value in parts[4:]):
                raise ProtocolError('Invalid mounted Tour frame')
            frame = dict(observed_stage=parts[2], native_turn=int(parts[3]), menu_open=parts[4]=='true', commlink_open=parts[5]=='true', buttons=[])
            positions = []; native_units = []
        elif marker == 'TOUR_BODY':
            if frame is None or len(parts) != 2 or 'mounted_body' in frame: raise ProtocolError('Invalid mounted Tour body')
            frame['mounted_body'] = parts[1]
        elif marker == 'TOUR_BUTTON':
            if frame is None or len(parts) != 3: raise ProtocolError('Invalid mounted Tour button')
            positions.append((int(parts[1]), normalized(parts[2])))
        elif marker == 'TOUR_COMMLINK':
            if frame is None or len(parts) != 2 or 'commlink_text' in frame: raise ProtocolError('Invalid actual Commlink heading')
            frame['commlink_text'] = normalized(parts[1]) or None
        elif marker == 'TOUR_BINDINGS':
            if frame is None or len(parts) != 3 or 'native_bindings' in frame: raise ProtocolError('Invalid native Tour text bindings')
            frame['native_bindings'] = {'$BASENAME0': parts[1], '$UNITNAME0': parts[2], '$UNITNAME1': parts[2]}
        elif marker == 'TOUR_UNIT':
            if frame is None or len(parts) != 9: raise ProtocolError('Invalid native Tour unit snapshot')
            native_units.append(tuple(parts[1:]))
        elif marker == 'TOUR_FRAME_DONE':
            if frame is None or len(parts) != 1 or not {'mounted_body','commlink_text','native_bindings'} <= frame.keys(): raise ProtocolError('Incomplete mounted Tour frame')
            frame['buttons'] = [label for _, label in sorted(positions)]
            current['output']['frames'].append(frame); units.append(sorted(native_units)); frame = None
        elif marker == 'TOUR_MISSING':
            if frame is not None or len(parts) != 3 or current['output']['failure'] is not None: raise ProtocolError('Invalid missing Tour action')
            current['output']['failure'] = dict(step=int(parts[1]), reason=parts[2])
        elif marker == 'TOUR_DONE':
            if frame is not None or len(parts) != 2 or parts[1] not in ('true','false'): raise ProtocolError('Incomplete native Tour case')
            current['output']['completed'] = parts[1]=='true'
            current['output']['units_unchanged'] = bool(units) and all(value == units[0] for value in units)
            profile = cases[len(results)]['input']['source_profile']
            classify_frames(current['output'], tutorial_document(profile), contract.TOPICS)
            contract.validate_output(current['output'], cases[len(results)])
            results.append(current); current = None
        elif marker == 'TOUR_ERROR':
            results.append(dict(id=current['id'], status='error', reason='|'.join(parts[1:]))); current = frame = None
        else:
            raise ProtocolError('Unknown native Tour observation')
    if current is not None or frame is not None or [row['id'] for row in results] != [case['id'] for case in cases]:
        raise ProtocolError('Missing or reordered native Tour results')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path(os.environ.get('WASM_HEADLESS_APP_DIR', os.environ.get('WASM_APP_DIR', ROOT/'build/wasm/bin'))) / 'GLSMAC.js')
    parser.add_argument('--node', default=os.environ.get('NODE', 'node'))
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent/'.build/ui/interface-tour-headless.log')
    parser.add_argument('--source-root', type=Path, default=ROOT)
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] == contract.ALGORITHM]
    for case in supported: contract.validate_input(case['input'])
    if len(supported) > 4: raise ProtocolError('Native Tour accepts at most four cases per request')
    if not supported:
        write_response(dict(name='glsmac-interface-tour-native',kind='candidate',candidate_executed=False),
                       [dict(id=case['id'],status='unsupported',reason='Unknown native Tour contract') for case in cases])
        return
    runtime = args.runtime.resolve(); hashes = {path:hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime,runtime.with_suffix('.wasm'))}
    snapshot = create_snapshot()
    if args.source_root.resolve() != ROOT:
        snapshot = {name:source for name,source in snapshot.items() if not name.startswith('GLSMAC_data/default/')}
        for path in sorted((args.source_root/'GLSMAC_data/default').rglob('*.gls.js')): snapshot[path.relative_to(args.source_root).as_posix()] = path.read_text()
    template = (DIRECTORY/'_interface_tour_headless.gls.js').read_text()
    inputs = []
    for case in supported:
        profile = case['input']['source_profile']
        inputs.append(dict(id=case['id'], finish=case['input']['finish'], controls=declarations(profile)['controls'], sources=[dict(name='tutor.txt',source=tutorial_document(profile)),dict(name='labels.txt',source=label_document(profile))]))
    digest = hashlib.sha256((canonical(snapshot)+template+canonical(inputs)).encode()).hexdigest()
    script = 'GLSMAC_data/tests/interface_tour_headless_probe.gls.js'; snapshot[script] = 'const interface_tour_inputs = '+gse_literal(inputs)+';\n'+template
    with tempfile.TemporaryDirectory(prefix='glsmac-interface-tour-') as temporary:
        path = Path(temporary)/'scripts.json'; path.write_text(canonical(snapshot))
        process = subprocess.run([args.node,str(DIRECTORY.parent/'gse-worker.cjs')],input=canonical(dict(runtime=str(runtime),snapshot=str(path),script=script,prefix=temporary)),text=True,capture_output=True,timeout=180,cwd=ROOT)
    args.log.parent.mkdir(parents=True,exist_ok=True); args.log.write_text(process.stdout+process.stderr)
    if process.returncode or any(hashlib.sha256(path.read_bytes()).hexdigest()!=value for path,value in hashes.items()): raise ProtocolError('Native Tour worker failed or runtime changed; inspect '+str(args.log))
    observed = iter(parse_candidate(process.stdout,supported))
    results = [next(observed) if case['algorithm']==contract.ALGORITHM else dict(id=case['id'],status='unsupported',reason='Unknown native Tour contract') for case in cases]
    write_response(dict(name='glsmac-interface-tour-native',kind='candidate',target='wasm-gse',rendering=False,assets_required=False,runtime_sha256=hashes[runtime.with_suffix('.wasm')],scripts_sha256=digest,
                        executed=['real native opening commands, Headquarters, FirstTurn and unit state','production Tour/prompt/MENU/Commlink controls and mounted Text values','independent classification against declared raw tutorial inputs'],
                        mocked=['display nodes/font metrics','explicit timer and keyboard/pointer delivery','unmeasured declared startup/prelude/MENU context']),results)


if __name__ == '__main__':
    try: main()
    except (OSError,ValueError,ProtocolError,subprocess.SubprocessError) as error:
        print('Native Tour adapter failed: '+str(error),file=sys.stderr); sys.exit(1)
