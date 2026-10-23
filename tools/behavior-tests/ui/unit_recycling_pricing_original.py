"""Audit immutable saved-fixture pricing globals through read-only original state."""
import argparse,hashlib,json,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import unit_recycling_original as original
from ui import faction_ratings_original as ratings
from ui.faction_setup_native import NativeMemory
ALGORITHM='fixture.unit_recycling_pricing.v1'

def read(driver):
 m=NativeMemory(driver)
 try:
  mask=m.read(m.address(0x009A64E8),1)[0]
  if mask not in (2,4,8,16,32,64,128):raise ProtocolError('Pricing audit requires one actual human')
  owner=mask.bit_length()-1
  data=dict(map_size_kind=m.image_word(0x0094A2A0,signed=True),width=m.image_word(0x00949870),height=m.image_word(0x00949874),
   difficulty=m.image_word(0x009A64C4),industry=m.image_word(ratings.INDUSTRY+owner*ratings.STRIDE,signed=True),mineral_rule_factor=m.image_word(ratings.MINERAL_RULE,signed=True))
  if data['map_size_kind'] not in (0,1,2,3,4,99) or not 0<=data['difficulty']<=5 or not -8<=data['industry']<=10 or not 1<=data['mineral_rule_factor']<=100 or not 2<=data['width']<=512 or not 2<=data['height']<=256:raise ProtocolError('Unrecognized original pricing globals')
  return data
 finally:m.close()

def main():
 p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases']
 expected=dict(profile='stacked',initial_base=original.contract.INITIAL,text_profile='synthetic')
 for case in cases:
  if case['algorithm']!=ALGORITHM or case['input']!=expected:raise ProtocolError('Unknown fixed saved pricing audit')
 args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));initial=hashlib.sha256(Path(__file__).read_bytes()+original.fingerprint().encode()+ratings.fingerprint().encode()).hexdigest()
 sources=original.profiles(args.assets)['synthetic'];observer=original.base.FactionVision();vision=original.terraform.TerraformVision();driver=None
 try:
  driver=original.transport.base.ContextDriver(args.assets,args.wine,work)
  for name,raw in sources.items():
   target=driver.work/'game'/name
   if target.is_symlink():target.unlink()
   target.write_bytes(raw)
  rows=[]
  for case in cases:
   if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
   path=work/case['id'];path.mkdir();first,origin=original.base.prepare(driver,observer,vision,case,path,60)
   city=original.found.city(driver,origin)
   if {key:city['city'][key] for key in original.contract.INITIAL}!=expected['initial_base']:raise ProtocolError('Pricing audit city differs from saved declaration')
   data=read(driver);time.sleep(.3)
   if data!=read(driver) or first!=original.base.native(driver) or city!=original.found.city(driver,origin):raise ProtocolError('Pricing audit state did not remain paused/stable')
   rows.append(dict(id=case['id'],status='ok',output=data))
  final=hashlib.sha256(Path(__file__).read_bytes()+original.fingerprint().encode()+ratings.fingerprint().encode()).hexdigest()
  if final!=initial:raise ProtocolError('Pricing audit source changed')
  write_response(dict(driver.metadata,adapter_sha256=initial,contract=ALGORITHM,fixture_transport='guarded-original-created-save',
   observation='Read-only initialized size kind, dimensions, difficulty, human INDUSTRY and mineral-rule scalar before disband; actual Save/Load UI and native city/unit fixture guarded',
   boundaries='Preparation audit only, no refund algorithm or native map-file provenance equivalence claim'),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()
if __name__=='__main__':main()
