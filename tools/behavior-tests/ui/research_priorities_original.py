#!/usr/bin/env python3
"""Observe actual initial blind-priority labels, checkboxes and return paths."""
import argparse,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui.research_choice_original import OriginalDriver,FactionVision,ResearchVision,key,click,fingerprint as dependency_fingerprint
from ui.faction_identity_original import opening_dialog
from ui.former_work_original import choose
from ui.research_priorities_contract import ALGORITHM,validate_input,validate_output
from ui.vision import VisionError
DIRECTORY=Path(__file__).resolve().parent

def fingerprint():
    h=hashlib.sha256(dependency_fingerprint().encode())
    for n in ('research_priorities_original.py','research_priorities_contract.py'):h.update((DIRECTORY/n).read_bytes())
    return h.hexdigest()

class PriorityVision(ResearchVision):
    def state(self,image):
        image=image.convert('RGB')
        try:self.require_text(image,(165,256,855,286),'CONFIRM RESEARCH PRIORITIES')
        except VisionError:
            self.require_text(image,(5,633,135,657),'SCOUT PATROL');return dict(screen='map')
        rows=[]
        for i in range(4):
            y=341+22*i
            count=sum(r>50 and b>100 for r,g,b in image.crop((185,y,203,y+18)).getdata())
            if not (count<10 or count>50):raise VisionError('ambiguous original priority checkbox')
            rows.append(dict(label=self.ink(image,(208,y,835,y+19),(0,0,0)),checked=count>50))
        return dict(screen='priorities',caption=self.text(image,(200,259,820,282)),rows=rows,buttons=[self.ink(image,(185,437,835,456),(0,0,0))])

def prepare(driver,observer,vision,directory,timeout):
    driver.reset()
    for i,label in enumerate(('START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN','PLAY WITH STANDARD RULES')):choose(driver,observer,label,directory/f'menu-{i}.png',timeout,startup=i==0)
    observer.wait(driver,directory/'factions.png',timeout);click(driver,135,88);click(driver,550,147);key(driver,'Return')
    if observer.wait(driver,directory/'name.png',timeout)['screen']!='name':raise ProtocolError('Gaian name confirmation absent')
    key(driver,'Return');vision.wait(driver,lambda im:opening_dialog(observer,im),directory/'opening.png',timeout);key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(260,256,765,286),'FIRST BASE'),directory/'base-name.png',timeout);key(driver,'Return')
    vision.wait(driver,lambda im:vision.require_text(im,(40,724,220,749),'TOUR'),directory/'tour.png',timeout);click(driver,365,735);key(driver,'shift+r')
    return vision.wait(driver,vision.state,directory/'checkpoint-0.png',timeout)

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);p.add_argument('--timeout',type=float,default=45);args=p.parse_args()
    cases=load_request()['cases'];initial=fingerprint()
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown blind-priority contract')
        validate_input(c['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=FactionVision();vision=PriorityVision();driver=None;results=[]
    print('Original priorities artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=OriginalDriver(args.assets,args.wine,work)
        for c in cases:
            directory=work/c['id'];directory.mkdir();trace=[prepare(driver,observer,vision,directory,args.timeout)]
            for i,a in enumerate(c['input']['actions']):
                if isinstance(a,dict):click(driver,194,350+22*a['toggle'])
                elif a=='OK':click(driver,510,446)
                else:key(driver,dict(open='shift+r',Enter='Return',Escape='Escape')[a])
                trace.append(vision.wait(driver,vision.state,directory/f'checkpoint-{i+1}.png',args.timeout))
            out=dict(trace=trace);validate_output(out);results.append(dict(id=c['id'],status='ok',output=out));(directory/'observed.json').write_text(json.dumps(out,indent=2)+'\n')
            print('Captured blind priorities: '+c['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('priority reference changed during capture')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,
            fixture='Fresh Tiny/Citizen/Standard Rules/base Gaians; first base and Tour closed; Shift+R; no turn advanced',
            observation='Rendered caption, four source labels and checkbox glyph states, actual OK label and map/dialog return state; optional asset-backed evidence',
            ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),results)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original priorities failed: '+str(e),file=sys.stderr);sys.exit(1)
