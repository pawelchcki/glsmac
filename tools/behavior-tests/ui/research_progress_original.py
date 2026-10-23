#!/usr/bin/env python3
"""Observe original science labels and guarded native state on a synthetic map.

No executable, original memory or installed text is patched. The sole input
replacement is the declared synthetic flat map. No science answer is computed.
"""
import argparse,hashlib,json,re,struct,subprocess,sys,tempfile,time
from collections import Counter
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui.research_choice_original import OriginalDriver,FactionVision,key,click,fingerprint as dependency_fingerprint
from ui.former_work_original import choose
from ui.former_work_sources import arid_map
from ui.unit_menu_context_paced_original import ContextVision
from ui.faction_identity_original import opening_dialog
from ui.faction_setup_native import NativeMemory
from ui.colony_join_original import city
from ui.base_resource_hud_original import REGIONS
from ui.research_progress_contract import ALGORITHM,validate_input,validate_output
from ui.vision import VisionError
DIRECTORY=Path(__file__).resolve().parent

def fingerprint():
    h=hashlib.sha256(dependency_fingerprint().encode())
    for n in ('research_progress_original.py','research_progress_contract.py','former_work_sources.py','colony_join_original.py','unit_menu_context_paced_original.py'):h.update((DIRECTORY/n).read_bytes())
    return h.hexdigest()

class ProgressVision(ContextVision):
    def allocation(self,image):
        output={}
        for kind in ('economy','psych','labs'):
            crop=image.convert('RGB').crop(REGIONS[kind]);mask=self.Image.new('L',crop.size,255)
            mask.putdata([0 if max(p)>150 else 255 for p in crop.getdata()]);mask=self.vision.ImageOps.expand(mask,8,255)
            readings=[self.vision.text(mask.resize((mask.width*x,mask.height*x),self.Image.Resampling.LANCZOS)) for x in (2,3,4)]
            value,votes=Counter(readings).most_common(1)[0]
            if votes<2 or not re.fullmatch(r'[0-9]{1,3}%',value):raise VisionError('allocation percentage readings disagree')
            output[kind]=dict(percent=int(value[:-1]))
        return output

    def report(self,image):
        image=image.convert('RGB');self.require_text(image,(270,578,750,602),'LABORATORY SUMMARY')
        crop=image.crop((390,600,730,622));mask=self.Image.new('L',crop.size,255)
        mask.putdata([0 if p==(88,140,44) else 255 for p in crop.getdata()]);mask=self.vision.ImageOps.expand(mask,8,255)
        reads=[]
        for scale in (3,4,6):
            text=self.vision.text(mask.resize((mask.width*scale,mask.height*scale),self.Image.Resampling.LANCZOS))
            # Read only three actual decimal values after their label colons.
            # Labels may fail OCR; O-to-zero is allowed only in decimal regions.
            values=re.findall(r':\s*([O0-9]+)\b',text)
            values=[x.replace('O','0') for x in values]
            reads.append(tuple(map(int,values)) if len(values)==3 else None)
        values,votes=Counter(reads).most_common(1)[0]
        if values is None or votes<2:raise VisionError('science report decimal readings disagree: '+repr(reads))
        return dict(zip(('cost','accumulated','per_turn'),values))

def native(driver):
    m=NativeMemory(driver)
    try:
        if m.read(m.address(0x009A64E8),1)[0]!=2 or (m.image_word(0x00949870),m.image_word(0x00949874))!=(40,80):raise ProtocolError('research faction/map guard failed')
        count=m.image_word(0x009A64C8);owned=[]
        if not 0<=count<=2048:raise ProtocolError('research unit array unbounded')
        for i in range(count):
            raw=m.read(m.address(0x00952828)+52*i,52)
            if raw[14]==1:owned.append(raw)
        if len(owned)!=1 or struct.unpack_from('<h',owned[0],10)[0]!=2 or owned[0][16] or owned[0][17]!=2:raise ProtocolError('research held Scout context changed')
        origin=struct.unpack_from('<hh',owned[0]);ownership=m.read(m.address(0x009A6670),89)
        state=dict(turn=m.image_word(0x009A64D4),goal_id=m.image_word(0x0096EE78,signed=True),
                   accumulated=m.image_word(0x0096EE74,signed=True),owned_ids=[i for i,x in enumerate(ownership) if x&2])
    finally:m.close()
    c=city(driver,origin)['city'];state['city']={k:c[k] for k in ('population','workers','doctors','worked_tiles','nutrients','minerals')}
    return state

def map_ready(driver,vision,path,expected):
    previous=None;deadline=time.monotonic()+45;time.sleep(1.2)
    while time.monotonic()<deadline:
        driver.snapshot(path)
        try:
            image=vision.Image.open(path);vision.require_text(image,(785,572,1013,598),'TURN COMPLETE')
            state=native(driver)
            if state['turn']>expected:raise ProtocolError('original advanced beyond requested research checkpoint')
            if state['turn']==expected and state==previous:return state
            previous=state
        except (VisionError,OSError):previous=None
        time.sleep(.2)
    raise ProtocolError('original research map did not settle at turn '+str(expected))

def open_report(driver,vision,path,expected):
    click(driver,60,540);click(driver,25,376);click(driver,280,510)
    def read(image):
        report=vision.report(image);state=native(driver)
        if state['turn']!=expected or report['accumulated']!=state['accumulated']:raise ProtocolError('science report/native counter cross-check failed')
        return dict(state,report=report)
    return vision.wait(driver,read,path,45)

def prepare(driver,observer,vision,directory):
    d,f,v,w=driver,observer,vision,directory
    for p in (d.work/'game/maps').glob('*'):
     if p.is_file() and p.suffix.lower()=='.mp':p.unlink()
    (d.work/'game/maps/PLANET.MP').write_bytes(arid_map());d.reset()
    choose(d,f,'START GAME',w/'main.png',45,True);choose(d,f,'LOAD MAP FILE',w/'map-type.png',45)
    v.wait(d,lambda im:v.require_text(im,(365,160,676,192),'LOAD'),w/'file.png',45);v.wait(d,v.map_choice,w/'file-name.png',45);click(d,430,225);click(d,445,521)
    choose(d,f,'CITIZEN',w/'difficulty.png',45);choose(d,f,'CUSTOMIZE RULES',w/'rules-menu.png',45)
    v.wait(d,lambda im:v.require_text(im,(345,280,1015,310),'CUSTOMIZE GAME RULES'),w/'rules.png',45);click(d,362,525);click(d,679,738)
    f.wait(d,w/'factions.png',45);click(d,135,88);click(d,550,147);key(d,'Return');f.wait(d,w/'name.png',45);key(d,'Return');v.wait(d,lambda im:opening_dialog(f,im),w/'opening.png',45);key(d,'Return');v.wait(d,lambda im:v.require_text(im,(260,256,765,286),'FIRST BASE'),w/'base-name.png',45);key(d,'Return');v.wait(d,lambda im:v.require_text(im,(40,724,220,749),'TOUR'),w/'tour.png',45);click(d,365,735);key(d,'shift+r');v.wait(d,lambda im:v.require_text(im,(200,329,820,357),'ABOUT RESEARCH'),w/'about.png',45);click(d,510,424);time.sleep(1);click(d,155,155);time.sleep(1);key(d,'ctrl+p');v.wait(d,lambda im:v.require_text(im,(439,281,715,303),'PAUSE AT END'),w/'preferences.png',45)
    im=v.Image.open(w/'preferences.png')
    if not v.preference(im,292):click(d,428,292)
    if v.preference(im,172):click(d,428,172)
    click(d,300,496);key(d,'Return');time.sleep(.7);d.snapshot(w/'allocation.png');allocation=v.allocation(v.Image.open(w/'allocation.png'));key(d,'Escape');key(d,'h');
    map_ready(driver,vision,directory/'initial-map.png',1)
    actual={k:allocation[k]['percent'] for k in ('economy','psych','labs')}
    if actual!={'economy':50,'psych':0,'labs':50}:raise ProtocolError('original allocation differs from declared fixture')
    return actual

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases'];initial=fingerprint()
    for case in cases:
        if case['algorithm']!=ALGORITHM:raise ProtocolError('unknown research progress algorithm')
        validate_input(case['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=FactionVision();vision=ProgressVision();driver=None;results=[]
    print('Original research progress artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=OriginalDriver(args.assets,args.wine,work)
        for case in cases:
            directory=work/case['id'];directory.mkdir();allocation=prepare(driver,observer,vision,directory)
            trace=[open_report(driver,vision,directory/'checkpoint-0.png',1)]
            for i in range(case['input']['advances']):
                click(driver,630,520);click(driver,890,584);map_ready(driver,vision,directory/f'map-{i+1}.png',i+2)
                trace.append(open_report(driver,vision,directory/f'checkpoint-{i+1}.png',i+2))
            output=dict(initial_allocation=allocation,trace=trace);validate_output(output);results.append(dict(id=case['id'],status='ok',output=output));(directory/'observed.json').write_text(json.dumps(output,indent=2)+'\n')
        if fingerprint()!=initial:raise ProtocolError('research progress observer changed during capture')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,map_sha256=hashlib.sha256(arid_map()).hexdigest(),
            fixture='Synthetic flat arid40x80 map; stock Gaians/Citizen; Blind Research off; first base; Doctrine Mobility chosen; one held Scout; pause at end on/tutorials off; default allocation50/0/50; five real end-turn clicks',
            observation='Actual Laboratories report decimals cost/accumulated/per-turn; native target/accumulated/technology ownership and initial city/jobs/stores context; report accumulation cross-checked against native state',
            scope='Optional asset-backed first six turn counters only; no acquisition or general cost/progression algorithm claim',ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),results)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original research progress failed: '+str(e),file=sys.stderr);sys.exit(1)
