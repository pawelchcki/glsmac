#!/usr/bin/env python3
"""Replay native settings and actual setup controls without rendering."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, load_request, write_response
from ui.drivers import ROOT
from ui.headless import gse_literal
from ui.size_kind_contract import ALGORITHM, parse_candidate, validate_input
DIRECTORY=Path(__file__).resolve().parent

def headless(cases,runtime):
    snapshot=create_snapshot()
    snapshot['GLSMAC_data/tests/_headless_display.gls.js']=(DIRECTORY/'_headless_display.gls.js').read_text()
    inputs=[dict(c['input'],id=c['id'],prior_preset=c['input']['prior_preset'] if c['input']['prior_preset'] is not None else -1,reenter=int(c['input']['reenter'])) for c in cases]
    script='GLSMAC_data/tests/size_kind_probe.gls.js'
    snapshot[script]='const headless_inputs = [];\nconst kind_inputs = '+gse_literal(inputs)+';\n'+(DIRECTORY/'_headless.gls.js').read_text()+(DIRECTORY/'_size_kind.gls.js').read_text()
    digest=hashlib.sha256(json.dumps(snapshot,sort_keys=True).encode()).hexdigest()
    hashes={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in (runtime,runtime.with_suffix('.wasm'))}
    with tempfile.TemporaryDirectory(prefix='glsmac-size-kind-') as directory:
        source=Path(directory)/'scripts.json';source.write_text(json.dumps(snapshot))
        request={'runtime':str(runtime),'snapshot':str(source),'script':script,'prefix':directory}
        result=subprocess.run(['node',str(DIRECTORY.parent/'gse-worker.cjs')],input=json.dumps(request),text=True,capture_output=True,timeout=120)
    if result.returncode:raise ProtocolError('size-kind worker failed: '+(result.stdout+result.stderr)[-3000:])
    if any(hashlib.sha256(path.read_bytes()).hexdigest()!=value for path,value in hashes.items()):raise ProtocolError('size-kind runtime changed during replay')
    try:rows=parse_candidate(result.stdout,cases)
    except (ValueError,ProtocolError) as error:raise ProtocolError(str(error)+': '+result.stdout[-3000:]) from error
    return {'name':'glsmac-custom-size-kind','kind':'candidate','target':'wasm-gse','rendering':False,'scripts_sha256':digest,
            'loader_sha256':hashes[runtime],'runtime_sha256':hashes[runtime.with_suffix('.wasm')],
            'mocked':['native display','audio','timer delivery','equivalent synthetic installed text','pre-world lifecycle']},rows

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runtime',type=Path,default=ROOT/'build/wasm/bin/GLSMAC.js');args=p.parse_args()
    cases=load_request()['cases'];supported=[c for c in cases if c['algorithm']==ALGORITHM]
    for c in supported:validate_input(c['input'])
    metadata,rows=({'name':'custom-size-kind-headless','kind':'adapter'},[])
    if supported:metadata,rows=headless(supported,args.runtime.resolve())
    iterator=iter(rows);write_response(metadata,[next(iterator) if c['algorithm']==ALGORITHM else {'id':c['id'],'status':'unsupported','reason':'unknown custom-size kind contract'} for c in cases])
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,subprocess.SubprocessError) as error:
        print(f'Size-kind replay failed: {error}',file=sys.stderr);sys.exit(1)
