#!/usr/bin/env python3
"""Actual one-report map/preset context; direct fields, no inferred conversion."""
import argparse,hashlib,json,struct,subprocess,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import science_timing_variants_original as timing
from ui.science_timing_variants_original import previous
from ui.science_difficulty_original import LockedDriver,DifficultyVision
from ui.zero_labs_context_original import live_cost_context,fingerprint as context_fingerprint
from ui.faction_setup_native import NativeMemory
from ui.live_map_cost_context_contract import ALGORITHM,validate_input,validate_output
from ui.vision import VisionError

def fingerprint():
    return hashlib.sha256(context_fingerprint().encode()+Path(__file__).read_bytes()+Path(__file__).with_name('live_map_cost_context_contract.py').read_bytes()+Path(__file__).with_name('wine_key_input.c').read_bytes()).hexdigest()

def arid_map(width,height):
    count=width*height//2;aw,ah=(width+4)//5,(height+4)//5;ac=((aw+1)//2)*ah;offset=15+0xaa4
    raw=bytearray(offset+count*44+ac);raw[:11]=b'TERRANMAP\0\x1a';struct.pack_into('<I',raw,11,5)
    for at,value in ((0,width),(4,height),(20,count),(0xa24,aw),(0xa28,ah),(0xa2c,ac)):struct.pack_into('<I',raw,15+at,value)
    for i in range(count):
        at=offset+i*44;raw[at]=96;raw[at+1]=64;raw[at+4]=255
    return bytes(raw)

def map_kind(driver):
    m=NativeMemory(driver)
    try:return m.image_word(0x0094A2A0,signed=True)
    finally:m.close()

def native(driver,data):
    m=NativeMemory(driver)
    try:
        mask=m.read(m.address(0x009A64E8),1)[0];width,height=m.image_word(0x00949870),m.image_word(0x00949874)
        if mask!=2 or (width,height)!=(data['map_width'],data['map_height']):raise ProtocolError('actual human/physical dimensions differ from declared fixture')
        count=m.image_word(0x009A64C8);units=[];origin=None
        if not 0<=count<=2048:raise ProtocolError('unbounded unit roster')
        for i in range(count):
            raw=m.read(m.address(0x00952828)+52*i,52)
            if raw[14]!=1:continue
            xy=struct.unpack_from('<hh',raw)
            if origin is not None and origin!=xy:raise ProtocolError('owned units left actual first-city stack')
            origin=xy;units.append(dict(prototype_id=struct.unpack_from('<h',raw,10)[0],order_code=raw[17],movement_spent=raw[40],damage=raw[16]))
        if not 1<=len(units)<=8 or any(u['damage'] or u['prototype_id'] not in (0,1,2) for u in units):raise ProtocolError('unsupported initial roster')
        state=dict(turn=m.image_word(0x009A64D4),faction_id=1,goal_id=m.image_word(0x0096EE78,signed=True),accumulated=m.image_word(0x0096EE74,signed=True),owned_ids=[i for i,x in enumerate(m.read(m.address(0x009A6670),89)) if x&2],map_width=width,map_height=height,map_kind=m.image_word(0x0094A2A0,signed=True),units=units)
    finally:m.close()
    city=timing.city(driver,origin)['city'];state['city']={k:city[k] for k in ('population','workers','doctors','worked_tiles','nutrients','minerals')}
    return state

def ready(driver,vision,path,data):
    def check(image):
        vision.require_text(image,(785,572,1013,598),'TURN COMPLETE');state=native(driver,data)
        if state['turn']!=1:raise ProtocolError('single-checkpoint fixture advanced')
        return state
    return vision.wait(driver,check,path,45)

def prepare(driver,observer,vision,directory,data):
    profile=dict(slot=0,difficulty='CITIZEN');preset_trace=[]
    for p in (driver.work/'game/maps').glob('*'):
        if p.is_file() and p.suffix.lower()=='.mp':p.unlink()
    (driver.work/'game/maps/PLANET.MP').write_bytes(arid_map(data['map_width'],data['map_height']));driver.reset()
    previous.choose(driver,observer,'START GAME',directory/'main.png',45,True)
    if data['setup_preset']!='load-default':
        previous.choose(driver,observer,'MAKE RANDOM MAP',directory/'preset-route.png',45)
        previous.choose(driver,observer,{'tiny':'TINY PLANET','standard':'STANDARD PLANET'}[data['setup_preset']],directory/'preset-size.png',45)
        screen=observer.wait(driver,directory/'preset-difficulty.png',45)
        if screen.get('caption')!='PICK A DIFFICULTY LEVEL':raise ProtocolError('actual preset did not reach difficulty')
        preset_trace.append(dict(phase='preset-selected',map_kind=map_kind(driver)))
        previous.key(driver,'Escape')
    previous.choose(driver,observer,'LOAD MAP FILE',directory/'map-type.png',45)
    vision.wait(driver,lambda im:vision.require_text(im,(365,160,676,192),'LOAD'),directory/'file.png',45);vision.wait(driver,vision.map_choice,directory/'file-name.png',45);previous.click(driver,430,225);previous.click(driver,445,521)
    previous.choose(driver,observer,profile['difficulty'],directory/'difficulty.png',45);previous.choose(driver,observer,'CUSTOMIZE RULES',directory/'rules-menu.png',45)
    vision.wait(driver,lambda im:vision.require_text(im,(345,280,1015,310),'CUSTOMIZE GAME RULES'),directory/'rules.png',45);previous.click(driver,362,525);previous.click(driver,679,738)
    observer.wait(driver,directory/'factions.png',45);previous.click(driver,135,88);previous.click(driver,550,147+19*profile['slot']);previous.key(driver,'Return')
    if observer.wait(driver,directory/'name.png',45)['screen']!='name':raise ProtocolError('stock variant identity prompt absent')
    previous.key(driver,'Return');vision.wait(driver,lambda im:previous.opening_dialog(observer,im),directory/'opening.png',45);previous.key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(260,256,765,286),'FIRST BASE'),directory/'base-name.png',45);previous.key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(40,724,220,749),'TOUR'),directory/'tour.png',45);previous.click(driver,365,735);previous.key(driver,'shift+r')
    vision.wait(driver,lambda im:vision.require_text(im,(200,329,820,357),'ABOUT RESEARCH'),directory/'about.png',45);previous.click(driver,510,424);time.sleep(1);previous.click(driver,155,155);time.sleep(1)
    previous.key(driver,'ctrl+p');vision.wait(driver,lambda im:vision.require_text(im,(439,281,715,303),'PAUSE AT END'),directory/'preferences.png',45)
    image=vision.Image.open(directory/'preferences.png')
    if not vision.preference(image,292):previous.click(driver,428,292)
    if vision.preference(image,172):previous.click(driver,428,172)
    previous.click(driver,300,496);previous.key(driver,'Return');time.sleep(.7);driver.snapshot(directory/'allocation.png')
    image=vision.Image.open(directory/'allocation.png');allocation=vision.allocation(image);income=vision.labs_income(image)
    previous.key(driver,'Escape');timing.hold_units(driver);ready(driver,vision,directory/'initial-map.png',data)
    state=native(driver,data)
    if state['goal_id']!=5:raise ProtocolError('declared target5 was not actually selected')
    return {k:allocation[k]['percent'] for k in ('economy','psych','labs')},income,preset_trace

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);parser.add_argument('--key-helper',type=Path,required=True);args=parser.parse_args();initial=fingerprint();cases=load_request()['cases']
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown live map context contract')
        validate_input(c['input'])
    helper=args.key_helper.resolve();binary=helper.with_suffix(helper.suffix+'.so')
    if not helper.is_file() or not binary.is_file():raise ProtocolError('compile the self-authored Wine key helper first')
    key_hash=hashlib.sha256(helper.read_bytes()+binary.read_bytes()).hexdigest()
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=previous.FactionVision();vision=DifficultyVision();driver=None;rows=[]
    print('Original live map context artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=LockedDriver(args.assets,args.wine,work,args.artifacts/'wine-bootstrap.lock');driver.env['PATH']=str(Path(args.wine).resolve().parent)+':'+driver.env['PATH']
        for c in cases:
            directory=work/c['id'];directory.mkdir();allocation,income,preset_trace=prepare(driver,observer,vision,directory,c['input'])
            subprocess.run([str(helper)],env=driver.env,cwd=driver.work,check=True,timeout=15)
            def read(image):
                report=vision.report(image);state=native(driver,c['input']);context=live_cost_context(driver)
                if state['turn']!=1 or report['accumulated']!=state['accumulated'] or context['turn']!=1 or state['goal_id']!=5:raise ProtocolError('initial report/native context mismatch')
                return dict(setup_preset_trace=preset_trace,initial_allocation=allocation,initial_labs_income=income,native=state,report=report,cost_context=context,entry=dict(key='F2',transport='windows-sendinput'))
            output=vision.wait(driver,read,directory/'labs-f2.png',45);validate_output(output);rows.append(dict(id=c['id'],status='ok',output=output));(directory/'observed.json').write_text(json.dumps(output,indent=2)+'\n');print('Captured live map context: '+c['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('observer changed during recording')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,windows_key_helper_sha256=key_hash,fixture='Stock Gaians/Citizen, Blind-off target5; declared synthetic map dimensions; optional actual Tiny/Standard preset prelude then Escape/Load Map; actual allocation/Labs income; held ready units; first report only via Windows SendInput F2',observation='Actual rendered report and direct selected/rival native cost context, physical dimensions and raw map_kind; no conversion or ownership-derived counters',scope='Optional one-checkpoint asset-backed context and actual F2 entry; no general cost/scalar conversion, timing or acquisition rule',ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original live map context failed: '+str(e),file=sys.stderr);sys.exit(1)
