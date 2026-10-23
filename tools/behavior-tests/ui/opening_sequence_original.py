#!/usr/bin/env python3
"""Observe natural opening phases and native turns through actual original input."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui.drivers import OriginalDriver
from ui.probe import observe
from ui.faction_setup_original_v2 import FactionVision
from ui.faction_setup_native import NativeMemory
from ui.faction_identity_original import opening_dialog
from ui.citizen_job_original import JobVision
from ui.vision import VisionError, consensus
from ui.opening_sequence_contract import ALGORITHM, validate_input, validate_output

DIRECTORY = Path(__file__).parent


def fingerprint():
    digest = hashlib.sha256()
    for name in ['opening_sequence_original.py','opening_sequence_contract.py','drivers.py','probe.py',
                 'faction_setup_original.py','faction_setup_original_v2.py','faction_setup_native.py',
                 'faction_identity_original.py','citizen_job_original.py','vision.py']:
        digest.update((DIRECTORY/name).read_bytes())
    return digest.hexdigest()


def native_turn(driver):
    memory = NativeMemory(driver)
    try:
        turn = memory.image_word(0x009A64D4, signed=True)
        if not 0 <= turn <= 10000: raise ProtocolError('Unbounded original opening turn')
        return turn
    finally: memory.close()


def editor_value(vision, image):
    # The in-game editor has a different native class from faction setup.
    # Read its actually selected draft, without relaxing a native type guard.
    image = image.convert('RGB'); crop = image.crop((270,292,751,317))
    selected = (100,81,63)
    points = [(x,y) for y in range(crop.height) for x in range(crop.width)
              if crop.getpixel((x,y)) == selected]
    if not points: raise VisionError('First-base draft selection is not visible')
    left,right = min(x for x,y in points),max(x for x,y in points)+1
    top,bottom = min(y for x,y in points),max(y for x,y in points)+1
    crop = crop.crop((left,top,right,bottom))
    mask = vision.Image.new('L',crop.size,255)
    mask.putdata([0 if pixel == (0,0,0) else 255 for pixel in crop.getdata()])
    bounds = mask.point(lambda value:255-value).getbbox()
    if bounds is None: return ''
    mask = vision.ImageOps.expand(mask.crop(bounds),8,255)
    return consensus([vision.text(mask.resize((mask.width*scale,mask.height*scale),
                                              vision.Image.Resampling.LANCZOS)) for scale in (3,4,5)])


def capture_case(driver, observer, vision, case, directory):
    directory.mkdir(); driver.reset()
    for index,label in enumerate(['START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN']):
        menu, controls = observe(driver,observer.vision,directory/f'prelude-{index}.png',60 if index == 0 else 30,startup=index == 0)
        matches = [control for control in controls if control['text'] == label]
        if len(matches) != 1: raise ProtocolError('Actual opening control absent: '+label)
        driver.click(matches[0]['x'],matches[0]['y'])
    menu,controls = observe(driver,observer.vision,directory/'prelude-rules.png',30)
    # At this declared font environment the original clips the final letters.
    matches = [control for control in controls if control['text'].startswith('PLAY WITH STANDARD RULE')]
    if len(matches) != 1: raise ProtocolError('Actual standard-rules control absent')
    driver.click(matches[0]['x'],matches[0]['y'])
    roster = observer.wait(driver,directory/'prelude-factions.png',30)
    if roster['screen'] != 'factions' or roster['selected'] != 0 or roster['random']:
        raise ProtocolError('Original explicit initial faction is not selected')
    if not roster['items'][0].startswith('The Cybernetic Consciousness|'):
        raise ProtocolError('Original opening faction differs from declared context')
    driver.key('Enter')
    name = observer.wait(driver,directory/'prelude-name.png',30)
    if name['screen'] != 'name' or name['values'] != ['Aki Zeta-5']:
        raise ProtocolError('Original initial leader-name context differs')
    driver.key('Enter')
    frames = []
    def save(phase, caption=None, value=None):
        turn = native_turn(driver)
        if native_turn(driver) != turn: raise ProtocolError('Original turn changed during observation')
        frames.append(dict(phase=phase,caption=caption,value=value,native_turn=turn))
        (directory/'progress.json').write_text(json.dumps({'frames':frames},indent=2)+'\n')
    caption = vision.wait(driver,lambda image:opening_dialog(observer,image),directory/'00-planetfall.png',60)
    save('planetfall',caption)
    if case['input']['confirmation'] == 'keyboard': driver.key('Enter')
    else: driver.click(707,737)
    # This waits for the actual post-landing editor, not an artificial B action.
    def first_name(image):
        vision.require_text(image,(260,256,765,286),'FIRST BASE')
        return observer.region(image.convert('RGB'),(264,259,755,283))
    caption = vision.wait(driver,first_name,directory/'01-first-base-name.png',60)
    save('first-base-name',caption,editor_value(observer.vision,vision.Image.open(directory/'01-first-base-name.png')))
    if case['input']['confirmation'] == 'keyboard': driver.key('Enter')
    else: driver.click(510,345)
    vision.wait(driver,lambda image:vision.require_text(image,(40,724,220,749),'TOUR'),directory/'02-tour.png',30)
    save('tour')
    # Click the actual right-hand dismissal control, without inferring its text.
    driver.click(365,735)
    def map_ready(image):
        return vision.require_text(image,(5,637,137,660),'SCOUT PATROL')
    vision.wait(driver,map_ready,directory/'03-first-turn.png',30)
    save('map')
    subprocess.run(['xdotool','key','--clearmodifiers','space'],env=driver.env,check=True,timeout=10)
    previous = frames[-1]['native_turn']
    def next_turn(image):
        map_ready(image)
        actual = native_turn(driver)
        if actual == previous: raise VisionError('Original next turn has not started')
        return actual
    vision.wait(driver,next_turn,directory/'04-next-turn.png',60)
    save('map')
    output = dict(frames=frames,completed=True,failure=None); validate_output(output,case)
    return output


def capture(cases,args):
    initial=fingerprint(); args.artifacts.mkdir(parents=True,exist_ok=True)
    work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts)); observer=FactionVision(); vision=JobVision();driver=None
    try:
        driver=OriginalDriver(args.assets,args.wine,work);results=[]
        for case in cases:
            output=capture_case(driver,observer,vision,case,work/case['id'])
            results.append(dict(id=case['id'],status='ok',output=output))
            print('Captured original opening sequence: '+case['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('Opening sequence observer changed during capture')
        return dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,viewport=[1024,768],
                    observation='Actual fresh explicit-Cybernetic Tiny/Citizen/standard new game; rendered dialog phases and editor, read-only native turn counter',
                    readonly_fields=[{'name':'native_turn','rva':hex(0x009A64D4-0x00400000),'bytes':4}],
                    boundaries='Only declared keyboard/pointer confirmations, initial base-name value, right-hand tour dismissal and Space first-turn progression. No paragraph, font, geometry, animation, HUD-year, city resources, world generation, opponent or AI parity claim',
                    ocr_version=observer.vision.version,ocr_model_sha256=observer.vision.model_sha256),results
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--assets',type=Path,required=True)
    parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True)
    args=parser.parse_args();cases=load_request()['cases'];supported=[case for case in cases if case['algorithm']==ALGORITHM]
    for case in supported:validate_input(case['input'])
    metadata,results=capture(supported,args) if supported else ({'name':'opening-sequence-original','kind':'adapter'},[])
    iterator=iter(results);write_response(metadata,[next(iterator) if case['algorithm']==ALGORITHM else
        dict(id=case['id'],status='unsupported',reason='unknown opening sequence contract') for case in cases])


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:
        print('Original opening sequence failed: '+str(error),file=sys.stderr);sys.exit(1)
