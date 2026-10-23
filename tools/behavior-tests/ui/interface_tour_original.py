"""Record actual original interface-tour controls without native-state writes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from protocol import ProtocolError,load_request,write_response
from ui.opening_sequence_original import OriginalDriver,FactionVision,JobVision,observe,opening_dialog,native_turn
from ui.faction_setup_native import NativeMemory
from ui.ingame_menu_vision import IngameMenuVision
from ui.vision import VisionError,consensus
from ui.interface_tour_vision import read
from ui import interface_tour_vision, interface_tour_contract
from ui.interface_tour_contract import ALGORITHM,TOPICS,validate_input,validate_output
from ui import opening_sequence_original, ingame_menu_vision

def fingerprint():
    digest=hashlib.sha256(opening_sequence_original.fingerprint().encode())
    for path in [Path(__file__),Path(interface_tour_vision.__file__),Path(interface_tour_contract.__file__),Path(ingame_menu_vision.__file__)]:
        digest.update(path.read_bytes())
    return digest.hexdigest()

def commlink_open(vision,image):
    panel=image.convert('RGB').crop((889,358,1023,517))
    if sum(p==(11,18,24) for p in panel.getdata())<=4000:return False
    vision.require_text(image,(897,360,1017,384),'NO CONTACTS')
    return True

def owned_units(driver):
    memory=NativeMemory(driver)
    try:
        mask=memory.read(memory.address(0x9A64E8),1)[0]
        if mask not in (2,4,8,16,32,64,128):raise ProtocolError('Expected one actual human owner')
        owner=mask.bit_length()-1; count=memory.image_word(0x9A64C8)
        if not 0<=count<=2048:raise ProtocolError('Unbounded actual unit count')
        width,height=memory.image_word(0x949870),memory.image_word(0x949874)
        if not 2<=width<=4096 or not 2<=height<=4096 or width*height>2097152:raise ProtocolError('Unbounded actual world')
        result=[]
        for index in range(count):
            raw=memory.read(memory.address(0x952828)+index*52,52)
            if raw[14]==owner:
                x,y=struct.unpack_from('<hh',raw)
                if not 0<=x<width or not 0<=y<height or (x+y)%2:raise ProtocolError('Invalid actual human unit location')
                result.append((index,raw[:4].hex(),raw[10:12].hex(),raw[16],raw[17],raw[40]))
        if not result:raise ProtocolError('No actual human units')
        return result
    finally:memory.close()

def buttons(menu,image):
    pixels=image.load();runs={}
    for y in range(768):
        x=0
        while x<1024:
            if pixels[x,y]!=(103,91,181):x+=1;continue
            left=x
            while x<1024 and pixels[x,y]==(103,91,181):x+=1
            if x-left>=100:runs.setdefault((left,x),[]).append(y)
    result=[]
    for (left,right),ys in runs.items():
        top,bottom=min(ys),max(ys)+1
        if not 12<=bottom-top<=30:continue
        crop=image.crop((left,top,right,bottom))
        mask=menu.vision.Image.new('L',crop.size,255)
        mask.putdata([0 if p==(0,0,0) else 255 for p in crop.getdata()])
        try:label=menu.text(mask)
        except VisionError:continue
        result.append({'label':label,'x':(left+right)//2,'y':(top+bottom)//2})
    result.sort(key=lambda row:(row['y'],row['x']))
    return result

def tokens(text):return set(re.findall(r'[A-Z0-9]+',text.upper()))

def documents():
    source=(ASSETS/'tutor.txt').read_text(encoding='latin1')
    result={}
    for block in re.split(r'(?m)^#(?=[A-Z])',source)[1:]:
        lines=block.splitlines();key=lines[0].strip()
        if key.startswith('TOUR'):
            body=' '.join(line for line in lines[1:] if not line.startswith('#'))
            result[key]=tokens(re.sub(r'\$[A-Z0-9]+','',body))
    return result

def topic(vision,image,docs):
    lines=read(vision,image)
    texts=[line['text'] for line in lines if not line['text'].startswith('OCR ERROR')]
    actual=tokens(' '.join(texts))
    if len(actual)<5:raise VisionError('No complete original tour body is visible')
    scores=sorted(((len(actual & words)/len(actual | words),key) for key,words in docs.items()),reverse=True)
    score,key=scores[0]
    if score<.35:raise VisionError('Unrecognized actual tour text: '+repr(scores[:3]))
    other=[entry for entry in scores if TOPICS.get(entry[1],entry[1]) != TOPICS.get(key,key)]
    if other and score-other[0][0]<.09:raise VisionError('Ambiguous actual tour topic')
    return key

def prepare(driver,observer,vision,directory):
    driver.reset()
    for n,label in enumerate(['START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN']):
        _,controls=observe(driver,observer.vision,directory/f'prelude-{n}.png',60,startup=n==0)
        matches=[row for row in controls if row['text']==label]
        if len(matches)!=1:raise ProtocolError('Opening control absent: '+label)
        driver.click(matches[0]['x'],matches[0]['y'])
    _,controls=observe(driver,observer.vision,directory/'prelude-rules.png',30)
    matches=[row for row in controls if row['text'].startswith('PLAY WITH STANDARD RULE')]
    if len(matches)!=1:raise ProtocolError('Standard rules absent')
    driver.click(matches[0]['x'],matches[0]['y'])
    roster=observer.wait(driver,directory/'prelude-factions.png',30)
    if roster['screen']!='factions' or roster['selected']!=0 or roster['random'] or not roster['items'][0].startswith('The Cybernetic Consciousness|'):
        raise ProtocolError('Wrong declared faction context')
    driver.key('Enter');name=observer.wait(driver,directory/'prelude-name.png',30)
    if name['screen']!='name' or name['values']!=['Aki Zeta-5']:raise ProtocolError('Wrong leader context')
    driver.key('Enter')
    vision.wait(driver,lambda image:opening_dialog(observer,image),directory/'prelude-planetfall.png',60)
    driver.key('Enter')
    vision.wait(driver,lambda image:vision.require_text(image,(260,256,765,286),'FIRST BASE'),directory/'prelude-first-base.png',60)
    driver.key('Enter')
    vision.wait(driver,lambda image:vision.require_text(image,(40,724,220,749),'TOUR'),directory/'prelude-tour-prompt.png',30)
    if native_turn(driver)!=1:raise ProtocolError('Tour prompt is not native turn one')

def run(cases):
    initial_fingerprint=fingerprint()
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    work=Path(tempfile.mkdtemp(prefix='capture-',dir=ARTIFACTS))
    observer=FactionVision();vision=JobVision();menu=IngameMenuVision();driver=None
    docs=documents();results=[]
    try:
        driver=OriginalDriver(ASSETS,WINE,work)
        for case in cases:
            directory=work/case['id'];directory.mkdir();prepare(driver,observer,vision,directory)
            frames=[];all_frames=[];initial_units=owned_units(driver)
            prompt=vision.Image.open(directory/'prelude-tour-prompt.png').convert('RGB')
            targets=[row for row in buttons(menu,prompt) if row['label']=='TOUR']
            if len(targets)!=1:raise ProtocolError('Actual opening Tour control is absent')
            frame={'topic':'tour-prompt','native_turn':native_turn(driver),'menu_open':menu.headers(prompt) is not None,
                   'commlink_open':commlink_open(vision,prompt),'buttons':[row['label'] for row in buttons(menu,prompt)]}
            frames.append(frame);all_frames.append(dict(image='prelude-tour-prompt.png',**frame))
            driver.click(targets[0]['x'],targets[0]['y'])
            for step in range(45):
                path=directory/f'page-{step:02d}.png'
                if case['input']['finish']=='early' and step==1:
                    vision.wait(driver,lambda image:vision.require_text(image,(5,637,137,660),'SCOUT PATROL'),path,30)
                    image=vision.Image.open(path).convert('RGB')
                    if read(observer.vision,image):raise ProtocolError('Tour body remains after actual End Tour')
                    frame={'topic':'map','native_turn':native_turn(driver),'menu_open':menu.headers(image) is not None,'commlink_open':commlink_open(vision,image),'buttons':[row['label'] for row in buttons(menu,image)]}
                    frames.append(frame);all_frames.append(dict(image=path.name,**frame));break
                key=vision.wait(driver,lambda image:topic(observer.vision,image,docs),path,30)
                image=vision.Image.open(path).convert('RGB')
                headers=menu.headers(image)
                comm=commlink_open(vision,image)
                actual_buttons=buttons(menu,image)
                frame={'topic':TOPICS.get(key,key),'native_turn':native_turn(driver),'menu_open':headers is not None,'commlink_open':comm,'buttons':[row['label'] for row in actual_buttons]}
                all_frames.append(dict(image=path.name,**frame))
                if key in TOPICS:frames.append(frame)
                (directory/'all-pages.json').write_text(json.dumps(all_frames,indent=2)+'\n')
                if case['input']['finish']=='early':
                    targets=[row for row in actual_buttons if row['label']=='END TOUR']
                    if len(targets)!=1:raise ProtocolError('Actual End Tour control absent')
                    driver.click(targets[0]['x'],targets[0]['y'])
                else:driver.key('Enter')
                if key=='TOUROVER':
                    path=directory/'map-restored.png'
                    vision.wait(driver,lambda image:vision.require_text(image,(5,637,137,660),'SCOUT PATROL'),path,30)
                    image=vision.Image.open(path).convert('RGB')
                    if read(observer.vision,image):raise ProtocolError('Tour body still visible after Close')
                    frame={'topic':'map','native_turn':native_turn(driver),'menu_open':menu.headers(image) is not None,'commlink_open':commlink_open(vision,image),'buttons':[row['label'] for row in buttons(menu,image)]}
                    frames.append(frame);all_frames.append(dict(image=path.name,**frame));break
            else:raise ProtocolError('Original guided tour did not terminate within declared bound')
            (directory/'all-pages.json').write_text(json.dumps(all_frames,indent=2)+'\n')
            results.append(dict(id=case['id'],status='ok',output={'frames':frames,'completed':True,'failure':None,'units_unchanged':owned_units(driver)==initial_units}))
            print('Captured actual original tour '+case['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial_fingerprint:raise ProtocolError('Original tour observer changed during recording')
        for case,result in zip(cases,results):validate_output(result['output'],case)
        metadata=dict(driver.metadata,adapter_sha256=initial_fingerprint,
          ocr_version=observer.vision.version,ocr_model_sha256=observer.vision.model_sha256,
          viewport=[1024,768],
          readonly_fields=[{'name':'native_turn','rva':'0x5a64d4','bytes':4},
                           {'name':'human_owner_mask','rva':'0x5a64e8','bytes':1},
                           {'name':'unit_count','rva':'0x5a64c8','bytes':4},
                           {'name':'unit_records','rva':'0x552828','stride':52,'limit':2048},
                           {'name':'world_width','rva':'0x549870','bytes':4},
                           {'name':'world_height','rva':'0x549874','bytes':4}],
          tutor_sha256=hashlib.sha256((ASSETS/'tutor.txt').read_bytes()).hexdigest(),
          observation='Actual normal opening, Tour click, Enter Continue/Close or first-page right End Tour. Installed-source topic classification from actual screenshots; native turn and human unit state read only.',
          boundaries='Projected mandatory interface-control pages only. Unseeded terrain-dependent pages retained in private captures but excluded from expected packet. No font/layout/arrow/terrain/animation/AI equivalence claim.')
        write_response(metadata,results)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close();menu.close()

def main():
    global ASSETS,WINE,ARTIFACTS
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets',type=Path,required=True)
    parser.add_argument('--wine',required=True)
    parser.add_argument('--artifacts',type=Path,required=True)
    args=parser.parse_args();ASSETS=args.assets;WINE=args.wine;ARTIFACTS=args.artifacts
    cases=load_request()['cases']
    for case in cases:
        if case['algorithm']!=ALGORITHM:raise ProtocolError('Unsupported interface tour algorithm')
        validate_input(case['input'])
    run(cases)

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError) as error:
        print('Original interface tour failed: '+str(error),file=sys.stderr)
        sys.exit(1)
