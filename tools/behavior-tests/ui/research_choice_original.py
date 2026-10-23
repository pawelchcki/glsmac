#!/usr/bin/env python3
"""Record real original initial directed-research cards and native selected goal.

Only real keyboard/pointer input is delivered. The original executable, memory
and installed text are never patched. Each case starts a fresh original process.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.drivers import OriginalDriver
from ui.faction_setup_original_v2 import FactionVision
from ui.citizen_job_original import JobVision
from ui.faction_identity_original import opening_dialog
from ui.former_work_original import choose
from ui.probe import observe
from ui.faction_setup_native import NativeMemory
from ui.vision import VisionError, consensus
from ui.research_choice_contract import ALGORITHM, validate_input, validate_output
DIRECTORY=Path(__file__).resolve().parent


def fingerprint():
    digest=hashlib.sha256()
    for name in ('research_choice_original.py','research_choice_contract.py','drivers.py','vision.py',
                 'faction_setup_original_v2.py','faction_setup_original.py','citizen_job_original.py',
                 'faction_identity_original.py','former_work_original.py','probe.py','faction_setup_native.py'):
        digest.update((DIRECTORY/name).read_bytes())
    return digest.hexdigest()


def key(driver, value):
    subprocess.run(['xdotool','keydown','--clearmodifiers',value,'sleep','.18','keyup',value,'sleep','.20'],
                   env=driver.env,check=True,timeout=10)


def click(driver,x,y):
    subprocess.run(['xdotool','mousemove','--sync',str(x),str(y),'sleep','.25','mousedown','1',
                    'sleep','.18','mouseup','1','sleep','.25','mousemove','10','10'],
                   env=driver.env,check=True,timeout=10)


class ResearchVision(JobVision):
    def ink(self,image,box,color):
        crop=image.convert('RGB').crop(box); mask=self.Image.new('L',crop.size,255)
        mask.putdata([0 if p==color else 255 for p in crop.getdata()])
        mask=self.vision.ImageOps.expand(mask,8,255)
        return consensus([self.vision.text(mask.resize((mask.width*s,mask.height*s),self.Image.Resampling.NEAREST)) for s in (2,3,4)])

    def state(self,image):
        image=image.convert('RGB')
        try:
            self.require_text(image,(40,25,984,51),'SELECT RESEARCH GOAL')
        except VisionError:
            self.require_text(image,(5,633,135,657),'SCOUT PATROL')
            return dict(screen='map')
        choices=[]
        for i in range(7):
            x=40+(i%4)*236;y=55+(i//4)*345
            name=self.ink(image,(x+2,y+3,x+230,y+28),(60,148,124))
            # Category color is itself displayed and discovered from its glyphs.
            category=self.text(image,(x+10,y+30,x+225,y+49))
            choices.append(dict(name=name,category=category))
        return dict(screen='research',caption=self.text(image,(40,25,984,51)),choices=choices)


def prepare(driver,observer,vision,directory,timeout):
    driver.reset()
    for index,label in enumerate(('START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN','CUSTOMIZE RULES')):
        choose(driver,observer,label,directory/f'menu-{index}.png',timeout,startup=index==0)
    vision.wait(driver,lambda im:vision.require_text(im,(345,280,1015,310),'CUSTOMIZE GAME RULES'),directory/'rules.png',timeout)
    # Standard rules are the reset baseline. Toggle only the actual named row.
    image=vision.Image.open(directory/'rules.png')
    vision.require_text(image,(375,514,1005,538),'BLIND RESEARCH')
    click(driver,362,525);click(driver,679,738)
    observer.wait(driver,directory/'factions.png',timeout);click(driver,135,88);click(driver,550,147);key(driver,'Return')
    if observer.wait(driver,directory/'name.png',timeout)['screen']!='name':
        raise ProtocolError('missing actual Gaian name confirmation')
    key(driver,'Return')
    vision.wait(driver,lambda im:opening_dialog(observer,im),directory/'opening.png',timeout);key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(260,256,765,286),'FIRST BASE'),directory/'base-name.png',timeout)
    key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(40,724,220,749),'TOUR'),directory/'tour.png',timeout)
    click(driver,365,735);key(driver,'shift+r')
    vision.wait(driver,lambda im:vision.require_text(im,(200,329,820,357),'ABOUT RESEARCH'),directory/'about.png',timeout)
    click(driver,510,424)
    return wait_state(driver,vision,directory/'checkpoint-0.png',timeout)


def wait_state(driver,vision,path,timeout):
    def read(image):
        state=vision.state(image);memory=NativeMemory(driver)
        try:
            if memory.read(memory.address(0x009A64E8),1)[0]!=2 or memory.image_word(0x009A64D4)!=1:
                raise ProtocolError('initial research human faction/turn guard failed')
            goal=memory.image_word(0x0096EE78,signed=True)
            if not -1<=goal<=88:raise ProtocolError('invalid original selected research field')
            state['goal_id']=goal
        finally:memory.close()
        return state
    return vision.wait(driver,read,path,timeout)


def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True)
    p.add_argument('--artifacts',type=Path,required=True);p.add_argument('--timeout',type=float,default=45);args=p.parse_args()
    cases=load_request()['cases'];initial=fingerprint()
    for case in cases:
        if case['algorithm']!=ALGORITHM:raise ProtocolError('unknown research contract')
        validate_input(case['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
    observer=FactionVision();vision=ResearchVision();driver=None;rows=[]
    print('Original research artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=OriginalDriver(args.assets,args.wine,work)
        for case in cases:
            directory=work/case['id'];directory.mkdir();trace=[prepare(driver,observer,vision,directory,args.timeout)]
            for i,action in enumerate(case['input']['actions']):
                if action=='Escape':key(driver,'Escape')
                elif action=='open':key(driver,'shift+r')
                else:
                    if trace[-1]['screen']!='research':raise ProtocolError('research card absent')
                    slot=action['choose'];click(driver,155+(slot%4)*236,155+(slot//4)*345)
                trace.append(wait_state(driver,vision,directory/f'checkpoint-{i+1}.png',args.timeout))
            result=dict(trace=trace);validate_output(result);rows.append(dict(id=case['id'],status='ok',output=result))
            (directory/'observed.json').write_text(json.dumps(result,indent=2)+'\n')
            print('Recorded original research: '+case['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('research adapter changed during recording')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,
            fixture='Fresh Tiny/Citizen/Gaians; Customize Rules; only Blind Research toggled off; first base; no turn advanced; Shift+R and About Research OK',
            observation='Actual ordered research card titles/categories and read-only native selected research ID; human faction1 and turn1 guarded',
            ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:
        print('Original research capture failed: '+str(e),file=sys.stderr);sys.exit(1)
