#!/usr/bin/env python3
"""Original-only explicit initial-world fixture and actual action observer.

Only declared initial data is assigned; other native defaults are preserved. Every post-action answer executes
original instructions. The natural-startup adapters/evidence remain unchanged.
"""
import argparse,hashlib,importlib.util,json,os,signal,struct,sys,tempfile,time
from pathlib import Path
DIRECTORY=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('frozen_state_trace_original',DIRECTORY/'original.py')
o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
from protocol import ProtocolError,load_request,write_response
CASES=DIRECTORY/'cases/explicit-seven-world-v2.json'
CONTRACT=DIRECTORY/'explicit-world-contract-v2.md'

def fingerprint():
 digest=hashlib.sha256(o.fingerprint().encode())
 for p in [Path(__file__),CASES,CONTRACT]:digest.update(p.read_bytes())
 return digest.hexdigest()


def validate_case(case):
 declared=json.loads(CASES.read_text())['cases']
 if case not in declared:raise ProtocolError('unsupported explicit initial-world scenario/input')
 return case['input']['fixture']


def apply_fixture(driver,f,initial):
 if len(initial['bases'])!=7 or len(initial['units'])!=7:raise ProtocolError('original initializer lacks seven source actors')
 m=o.NativeMemory(driver);pid=int(Path(m.file.name).parent.name);fd=os.open(m.file.name,os.O_RDWR)
 os.kill(pid,signal.SIGSTOP)
 try:
  def put(addr,data):
   m.read(addr,len(data));assert os.pwrite(fd,data,addr)==len(data);assert os.pread(fd,len(data),addr)==data
  def img(addr,data):put(m.address(addr),data)
  tilebase=m.image_word(0x0094A30C);centers={(r['x'],r['y']):int(r['owner'].split(':')[1]) for r in f['bases']}
  for y in range(80):
   for x in range(y%2,40,2):
    r=bytearray(m.read(tilebase+(y*20+x//2)*44,44));r[0]=96;r[1]=64;r[2]=(r[2]&0xF0)|15;r[4]=255;r[7]=255;r[8:44]=bytes(36)
    owner=centers.get((x,y))
    if owner:r[2]=(r[2]&0xF0)|owner;r[7]=owner;struct.pack_into('<I',r,8,3)
    put(tilebase+(y*20+x//2)*44,r)
  for declared,actual in zip(f['units'],initial['units']):
   assert actual['owner']==int(declared['owner'].split(':')[1])
   r=bytearray(m.read(m.address(0x00952828)+52*actual['runtime_id'],52));struct.pack_into('<hh',r,0,declared['x'],declared['y']);struct.pack_into('<h',r,10,2);r[14]=actual['owner'];r[16]=0;r[17]=0;r[36]=2;r[40]=0
   struct.pack_into('<hhhh',r,20,-1,-1,-1,-1);struct.pack_into('<hhh',r,46,-1,-1,-1)
   img(0x00952828+52*actual['runtime_id'],r)
  for declared,actual in zip(f['bases'],initial['bases']):
   assert actual['owner']==int(declared['owner'].split(':')[1]);addr=m.address(0x0097D040)+308*actual['runtime_id'];r=bytearray(m.read(addr,308))
   struct.pack_into('<hh',r,0,declared['x'],declared['y']);r[6]=1
   struct.pack_into('<ii',r,60,0,3);struct.pack_into('<i',r,68,0);struct.pack_into('<i',r,76,0);r[80:120]=bytes(40);struct.pack_into('<IIIII',r,120,1,1,0,1,0);r[140:152]=bytes([2])+bytes(11)
   put(addr,r)
  ownership=bytearray(89);ownership[6]=254;img(0x009A6670,ownership)
  for owner in range(1,8):img(0x0096CDA8+owner*0x20CC,struct.pack('<ii',0,-1))
 finally:
  os.kill(pid,signal.SIGCONT);os.close(fd);m.close()
 o.base.raw_key(driver,'Tab');time.sleep(.5)
 o.seed_control(driver,f['reference_rng_seed'])


def native(driver):
 state=o.native(driver);m=o.NativeMemory(driver)
 try:
  for row in state['units']:
   raw=m.read(m.address(0x00952828)+52*row['runtime_id'],52)
   row.update(morale_row=raw[36],home_base_id=struct.unpack_from('<h',raw,46)[0])
  for row in state['bases']:
   raw=m.read(m.address(0x0097D040)+308*row['runtime_id'],308)
   row['facilities_built_ids']=[i for i in range(96) if raw[140+i//8]&(1<<(i%8))]
  state['selection']={'mode':m.image_word(0x00939288),'unit_runtime_id':m.image_word(0x0093928C,signed=True)}
 finally:m.close()
 return state


def stable(driver,vision,path,turn):
 previous=None;deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  driver.snapshot(path);current=native(driver)
  if current['turn']!=turn:raise ProtocolError('explicit original trace advanced beyond requested turn')
  if current==previous:return current
  previous=current;time.sleep(.35)
 raise ProtocolError('explicit original all-player state did not settle')


class Identity:
 def __init__(self,raw,fixture):
  self.base=o.Identity(raw);self.unit_ids={};self.base_ids={}
  for observed in raw['units']:
   requested=[r for r in fixture['units'] if r['owner']=='player:'+str(observed['owner'])]
   if len(requested)!=1:raise ProtocolError('ambiguous authored initial unit identity')
   r=requested[0]
   if (observed['x'],observed['y'],o.token(observed['prototype_name']),observed['damage'],observed['morale_row'],observed['movement_spent'],observed['order_code'],observed['home_base_id'])!=(r['x'],r['y'],r['prototype'],0,2,0,0,-1):raise ProtocolError('original unit fixture readback differs from declared input')
   self.unit_ids[observed['runtime_id']]=r['id']
  for observed in raw['bases']:
   requested=[r for r in fixture['bases'] if r['owner']=='player:'+str(observed['owner'])]
   if len(requested)!=1:raise ProtocolError('ambiguous authored initial base identity')
   r=requested[0]
   if (observed['x'],observed['y'],observed['population'],observed['workers'],observed['specialists'],observed['doctor_codes'],observed['raw_nutrients'],observed['raw_minerals'],observed['project_id'],observed['facilities_built_ids'])!=(r['x'],r['y'],r['population'],0,1,[1],r['raw_nutrients'],r['resources']['minerals'],0,[1]):raise ProtocolError('original base fixture readback differs from declared input')
   self.base_ids[observed['runtime_id']]=r['id']
  for observed,requested in zip(raw['players'],fixture['players']):
   if ('player:'+str(observed['id']),observed['faction_filename'],observed['is_human'],observed['alive'],observed['owned_tech_ids'],observed['research_target'],observed['research_accumulated'])!=(requested['id'],requested['faction'],requested['is_human'],True,requested['research']['owned_tech_ids'],requested['research']['target_id'],requested['research']['accumulated']):raise ProtocolError('original participant/research fixture readback differs from declared input')

 def state(self,raw):
  state=self.base.state(raw,'economy-research-v1')
  for semantic,observed in zip(state['units'],raw['units']):
   semantic['id']=self.unit_ids[observed['runtime_id']]
   if observed['order_code'] not in (0,2):raise ProtocolError('original order outside verified explicit none/hold profile')
   semantic['order']={0:'none',2:'hold'}[observed['order_code']]
  for semantic,observed in zip(state['bases'],raw['bases']):semantic['id']=self.base_ids[observed['runtime_id']]
  return state


def capture(driver,observer,vision,case,path):
 fixture=validate_case(case)
 for p in (driver.work/'game/maps').iterdir():
  if p.is_file() and p.suffix.lower()=='.mp':p.unlink()
 (driver.work/'game/maps/PLANET.MP').write_bytes(o.base.arid_map())
 natural=o.setup(driver,observer,vision,path,fixture['reference_rng_seed'])
 apply_fixture(driver,fixture,natural)
 first=stable(driver,vision,path/'fixture-assembled.png',1);identities=Identity(first,fixture);turn=1
 if first['selection']!={'mode':1,'unit_runtime_id':next(i for i,logical in identities.unit_ids.items() if logical==fixture['selected_unit'])}:raise ProtocolError('declared original caller/selected unit was not established')
 history={'initial':first}
 for action in case['input']['actions']:
  aid=action['id'];kind=action['kind'];frame=path/(aid+'.png')
  if kind=='move-unit':
   if action['args']!={'unit':'scout-p1','direction':'E'}:raise ProtocolError('unsupported original real movement action')
   o.base.raw_key(driver,'KP_6')
  elif kind=='hold-unit':
   if action['args']!={'unit':'scout-p1'}:raise ProtocolError('unsupported original real Hold target')
   o.base.raw_key(driver,'h')
  elif kind=='hold-all-ready-human-units':o.timing.hold_units(driver)
  elif kind=='end-turn':
   driver.click(890,584);turn+=1;deadline=time.monotonic()+90;previous=None
   while time.monotonic()<deadline:
    driver.snapshot(frame);current=native(driver)
    if current['turn']>turn:raise ProtocolError('original advanced beyond explicit next-turn checkpoint')
    if current['turn']==turn and current==previous:break
    o.base.dismiss_research(driver,vision,vision.Image.open(frame));previous=current;time.sleep(.4)
   else:raise ProtocolError('original explicit next-turn did not settle')
  elif kind!='snapshot':raise ProtocolError('unsupported original explicit action')
  current=stable(driver,vision,frame,turn);history[aid]=current
  (path/(aid+'.native.json')).write_text(json.dumps(current,indent=2)+'\n')
 output={'checkpoints':[{'id':p['id'],'after_action':p['after_action'],'state':identities.state(history[p['after_action']])} for p in case['input']['checkpoints']],'diagnostics':{'native_checkpoints':history,'reference_rng_seed':fixture['reference_rng_seed'],'initial_control':'Authored complete seven-player fixture assigned before initial checkpoint; original instructions supply every subsequent action result; nutrient/movement/health/morale retained as diagnostics'}}
 (path/'observed.json').write_text(json.dumps(output,indent=2)+'\n')
 return output


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args();cases=load_request()['cases']
 for case in cases:validate_case(case)
 initial=fingerprint();args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));driver=None;observer=o.base.FactionVision();vision=o.transport.base.ContextVision()
 print('Original explicit-world artifacts: '+str(work),file=sys.stderr,flush=True)
 try:
  driver=o.transport.base.ContextDriver(args.assets,args.wine,work);rows=[]
  for case in cases:
   path=work/case['id'];path.mkdir();output=capture(driver,observer,vision,case,path);rows.append({'id':case['id'],'status':'ok','output':output});print('Captured original explicit world: '+case['id'],file=sys.stderr,flush=True)
  if fingerprint()!=initial:raise ProtocolError('explicit original source/input contract changed during recording')
  write_response(dict(driver.metadata,contract='game.state_trace.v1',adapter_sha256=initial,fixture_contract_sha256=hashlib.sha256(CONTRACT.read_bytes()).hexdigest(),fixture_input_sha256=hashlib.sha256(CASES.read_bytes()).hexdigest(),map_sha256=hashlib.sha256(o.base.arid_map()).hexdigest(),input_control='Separate explicitly authored seven-player world v2: declared initial map/base/unit/technology/research values only; no code or postaction data writes',observation='Actual original controls and read-only complete native participant/unit/base/economy/research arrays at every checkpoint, with persistent authored entity IDs'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()

if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,o.subprocess.SubprocessError) as error:
  print('Original explicit-world trace failed: '+str(error),file=sys.stderr);sys.exit(1)
