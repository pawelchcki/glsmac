"""Read actual Action rejection text and unchanged native adjacent-city state."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import time
from types import FunctionType

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import colony_found_menu_original as previous
from ui import colony_near_contract as contract
from ui import colony_near_inputs as inputs
from ui.vision import VisionError,consensus
base,transport,shared=previous.base,previous.transport,previous.shared
row_click=FunctionType(shared.row_click.__code__,dict(shared.row_click.__globals__,inputs=inputs))


def fingerprint():
    digest=hashlib.sha256(previous.fingerprint().encode())
    for module in (contract,inputs):digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes());return digest.hexdigest()


def message(vision,image):
    # Actual message glyph palette/geometry, independently segmented from the
    # captured map. The source body and previous actions never supply answers.
    crop=image.crop((250,522,780,543));mask=vision.Image.new('L',crop.size,255)
    for y in range(crop.height):
        for x in range(crop.width):
            if crop.getpixel((x,y))==(232,212,140):mask.putpixel((x,y),0)
    bounds=mask.point(lambda value:255-value).getbbox()
    if bounds is None:return None
    mask=vision.ImageOps.expand(mask.crop(bounds),8,255)
    return consensus([vision.text(mask.resize((mask.width*scale,mask.height*scale),vision.Image.Resampling.LANCZOS)) for scale in (3,4,5)])


def profiles(assets):
    result={}
    for profile in contract.PROFILES:
        files=dict(previous.previous.ref.text_files(assets,'default'),**base.bundle(assets))
        for name,source in inputs.declarations(profile).items():
            paths=[path for path in assets.iterdir() if path.is_file() and path.name.lower()==name]
            if len(paths)!=1:raise ProtocolError('Missing/ambiguous adjacent warning input '+name)
            path=paths[0];raw=files.get(path.name,path.read_bytes())
            if name=='script.txt':
                for marker in ('#NEWBASE','#BASETOONEAR'):
                    lines=source.splitlines(keepends=True);start=next(i for i,line in enumerate(lines) if line.strip()==marker)
                    end=next(i for i in range(start+1,len(lines)) if re.fullmatch(r'#[A-Z][A-Z0-9_]*',lines[i].strip()))
                    raw=previous.patch_block(raw,''.join(lines[start:end])+'#END\n',marker)
            elif name=='gaians.txt':raw=previous.patch_block(raw,source,'#BASES')
            elif name=='alphax.txt':raw=previous.previous.patch_terrain(path.read_bytes(),source)
            else:raw=source.encode('ascii')
            files[path.name]=raw
        result[profile]=files
    return result


def capture(driver,observer,vision,menu_vision,case,path):
    path.mkdir();first,origin=base.prepare(driver,observer,vision,case,path,60)
    saved=json.loads((path/'saved-fixture-transport.json').read_text())
    if {key:saved['town']['city'][key] for key in contract.INITIAL}!=case['input']['initial_base']:
        raise ProtocolError('Actual adjacent-city start differs from input')
    town=previous.city(driver,origin);units=first['units']
    def observe(index, immediate=False):
        deadline=time.monotonic()+30;last=None;last_error=None
        while time.monotonic()<deadline:
            image_path=path/f'checkpoint-{index}.png';driver.snapshot(image_path)
            native=base.native(driver);current=previous.city(driver,origin)
            if native['turn']!=first['turn'] or native['units']!=units or current!=town:
                raise ProtocolError('Adjacent command changed paused year/city/unit identity/position/order/movement/stores')
            try:
                image=vision.Image.open(image_path).convert('RGB');menu=menu_vision.read(image)
                if native['selected'] is not None and vision.line_at(image,(10,637,135,653))!=base.ROLE_LABEL[native['selected']]:
                    raise VisionError('Actual adjacent selected name differs from native identity')
                state=dict(year_delta=0,selected=native['selected'],owned_count=current['owned_count'],
                    units=[{key:unit[key] for key in ('role','order_code','movement_spent')} for unit in native['units']],
                    root_open=menu is not None,child_header=menu['child']['header_index'] if menu and menu['child'] else None,
                    dialog_open=previous.NamingVision.present(image),message=message(vision.vision,image))
            except VisionError as error:
                last=None;last_error=str(error);time.sleep(.2);continue
            if immediate or state==last:return state
            last=state;time.sleep(.3)
        raise ProtocolError('Actual adjacent warning did not settle: '+str(image_path)+'; '+str(last_error))
    trace=[observe(0)]
    for index,action in enumerate(case['input']['actions'],1):
        if action=='tab':base.raw_key(driver,'Tab')
        elif action=='menu':transport.click(driver,60,539)
        elif 'header' in action:
            if not trace[-1]['root_open']:raise ProtocolError('Root missing before actual adjacent header')
            transport.click(driver,27,355+18*action['header'])
        else:row_click(driver,vision,menu_vision,path/f'checkpoint-{index-1}.png',case['input']['text_profile'])
        
        immediate=isinstance(action,dict) and 'row_source' in action
        if not immediate:time.sleep(.6)
        trace.append(observe(index,immediate));(path/'trace-progress.json').write_text(json.dumps(dict(trace=trace),indent=2)+'\n')
    output=dict(trace=trace);contract.validate_output(output,case['input']['actions']);return output


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args()
    cases=load_request()['cases']
    if previous.shared.shared.saved is None:raise ProtocolError('Adjacent recorder requires guarded original-created save')
    for case in cases:
        if case['algorithm']!=contract.ALGORITHM:raise ProtocolError('Unknown adjacent warning contract')
        contract.validate_input(case['input'])
    initial=fingerprint();sources=profiles(args.assets);args.artifacts.mkdir(parents=True,exist_ok=True)
    work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=base.FactionVision();vision=previous.shared.shared.TerraformVision();menu_vision=previous.shared.shared.glyphs.IngameMenuVision();driver=None
    try:
        driver=transport.base.ContextDriver(args.assets,args.wine,work)
        for path in (driver.work/'game/maps').iterdir():
            if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
        (driver.work/'game/maps/PLANET.MP').write_bytes(base.arid_map());results=[]
        for case in cases:
            if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
            for name,raw in sources[case['input']['text_profile']].items():
                target=driver.work/'game'/name
                if target.is_symlink():target.unlink()
                target.write_bytes(raw)
            results.append(dict(id=case['id'],status='ok',output=capture(driver,observer,vision,menu_vision,case,work/case['id'])))
        if fingerprint()!=initial:raise ProtocolError('Adjacent observer changed during capture')
        digest=hashlib.sha256(base.arid_map())
        for profile,files in sources.items():
            digest.update(profile.encode())
            for name,raw in sorted(files.items()):digest.update(name.encode()+b'\0'+raw)
        write_response(dict(driver.metadata,adapter_sha256=initial,contract=contract.ALGORITHM,source_profiles_sha256=digest.hexdigest(),fixture_transport='guarded-original-created-save',
            observation='Actual Tab/Tab/MENU/Action/source0; original message glyphs and menu visibility independently read; native city/unit membership/identity/stores/positions/orders/movement and paused year guarded',
            boundaries='Healthy ready Pod one southwest step from an owned city on flat arid land; two synthetic common BASETOONEAR/menu profiles; no other neighbors, message duration, general adjacency/name/AI parity'),results)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close();menu_vision.close()


if __name__=='__main__':main()
