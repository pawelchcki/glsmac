"""Private original Sentry lifecycle recorder; real controls and read-only fields."""
import argparse
import hashlib
import inspect
import json
from pathlib import Path
import subprocess
import sys
import tempfile
DIRECTORY=Path(__file__).resolve().parent
sys.path.insert(0,str(DIRECTORY.parent if DIRECTORY.name=='ui' else Path.cwd()/'tools/behavior-tests'))
from ui import unit_selection_original as base
from protocol import ProtocolError, load_request, write_response
from ui.vision import VisionError

ALGORITHM='game.unit_sentry_lifecycle.v1'

def fingerprint():
 return hashlib.sha256(base.fingerprint().encode()+Path(__file__).read_bytes()).hexdigest()

# This extends only a guarded public structural read, never original code.
# Ordinal 1 is retained raw in output; representation is not a candidate policy.
source=inspect.getsource(base.native)
assert source.count('raw[17] not in (0, 2)')==1
assert source.count("'order': 'hold' if raw[17] == 2 else 'none',")==1
source=source.replace('def native(driver):','def native_sentry(driver):',1)
source=source.replace('raw[17] not in (0, 2)','raw[17] not in (0, 1, 2)')
source=source.replace("'order': 'hold' if raw[17] == 2 else 'none',", "'order': {0: 'none', 1: 'source-order-1', 2: 'hold'}[raw[17]], 'order_code': raw[17],")
namespace=dict(vars(base));exec(source,namespace);base.native=namespace['native_sentry']

def validate(data):
 if not isinstance(data,dict) or set(data)!={'profile','actions'} or data['profile']!='stacked':raise ProtocolError('Sentry needs the declared stacked profile')
 actions=data['actions']
 if (not isinstance(actions,list) or not 1<=len(actions)<=12
     or any(not isinstance(a,str) or a not in {'sleep','hold','skip','wait','tab','advance'} for a in actions)
     or actions.count('advance')>1):raise ProtocolError('Invalid bounded Sentry actions')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);parser.add_argument('--timeout',type=float,default=45)
 args=parser.parse_args();cases=load_request()['cases'];initial=fingerprint()
 for case in cases:
  if case['algorithm']!=ALGORITHM:raise ProtocolError('Unknown Sentry contract')
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
   path=directory/case['id'];path.mkdir()
   current,origin=base.prepare(driver,observer,vision,case,path,args.timeout);year=current['turn']
   def observe(current):
    state={'year_delta':current['turn']-year,'selected':current['selected'],'units':[]}
    for unit in current['units']:
     if (unit['x'],unit['y'])!=origin:raise ProtocolError('Sentry fixture moved unexpectedly')
     state['units'].append({'role':unit['role'],'order_code':unit['order_code'],'movement_spent':unit['movement_spent']})
    return state
   trace=[observe(current)]
   for index,action in enumerate(case['input']['actions']):
    if action=='sleep':
     base.raw_key(driver,'l');current=base.settled(driver,vision,path/f'{index}-sleep.png',args.timeout,current['turn'])
    else:current=base.act(driver,vision,current,action,path/f'{index}-{action}.png',args.timeout)
    trace.append(observe(current))
   output={'trace':trace};(path/'observed.json').write_text(json.dumps(output,indent=2)+'\n');rows.append({'id':case['id'],'status':'ok','output':output})
   print('Captured original Sentry lifecycle: '+case['id'],file=sys.stderr,flush=True)
  if fingerprint()!=initial:raise ProtocolError('Sentry observer changed during capture')
  digest=hashlib.sha256(base.arid_map())
  for name,raw in sorted(inputs.items()):digest.update(name.encode()+b'\0'+raw)
  write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,source_profiles_sha256=digest.hexdigest(),
                      observation='Guarded read-only native selected identity and vehicle orders/movement; actual selected name checked against visible UI; real L/H/Space/W/Tab and turns',
                      fixture='Fresh three healthy owned Gaia/Citizen/standard units on one actual base; flat arid 40x80 map, declared UNIT bonuses, pause enabled and tutorials off',
                      units='Turn difference; original vehicle order byte ordinal 0/1/2 retained raw, movement spent in thirds; role-normalized actual selected identity'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()

if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:print('Original Sentry capture failed:',error,file=sys.stderr);sys.exit(1)
