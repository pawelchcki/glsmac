"""Observe actual original world base ownership after ordinary setup."""
import argparse,hashlib,json,struct,sys,tempfile
from collections import Counter
from pathlib import Path
DIRECTORY=Path(__file__).resolve().parent
sys.path.insert(0,str(DIRECTORY.parent))
sys.path.insert(0,str(DIRECTORY/'reference-archives/unit-menu-context-saved-v26'))
import unit_menu_context_message_original as message
from protocol import ProtocolError,load_request,write_response
from ui.faction_setup_native import NativeMemory
base=message.base
INITIAL={'workers':0,'doctors':1,'worked_tiles':0,'nutrients':0,'minerals':9}
ALGORITHM='game.world_base_ownership.v1'

def fingerprint():
 return hashlib.sha256(message.fingerprint().encode()+Path(__file__).read_bytes()).hexdigest()

def ownership(driver):
 memory=NativeMemory(driver)
 try:
  mask=memory.read(memory.address(0x009A64E8),1)[0]
  if mask not in (2,4,8,16,32,64,128):raise ProtocolError('Expected one actual human faction')
  human=mask.bit_length()-1;count=memory.image_word(0x009A64CC)
  if not 1<=count<=512:raise ProtocolError('Unbounded actual city array')
  owners=[]
  for index in range(count):
   raw=memory.read(memory.address(0x0097D040)+index*308,308)
   x,y=struct.unpack_from('<hh',raw);owner=raw[4]
   if not 0<=x<40 or not 0<=y<80 or (x+y)%2 or not 1<=owner<=7:raise ProtocolError('Invalid actual city identity/position/owner')
   owners.append(owner)
  counts=Counter(owners)
  return {'human_factions':mask.bit_count(),'total_bases':count,'owners_with_bases':len(counts),'human_bases':counts[human],
          'other_owner_base_counts':sorted(amount for owner,amount in counts.items() if owner!=human)}
 finally:memory.close()

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args()
 cases=load_request()['cases'];expected={'profile':'gaian-citizen-standard-flat-stacked','world_width':40,'world_height':80,'initial_human_base':INITIAL}
 for case in cases:
  if case['algorithm']!=ALGORITHM or case['input']!=expected:raise ProtocolError('Unsupported world ownership input')
 initial_hash=fingerprint();args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));driver=None
 observer=base.previous.base.FactionVision();vision=base.ContextVision()
 try:
  driver=base.ContextDriver(args.assets,args.wine,work)
  for path in (driver.work/'game/maps').iterdir():
   if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
  (driver.work/'game/maps/PLANET.MP').write_bytes(base.previous.base.arid_map())
  inputs=base.previous.base.bundle(args.assets)
  for name,raw in inputs.items():(driver.work/'game'/name).write_bytes(raw)
  rows=[]
  for case in cases:
   path=work/case['id'];path.mkdir()
   current,origin=base.previous.base.prepare(driver,observer,vision,{'input':{'profile':'stacked'}},path,45)
   town=base.previous.ref.full.city(driver,origin)
   if current['turn']!=1 or current['selected']!='scout' or any(unit['order_code'] or unit['movement_spent'] for unit in current['units']):raise ProtocolError('Prepared ordinary world is not the declared initial state')
   if {key:town['city'][key] for key in INITIAL}!=INITIAL:raise ProtocolError('Initial human city differs from input')
   first=ownership(driver);driver.snapshot(path/'ownership-observed.png');second=ownership(driver)
   if first!=second or base.previous.base.native(driver)!=current or base.previous.ref.full.city(driver,origin)!=town:raise ProtocolError('World ownership observation did not remain stable')
   (path/'observed.json').write_text(json.dumps(first,indent=2)+'\n');rows.append({'id':case['id'],'status':'ok','output':first})
  if fingerprint()!=initial_hash:raise ProtocolError('Reference research source changed during capture')
  digest=hashlib.sha256(base.previous.base.arid_map())
  for name,raw in sorted(inputs.items()):digest.update(name.encode()+b'\0'+raw)
  write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial_hash,source_profiles_sha256=digest.hexdigest(),
   observation='Fresh original ordinary setup through first city; read-only actual city array owners and human mask, with stable native city/unit/year guards',
   boundaries='Controlled Gaian/Citizen/standard-rules flat40x80 first-city fixture with declared companions. Counts of owners with bases only; not complete participant roster, AI decisions, faction identity/composition, natural starting units/placement or later turns'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()
if __name__=='__main__':main()
