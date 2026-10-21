"""Private original Save/Load fixture transport; all answers execute original instructions."""
import hashlib,json,os,shutil,sys,time
from pathlib import Path
import unit_menu_context_message_original as message
base=message.base
cache=Path(os.environ['SMAC_UI_SAVED_FIXTURE_ROOT']).resolve()
save=cache/'stacked-start.sav';receipt_path=cache/'receipt.json'
receipt=json.loads(receipt_path.read_text())
expected_hash='cb3415774a80a98535f623682f4a43df58c4b37eba0786984c9e3bfbd3597f92'
if hashlib.sha256(save.read_bytes()).hexdigest()!=expected_hash or receipt['sha256']!=expected_hash:
 raise base.ProtocolError('Unsupported private original-created saved fixture')
old_fingerprint=message.fingerprint

def fingerprint():
 return hashlib.sha256(old_fingerprint().encode()+Path(__file__).read_bytes()+bytes.fromhex(expected_hash)+hashlib.sha256(receipt_path.read_bytes()).digest()).hexdigest()

def text(vision,image,box,kind):
 image=image.convert('RGB').crop(box);mask=vision.Image.new('L',image.size,255)
 mask.putdata([0 if (max(p)<95 if kind=='dark' else p[2]>100 and p[2]>p[0]*1.1 and p[2]>p[1]*1.1) else 255 for p in image.getdata()])
 mask=vision.vision.ImageOps.expand(mask,8,255)
 return base.consensus([vision.vision.text(mask.resize((mask.width*s,mask.height*s),vision.Image.Resampling.LANCZOS)) for s in (2,3,4)])

def require(vision,image,box,expected,kind='blue'):
 actual=text(vision,image,box,kind)
 if actual.replace(' ','')!=expected.replace(' ',''):raise base.VisionError('Original load control not observed: '+repr(actual))
 return True

def setup(driver,observer,vision,directory,timeout):
 # Only transport input lives here. Never supply or replay expected behavior.
 saves=driver.work/'game/saves'
 if saves.exists():shutil.rmtree(saves)
 saves.mkdir();(saves/'auto').mkdir();shutil.copyfile(save,saves/'START.SAV')
 if hashlib.sha256((saves/'START.SAV').read_bytes()).hexdigest()!=expected_hash:raise base.ProtocolError('Saved fixture copy changed')
 driver.reset()
 base.previous.base.choose(driver,observer,'LOAD GAME',directory/'load-main.png',timeout,True)
 vision.wait(driver,lambda image:vision.require_text(image,(365,160,676,192),'LOAD'),directory/'load-dialog.png',timeout)
 driver.click(435,247)
 vision.wait(driver,lambda image:require(vision,image,(393,238,550,256),'START.SAV','dark'),directory/'load-file.png',timeout)
 driver.click(445,521)
 vision.wait(driver,lambda image:require(vision,image,(330,269,755,290),'DIFFICULTY LEVEL: CITIZEN'),directory/'load-summary.png',timeout)
 vision.wait(driver,lambda image:require(vision,image,(338,299,740,318),'LADY DEIRDRE OF THE GAIANS'),directory/'load-identity.png',timeout)
 vision.wait(driver,lambda image:require(vision,image,(338,318,740,337),'MISSION YEAR 2101'),directory/'load-year.png',timeout)
 driver.click(356,477)
 current=base.previous.base.settled(driver,vision,directory/'loaded.png',timeout,1)
 origin=tuple(receipt['native']['units'][0][key] for key in ('x','y'))
 town=base.previous.ref.full.city(driver,origin)
 if current!=receipt['native'] or town!=receipt['town']:raise base.ProtocolError('Fresh original load differs from original-created fixture receipt')
 # Restore and observe the same original preferences as ordinary wizard setup.
 base.previous.base.raw_key(driver,'ctrl+p')
 vision.wait(driver,lambda image:vision.require_text(image,(439,281,715,303),'PAUSE AT END'),directory/'preferences.png',timeout)
 image=vision.Image.open(directory/'preferences.png')
 if not vision.preference(image,292):driver.click(428,292)
 if vision.preference(image,172):driver.click(428,172)
 def configured(image):
  vision.require_text(image,(439,281,715,303),'PAUSE AT END')
  if not vision.preference(image,292) or vision.preference(image,172):raise base.VisionError('Original saved-fixture preferences have not settled')
  return True
 vision.wait(driver,configured,directory/'configured.png',timeout);driver.click(300,496)
 current=base.previous.base.settled(driver,vision,directory/'initial.png',timeout,1)
 if current!=receipt['native'] or base.previous.ref.full.city(driver,origin)!=receipt['town']:raise base.ProtocolError('Preferences changed loaded original fixture')
 (directory/'saved-fixture-transport.json').write_text(json.dumps({'save_sha256':expected_hash,'native':current,'town':town},indent=2)+'\n')
 return current

base.previous.base.setup=setup
base.fingerprint=fingerprint
if __name__=='__main__':base.main()
