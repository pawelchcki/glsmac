"""Private discovery: real B joins own base; guarded structural reads only."""
import argparse,hashlib,inspect,json,struct,subprocess,sys,tempfile,time
from pathlib import Path
DIRECTORY=Path(__file__).resolve().parent
sys.path.insert(0,str(DIRECTORY.parent if DIRECTORY.name=='ui' else Path.cwd()/'tools/behavior-tests'))
from ui import unit_selection_original as base
from ui.faction_setup_native import NativeMemory
from protocol import ProtocolError,load_request,write_response
from ui.vision import VisionError

# Extend only the bounded public structural observer: 2/3 owned identities and
# raw order ordinals. Never modify original instructions or process memory.
source=inspect.getsource(base.native).replace('def native(driver):','def native_join(driver):',1)
source=source.replace('raw[17] not in (0, 2)','raw[17] not in (0, 1, 2)')
source=source.replace("'order': 'hold' if raw[17] == 2 else 'none',", "'order': {0:'none',1:'source-order-1',2:'hold'}[raw[17]], 'order_code': raw[17],")
old="if len(units) != 3 or {u['role'] for u in units} != set(ROLES):"
new="if len(units) not in (2,3) or len({u['role'] for u in units}) != len(units) or not {'scout','former'} <= {u['role'] for u in units} or not {u['role'] for u in units} <= set(ROLES):"
assert old in source;source=source.replace(old,new)
namespace=dict(vars(base));exec(source,namespace);base.native=namespace['native_join']

def city(driver,origin):
 m=NativeMemory(driver)
 try:
  mask=m.read(m.address(0x009A64E8),1)[0]
  if mask not in (2,4,8,16,32,64,128):raise ProtocolError('Expected one human faction')
  owner=mask.bit_length()-1;count=m.image_word(0x009A64CC)
  if not 1<=count<=512:raise ProtocolError('Unbounded original base array')
  own=[]
  for index in range(count):
   raw=m.read(m.address(0x0097D040)+index*308,308)
   if raw[4]!=owner:continue
   x,y=struct.unpack_from('<hh',raw);pop=struct.unpack_from('<b',raw,6)[0]
   # Public packed BASE declarations: pop6, name19, food60, minerals64,
   # worked tiles120 and specialist count124. These are data, not algorithms.
   food,minerals=struct.unpack_from('<ii',raw,60);worked,specialists=struct.unpack_from('<Ii',raw,120)
   codes=[(struct.unpack_from('<I',raw,132)[0]>>(i*4))&15 for i in range(specialists)] if 0<=specialists<=3 else []
   if not worked&1 or worked>>21 or any(code!=1 for code in codes):raise ProtocolError('Unexpected worker mask or non-Doctor specialist')
   if not 1<=pop<=3 or not 0<=specialists<=pop or not 0<=food<=100000 or not 0<=minerals<=100000:raise ProtocolError('Unexpected city data range')
   name=raw[19:44]
   if b'\0' not in name:raise ProtocolError('Unterminated original base name')
   own.append({'id':index,'x':x,'y':y,'name':name.split(b'\0',1)[0].decode('cp1252'),'population':pop,'workers':pop-specialists,'doctors':specialists,'worked_tiles':worked.bit_count()-1,'nutrients':food,'minerals':minerals,'worked_mask':worked})
  if len(own)!=1 or (own[0]['x'],own[0]['y'])!=origin:raise ProtocolError('Expected one owned city at the actual initial stack')
  return {'global_count':count,'owned_count':len(own),'city':own[0]}
 finally:m.close()

def settled(driver,vision,path,year,origin):
 deadline=time.monotonic()+45;previous=None;time.sleep(1.2)
 while time.monotonic()<deadline:
  driver.snapshot(path);image=vision.Image.open(path).convert('RGB');native=base.native(driver);town=city(driver,origin)
  if native['turn']!=year:raise ProtocolError('Join changed the paused year')
  if any((u['x'],u['y'])!=origin for u in native['units']):raise ProtocolError('Join fixture moved unexpectedly')
  if native['selected'] is not None:
   try:
    if vision.line_at(image,(10,637,135,653))!=base.ROLE_LABEL[native['selected']]:raise VisionError('Selected name mismatch')
   except VisionError:previous=None;time.sleep(.2);continue
  state={'native':native,'base':town}
  if state==previous:return state
  previous=state;time.sleep(.2)
 raise ProtocolError('Join observation failed to settle')


ALGORITHM='game.colony_join_base.v1'
INITIAL={'workers':0,'doctors':1,'worked_tiles':0,'nutrients':0,'minerals':9}
def fingerprint():
 return hashlib.sha256(base.fingerprint().encode()+Path(__file__).read_bytes()).hexdigest()
def validate(data):
 if not isinstance(data,dict) or set(data)!={'profile','initial_base','setup','actions'} or data['profile']!='stacked' or not isinstance(data['initial_base'],dict) or any(type(v) is not int for v in data['initial_base'].values()) or data['initial_base']!=INITIAL:raise ProtocolError('Join requires the declared first-city fixture')
 if not isinstance(data['setup'],list) or len(data['setup'])!=2 or any(a not in ('wait','skip','hold','sleep') for a in data['setup']) or data['actions']!=['join','wait','tab']:raise ProtocolError('Unknown bounded join sequence')
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args();cases=load_request()['cases'];initial_hash=fingerprint()
 for case in cases:
  if case['algorithm']!=ALGORITHM:raise ProtocolError('Unknown join algorithm')
  validate(case['input'])
 args.artifacts.mkdir(parents=True,exist_ok=True);directory=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=base.FactionVision();vision=base.FormerVision();driver=None
 try:
  driver=base.OriginalDriver(args.assets,args.wine,directory)
  for path in (driver.work/'game/maps').iterdir():
   if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
  (driver.work/'game/maps/zzterraform.MP').write_bytes(base.arid_map());inputs=base.bundle(args.assets)
  for name,raw in inputs.items():(driver.work/'game'/name).write_bytes(raw)
  rows=[]
  citizen_hash=hashlib.sha256()
  citizen_files=[p for p in args.assets.iterdir() if p.name.lower() in ('alpha.txt','alphax.txt')]
  if len(citizen_files)!=2:raise ProtocolError('Missing citizen input pair')
  for p in sorted(citizen_files):
   raw=p.read_bytes();lines=raw.decode('latin1').splitlines();starts=[i for i,line in enumerate(lines) if line.strip()=='#CITIZENS']
   if len(starts)!=1:raise ProtocolError('Ambiguous citizen source')
   citizen_rows=[]
   for line in lines[starts[0]+1:]:
    if line.strip().startswith('#'):break
    body=line.split(';',1)[0].strip()
    if body:citizen_rows.append(body)
   if len(citizen_rows)<2 or citizen_rows[1].split(',')[0].strip().upper()!='DOCTOR':raise ProtocolError('Doctor ordinal does not match installed source')
   citizen_hash.update(p.name.lower().encode()+b'\0'+raw)
  for case in cases:
   if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
   path=directory/case['id'];path.mkdir();current,origin=base.prepare(driver,observer,vision,{'input':{'profile':'stacked'}},path,45)
   if len(current['units'])!=3:raise ProtocolError('Fresh join fixture lost a unit')
   for index,action in enumerate(case['input']['setup']):
    base.raw_key(driver,{'wait':'w','skip':'space','hold':'h','sleep':'l'}[action]);current=base.settled(driver,vision,path/f'prepare-{index}.png',45,current['turn'])
   if current['selected']!='colony':raise ProtocolError('Join preparation did not select actual Colony Pod')
   first=settled(driver,vision,path/'initial.png',current['turn'],origin);before=first['base'];identity={k:before['city'][k] for k in ('id','x','y','name')};unit_ids={u['role']:u['index'] for u in first['native']['units']}
   if {k:before['city'][k] for k in INITIAL}!=case['input']['initial_base']:raise ProtocolError('Original initial city does not match declared input')
   def output(state):
    town=state['base'];c=town['city']
    if town['global_count']!=before['global_count'] or town['owned_count']!=before['owned_count'] or {k:c[k] for k in identity}!=identity:raise ProtocolError('Join changed base count or identity')
    for u in state['native']['units']:
     if u['index']!=unit_ids[u['role']]:raise ProtocolError('Join replaced an existing surviving unit identity')
    return {'year_delta':state['native']['turn']-current['turn'],'selected':state['native']['selected'],
            'base':dict({k:c[k] for k in ('population','workers','doctors','worked_tiles','nutrients','minerals')},owned_count=town['owned_count']),
            'units':[{'role':u['role'],'order_code':u['order_code'],'movement_spent':u['movement_spent']} for u in state['native']['units']]}
   trace=[output(first)]
   for index,action in enumerate(case['input']['actions']):
    base.raw_key(driver,{'join':'b','wait':'w','tab':'Tab'}[action]);trace.append(output(settled(driver,vision,path/f'{index}-{action}.png',current['turn'],origin)))
   result={'trace':trace};(path/'observed.json').write_text(json.dumps(result,indent=2)+'\n');rows.append({'id':case['id'],'status':'ok','output':result});print('Captured original Colony join: '+case['id'],file=sys.stderr,flush=True)
  if fingerprint()!=initial_hash:raise ProtocolError('Join observer changed during capture')
  digest=hashlib.sha256(base.arid_map())
  for name,raw in sorted(inputs.items()):digest.update(name.encode()+b'\0'+raw)
  write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial_hash,source_profiles_sha256=digest.hexdigest(),citizen_sources_sha256=citizen_hash.hexdigest(),
                     fixture='Fresh owned healthy three-unit Gaians/Citizen/standard stack at actual first base on flat arid 40x80 land; declared initial Doctor/stores, UNIT1+0 bonuses, pause on/tutorials off; real companion commands',
                     observation='Real B/W/Tab, guarded actual unit count/orders/movement/identity and visible selected-name cross-check; actual base population, Doctor ordinal1 count, worked-tile count and stored nutrients/minerals; global/owned base count and identity guarded',
                     units='Role-normalized selected identity, original order byte ordinals0/1/2, movement spent in thirds; integer base citizen/worked-tile/resource counts; owned base count, turn difference',
                     boundaries='Controlled initial city input is guarded in original and may be declared in reproduction fixture; natural starting-city defaults, work assignment positions, income/turns, other sizes/terrain/factions, population limits, save/load/multiplayer are not established'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:print('Original Colony join failed:',error,file=sys.stderr);sys.exit(1)
