"""Observe natural human first-city state with stock text inputs and a flat map."""
import argparse,hashlib,inspect,json,struct,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
UI=ROOT/'tools/behavior-tests/ui'
sys.path.insert(0,str(UI.parent))
sys.path.insert(0,str(UI/'reference-archives/unit-menu-context-saved-v26'))
import unit_menu_context_message_original as transport
from protocol import ProtocolError,load_request,write_response
from ui.faction_setup_native import NativeMemory
base=transport.base.previous.base
ALGORITHM='game.natural_first_city.v1'
FACTION_SLOTS={'GAIANS':0,'HIVE':1,'UNIV':2,'MORGAN':3,'SPARTANS':4,'BELIEVE':5,'PEACE':6}

def fingerprint():
 return hashlib.sha256(transport.fingerprint().encode()+Path(__file__).read_bytes()).hexdigest()

def native(driver):
 m=NativeMemory(driver)
 try:
  mask=m.read(m.address(0x009A64E8),1)[0]
  if mask not in (2,4,8,16,32,64,128):raise ProtocolError('Expected exactly one human owner')
  owner=mask.bit_length()-1
  width,height=m.image_word(0x00949870),m.image_word(0x00949874)
  if (width,height)!=(40,80):raise ProtocolError('Actual native grid differs from declared flat map')
  count=m.image_word(0x009A64CC)
  if not 1<=count<=512:raise ProtocolError('Unbounded actual city array')
  cities=[]
  for index in range(count):
   raw=m.read(m.address(0x0097D040)+index*308,308)
   if raw[4]!=owner:continue
   x,y=struct.unpack_from('<hh',raw);population=struct.unpack_from('<b',raw,6)[0]
   nutrients,minerals=struct.unpack_from('<ii',raw,60)
   worked,specialists=struct.unpack_from('<Ii',raw,120)
   if not 0<=x<width or not 0<=y<height or (x+y)%2:raise ProtocolError('Actual city outside declared grid')
   tile=m.read(m.image_word(0x0094A30C)+(y*(width//2)+x//2)*44,44)
   if tile[0]>>5!=3 or (tile[0]>>3)&3 or tile[5]>>6:raise ProtocolError('Actual city terrain differs from declared flat arid land')
   if not 1<=population<=127 or not 0<=specialists<=population or not worked&1 or worked>>21:raise ProtocolError('Unrecognized actual population/work fields')
   if not -100000<=nutrients<=100000 or not -100000<=minerals<=100000:raise ProtocolError('Unbounded actual resource fields')
   cities.append({'identity':{'id':index,'x':x,'y':y,'name':raw[19:44].hex()},'population':population,
      'workers':population-specialists,'specialists':specialists,'worked_tiles':worked.bit_count()-1,
      'raw_nutrients':nutrients,'raw_minerals':minerals})
  unit_count=m.image_word(0x009A64C8)
  if not 0<=unit_count<=2048:raise ProtocolError('Unbounded actual vehicle array')
  units=[]
  for index in range(unit_count):
   raw=m.read(m.address(0x00952828)+index*52,52)
   if raw[14]==owner:
    units.append({'id':index,'position':list(struct.unpack_from('<hh',raw)),'type':struct.unpack_from('<h',raw,10)[0],
                  'damage':raw[16],'order':raw[17],'work':raw[37],'movement_spent':raw[40]})
  return {'year':m.image_word(0x009A64D4),'human_cities':cities,'owned_units':units,'global_city_count':count}
 finally:m.close()

def settled(driver,vision,path,timeout,turn,advance=False):
 deadline=time.monotonic()+timeout;previous=None
 while time.monotonic()<deadline:
  driver.snapshot(path);current=native(driver)
  if current['year']!=turn:raise ProtocolError('First-city observation advanced a turn')
  if len(current['human_cities'])!=1:raise ProtocolError('First-city checkpoint does not contain exactly one human city')
  # The frame is real; this native observer does not infer values from artwork.
  if current==previous:return current
  previous=current;time.sleep(.3)
 raise ProtocolError('Natural first-city state did not settle')

def setup_for_input(difficulty,faction):
 source=inspect.getsource(base.setup)
 old="choose(driver, observer, 'CITIZEN',"
 if source.count(old)!=1:raise ProtocolError('Original setup adapter shape changed')
 source=source.replace(old,"choose(driver, observer, difficulty,")
 slot=FACTION_SLOTS[faction]
 for old,new in [('driver.click(550, 147)','driver.click(550, 147 + 19 * slot)'),("selected['selected'] != 0","selected['selected'] != slot")]:
  if source.count(old)!=1:raise ProtocolError('Original faction setup adapter shape changed')
  source=source.replace(old,new)
 namespace=dict(vars(base),difficulty=difficulty,slot=slot,settled=settled)
 exec(compile(source,'<declared-difficulty-setup>','exec'),namespace)
 return namespace['setup']

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args()
 cases=load_request()['cases']
 expected={'faction':'GAIANS','difficulty':'CITIZEN','rules':'standard','text_profile':'stock','world_width':40,'world_height':80,'terrain':'flat-arid','checkpoint':'first-city-initialized','preferences':{'pause_at_end':True,'tutorials':False}}
 for case in cases:
  declared=dict(expected,difficulty=case['input'].get('difficulty'),faction=case['input'].get('faction'))
  if declared['faction'] not in FACTION_SLOTS or declared['difficulty'] not in ('CITIZEN','SPECIALIST','TALENT','LIBRARIAN','THINKER','TRANSCEND') or case['algorithm']!=ALGORITHM or case['input']!=declared:raise ProtocolError('Unsupported natural first-city input')
 initial_hash=fingerprint();args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
 observer=base.FactionVision();vision=transport.base.ContextVision();driver=None
 try:
  driver=transport.base.ContextDriver(args.assets,args.wine,work)
  for path in (driver.work/'game/maps').iterdir():
   if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
  terrain=base.arid_map();(driver.work/'game/maps/PLANET.MP').write_bytes(terrain)
  source_hashes={}
  for path in sorted(args.assets.iterdir()):
   if path.is_file() and path.suffix.lower()=='.txt':
    installed=driver.work/'game'/path.name
    if not installed.exists() or installed.read_bytes()!=path.read_bytes():raise ProtocolError('Installed text input is not stock: '+path.name)
    source_hashes[path.name.lower()]=hashlib.sha256(path.read_bytes()).hexdigest()
  if not {'alphax.txt','alpha.txt','gaians.txt'}<=set(source_hashes):raise ProtocolError('Missing stock rules/faction inputs')
  base.settled=settled
  rows=[]
  for case in cases:
   path=work/case['id'];path.mkdir()
   for name,digest in source_hashes.items():
    files=[item for item in (driver.work/'game').iterdir() if item.name.lower()==name]
    if len(files)!=1 or hashlib.sha256(files[0].read_bytes()).hexdigest()!=digest:raise ProtocolError('Stock text changed between independent cases')
   current=setup_for_input(case['input']['difficulty'],case['input']['faction'])(driver,observer,vision,path,45)
   later=settled(driver,vision,path/'observed-again.png',45,1)
   if current!=later:raise ProtocolError('Read-only first-city state changed during observation')
   city=current['human_cities'][0]
   output={'year_delta':current['year']-1,'human_base_count':len(current['human_cities']),
      'base':{key:city[key] for key in ('population','workers','specialists','worked_tiles','raw_nutrients','raw_minerals')}}
   (path/'raw-native-observation.json').write_text(json.dumps(current,indent=2)+'\n')
   (path/'observed.json').write_text(json.dumps(output,indent=2)+'\n')
   rows.append({'id':case['id'],'status':'ok','output':output})
  if fingerprint()!=initial_hash:raise ProtocolError('Reference source changed during capture')
  write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial_hash,map_sha256=hashlib.sha256(terrain).hexdigest(),
   stock_text_sha256=source_hashes,observation='Fresh ordinary stock declared-base-faction/declared-difficulty/standard setup through first-city naming and default research acceptance; bounded read-only city/unit/year observation repeated stable',
   boundaries='Declared flat40x80 land and pause/tutorial preferences; no population/store/starting-unit fixture writes or text edits. Raw resource fields are not general resource semantics. No AI decisions, opponent roster, natural random terrain, founding controls or later turns established'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()
if __name__=='__main__':main()
