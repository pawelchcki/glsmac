"""Capture actual owned-city Rename controls in fresh original fixtures."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, load_request, write_response
from ui import base_rename_contract as contract
from ui import starvation_dialog_original as ref
from ui.starvation_mineral_original import MineralVision, fingerprint as mineral_fingerprint
from ui.vision import VisionError, consensus, normalize

base = ref.base


class InitialManagementUnavailable(ProtocolError):
    pass


class RenameCaretVisible(VisionError):
    pass


def fingerprint():
    return hashlib.sha256(mineral_fingerprint().encode() + Path(__file__).read_bytes() + Path(contract.__file__).read_bytes()).hexdigest()


def patch_source(raw, data):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == '#RENAME']
    if len(starts) != 1: raise ProtocolError('Ambiguous RENAME source')
    start = starts[0]; end = next((i for i in range(start + 1, len(lines)) if re.fullmatch(r'#[A-Z][A-Z0-9_]*', lines[i].strip())), len(lines))
    captions = [i for i in range(start + 1, end) if lines[i].startswith('#caption ')]
    body = [i for i in range(start + 1, end) if lines[i].strip() and not lines[i].startswith(('#', ';'))]
    if len(captions) != 1 or len(body) != 2: raise ProtocolError('Unsupported RENAME source structure')
    lines[captions[0]] = '#caption ' + data['caption'] + '\r\n'
    for i, value in zip(body, (data['prompt'], data['label']), strict=True): lines[i] = value + '\r\n'
    return ''.join(lines).encode('latin1')


def profiles(assets):
    original = ref.text_files(assets, 'default'); result = {}
    for profile in contract.PROFILES:
        files = dict(original)
        for name, kind in [('script.txt', 'common'), ('xscript.txt', 'expansion')]:
            if profile not in (kind, 'both'): continue
            actual = next(key for key in files if key.lower() == name)
            files[actual] = patch_source(files[actual], contract.SOURCE_TEXT[kind])
        result[profile] = files
    return result


class RenameVision:
    def __init__(self, vision): self.vision = vision; self.reader = ref.NoticeVision(vision); self.field_left = None

    @staticmethod
    def present(image):
        return all(image.getpixel(point) == (28, 80, 99) for point in ((500, 430), (520, 430), (839, 430)))

    def draft(self, image):
        v = self.vision; selected = (100, 81, 63)
        band = image.crop((180, 385, 839, 407))
        selected_x = [x for y in range(band.height) for x in range(band.width) if band.getpixel((x,y)) == selected]
        if selected_x: self.field_left = 180 + min(selected_x)
        if self.field_left is None: raise VisionError('Rendered Rename field origin not observed')
        crop = image.crop((self.field_left, 385, 839, 407))
        points = [(x, y) for y in range(crop.height) for x in range(crop.width) if crop.getpixel((x, y)) == selected]
        if points:
            left = min(x for x, y in points); right = max(x for x, y in points) + 1
            top = min(y for x, y in points); bottom = max(y for x, y in points) + 1
            crop = crop.crop((left, top, right, bottom)); ink = {(x, y) for y in range(crop.height) for x in range(crop.width) if crop.getpixel((x, y)) == (0, 0, 0)}
        else:
            ink = {(x, y) for y in range(crop.height) for x in range(crop.width) if crop.getpixel((x, y)) == (120, 164, 212)}
            # A live caret can overwrite a glyph. Wait for a clean rendered
            # frame instead of reconstructing letters or deleting their pixels.
            columns = {}
            for x,y in ink: columns.setdefault(x,set()).add(y)
            if any(len(ys)>=18 and max(ys)-min(ys)>=18 for ys in columns.values()):
                raise RenameCaretVisible('Caret overlays Rename draft; wait for clean frame')
        if not ink: return ''
        mask = v.Image.new('L', crop.size, 255)
        for point in ink: mask.putpixel(point, 0)
        bounds = mask.point(lambda x: 255-x).getbbox(); mask = v.ImageOps.expand(mask.crop(bounds), 8, 255)
        return consensus([v.text(mask.resize((mask.width*scale, mask.height*scale), v.Image.Resampling.LANCZOS)).replace('’', "'") for scale in (3,4,5)])

    def title(self, image, vision):
        crop=image.crop((280,576,726,620))
        if not any(g>85 and g>r*1.2 and g>b*1.2 or r>100 and r>g*1.5 and r>b*1.5 for r,g,b in crop.getdata()): return ''
        return vision.line_at(image,(280,576,726,620))

    def read(self, image):
        if image.size != (1024,768) or not self.present(image): raise VisionError('Actual Rename controls absent')
        r = self.reader; value = self.draft(image)
        return dict(caption=r.text(image,(175,326,845,348)), prompt=r.text(image,(176,353,844,377)),
                    label=r.text(image,(180,385,self.field_left-1,408)), value=value,
                    buttons=[r.text(image,box,black=True) for box in ((183,420,505,441),(517,420,839,441))])


def click_control(driver, x, y):
    # Give the original event loop a frame at the target for each mouse edge.
    # An immediate move-away can leave its polled pointer outside the button.
    subprocess.run(['xdotool', 'mousemove', '--sync', str(x), str(y),
                    'sleep', '.20', 'mousedown', '1', 'sleep', '.18',
                    'mouseup', '1', 'sleep', '.20', 'mousemove', '10', '10'],
                   env=driver.env, check=True, timeout=10)


class RenameDriver(base.OriginalDriver):
    def click(self, x, y):
        # These controls establish the paused, tutorial-free initial fixture.
        # Apply the same explicit mouse-edge pacing used by the tested dialog.
        if (x, y) in ((428, 292), (428, 172), (300, 496)):
            click_control(self, x, y)
        else:
            super().click(x, y)


def capture(driver, observer, vision, case, path):
    path.mkdir(); native, origin = base.prepare(driver, observer, vision, {'input': {'profile':'stacked'}}, path, 45)
    initial_year = native['turn']; original = ref.full.city(driver, origin); c = original['city']
    if {key:c[key] for key in contract.INITIAL} != case['input']['initial_base']: raise ProtocolError('Original initial Rename city differs from declared input')
    identity = {key:c[key] for key in ('id','x','y')}; unit_ids = {u['role']:u['index'] for u in native['units']}; reader = RenameVision(vision.vision)

    def observe(index, required_screen=None):
        deadline = time.monotonic()+45; previous = None; last_error = None
        while time.monotonic()<deadline:
            image_path=path/f'checkpoint-{index+1}.png'; driver.snapshot(image_path); image=vision.Image.open(image_path).convert('RGB')
            n=base.native(driver); town=ref.full.city(driver,origin); c=town['city']
            if (n['turn']!=initial_year or town['global_count']!=original['global_count'] or town['owned_count']!=1
                    or {key:c[key] for key in identity}!=identity or [u['role'] for u in n['units']]!=['scout','former','colony']
                    or any(u['index']!=unit_ids[u['role']] or (u['x'],u['y'])!=origin for u in n['units'])):
                raise ProtocolError('Rename city/unit/year identity guard failed')
            try:
                dialog=None; title=None
                if reader.present(image):
                    screen='rename'; dialog=reader.read(image)
                    title=reader.title(image,vision)
                else:
                    try:
                        ref.hud.parse_hud(vision.vision,image_path); screen='base'
                        title=reader.title(image,vision)
                    except (VisionError,ProtocolError):
                        if n['selected'] is None: raise VisionError('Ready selected map unit absent')
                        if vision.line_at(image,(10,637,135,653))!=base.ROLE_LABEL[n['selected']]: raise VisionError('Actual selected map label absent')
                        screen='map'
                if required_screen is not None and screen!=required_screen: raise VisionError('Initial management is still opening')
                state=dict(after_action=index,screen=screen,title=title,year_delta=0,selected=n['selected'],
                           base=dict({key:c[key] for key in ('name','population','workers','doctors','worked_tiles')},owned_count=town['owned_count']),
                           units=[{key:u[key] for key in ('role','order_code','movement_spent')} for u in n['units']],dialog=dialog)
            except RenameCaretVisible as error:
                # Caret-on frames contain no trustworthy draft reading. Keep
                # the previous complete clean reading for clean-frame consensus.
                last_error=str(error);time.sleep(.15);continue
            except (VisionError,ProtocolError) as error:
                previous=None;last_error=str(error);time.sleep(.25);continue
            if state==previous:return state
            previous=state;time.sleep(.3)
        if index==-1: raise InitialManagementUnavailable('Complete initial management did not settle: '+str(image_path))
        raise ProtocolError('Rename checkpoint did not settle: '+str(image_path)+'; last observer error: '+str(last_error))

    base.raw_key(driver,'Return'); time.sleep(.8); trace=[observe(-1,'base')]
    if trace[0]['screen']!='base': raise ProtocolError('Initial complete Rename management absent')
    for index,action in enumerate(case['input']['actions']):
        previous=trace[-1]
        if isinstance(action,dict):
            if previous['screen']!='rename':raise ProtocolError('Actual Rename edit control missing')
            click_control(driver,350,396)
            subprocess.run(['xdotool','key','--clearmodifiers','--repeat','80','--delay','2','BackSpace'],env=driver.env,check=True,timeout=10)
            if action['edit']:subprocess.run(['xdotool','type','--clearmodifiers','--delay','12',action['edit']],env=driver.env,check=True,timeout=10)
        elif action=='rename':
            if previous['screen']!='base':raise ProtocolError('Actual Rename button missing')
            click_control(driver,400,524)
        elif action in ('button-ok','button-cancel'):
            if previous['screen']!='rename':raise ProtocolError('Actual Rename action button missing')
            click_control(driver,344 if action=='button-ok' else 676,429)
        else:base.raw_key(driver,{'confirm':'Return','cancel':'Escape','close':'Escape','open':'Return'}[action])
        time.sleep(.3);trace.append(observe(index));(path/'trace-progress.json').write_text(json.dumps(dict(trace=trace),indent=2)+'\n')
    output=dict(trace=trace);contract.validate_output(output,case['input']['actions']);return output


def capture_fresh_case(driver,observer,vision,case,work,files):
    for attempt in range(2):
        if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
        for name,raw in files.items():
            target=driver.work/'game'/name
            if target.is_symlink():target.unlink()
            target.write_bytes(raw)
        path=work/case['id'] if attempt==0 else work/(case['id']+'-setup-retry')
        try:
            return capture(driver,observer,vision,case,path)
        except InitialManagementUnavailable:
            if attempt==1:raise
            print('Retrying fresh fixture before any Rename action: '+case['id'],file=sys.stderr,flush=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args()
    cases=load_request()['cases'];initial=fingerprint()
    for case in cases:
        if case['algorithm']!=contract.ALGORITHM:raise ProtocolError('Unknown Rename algorithm')
        contract.validate_input(case['input'])
    sources=profiles(args.assets);args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
    observer=base.FactionVision();vision=MineralVision();driver=None
    try:
        driver=RenameDriver(args.assets,args.wine,work)
        for path in (driver.work/'game/maps').iterdir():
            if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
        (driver.work/'game/maps/zzterraform.MP').write_bytes(base.arid_map());inputs=base.bundle(args.assets);rows=[]
        for case in cases:
            output=capture_fresh_case(driver,observer,vision,case,work,dict(inputs,**sources[case['input']['text_profile']]))
            rows.append(dict(id=case['id'],status='ok',output=output))
            print('Captured original Rename: '+case['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('Rename observer changed during capture')
        digest=hashlib.sha256(base.arid_map())
        for profile,files in sources.items():
            digest.update(profile.encode())
            for name,raw in sorted(dict(inputs,**files).items()):digest.update(name.encode()+b'\0'+raw)
        write_response(dict(driver.metadata,contract=contract.ALGORITHM,adapter_sha256=initial,source_profiles_sha256=digest.hexdigest(),
                            observation='Actual full management/Rename clicks, focused Backspace/type, Enter/Escape/OK/Cancel and reopen; independent rendered dialog/draft/title OCR and read-only native name/citizens/unit/year guards',
                            boundaries='Eleven declared ASCII sequences only; draft/display wording uppercase whitespace normalized, native committed names preserve case/spaces; other input, cities, save/load/network, raw stores and full game excluded'),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:
        print('Original Rename capture failed:',error,file=sys.stderr);sys.exit(1)
