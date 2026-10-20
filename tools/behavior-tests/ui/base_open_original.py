"""Private reference capture: real base-window open/close and guarded live city data."""
import argparse,hashlib,inspect,json,subprocess,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'tools/behavior-tests'))
from ui import colony_join_original as join
from protocol import ProtocolError,load_request,write_response
from ui.vision import VisionError
base=join.base
# BASE.nutrients_accumulated is a signed int32 declaration. The previous
# closed-map contract deliberately rejected negative values; do not edit it.
source=inspect.getsource(join.city).replace('not 0<=food<=100000','not (0-100000)<=food<=100000')
namespace=dict(vars(join));exec(source,namespace);city=namespace['city']
ALGORITHM='ui.base_open_city_recalc.v1'
INITIAL={'workers':0,'doctors':1,'worked_tiles':0,'nutrients':0,'minerals':9}
def fingerprint():return hashlib.sha256(join.fingerprint().encode()+Path(__file__).read_bytes()).hexdigest()
def validate(data):
 if not isinstance(data,dict) or set(data)!={'profile','initial_base','setup','actions'} or data['profile']!='stacked' or data['initial_base']!=INITIAL or any(type(v) is not int for v in data['initial_base'].values()):raise ProtocolError('Unexpected declared city input')
 if data['setup']!=['wait','wait'] or data['actions'] not in (['open','close','open','close'],['join','open','close','open','close']):raise ProtocolError('Unsupported bounded base-window sequence')
def main():
 p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases'];initial=fingerprint()
 for case in cases:
  if case['algorithm']!=ALGORITHM:raise ProtocolError('Unknown base-window algorithm')
  validate(case['input'])
 args.artifacts.mkdir(parents=True,exist_ok=True);directory=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=base.FactionVision();vision=base.FormerVision();driver=None
 try:
  driver=base.OriginalDriver(args.assets,args.wine,directory)
  for path in (driver.work/'game/maps').iterdir():
   if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
  (driver.work/'game/maps/zzterraform.MP').write_bytes(base.arid_map());inputs=base.bundle(args.assets)
  for name,raw in inputs.items():(driver.work/'game'/name).write_bytes(raw)
  rows=[]
  for case in cases:
   if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
   path=directory/case['id'];path.mkdir();native,origin=base.prepare(driver,observer,vision,{'input':{'profile':'stacked'}},path,45);year=native['turn']
   for i in range(2):base.raw_key(driver,'w');native=base.settled(driver,vision,path/f'prepare-{i}.png',45,year)
   before=city(driver,origin);identity={k:before['city'][k] for k in ('id','name','x','y')};ids={u['role']:u['index'] for u in native['units']}
   if {k:before['city'][k] for k in INITIAL}!=case['input']['initial_base']:raise ProtocolError('Original city does not match declared initial input')
   def observe(name,required_screen):
    previous=None;deadline=time.monotonic()+45;time.sleep(.5)
    while time.monotonic()<deadline:
     image_path=path/(name+'.png');driver.snapshot(image_path);image=vision.Image.open(image_path).convert('RGB');n=base.native(driver);town=city(driver,origin);c=town['city']
     if n['turn']!=year or town['global_count']!=before['global_count'] or town['owned_count']!=before['owned_count'] or {k:c[k] for k in identity}!=identity:raise ProtocolError('Base-window year or base identity changed')
     if any(u['index']!=ids[u['role']] or (u['x'],u['y'])!=origin for u in n['units']):raise ProtocolError('Base-window changed surviving unit identity or position')
     try:title=vision.line_at(image,(280,576,726,620))
     except VisionError:title=None
     screen='base' if title==c['name'].upper() else 'map'
     if screen!=required_screen:previous=None;time.sleep(.2);continue
     if screen=='map':
      title=None
      if n['selected'] is not None:
       try:
        if vision.line_at(image,(10,637,135,653))!=base.ROLE_LABEL[n['selected']]:raise VisionError('Map selected name differs')
       except VisionError:previous=None;time.sleep(.2);continue
     state={'screen':screen,'title_matches_base':title is not None and title==c['name'].upper(),'year_delta':n['turn']-year,'selected':n['selected'],'base':dict({k:c[k] for k in ('population','workers','doctors','worked_tiles','nutrients','minerals')},owned_count=town['owned_count']),
            'units':[{'role':u['role'],'order_code':u['order_code'],'movement_spent':u['movement_spent']} for u in n['units']]}
     if state==previous:return state
     previous=state;time.sleep(.3)
    raise ProtocolError('Base-window observation did not settle: '+name)
   trace=[observe('initial','map')]
   for i,action in enumerate(case['input']['actions']):base.raw_key(driver,{'join':'b','open':'Return','close':'Escape'}[action]);trace.append(observe(f'{i}-{action}','base' if action=='open' else 'map'))
   output={'trace':trace};(path/'observed.json').write_text(json.dumps(output,indent=2)+'\n');rows.append({'id':case['id'],'status':'ok','output':output});print('Captured original base window: '+case['id'],file=sys.stderr,flush=True)
  if fingerprint()!=initial:raise ProtocolError('Base-window observer changed during capture')
  digest=hashlib.sha256(base.arid_map())
  for name,raw in sorted(inputs.items()):digest.update(name.encode()+b'\0'+raw)
  write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,source_profiles_sha256=digest.hexdigest(),
                     observation='Actual B/Enter/Escape; visible native base-title and map selected-name guards; signed nutrient counter, citizen types/counts, worked-tile count and minerals read from actual native records; surviving unit and base identity/count/year guarded',
                     fixture='Fresh Gaians/Citizen/standard 40x80 flat arid owned three-unit stack with declared UNIT bonuses, initial Doctor and stores, pause/tutorial settings; real W/W preparation; no original memory/instruction writes',
                     boundaries='Declared initial city is not natural startup evidence. Only this owned first city, zero-income-turn B/open/close/reopen sequences; no other populations/terrain/factions, stock values, governor modes, turns or general economy rules established',
                     units='Visible title equality to own native base identity, normalized independent of the literal city name; signed native nutrient counter; actual base population/jobs/worked tile/mineral counts and role/order/movement-third unit protocol'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original base-window capture failed:',e,file=sys.stderr);sys.exit(1)
