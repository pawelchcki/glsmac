"""Execute original ready-Former disband controls with read-only state guards."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time
from types import FunctionType
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import colony_found_menu_original as previous
from ui import unit_disband_contract as contract
from ui import unit_disband_inputs as inputs
from ui.starvation_dialog_original import NoticeVision
from ui.vision import VisionError
base,transport=previous.base,previous.transport
row_click=FunctionType(previous.shared.row_click.__code__,dict(previous.shared.row_click.__globals__,inputs=inputs))
# Broaden only the structural read to allow the declared Former to be absent.
# The caller guards all remaining role/position/health/order records. Original
# unit array indices are observed rather than assumed persistent after deletion.
_native_source=previous.membership.source
_old="not {'scout','former'} <= {u['role'] for u in units}"
if _old not in _native_source:raise ProtocolError('Original unit layout observer changed')
_native_source=_native_source.replace(_old,"not {'scout','colony'} <= {u['role'] for u in units}")
_namespace=dict(previous.membership.namespace);exec(_native_source,_namespace)
native=_namespace['native_join']


def fingerprint():
    digest=hashlib.sha256(previous.fingerprint().encode())
    for module in (contract,inputs):digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes());return digest.hexdigest()


class DialogVision:
    def __init__(self,vision):self.reader=NoticeVision(vision)
    @staticmethod
    def present(image):
        return image.getpixel((800,424)) in ((120,164,212),(103,91,181))
    def read(self,image):
        paints=[image.getpixel((800,y)) for y in (424,446,468)]
        if paints.count((120,164,212))!=1 or any(p not in ((120,164,212),(103,91,181)) for p in paints):raise VisionError('Unknown actual disband choice paint')
        r=self.reader
        return dict(caption=r.text(image,(175,255,845,278)),body=r.text(image,(386,284,841,313)),
          choices=[r.text(image,box,black=True) for box in ((184,418,831,434),(184,440,831,455),(184,462,831,477))],
          selected=paints.index((120,164,212)),buttons=[r.text(image,(190,490,831,505),black=True)])


def profiles(assets):
    result={}
    for profile in contract.PROFILES:
        files=dict(previous.previous.ref.text_files(assets,'default'),**base.bundle(assets))
        for name,source in inputs.declarations(profile).items():
            paths=[p for p in assets.iterdir() if p.is_file() and p.name.lower()==name]
            if len(paths)!=1:raise ProtocolError('Missing/ambiguous disband input '+name)
            path=paths[0]
            if name in ('script.txt','xscript.txt'):raw=previous.patch_block(files.get(path.name,path.read_bytes()),source,'#DISBAND2')
            elif name=='alphax.txt':raw=previous.previous.patch_terrain(path.read_bytes(),source)
            else:raw=source.encode('ascii')
            files[path.name]=raw
        result[profile]=files
    return result


def capture(driver,observer,vision,menu_vision,case,path):
    path.mkdir();first,origin=base.prepare(driver,observer,vision,case,path,60)
    saved=json.loads((path/'saved-fixture-transport.json').read_text())
    if {key:saved['town']['city'][key] for key in contract.INITIAL}!=case['input']['initial_base']:raise ProtocolError('Disband saved fixture differs from declared city')
    town=previous.city(driver,origin);units={unit['role']:unit for unit in first['units']};dialog=DialogVision(vision.vision)
    def observe(index):
        deadline=time.monotonic()+30;last=None;last_error=None
        while time.monotonic()<deadline:
            image_path=path/f'checkpoint-{index}.png';driver.snapshot(image_path);current=native(driver)
            if current['turn']!=first['turn'] or previous.city(driver,origin)!=town:raise ProtocolError('Disband changed paused year/city/citizens/stores/membership')
            for unit in current['units']:
                original=units[unit['role']]
                if {key:value for key,value in unit.items() if key!='index'}!={key:value for key,value in original.items() if key!='index'}:raise ProtocolError('Disband changed surviving unit role/position/health/order/movement')
            if len(current['units'])==3 and current['units']!=first['units']:raise ProtocolError('Disband replaced a native identity before deletion')
            try:
                image=vision.Image.open(image_path).convert('RGB');menu=menu_vision.read(image)
                if current['selected'] is not None and vision.line_at(image,(10,637,135,653))!=base.ROLE_LABEL[current['selected']]:raise VisionError('Selected disband name differs from native role')
                state=dict(year_delta=0,selected=current['selected'],owned_count=town['owned_count'],
                  units=[{key:unit[key] for key in ('role','order_code','movement_spent')} for unit in current['units']],
                  root_open=menu is not None,child_header=menu['child']['header_index'] if menu and menu['child'] else None,
                  dialog=dialog.read(image) if dialog.present(image) else None)
            except VisionError as error:last=None;last_error=str(error);time.sleep(.2);continue
            if state==last:return state
            last=state;time.sleep(.3)
        raise ProtocolError('Actual disband controls did not settle '+str(image_path)+'; '+str(last_error))
    trace=[observe(0)]
    for index,action in enumerate(case['input']['actions'],1):
        if isinstance(action,str) and action in ('tab','cancel','down','up','confirm','disband-shortcut'):
            base.raw_key(driver,dict(tab='Tab',cancel='Escape',down='Down',up='Up',confirm='Return',**{'disband-shortcut':'shift+d'})[action])
        elif action=='menu':transport.click(driver,60,539)
        elif action=='button-ok':previous.click_control(driver,510,498)
        elif 'header' in action:
            if not trace[-1]['root_open']:raise ProtocolError('Actual root missing before disband header')
            transport.click(driver,27,355+18*action['header'])
        else:row_click(driver,vision,menu_vision,path/f'checkpoint-{index-1}.png',case['input']['text_profile'])
        time.sleep(.6);trace.append(observe(index));(path/'trace-progress.json').write_text(json.dumps(dict(trace=trace),indent=2)+'\n')
    output=dict(trace=trace);contract.validate_output(output,case['input']['actions']);return output


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args();cases=load_request()['cases']
    if previous.shared.shared.saved is None:raise ProtocolError('Disband recording requires guarded original-created save')
    for case in cases:
        if case['algorithm']!=contract.ALGORITHM:raise ProtocolError('Unknown disband contract')
        contract.validate_input(case['input'])
    initial=fingerprint();sources=profiles(args.assets);args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
    observer=base.FactionVision();vision=previous.shared.shared.TerraformVision();menu_vision=previous.shared.shared.glyphs.IngameMenuVision();driver=None
    try:
        driver=transport.base.ContextDriver(args.assets,args.wine,work)
        for path in (driver.work/'game/maps').iterdir():
            if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
        (driver.work/'game/maps/PLANET.MP').write_bytes(base.arid_map());rows=[]
        for case in cases:
            if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
            for name,raw in sources[case['input']['text_profile']].items():
                target=driver.work/'game'/name
                if target.is_symlink():target.unlink()
                target.write_bytes(raw)
            rows.append(dict(id=case['id'],status='ok',output=capture(driver,observer,vision,menu_vision,case,work/case['id'])))
        if fingerprint()!=initial:raise ProtocolError('Disband observer changed during recording')
        digest=hashlib.sha256(base.arid_map())
        for profile,files in sources.items():
            digest.update(profile.encode())
            for name,raw in sorted(files.items()):digest.update(name.encode()+b'\0'+raw)
        write_response(dict(driver.metadata,adapter_sha256=initial,contract=contract.ALGORITHM,source_profiles_sha256=digest.hexdigest(),fixture_transport='guarded-original-created-save',
          observation='Actual ready-Former Tab/MENU/Action9; independently segmented dialog caption/body/three choices/highlight/button; selected HUD crosschecked against native units; survivor roles/positions/health/orders/movement and native city/year guarded',
          boundaries='Single ready Former one southeast step from own city, flat arid land, no active work, two source profiles; ordinary disband only, no self-destruct activation, city recycling, other units/context/terrain/AI or general disband parity'),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close();menu_vision.close()


if __name__=='__main__':main()
