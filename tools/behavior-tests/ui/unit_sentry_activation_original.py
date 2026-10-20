"""Original Sentry activation recorder; real controls and guarded read-only observations."""
import argparse,hashlib,json,subprocess,sys,tempfile,time
from pathlib import Path
DIRECTORY=Path(__file__).resolve().parent
sys.path.insert(0,str(DIRECTORY.parent if DIRECTORY.name=='ui' else Path.cwd()/'tools/behavior-tests'))
from ui import unit_sentry_original as sentry
from ui import unit_activation_original as activation
from protocol import ProtocolError,load_request,write_response
from ui.vision import VisionError
base=sentry.base
ALGORITHM='ui.unit_sentry_activation.v1'

def fingerprint():
 return hashlib.sha256(sentry.fingerprint().encode()+activation.fingerprint().encode()+Path(__file__).read_bytes()).hexdigest()

def validate(data):
 if not isinstance(data,dict) or set(data)!={'profile','setup','actions'} or data['profile']!='stacked':raise ProtocolError('Sentry activation requires the declared stack')
 if not isinstance(data['setup'],list) or len(data['setup'])!=3 or any(not isinstance(a,str) or a not in {'sleep','hold','skip'} for a in data['setup']):raise ProtocolError('Sentry activation requires three actual preparation commands')
 actions=data['actions']
 if not isinstance(actions,list) or not 1<=len(actions)<=10 or actions[0]!='open' or actions.count('open')!=1 or any(not isinstance(a,str) or a not in {'open','up','down','enter','escape','wait','tab'} for a in actions):raise ProtocolError('Invalid Sentry activation actions')
 closed=False
 for action in actions:
  if (closed and action not in {'wait','tab'}) or (not closed and action in {'wait','tab'}):raise ProtocolError('Sentry activation navigation and post-confirm controls must stay separate')
  if action in {'enter','escape'}:closed=True

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);parser.add_argument('--timeout',type=float,default=45);args=parser.parse_args()
 cases=load_request()['cases'];initial=fingerprint()
 for case in cases:
  if case['algorithm']!=ALGORITHM:raise ProtocolError('Unknown Sentry activation contract')
  validate(case['input'])
 args.artifacts.mkdir(parents=True,exist_ok=True);directory=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
 observer=base.FactionVision();vision=base.FormerVision();driver=None
 try:
  driver=base.OriginalDriver(args.assets,args.wine,directory)
  for path in (driver.work/'game/maps').iterdir():
   if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
  (driver.work/'game/maps/zzterraform.MP').write_bytes(base.arid_map())
  inputs=base.bundle(args.assets)
  for name,raw in inputs.items():(driver.work/'game'/name).write_bytes(raw)
  rows=[]
  for case in cases:
   if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
   path=directory/case['id'];path.mkdir();current,origin=base.prepare(driver,observer,vision,{'input':{'profile':'stacked'}},path,args.timeout);year=current['turn']
   def check_positions(state):
    if any((u['x'],u['y'])!=origin for u in state['units']):raise ProtocolError('Unexpected movement in Sentry activation')
   for index,action in enumerate(case['input']['setup']):
    if action=='sleep':
     base.raw_key(driver,'l');current=base.settled(driver,vision,path/f'prepare-{index}.png',args.timeout,current['turn'])
    else:current=base.act(driver,vision,current,action,path/f'prepare-{index}.png',args.timeout)
    check_positions(current)
   def observe(name):
    readings=[];deadline=time.monotonic()+args.timeout
    while time.monotonic()<deadline:
     image_path=path/(name+'.png');driver.snapshot(image_path);image=vision.Image.open(image_path);native=base.native(driver);check_positions(native)
     try:
      dialog=activation.picker(vision,image)
      state={'year_delta':native['turn']-year,'picker':dialog,'selected':native['selected'],
             'units':[{'role':u['role'],'order_code':u['order_code'],'movement_spent':u['movement_spent']} for u in native['units']]}
      if dialog is None and native['selected'] is not None:
       if vision.line_at(image.convert('RGB'),(10,637,135,653))!=base.ROLE_LABEL[native['selected']]:raise VisionError('Actual selected identity and visible name disagree')
      readings.append(state)
      if len(readings)>=2 and readings[-1]==readings[-2]:return state
     except VisionError:readings=[]
     time.sleep(.2)
    raise ProtocolError('Sentry activation observation did not settle: '+name)
   trace=[observe('initial')];keys={'open':'a','down':'Down','up':'Up','enter':'Return','escape':'Escape','wait':'w','tab':'Tab'}
   for index,action in enumerate(case['input']['actions']):
    base.raw_key(driver,keys[action]);time.sleep(.5);trace.append(observe(f'{index}-{action}'))
   output={'trace':trace};(path/'observed.json').write_text(json.dumps(output,indent=2)+'\n');rows.append({'id':case['id'],'status':'ok','output':output})
   print('Captured original Sentry activation: '+case['id'],file=sys.stderr,flush=True)
  if fingerprint()!=initial:raise ProtocolError('Sentry activation observer changed during capture')
  digest=hashlib.sha256(base.arid_map())
  for name,raw in sorted(inputs.items()):digest.update(name.encode()+b'\0'+raw)
  write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,source_profiles_sha256=digest.hexdigest(),
                     observation='Actual visible picker caption/row names/highlight/buttons and guarded read-only native selected identity, order byte and movement; visible selected-name check when picker is closed',
                     fixture='Fresh healthy owned three-unit Gaians/Citizen/standard stack on actual first base, declared UNIT bonuses, flat arid 40x80 terrain, pause enabled/tutorials off; preparation uses real L/H/Space',
                     units='Caption whitespace/case normalized OCR, role-normalized native identity, original vehicle order byte ordinals 0/1/2, movement spent in integer thirds, turn difference',
                     ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()

if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:print('Original Sentry activation capture failed:',error,file=sys.stderr);sys.exit(1)
