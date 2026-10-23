#!/usr/bin/env python3
"""Record real zero-Labs allocation, actual timing and live original cost inputs."""
import argparse,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import science_timing_variants_original as timing
from ui import production_stock_original as stock
from ui.faction_setup_native import NativeMemory
from ui.zero_labs_context_contract import ALGORITHM,validate_input,validate_output
from ui.vision import VisionError

def fingerprint():
    return hashlib.sha256(timing.fingerprint().encode()+stock.fingerprint().encode()+Path(__file__).read_bytes()+Path(__file__).with_name('zero_labs_context_contract.py').read_bytes()).hexdigest()

def live_cost_context(driver):
    m=NativeMemory(driver)
    try:
        mask=m.read(m.address(0x009A64E8),1)[0]
        if mask not in (2,4,8,16,32,64,128):raise ProtocolError('live cost requires one actual human faction')
        f=mask.bit_length()-1;offset=f*0x20CC
        rows=[dict(faction_id=i,saved_earned_techs=m.image_word(0x0096CDB4+i*0x20CC,signed=True),research_ranking=m.image_word(0x0096CD3C+i*0x20CC,signed=True)) for i in range(1,8)]
        return dict(faction_id=f,human=bool(mask&(1<<f)),target_id=m.image_word(0x0096CDAC+offset,signed=True),difficulty=m.image_word(0x0096C9E8+offset,signed=True),turn=m.image_word(0x009A64D4),map_area_sqrt=m.image_word(0x00949888,signed=True),saved_earned_techs=m.image_word(0x0096CDB4+offset,signed=True),research_ranking=m.image_word(0x0096CD3C+offset,signed=True),research_rating=m.image_word(0x0096CCD8+offset,signed=True),discovery_rate_percent=m.image_word(0x00949758,signed=True),faction_cost_percent=m.image_word(0x00946F48+1436*f,signed=True),stagnation=bool(m.image_word(0x009A649C)&0x20),cached_cost=m.image_word(0x0096CDB0+offset,signed=True),auxiliary_adjustment=m.image_word(0x0096CD40+offset,signed=True),global_difficulty=m.image_word(0x009A64C4,signed=True),faction_counters=rows)
    finally:m.close()

def zero_allocation(driver,vision,directory):
    timing.previous.key(driver,'e')
    vision.wait(driver,lambda im:vision.require_text(im,(265,575,760,605),'SOCIAL ENGINEERING'),directory/'social.png',45)
    for _ in range(5):timing.previous.click(driver,525,719)
    driver.snapshot(directory/'social-zero.png');timing.previous.click(driver,345,525);timing.map_ready(driver,vision,directory/'zero-map.png',1)
    timing.previous.click(driver,60,540);timing.previous.click(driver,25,376);timing.previous.click(driver,280,570)
    vision.wait(driver,lambda im:vision.require_text(im,(190,5,834,30),'BASE OPERATIONS'),directory/'base-operations.png',45);stock.double_click(driver,300,75)
    def read(image):
        a=vision.allocation(image);income=vision.labs_income(image)
        return {k:a[k]['percent'] for k in ('economy','psych','labs')},income
    allocation,income=vision.wait(driver,read,directory/'allocation-zero.png',45)
    if allocation!={'economy':100,'psych':0,'labs':0}:raise ProtocolError('zero-Labs UI did not reach declared allocation')
    timing.previous.key(driver,'Escape');vision.wait(driver,lambda im:vision.require_text(im,(190,5,834,30),'BASE OPERATIONS'),directory/'base-operations-return.png',45)
    timing.previous.click(driver,630,520);timing.map_ready(driver,vision,directory/'ready-zero.png',1)
    return allocation,income

def observe(driver,vision,path,expected):
    timing.previous.click(driver,60,540);timing.previous.click(driver,25,376);timing.previous.click(driver,280,510)
    def read(image):
        report=vision.report(image);state=timing.native(driver);context=live_cost_context(driver)
        if state['turn']!=expected or context['turn']!=expected or report['accumulated']!=state['accumulated']:raise ProtocolError('zero-Labs live/report context cross-check failed')
        return dict(state,report=report,cost_context=context)
    return vision.wait(driver,read,path,45)

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases'];initial=fingerprint()
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown zero-Labs live-context contract')
        validate_input(c['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=timing.previous.FactionVision();vision=timing.VariantVision();driver=None;rows=[]
    print('Original zero-Labs/context artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=timing.previous.OriginalDriver(args.assets,args.wine,work)
        for c in cases:
            directory=work/c['id'];directory.mkdir();timing.prepare(driver,observer,vision,directory,dict(slot=0,difficulty='CITIZEN'));allocation,income=zero_allocation(driver,vision,directory)
            trace=[observe(driver,vision,directory/'checkpoint-0.png',1)]
            for i in range(c['input']['advances']):
                timing.previous.click(driver,630,520);timing.hold_units(driver);timing.previous.click(driver,890,584);timing.map_ready(driver,vision,directory/f'map-{i+1}.png',i+2);timing.hold_units(driver)
                trace.append(observe(driver,vision,directory/f'checkpoint-{i+1}.png',i+2))
            output=dict(initial_allocation=allocation,initial_labs_income=income,trace=trace);validate_output(output);rows.append(dict(id=c['id'],status='ok',output=output));(directory/'observed.json').write_text(json.dumps(output,indent=2)+'\n')
        if fingerprint()!=initial:raise ProtocolError('zero-Labs observer changed during recording')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,map_sha256=hashlib.sha256(timing.previous.arid_map()).hexdigest(),fixture='Stock Gaians/Citizen flat-arid40x80 Blind-off target5; actual SE Labs slider decreased five times and confirmed; actual base allocation and Labs total read; six paused native counters; channels declined and ready units held',observation='Actual Labs report values and native science state, plus read-only live selected/rival cost input context from original process; no owned-ID-derived counters',scope='Optional asset-backed zero-income timing/control and live cost-field bridge; no credit algorithm, general cost inference or acquisition claim',ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original zero-Labs context failed: '+str(e),file=sys.stderr);sys.exit(1)
