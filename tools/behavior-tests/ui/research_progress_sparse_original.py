#!/usr/bin/env python3
"""Record the same real fixture without intermediate Laboratories openings."""
import argparse,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import research_progress_original as original
from ui.research_progress_sparse_contract import ALGORITHM,validate_input,validate_output
from ui.vision import VisionError

def fingerprint():
    return hashlib.sha256(original.fingerprint().encode()+Path(__file__).read_bytes()+Path(__file__).with_name('research_progress_sparse_contract.py').read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases'];initial=fingerprint()
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown sparse science contract')
        validate_input(c['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=original.FactionVision();vision=original.ProgressVision();driver=None;rows=[]
    print('Original sparse science artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=original.OriginalDriver(args.assets,args.wine,work)
        for c in cases:
            directory=work/c['id'];directory.mkdir();allocation=original.prepare(driver,observer,vision,directory)
            trace=[original.open_report(driver,vision,directory/'checkpoint-initial.png',1)]
            original.click(driver,630,520)
            for i in range(c['input']['advances']):
                original.click(driver,890,584)
                original.map_ready(driver,vision,directory/f'map-{i+1}.png',i+2)
            trace.append(original.open_report(driver,vision,directory/'checkpoint-final.png',6))
            output=dict(initial_allocation=allocation,trace=trace);validate_output(output);rows.append(dict(id=c['id'],status='ok',output=output));(directory/'observed.json').write_text(json.dumps(output,indent=2)+'\n')
        if fingerprint()!=initial:raise ProtocolError('sparse science observer changed during capture')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,map_sha256=hashlib.sha256(original.arid_map()).hexdigest(),
            fixture='Same synthetic map/stock Gaian/Citizen/Blind-off/target5/held Scout/default50-0-50 allocation fixture as initial research progress; five real end-turn clicks; Labs opened only initially and finally',
            observation='Independent initial/final report decimals with native accumulation/target/ownership/city cross-checks; no intermediate Labs openings',
            scope='Optional asset-backed observation-effect control only; no acquisition or general science-credit timing claim',ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original sparse science failed: '+str(e),file=sys.stderr);sys.exit(1)
