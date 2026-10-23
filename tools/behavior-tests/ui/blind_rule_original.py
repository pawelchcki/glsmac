#!/usr/bin/env python3
"""Observe the real Blind Research checkbox, setup returns and playable handoff."""
import argparse,hashlib,json,subprocess,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui.research_choice_original import OriginalDriver,FactionVision,ResearchVision,key,click,fingerprint as dependency_fingerprint
from ui.faction_identity_original import opening_dialog
from ui.former_work_original import choose
from ui.blind_rule_contract import ALGORITHM,validate_input,validate_output
from ui.vision import VisionError
DIRECTORY=Path(__file__).resolve().parent

def fingerprint():
    h=hashlib.sha256(dependency_fingerprint().encode())
    for n in ('blind_rule_original.py','blind_rule_contract.py'):h.update((DIRECTORY/n).read_bytes())
    return h.hexdigest()

class RuleVision(ResearchVision):
    def state(self,image,path):
        image=image.convert('RGB')
        try:self.require_text(image,(345,280,1015,310),'CUSTOMIZE GAME RULES');custom=True
        except VisionError:custom=False
        if custom:
            count=sum(r>50 and b>100 for r,g,b in image.crop((353,517,371,535)).getdata())
            if not(count<10 or count>50):raise VisionError('ambiguous Blind Research checkbox')
            return dict(screen='custom-rules',caption=self.text(image,(380,283,980,307)),
                blind=dict(label=self.ink(image,(377,517,1004,536),(0,0,0)),checked=count>50),
                buttons=[self.ink(image,box,(0,0,0)) for box in ((353,729,562,748),(574,729,783,748),(796,729,1006,748))])
        for screen,box,label in (
            ('priorities',(200,259,820,282),'CONFIRM RESEARCH PRIORITIES'),
            ('directed',(40,25,984,51),'SELECT RESEARCH GOAL'),
            ('factions',(12,13,788,35),'CHOOSE YOUR FACTIONS')):
            try:
                self.require_text(image,box,label)
                return dict(screen=screen,caption=self.text(image,box))
            except VisionError:pass
        menu,_=self.vision.read(path)
        return dict(screen='menu',caption=menu['caption'],entries=menu['entries'],selected=menu['selected'])


def observe(driver,vision,path,timeout):
    deadline=time.monotonic()+timeout;previous=None;last=None;time.sleep(.35)
    while time.monotonic()<deadline:
        driver.snapshot(path)
        try:
            state=vision.state(vision.Image.open(path),path)
            if state==previous:return state
            previous=state
        except (VisionError,ProtocolError,OSError,ValueError) as e:last=str(e);previous=None
        time.sleep(.15)
    raise ProtocolError('Blind Research rule observation timed out: '+str(path)+'; '+str(last))


def play(driver,observer,vision,directory,timeout):
    observer.wait(driver,directory/'factions.png',timeout);click(driver,135,88);click(driver,550,147);key(driver,'Return')
    if observer.wait(driver,directory/'name.png',timeout)['screen']!='name':raise ProtocolError('Gaian name confirmation absent')
    key(driver,'Return');vision.wait(driver,lambda im:opening_dialog(observer,im),directory/'opening.png',timeout);key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(260,256,765,286),'FIRST BASE'),directory/'base-name.png',timeout);key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(40,724,220,749),'TOUR'),directory/'tour.png',timeout);click(driver,365,735);key(driver,'shift+r')
    # Directed research has a first-use About Research tutorial; blind mode
    # directly opens priorities. Accept only that actually observed tutorial.
    time.sleep(.7);path=directory/'research-entry.png';driver.snapshot(path)
    try:
        vision.require_text(vision.Image.open(path),(200,329,820,357),'ABOUT RESEARCH');click(driver,510,424)
    except VisionError:pass


def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);p.add_argument('--timeout',type=float,default=45);args=p.parse_args()
    cases=load_request()['cases'];initial=fingerprint()
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown Blind Research rule contract')
        validate_input(c['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=FactionVision();vision=RuleVision();driver=None;results=[]
    print('Original rule artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=OriginalDriver(args.assets,args.wine,work)
        for c in cases:
            directory=work/c['id'];directory.mkdir();driver.reset()
            for i,label in enumerate(('START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN','CUSTOMIZE RULES')):choose(driver,observer,label,directory/f'menu-{i}.png',args.timeout,startup=i==0)
            trace=[observe(driver,vision,directory/'checkpoint-0.png',args.timeout)]
            for i,a in enumerate(c['input']['actions']):
                if isinstance(a,dict):choose(driver,observer,a['choose'],directory/f'choose-{i}.png',args.timeout)
                elif a=='toggle':click(driver,362,525)
                elif a=='OK':click(driver,679,738)
                elif a=='cancel':click(driver,900,738)
                elif a=='standard-button':click(driver,450,738)
                elif a=='Escape':key(driver,'Escape')
                elif a=='play':play(driver,observer,vision,directory,args.timeout)
                trace.append(observe(driver,vision,directory/f'checkpoint-{i+1}.png',args.timeout))
            out=dict(trace=trace);validate_output(out);results.append(dict(id=c['id'],status='ok',output=out));(directory/'observed.json').write_text(json.dumps(out,indent=2)+'\n')
            print('Captured Blind Research rule: '+c['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('rule reference changed during capture')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,
            fixture='Fresh Tiny/Citizen custom rules; only Blind Research toggle or Standard Rules reset; optional current-rules Gaian first-base handoff; no gameplay turn advanced',
            observation='Actual source caption/button/Blind Research label and checked glyph; real return menus, faction selector and first research screen; optional asset-backed evidence',
            ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),results)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original Blind Research rule failed: '+str(e),file=sys.stderr);sys.exit(1)
