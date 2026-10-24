#!/usr/bin/env python3
"""Observe real initial science timing under stock faction/difficulty variants."""
import argparse,hashlib,json,re,struct,subprocess,sys,tempfile,time
from collections import Counter
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import research_progress_original as previous
from ui.science_timing_variants_contract import ALGORITHM,PROFILES,validate_input,validate_output
from ui.faction_setup_native import NativeMemory
from ui.colony_join_original import city
from ui.base_resource_hud_original import REGIONS
from ui.vision import VisionError,consensus
STRIDE=0x20CC

def fingerprint():
    return hashlib.sha256(previous.fingerprint().encode()+Path(__file__).read_bytes()+Path(__file__).with_name('science_timing_variants_contract.py').read_bytes()).hexdigest()

class VariantVision(previous.ProgressVision):
    def labs_income(self,image):
        crop=image.convert('RGB').crop((690,462,733,482));mask=self.Image.new('L',crop.size,255)
        mask.putdata([0 if max(p)>150 else 255 for p in crop.getdata()]);mask=self.vision.ImageOps.expand(mask,8,255)
        text=consensus([self.vision.text(mask.resize((mask.width*s,mask.height*s),self.Image.Resampling.LANCZOS)) for s in (2,3,4)]).replace('O','0')
        if not re.fullmatch(r'[0-9]+',text):raise VisionError('actual base labs total not readable')
        return int(text)

def native(driver):
    m=NativeMemory(driver)
    try:
        mask=m.read(m.address(0x009A64E8),1)[0]
        if mask not in (2,4,8,16,32,64,128):raise ProtocolError('timing variant requires one actual human faction')
        faction=mask.bit_length()-1
        if (m.image_word(0x00949870),m.image_word(0x00949874))!=(40,80):raise ProtocolError('timing map changed')
        count=m.image_word(0x009A64C8);units=[];origin=None
        if not 0<=count<=2048:raise ProtocolError('timing unit array unbounded')
        for index in range(count):
            raw=m.read(m.address(0x00952828)+52*index,52)
            if raw[14]!=faction:continue
            xy=struct.unpack_from('<hh',raw)
            if origin is not None and origin!=xy:raise ProtocolError('timing owned units left the declared base')
            origin=xy
            units.append(dict(prototype_id=struct.unpack_from('<h',raw,10)[0],order_code=raw[17],movement_spent=raw[40],damage=raw[16]))
        if not 1<=len(units)<=8 or any(u['damage'] or u['prototype_id'] not in (0,1,2) for u in units):raise ProtocolError('unrecognized timing variant roster')
        owners=m.read(m.address(0x009A6670),89)
        state=dict(turn=m.image_word(0x009A64D4),faction_id=faction,goal_id=m.image_word(0x0096CDAC+faction*STRIDE,signed=True),accumulated=m.image_word(0x0096CDA8+faction*STRIDE,signed=True),owned_ids=[i for i,v in enumerate(owners) if v&mask],units=units)
    finally:m.close()
    c=city(driver,origin)['city'];state['city']={k:c[k] for k in ('population','workers','doctors','worked_tiles','nutrients','minerals')}
    return state

def hold_units(driver):
    for _ in range(8):
        m=NativeMemory(driver)
        try:mode=m.image_word(0x00939288);selected=m.image_word(0x0093928C,signed=True)
        finally:m.close()
        if mode==0 and selected==-1:return
        if mode!=1 or selected<0:raise ProtocolError('unknown real selected-unit context')
        previous.key(driver,'h');time.sleep(.35)
    raise ProtocolError('timing ready units did not settle after Hold inputs')

def map_ready(driver,vision,path,expected):
    deadline=time.monotonic()+45;prior=None;interrupted=None;retried=False;time.sleep(1.2)
    while time.monotonic()<deadline:
        driver.snapshot(path);image=vision.Image.open(path)
        try:
            vision.require_text(image,(175,214,850,242),'COMMUNICATIONS OFFICER');vision.require_text(image,(183,435,840,458),'CLOSE THE CHANNEL')
        except VisionError:pass
        else:
            previous.click(driver,350,446);previous.click(driver,510,498);interrupted=time.monotonic();prior=None;continue
        state=native(driver)
        if state['turn']>expected:raise ProtocolError('timing original advanced beyond checkpoint')
        try:vision.require_text(image,(785,572,1013,598),'TURN COMPLETE')
        except VisionError:prior=None;time.sleep(.2);continue
        if state['turn']==expected and state==prior:return state
        if state['turn']==expected-1 and interrupted is not None and not retried and time.monotonic()-interrupted>=8:
            previous.click(driver,890,584);retried=True;prior=None;continue
        prior=state if state['turn']==expected else None;time.sleep(.2)
    raise ProtocolError('timing original map did not settle at counter '+str(expected))

def prepare(driver,observer,vision,directory,profile):
    for p in (driver.work/'game/maps').glob('*'):
        if p.is_file() and p.suffix.lower()=='.mp':p.unlink()
    (driver.work/'game/maps/PLANET.MP').write_bytes(previous.arid_map());driver.reset()
    previous.choose(driver,observer,'START GAME',directory/'main.png',45,True);previous.choose(driver,observer,'LOAD MAP FILE',directory/'map-type.png',45)
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
    previous.key(driver,'Escape');hold_units(driver);map_ready(driver,vision,directory/'initial-map.png',1)
    state=native(driver)
    if state['goal_id']!=5:raise ProtocolError('declared target5 was not actually selected')
    return {k:allocation[k]['percent'] for k in ('economy','psych','labs')},income

def open_report(driver,vision,path,expected):
    previous.click(driver,60,540);previous.click(driver,25,376);previous.click(driver,280,510)
    def read(image):
        report=vision.report(image);state=native(driver)
        if state['turn']!=expected or report['accumulated']!=state['accumulated']:raise ProtocolError('timing report/native cross-check failed')
        return dict(state,report=report)
    return vision.wait(driver,read,path,45)

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases'];initial=fingerprint()
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown timing variant contract')
        validate_input(c['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=previous.FactionVision();vision=VariantVision();driver=None;rows=[]
    print('Original timing variant artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=previous.OriginalDriver(args.assets,args.wine,work)
        for c in cases:
            directory=work/c['id'];directory.mkdir();allocation,income=prepare(driver,observer,vision,directory,PROFILES[c['input']['profile']]);trace=[open_report(driver,vision,directory/'checkpoint-0.png',1)]
            for i in range(c['input']['advances']):
                previous.click(driver,630,520);hold_units(driver);previous.click(driver,890,584);map_ready(driver,vision,directory/f'map-{i+1}.png',i+2);hold_units(driver)
                trace.append(open_report(driver,vision,directory/f'checkpoint-{i+1}.png',i+2))
            output=dict(initial_allocation=allocation,initial_labs_income=income,trace=trace);validate_output(output);rows.append(dict(id=c['id'],status='ok',output=output));(directory/'observed.json').write_text(json.dumps(output,indent=2)+'\n');print('Captured timing variant: '+c['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('timing variant observer changed during recording')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,map_sha256=hashlib.sha256(previous.arid_map()).hexdigest(),fixture='Stock Hive/Citizen or Gaians/Talent, same flat-arid40x80 Blind-off target5 first-city fixture; actual allocation/income read; idle owned units held; channels declined if interrupted; five actual advances',observation='Real Laboratories cost/accumulated/per-turn values cross-checked against dynamic actual human faction state, ownership, city and unit roster; actual initial base Labs total',scope='Optional asset-backed six native-counter observations per declared profile; no internal credit algorithm, acquisition or general timing claim',ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original science timing variant failed: '+str(e),file=sys.stderr);sys.exit(1)
