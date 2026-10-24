#!/usr/bin/env python3
"""Observe displayed production numbers independently of the raw mineral field."""
import argparse,hashlib,json,re,struct,subprocess,sys,tempfile,time
from collections import Counter
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import research_progress_original as original
from ui.production_stock_contract import ALGORITHM,validate_input,validate_output
from ui.vision import VisionError,consensus
from ui.faction_setup_native import NativeMemory
from ui.colony_join_original import city
from ui.base_resource_hud_original import REGIONS

def fingerprint():
    return hashlib.sha256(original.fingerprint().encode()+Path(__file__).read_bytes()+Path(__file__).with_name('production_stock_contract.py').read_bytes()).hexdigest()

class StockVision(original.ProgressVision):
    def ink(self,image,box,color):
        crop=image.convert('RGB').crop(box);mask=self.Image.new('L',crop.size,255)
        mask.putdata([0 if p==color else 255 for p in crop.getdata()]);mask=self.vision.ImageOps.expand(mask,8,255)
        return consensus([self.vision.text(mask.resize((mask.width*s,mask.height*s),self.Image.Resampling.LANCZOS)) for s in (2,4,5)])
    def operations(self,image):
        self.require_text(image,(190,5,834,30),'BASE OPERATIONS')
        project=self.ink(image,(485,65,710,91),(232,212,140))
        text=self.ink(image,(730,63,830,92),(16,228,0))
        match=re.fullmatch(r'\(([0-9]+)/([0-9]+)\) TURNS:\s*([0-9]+)',text)
        if not match:raise VisionError('unreadable actual production numeric pair: '+repr(text))
        return dict(project=project,pair=[int(match[1]),int(match[2])],turns=int(match[3]))
    def mineral_label(self,image,name):
        crop=image.convert('RGB').crop(REGIONS[name]);mask=self.Image.new('L',crop.size,255)
        mask.putdata([0 if max(p)>150 else 255 for p in crop.getdata()]);mask=self.vision.ImageOps.expand(mask,8,255)
        return consensus([self.vision.text(mask.resize((mask.width*s,mask.height*s),self.Image.Resampling.LANCZOS)) for s in (2,3,4)])
    def panel(self,image):
        image=image.convert('RGB');self.require_text(image,(280,576,726,620),'LANDING')
        project=self.ink(image,(10,637,135,653),(53,61,115))
        turns=self.ink(image,(10,725,132,745),(68,100,160));match=re.fullmatch(r'TURNS:\s*([0-9]+)',turns)
        if not match:raise VisionError('unreadable base production turns: '+repr(turns))
        left=re.fullmatch(r'([0-9]+) - ([0-9]+)',self.mineral_label(image,'minerals_left'))
        right=re.fullmatch(r'=?\s*([+-]?[0-9]+)',self.mineral_label(image,'minerals_right'))
        if not left or not right:raise VisionError('unreadable visible mineral resource row')
        samples=[image.getpixel((22+14*x,y)) for y in (675,707) for x in range(8)]
        if any(p not in ((176,212,235),(120,164,212)) for p in samples):raise VisionError('unexpected production-grid measurement palette')
        return dict(project=project,turns=int(match[1]),mineral_intake=int(left[1]),mineral_consumption=int(left[2]),mineral_surplus=int(right[1]),bright_grid_samples=samples.count((176,212,235)),dim_grid_samples=samples.count((120,164,212)))

def native(driver):
    state=original.native(driver);m=NativeMemory(driver)
    try:
        count=m.image_word(0x009A64C8);units=[];origin=None
        for i in range(count):
            raw=m.read(m.address(0x00952828)+52*i,52)
            if raw[14]!=1:continue
            origin=struct.unpack_from('<hh',raw)
            units.append(dict(prototype_id=struct.unpack_from('<h',raw,10)[0],order_code=raw[17],movement_spent=raw[40],damage=raw[16]))
        town=city(driver,origin);base_raw=m.read(m.address(0x0097D040)+308*town['city']['id'],308)
        return dict(turn=state['turn'],raw_mineral_field=state['city']['minerals'],current_project_id=struct.unpack_from('<i',base_raw,80)[0],queue_size=struct.unpack_from('<i',base_raw,76)[0],city={k:state['city'][k] for k in ('population','workers','doctors','worked_tiles','nutrients')},units=units)
    finally:m.close()

def double_click(driver,x,y):
    subprocess.run(['xdotool','mousemove',str(x),str(y),'sleep','.3','click','--repeat','2','--delay','100','1','sleep','.5','mousemove','10','10'],env=driver.env,check=True,timeout=10)

def map_ready(driver,vision,path,expected):
    deadline=time.monotonic()+45;previous=None;interrupted=None;retried=False;time.sleep(1.2)
    while time.monotonic()<deadline:
        driver.snapshot(path);image=vision.Image.open(path)
        try:
            vision.require_text(image,(175,214,850,242),'COMMUNICATIONS OFFICER')
            vision.require_text(image,(183,435,840,458),'CLOSE THE CHANNEL')
        except VisionError:pass
        else:
            original.click(driver,350,446);original.click(driver,510,498)
            interrupted=time.monotonic();previous=None;continue
        state=native(driver)
        if state['turn']>expected:raise ProtocolError('original production advanced beyond requested checkpoint')
        try:vision.require_text(image,(785,572,1013,598),'TURN COMPLETE')
        except VisionError:previous=None;time.sleep(.2);continue
        if state['turn']==expected and state==previous:return state
        # Same bounded resume control used by the existing turn harness: an
        # actual declined channel can return to the paused prior-year map.
        if state['turn']==expected-1 and interrupted is not None and not retried and time.monotonic()-interrupted>=8:
            original.click(driver,890,584);retried=True;previous=None;continue
        previous=state if state['turn']==expected else None;time.sleep(.2)
    raise ProtocolError('original production map did not settle at turn '+str(expected))


def capture(driver,vision,directory,turn):
    before=native(driver)
    if before['turn']!=turn:raise ProtocolError('production stock checkpoint year differs')
    original.click(driver,60,540);original.click(driver,25,376);original.click(driver,280,570)
    operations=vision.wait(driver,vision.operations,directory/f'operations-{turn}.png',45)
    double_click(driver,300,75)
    panel=vision.wait(driver,vision.panel,directory/f'base-{turn}.png',45);after=native(driver)
    original.key(driver,'Escape');vision.wait(driver,vision.operations,directory/f'operations-return-{turn}.png',45)
    original.click(driver,630,520);map_ready(driver,vision,directory/f'closed-{turn}.png',turn)
    return dict(before=before,operations=operations,panel=panel,after=after)

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases'];initial=fingerprint()
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown production stock contract')
        validate_input(c['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=original.FactionVision();vision=StockVision();driver=None;rows=[]
    print('Original production stock artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=original.OriginalDriver(args.assets,args.wine,work)
        for c in cases:
            directory=work/c['id'];directory.mkdir();allocation=original.prepare(driver,observer,vision,directory)
            trace=[capture(driver,vision,directory,1)]
            for i in range(c['input']['advances']):
                original.click(driver,890,584);map_ready(driver,vision,directory/f'map-{i+1}.png',i+2)
            trace.append(capture(driver,vision,directory,6));output=dict(initial_allocation=allocation,trace=trace);validate_output(output)
            rows.append(dict(id=c['id'],status='ok',output=output));(directory/'observed.json').write_text(json.dumps(output,indent=2)+'\n')
        if fingerprint()!=initial:raise ProtocolError('production stock observer changed during capture')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,map_sha256=hashlib.sha256(original.arid_map()).hexdigest(),
            fixture='Unchanged stock Gaian/Citizen/Blind-off/held-Scout synthetic flat-arid40x80 science fixture, actual50/0/50 allocation; communications channels declined if interrupted; endpoint Base Operations and base-panel observations; five real turn advances',
            observation='Independent rendered project/numeric pair/turns in Base Operations, actual base-panel project/turns/mineral resource numerals and16 grid palette samples, read-only raw field/project ID/roster/context before and after panel',
            scope='Optional asset-backed bounded endpoint comparison; numeric pair semantics beyond this fixture and unconditional startup mineral rules are not inferred',ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original production stock failed: '+str(e),file=sys.stderr);sys.exit(1)
