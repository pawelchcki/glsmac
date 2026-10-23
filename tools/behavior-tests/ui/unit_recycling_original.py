"""Execute original city-Scout Disband controls and measure actual mineral deltas."""
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
from ui import unit_disband_original as previous
from ui import unit_recycling_contract as contract
from ui import unit_recycling_inputs as inputs
from ui.vision import VisionError
from ui.faction_setup_native import NativeMemory
from ui import faction_ratings_original as ratings
base,transport=previous.base,previous.transport
found=previous.previous
orders=found.previous
terraform=found.shared.shared
row_click=FunctionType(previous.row_click.__code__,dict(previous.row_click.__globals__,inputs=inputs))
# Read either declared actor's absence; independently guard its companions below.
_old="not {'scout','colony'} <="
if _old not in previous._native_source:raise ProtocolError('Original recycling observer layout changed')
_namespace=dict(previous._namespace);exec(previous._native_source.replace(" or not {'scout','colony'} <= {u['role'] for u in units}", ""),_namespace)
native=_namespace['native_join']


def fingerprint():
 digest=hashlib.sha256(previous.fingerprint().encode())
 for module in (contract,inputs):digest.update(Path(module.__file__).read_bytes())
 digest.update(Path(__file__).read_bytes());return digest.hexdigest()


def pricing_context(driver):
 m=NativeMemory(driver)
 try:
  mask=m.read(m.address(0x009A64E8),1)[0]
  if mask not in (2,4,8,16,32,64,128):raise ProtocolError('Recycling pricing requires one human faction')
  owner=mask.bit_length()-1
  return dict(map_size_kind=m.image_word(0x0094A2A0,signed=True),mineral_rule_factor=m.image_word(ratings.MINERAL_RULE,signed=True),industry=m.image_word(ratings.INDUSTRY+owner*ratings.STRIDE,signed=True))
 finally:m.close()


class DialogVision:
 def __init__(self,vision):self.reader=previous.NoticeVision(vision)
 @staticmethod
 def present(image):return image.getpixel((800,424)) in ((120,164,212),(103,91,181))
 def read(self,image):
  paints=[image.getpixel((800,y)) for y in (424,446,468)]
  count=3 if paints[2] in ((120,164,212),(103,91,181)) else 2;paints=paints[:count]
  if paints.count((120,164,212))!=1 or any(p not in ((120,164,212),(103,91,181)) for p in paints):raise VisionError('Unknown actual recycling choice paint')
  r=self.reader
  boxes=((184,421,831,439),(184,443,831,460)) if count==2 else ((184,418,831,434),(184,440,831,455),(184,462,831,477))
  return dict(caption=r.text(image,(175,255,845,278)),body=r.text(image,(386,284,841,313)),
   choices=[r.text(image,box,black=True) for box in boxes],selected=paints.index((120,164,212)),
   buttons=[r.text(image,(190,473,831,492) if count==2 else (190,490,831,505),black=True)])


def profiles(assets):
 result={}
 for profile in contract.PROFILES:
  files=dict(orders.ref.text_files(assets,'default'),**base.bundle(assets))
  for name,source in inputs.declarations(profile).items():
   paths=[p for p in assets.iterdir() if p.is_file() and p.name.lower()==name]
   if len(paths)!=1:raise ProtocolError('Missing/ambiguous recycling input '+name)
   path=paths[0]
   if name in ('script.txt','xscript.txt'):
    raw=files.get(path.name,path.read_bytes())
    for marker in ('DISBAND','DISBAND2'):
     declaration='#'+marker+source.split('#'+marker+'\n',1)[1].split('#END',1)[0]+'#END\n'
     # Preserve the declaration newline after its marker.
     declaration=declaration.replace('#'+marker,'#'+marker+'\n',1)
     raw=found.patch_block(raw,declaration,'#'+marker)
   elif name=='alphax.txt':raw=orders.patch_terrain(path.read_bytes(),source)
   else:raw=source.encode('ascii')
   files[path.name]=raw
  result[profile]=files
 return result


def capture(driver,observer,vision,menu_vision,case,path):
 path.mkdir()
 prepared_case=case
 if case['input']['profile']=='scout-free':
  prepared_case=dict(case,input=dict(case['input'],profile='spread'))
 first,origin=base.prepare(driver,observer,vision,prepared_case,path,60)
 if case['input']['profile']=='scout-free':
  for index,action in enumerate(('southeast','skip','skip','advance')):
   first=base.act(driver,vision,first,action,path/f'extra-prepare-{index}-{action}.png',60)
  for focus_index in range(3):
   if first['selected']=='scout':break
   first=base.act(driver,vision,first,'tab',path/f'extra-focus-{focus_index}.png',60)
  expected={'scout':(1,1),'former':(1,1),'colony':(-1,1)}
  if first['selected']!='scout':raise ProtocolError('Free-tile preparation did not select ready Scout')
  for unit in first['units']:
   offset=((unit['x']-origin[0]+20)%40-20,unit['y']-origin[1])
   if offset!=expected[unit['role']] or unit['order']!='none' or unit['movement_spent']:raise ProtocolError('Free Scout preparation differs from declared ready positions')

 saved=json.loads((path/'saved-fixture-transport.json').read_text())
 if {key:saved['town']['city'][key] for key in contract.INITIAL}!=case['input']['initial_base']:raise ProtocolError('Recycling saved fixture differs from declared city')
 if pricing_context(driver)!=inputs.PRICING_CONTEXT:raise ProtocolError('Recycling original pricing differs from declared audited inputs')
 town=found.city(driver,origin);units={unit['role']:unit for unit in first['units']};dialog=DialogVision(vision.vision)
 def city_guard(value):
  result=json.loads(json.dumps(value));result['city'].pop('minerals');return result
 guarded_city=city_guard(town)
 def observe(index):
  deadline=time.monotonic()+30;last=None;last_error=None
  while time.monotonic()<deadline:
   image_path=path/f'checkpoint-{index}.png';driver.snapshot(image_path);current=native(driver);city=found.city(driver,origin)
   actor='former' if case['input']['profile']=='stacked' else 'scout'
   roles=[u['role'] for u in current['units']]
   if roles not in [list(contract.ROLES),[r for r in contract.ROLES if r!=actor]]:raise ProtocolError('Recycling removed another actor/companion')
   if current['turn']!=first['turn'] or city_guard(city)!=guarded_city or pricing_context(driver)!=inputs.PRICING_CONTEXT:raise ProtocolError('Recycling changed paused year/city/citizens/non-mineral stores/membership')
   for unit in current['units']:
    original=units[unit['role']]
    if {k:v for k,v in unit.items() if k!='index'}!={k:v for k,v in original.items() if k!='index'}:raise ProtocolError('Recycling changed surviving role/position/health/order/movement')
   if len(current['units'])==3 and current['units']!=first['units']:raise ProtocolError('Recycling replaced native identity before deletion')
   try:
    image=vision.Image.open(image_path).convert('RGB');actual_dialog=dialog.read(image) if dialog.present(image) else None
    if actual_dialog is None:menu=menu_vision.read(image)
    else:
     # A recognized dialog can share the generic Quit frame; independently read
     # its own glyphs first, then the actual unobscured root/child pixels.
     headers=menu_vision.headers(image);child=menu_vision.child(image)
     if headers is None or child is not None:raise VisionError('Unexpected recycling root/child layout')
     menu=dict(headers=headers,child=None)
    if current['selected'] is not None and vision.line_at(image,(10,637,135,653))!=base.ROLE_LABEL[current['selected']]:raise VisionError('Selected recycling HUD differs from native role')
    state=dict(year_delta=0,selected=current['selected'],owned_count=city['owned_count'],mineral_delta=city['city']['minerals']-town['city']['minerals'],
     units=[{key:unit[key] for key in ('role','order_code','movement_spent')} for unit in current['units']],root_open=menu is not None,
     child_header=menu['child']['header_index'] if menu and menu['child'] else None,dialog=actual_dialog)
   except VisionError as error:last=None;last_error=str(error);time.sleep(.2);continue
   if state==last:return state
   last=state;time.sleep(.3)
  raise ProtocolError('Actual recycling controls did not settle '+str(image_path)+'; '+str(last_error))
 trace=[observe(0)]
 for index,action in enumerate(case['input']['actions'],1):
  if isinstance(action,str) and action in ('tab','cancel','down','up','confirm'):base.raw_key(driver,dict(tab='Tab',cancel='Escape',down='Down',up='Up',confirm='Return')[action])
  elif action=='menu':transport.click(driver,60,539)
  elif action=='button-ok':
   current_dialog=trace[-1]['dialog']
   if current_dialog is None:raise ProtocolError('Actual recycling OK dialog missing')
   found.click_control(driver,510,482 if len(current_dialog['choices'])==2 else 498)
  elif 'header' in action:
   if not trace[-1]['root_open']:raise ProtocolError('Actual root missing before recycling header')
   transport.click(driver,27,355+18*action['header'])
  else:row_click(driver,vision,menu_vision,path/f'checkpoint-{index-1}.png',case['input']['text_profile'])
  time.sleep(.6);trace.append(observe(index));(path/'trace-progress.json').write_text(json.dumps(dict(trace=trace),indent=2)+'\n')
 output=dict(trace=trace);contract.validate_output(output,case['input']['actions']);return output


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args();cases=load_request()['cases']
 if terraform.saved is None:raise ProtocolError('Recycling requires guarded original-created save')
 for case in cases:
  if case['algorithm']!=contract.ALGORITHM:raise ProtocolError('Unknown recycling contract')
  contract.validate_input(case['input'])
 initial=fingerprint();sources=profiles(args.assets);args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
 observer=base.FactionVision();vision=terraform.TerraformVision();menu_vision=terraform.glyphs.IngameMenuVision();driver=None
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
  if fingerprint()!=initial:raise ProtocolError('Recycling observer changed during capture')
  digest=hashlib.sha256(base.arid_map())
  for profile,files in sources.items():
   digest.update(profile.encode())
   for name,raw in sorted(files.items()):digest.update(name.encode()+b'\0'+raw)
  write_response(dict(driver.metadata,adapter_sha256=initial,contract=contract.ALGORITHM,source_profiles_sha256=digest.hexdigest(),fixture_transport='guarded-original-created-save',
   observation='Actual ready-city Scout MENU/Action9; independently segmented dialog text/choices/highlight/button; native survivors and actual city mineral delta guarded against prepared baseline',
   boundaries='Declared ready Scout city/free-tile or Former stacked-city contexts with guarded companions; synthetic common DISBAND and conflicting expansion/DISBAND2 declarations; no alternate costs, industry, damage, other recycling/overload or AI parity'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close();menu_vision.close()
if __name__=='__main__':main()
