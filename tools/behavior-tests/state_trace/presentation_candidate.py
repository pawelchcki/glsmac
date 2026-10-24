#!/usr/bin/env python3
"""Execute bounded real browser captures, retaining explicit semantic gaps.

Raw native diagnostics are never promoted to cross-engine semantic agreement.
The two pinned scenarios remain unsupported until complete semantic producers
exist. Installed assets and a newly rebuilt native observer runtime are needed.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, fingerprint, load_request, write_response
from state_trace.presentation_schema import ALGORITHM, validate_input
from state_trace.presentation_capture import reduce_capture

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]


def main():
    request = load_request()
    pinned = {case['id']:case for case in json.loads((DIRECTORY/'presentation-cases.json').read_text())['cases']}
    for case in request['cases']:
        if case['algorithm'] != ALGORITHM: raise ProtocolError('unknown presentation algorithm')
        validate_input(case['input'])
        if case['id'] not in pinned or fingerprint(case['input']) != fingerprint(pinned[case['id']]['input']):
            raise ProtocolError('candidate supports only the exact two declared presentation inputs')
    artifacts = Path(os.environ.get('PRESENTATION_ARTIFACTS', tempfile.mkdtemp(prefix='glsmac-presentation-')))
    artifacts.mkdir(parents=True, exist_ok=True)
    implementation = {'name':'GLSMAC bounded real presentation observer (semantic transfer pending)',
                      'kind':'candidate', 'adapter_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                      'capture_root':str(artifacts), 'captures':{}}
    results = []
    for case in request['cases']:
        case_id = case['id']; directory = artifacts/case_id; directory.mkdir(exist_ok=True)
        if not os.environ.get('SMAC_ASSETS_DIR'):
            results.append(dict(id=case_id,status='unsupported',reason='Installed assets unavailable; no presentation channels observed'))
            continue
        env = dict(os.environ)
        env.update(PRESENTATION_TRACE='1', PRESENTATION_INTRO=case['input']['fixture']['intro'],
                   PRESENTATION_STOP_AT_FIRST_PLAYABLE='1', OPENING_SEQUENCE_ARTIFACTS=str(directory),
                   PRESENTATION_ARTIFACTS=str(directory))
        opening = case['input']['fixture']['intro'] == 'disabled'
        if opening:
            worker = DIRECTORY.parent/'ui/opening_sequence_browser.mjs'
            worker_request = {'version':1,'cases':[{'id':case_id,'algorithm':'ui.opening_sequence.v1','input':{'confirmation':'keyboard'}}]}
            stdin = json.dumps(worker_request)
        else:
            worker = DIRECTORY/'presentation_intro_browser.mjs'; stdin = ''
        try:
            run = subprocess.run([env.get('NODE','node'),str(worker)],input=stdin,text=True,capture_output=True,env=env,cwd=ROOT,timeout=230)
            (directory/'worker.stdout').write_text(run.stdout); (directory/'worker.stderr').write_text(run.stderr)
            if run.returncode: raise ProtocolError('browser worker failed: '+run.stderr[-2000:])
            observed = json.loads(run.stdout)
            if opening:
                result = observed['results'][0]
                if result['status'] != 'ok': raise ProtocolError(result.get('reason','opening capture failed'))
                if not result['output']['completed']: raise ProtocolError('opening input route did not complete')
                raw = directory/case_id/'presentation-raw.json'
                implementation['captures'][case_id] = observed['implementation']
            else:
                if observed['failure']: raise ProtocolError(observed['failure'])
                raw = directory/'presentation-raw.json'
                implementation['captures'][case_id] = observed['implementation']
            capture = json.loads(raw.read_text())
            reduced = reduce_capture(capture)
            implementation['captures'][case_id]['input_ledger'] = dict(
                raw_path=str(raw), checkpoint_paths=[str(raw.parent/('presentation-checkpoint-'+point['id']+'.json')) for point in capture.get('input_checkpoints',[])],
                attribution=capture.get('input_attribution'), validation=capture.get('input_validation'))
            (directory/'reduced.json').write_text(json.dumps(reduced,indent=2)+'\n')
            results.append(dict(id=case_id,status='unsupported',reason='Real raw capture retained; complete semantic windows/widgets/focus/modal, animation/video and SFX/music classification/coverage remain unimplemented. No prelaunch-history, mixer/output or timing agreement claimed.'))
        except (OSError, ValueError, subprocess.TimeoutExpired) as error:
            results.append(dict(id=case_id,status='error',reason=str(error)))
    write_response(implementation,results)
    return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except (OSError,ValueError) as error:
        print('Presentation candidate failed: '+str(error),file=sys.stderr);sys.exit(2)
