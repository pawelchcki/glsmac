#!/usr/bin/env python3
"""Fingerprint-guarded original all-player scenario observer.

The original process supplies every answer. Only declared map/preferences and
PRNG input state are fixture controls; game instructions are never replaced.
"""
import argparse,hashlib,inspect,json,os,re,struct,subprocess,sys,tempfile,time
from collections import Counter
from pathlib import Path
DIRECTORY=Path(__file__).resolve().parent
BEHAVIOR=DIRECTORY.parent
UI=BEHAVIOR/'ui'
sys.path[:0]=[str(BEHAVIOR),str(UI/'reference-archives/unit-menu-context-saved-v26')]
import unit_menu_context_message_original as transport
from ui.faction_setup_native import NativeMemory
from ui.faction_identity_original import RECORD,STRIDE,OFFSETS
from ui.faction_identity_contract import FIELDS
from ui import science_timing_variants_original as timing
from protocol import ProtocolError,load_request,write_response
base=transport.base.previous.base
ALGORITHM='game.state_trace.v1'
FIXTURE={'kind':'natural-startup','width':40,'height':80,'terrain':'flat-arid','faction':'GAIANS','difficulty':'Citizen','reference_rng_seed':1}

def fingerprint():
 digest=hashlib.sha256(transport.fingerprint().encode())
 for path in [Path(__file__),DIRECTORY/'seed_control_win.py',DIRECTORY/'reference-profile-contract.md']:
  digest.update(path.read_bytes())
 return digest.hexdigest()

def native(driver):
 m=NativeMemory(driver)
 try:
  mask=m.read(m.address(0x009A64E8),1)[0];width=m.image_word(0x00949870);height=m.image_word(0x00949874)
  if mask!=2 or (width,height)!=(40,80):raise ProtocolError('unexpected human/map')
  def xy(raw):
   x,y=struct.unpack_from('<hh',raw)
   if not 0<=x<width or not 0<=y<height or (x+y)%2:raise ProtocolError('invalid position')
   return dict(x=x,y=y)
  count=m.image_word(0x009A64CC)
  if not 1<=count<=512:raise ProtocolError('unbounded bases')
  bases=[]
  for i in range(count):
   raw=m.read(m.address(0x0097D040)+308*i,308);owner=raw[4]
   if not 1<=owner<=7:raise ProtocolError('unknown base owner')
   pop=struct.unpack_from('<b',raw,6)[0];specialists=struct.unpack_from('<i',raw,124)[0];worked=struct.unpack_from('<I',raw,120)[0]
   if not 1<=pop<=127 or not 0<=specialists<=pop or not worked&1 or worked>>21:raise ProtocolError('unknown base population')
   bases.append(dict(runtime_id=i,owner=owner,**xy(raw),population=pop,workers=pop-specialists,specialists=specialists,worked_mask=worked,raw_nutrients=struct.unpack_from('<i',raw,60)[0],raw_minerals=struct.unpack_from('<i',raw,64)[0],project_id=struct.unpack_from('<i',raw,80)[0],doctor_codes=[(struct.unpack_from('<I',raw,132)[0]>>(4*k))&15 for k in range(specialists)] if specialists<=8 else None))
  count=m.image_word(0x009A64C8)
  if not 0<=count<=2048:raise ProtocolError('unbounded units')
  units=[]
  for i in range(count):
   raw=m.read(m.address(0x00952828)+52*i,52);owner=raw[14]
   if not 0<=owner<=7:raise ProtocolError('unknown unit owner')
   units.append(dict(runtime_id=i,owner=owner,**xy(raw),prototype_id=struct.unpack_from('<h',raw,10)[0],prototype_name=m.text(m.address(0x009AB868)+52*struct.unpack_from('<h',raw,10)[0]),damage=raw[16],order_code=raw[17],movement_spent=raw[40],work=raw[37]))
  ownership=m.read(m.address(0x009A6670),89)
  players=[]
  for i in range(1,8):
   names={k:m.text(m.address(RECORD+(i-1)*STRIDE+o)) for k,o in zip(FIELDS,OFFSETS)}
   players.append(dict(id=i,is_human=bool(mask&(1<<i)),faction_filename=m.text(m.address(0x00946A50)+STRIDE*i+4),alive=bool(m.read(m.address(0x009A64E9),1)[0]&(1<<i)),identity=names,owned_tech_ids=[t for t,b in enumerate(ownership) if b&(1<<i)],research_target=m.image_word(0x0096CDAC+i*0x20CC,signed=True),research_accumulated=m.image_word(0x0096CDA8+i*0x20CC,signed=True)))
  return dict(turn=m.image_word(0x009A64D4),map=dict(width=width,height=height),players=players,units=units,bases=bases)
 finally:m.close()

def seed_control(driver,seed):
 receipt=Path(driver.log.name).parent/'rng-fixture-input.json'
 subprocess.run([str(driver.wine),str(transport.runtime/'pythonw.exe'),transport.winpath(DIRECTORY/'seed_control_win.py'),transport.winpath(receipt),str(seed)],env=driver.env,stdout=driver.log,stderr=driver.log,check=True,timeout=20)
 result=json.loads(receipt.read_text())
 if result.get('ok') is not True or result.get('readback')!={'crt':seed,'game':seed}:raise ProtocolError('original RNG fixture control failed')


def stable(driver,vision,path,timeout,turn,*args,**kwargs):
 previous=None;deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  driver.snapshot(path);current=native(driver)
  if current['turn']!=turn:raise ProtocolError('unexpected native turn during observation')
  if current==previous:return current
  previous=current;time.sleep(.35)
 raise ProtocolError('complete all-player state did not settle')


def setup(driver,observer,vision,directory,seed):
 source=inspect.getsource(base.setup)
 old="    vision.wait(driver, lambda image: opening_dialog(observer, image), directory / 'opening.png', timeout); driver.key('Enter')"
 old_name="    driver.key('Enter')\n"+old
 if source.count(old_name)!=1:raise ProtocolError('original leader-confirmation setup shape changed')
 source=source.replace(old_name,"    apply_seed(driver)\n"+old_name)
 namespace=dict(vars(base),apply_seed=lambda d:seed_control(d,seed),settled=stable)
 exec(compile(source,'<declared-seeded-original-setup>','exec'),namespace)
 return namespace['setup'](driver,observer,vision,directory,45)


def token(name):
 result=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')
 if not result:raise ProtocolError('empty native prototype name')
 return result


class Identity:
 def __init__(self,initial):
  self.units={};self.bases={};ordinals=Counter()
  for row in initial['units']:
   key=(row['owner'],token(row['prototype_name']),row['x'],row['y']);ordinal=ordinals[('unit',*key)];ordinals[('unit',*key)]+=1
   logical='unit:player:%d:%s:%d:%d:%d'%(*key,ordinal)
   self.units[row['runtime_id']]=(logical,row['owner'],row['prototype_id'])
  for row in initial['bases']:
   key=(row['owner'],row['x'],row['y']);ordinal=ordinals[('base',*key)];ordinals[('base',*key)]+=1
   logical='base:player:%d:%d:%d:%d'%(*key,ordinal)
   self.bases[row['runtime_id']]=(logical,row['owner'],row['x'],row['y'])

 def state(self,raw,profile):
  if {r['runtime_id'] for r in raw['units']}!=set(self.units) or {r['runtime_id'] for r in raw['bases']}!=set(self.bases):
   raise ProtocolError('spawn/delete/compaction identity outside bounded original trace')
  players=[dict(id='player:'+str(p['id']),faction=p['faction_filename']) for p in raw['players'] if p['alive']]
  owners={p['id'] for p in raw['players'] if p['alive']}
  units=[];bases=[]
  for r in raw['units']:
   logical,owner,prototype=self.units[r['runtime_id']]
   if (r['owner'],r['prototype_id'])!=(owner,prototype) or owner not in owners:raise ProtocolError('original native unit identity changed')
   units.append(dict(id=logical,owner='player:'+str(owner),x=r['x'],y=r['y'],prototype=token(r['prototype_name'])))
  for r in raw['bases']:
   logical,owner,x,y=self.bases[r['runtime_id']]
   if (r['owner'],r['x'],r['y'])!=(owner,x,y) or owner not in owners:raise ProtocolError('original native base identity changed')
   row=dict(id=logical,owner='player:'+str(owner),x=x,y=y,population=r['population'])
   if profile=='economy-research-v1':
    if r['doctor_codes'] is None or any(c!=1 for c in r['doctor_codes']):raise ProtocolError('non-Doctor original specialists outside declared profile')
    if r['project_id'] not in (0,1,2):raise ProtocolError('unverified original project kind')
    row.update(resources={'minerals':r['raw_minerals']},project={0:'colony-pod',1:'formers',2:'scout-patrol'}[r['project_id']],jobs={'workers':r['workers'],'doctors':r['specialists']})
   bases.append(row)
  result=dict(turn=raw['turn'],map=raw['map'],players=players,units=units,bases=bases)
  if profile=='economy-research-v1':
   result['research']={'player:'+str(p['id']):dict(owned_tech_ids=p['owned_tech_ids'],target_id=p['research_target'],accumulated=p['research_accumulated']) for p in raw['players'] if p['alive']}
  return result


def validate_case(case):
 if case['algorithm']!=ALGORITHM:raise ProtocolError('unknown original state-trace algorithm')
 data=case['input'];fixture=dict(data['fixture']);profile=fixture.pop('profile','core')
 if fixture!=FIXTURE or profile not in ('core','economy-research-v1'):raise ProtocolError('unsupported original state-trace fixture')
 if set(data)-{'fixture','actions','checkpoints'}:raise ProtocolError('unknown scenario field')
 actions=data['actions']
 for a in actions:
  if set(a)-{'id','kind','args'} or a.get('args',{}) or a['kind'] not in ('snapshot','hold-all-ready-human-units','end-turn'):raise ProtocolError('unsupported original state-trace action')
 if sum(a['kind']=='end-turn' for a in actions)>1:raise ProtocolError('original scenario bounded to one end-turn')
 return profile


def capture(case,args,artifacts):
 profile=validate_case(case);observer=base.FactionVision();vision=transport.base.ContextVision();driver=None
 try:
  driver=transport.base.ContextDriver(args.assets,args.wine,artifacts)
  for path in (driver.work/'game/maps').iterdir():
   if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
  (driver.work/'game/maps/PLANET.MP').write_bytes(base.arid_map())
  first=setup(driver,observer,vision,artifacts,case['input']['fixture']['reference_rng_seed'])
  identities=Identity(first);history={'initial':first};turn=first['turn']
  for action in case['input']['actions']:
   kind=action['kind'];aid=action['id'];path=artifacts/(aid+'.png')
   if kind=='hold-all-ready-human-units':timing.hold_units(driver)
   if kind=='end-turn':
    driver.click(890,584);turn+=1;deadline=time.monotonic()+90;previous=None
    while time.monotonic()<deadline:
     driver.snapshot(path);current=native(driver)
     if current['turn']>turn:raise ProtocolError('original advanced beyond requested next-turn')
     if current['turn']==turn and current==previous:break
     base.dismiss_research(driver,vision,vision.Image.open(path));previous=current;time.sleep(.4)
    else:raise ProtocolError('original next-turn did not settle')
   current=stable(driver,vision,path,45,turn);history[aid]=current
   (artifacts/(aid+'.native.json')).write_text(json.dumps(current,indent=2)+'\n')
  plan=case['input'].get('checkpoints',[dict(id=a['id'],after_action=a['id']) for a in case['input']['actions']])
  output=dict(checkpoints=[dict(id=p['id'],after_action=p['after_action'],state=identities.state(history[p['after_action']],profile)) for p in plan],diagnostics={'native_checkpoints':history,'reference_rng_seed':case['input']['fixture']['reference_rng_seed'],'scope':'all native arrays irrespective visibility; no remaining-movement conversion; raw nutrient counter semantics unsupported'})
  (artifacts/'observed.json').write_text(json.dumps(output,indent=2)+'\n')
  return driver.metadata,output
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args()
 cases=load_request()['cases']
 for case in cases:validate_case(case)
 initial=fingerprint();args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));metadata=None;rows=[]
 print('Original all-player trace artifacts: '+str(work),file=sys.stderr,flush=True)
 for case in cases:
  path=work/case['id'];path.mkdir();actual,output=capture(case,args,path)
  if metadata is not None and actual!=metadata:raise ProtocolError('original executable/assets identity changed')
  metadata=actual;rows.append(dict(id=case['id'],status='ok',output=output))
  print('Captured original all-player trace: '+case['id'],file=sys.stderr,flush=True)
 if fingerprint()!=initial:raise ProtocolError('original state-trace adapter changed during recording')
 write_response(dict(metadata or {},contract=ALGORITHM,adapter_sha256=initial,map_sha256=hashlib.sha256(base.arid_map()).hexdigest(),input_control='stock original-seven Gaian/Citizen/standard flat40x80; original PRNG input states set once before leader-name confirmation; no roster/entity/position/resource/technology writes',observation='read-only complete live faction roster and all native units/bases at first-city, declared control actions and actual next turn; optional independently frozen economy/research fields'),rows)

if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,subprocess.SubprocessError) as error:
  print('Original all-player state trace failed: '+str(error),file=sys.stderr);sys.exit(1)
