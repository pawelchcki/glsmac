"""Private original activation-picker observer; captures UI and native effects."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
DIRECTORY=Path(__file__).resolve().parent
sys.path.insert(0,str(DIRECTORY.parent if DIRECTORY.name=='ui' else Path.cwd()/'tools/behavior-tests'))
from protocol import ProtocolError, load_request, write_response
from ui import unit_selection_original as base
from ui.vision import consensus, VisionError
ALGORITHM='ui.unit_activation_picker.v1'
ROLES=('scout','former','colony')


def validate_input(data):
 if not isinstance(data,dict) or set(data)!={'profile','actions'} or data['profile'] not in ('default','edited-caption'):
  raise ProtocolError('Activation picker requires declared profile and actions')
 actions=data['actions'];valid={'open','down','up','home','end','enter','escape','ok','cancel','click0','click1','click2'}
 if (not isinstance(actions,list) or not 1<=len(actions)<=10 or actions[0]!='open' or actions.count('open')!=1
     or any(not isinstance(a,str) or a not in valid for a in actions)
     or any(a in {'enter','escape','ok','cancel'} for a in actions[:-1])):
  raise ProtocolError('Invalid bounded activation-picker sequence')


def line(vision,image,box,button=False):
 crop=image.convert('RGB').crop(box);mask=vision.Image.new('L',crop.size,255)
 mask.putdata([0 if (max(pixel)<45 if button else max(pixel)>95) else 255 for pixel in crop.getdata()])
 mask=vision.vision.ImageOps.expand(mask,8,255)
 return consensus([vision.vision.text(mask.resize((mask.width*scale,mask.height*scale),vision.Image.Resampling.NEAREST)) for scale in (2,3,4)])


def picker(vision,image):
 image=image.convert('RGB')
 # Observe the actual two-button bar, not the action or a supplied answer.
 pixels=[image.getpixel((x,y)) for x in range(225,790,17) for y in (462,468,474)]
 if sum(p[2]>130 and p[2]>p[0]*1.2 and p[2]>p[1]*1.1 for p in pixels)<len(pixels)*.7:return None
 caption=line(vision,image,(215,287,807,307));choices=[];selected=[]
 for top in (324,364,404):
  text=line(vision,image,(264,top+7,800,top+29))
  names=[role for role,label in base.ROLE_LABEL.items() if text.endswith(label)]
  if len(names)!=1:raise VisionError('Unrecognized activation row: '+text)
  choices.append(names[0]);selected.append(sum(image.getpixel(point)[1]>150 for point in ((211,top),(212,top),(211,top+1),(260,top+1),(211,top+35)))>=4)
 if set(choices)!=set(ROLES) or sum(selected)!=1:raise VisionError('Ambiguous activation roster or highlight')
 if line(vision,image,(344,462,376,477),True)!='OK' or line(vision,image,(625,462,698,477),True)!='CANCEL':raise VisionError('Activation buttons missing')
 return {'caption':caption,'choices':choices,'selected':choices[selected.index(True)]}


def fingerprint():
 return hashlib.sha256(base.fingerprint().encode()+Path(__file__).read_bytes()).hexdigest()


def bundle(assets,profile):
 result=base.bundle(assets)
 if profile=='edited-caption':
  matches=[p for p in assets.iterdir() if p.is_file() and p.name.lower() in ('script.txt','xscript.txt')]
  if len(matches)!=2 or len({p.name.lower() for p in matches})!=2:raise ProtocolError('Missing or ambiguous activation caption input pair')
  for path in matches:
   lines=path.read_bytes().decode('latin1').splitlines(keepends=True)
   starts=[i for i,s in enumerate(lines) if s.strip()=='#PICKUNIT']
   if len(starts)!=1:raise ProtocolError('Ambiguous activation caption block')
   index=starts[0]+1
   while index<len(lines) and not lines[index].lstrip().lower().startswith('#caption '):
    if lines[index].strip().startswith('#') and not lines[index].strip().startswith('#xs '):raise ProtocolError('Missing activation caption')
    index+=1
   if index==len(lines):raise ProtocolError('Missing activation caption')
   lines[index]='#caption Activate an owned unit\r\n';result[path.name]=''.join(lines).encode('latin1')
 return result


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);parser.add_argument('--timeout',type=float,default=45)
 args=parser.parse_args();cases=load_request()['cases'];initial=fingerprint()
 for case in cases:
  if case['algorithm']!=ALGORITHM:raise ProtocolError('Unknown activation contract')
  validate_input(case['input'])
 args.artifacts.mkdir(parents=True,exist_ok=True);directory=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
 observer=base.FactionVision();vision=base.FormerVision();driver=None
 try:
  driver=base.OriginalDriver(args.assets,args.wine,directory)
  for path in (driver.work/'game/maps').iterdir():
   if path.is_file() and path.suffix.lower()=='.mp':path.unlink()
  (driver.work/'game/maps/zzterraform.MP').write_bytes(base.arid_map())
  profiles={name:bundle(args.assets,name) for name in ('default','edited-caption')}
  changed={name for files in profiles.values() for name in files};original={name:(args.assets/name).read_bytes() for name in changed}
  rows=[]
  for case in cases:
   if driver.process and driver.process.poll() is None:driver.process.kill();driver.process.wait(timeout=5)
   for name,raw in original.items():(driver.work/'game'/name).write_bytes(raw)
   for name,raw in profiles[case['input']['profile']].items():(driver.work/'game'/name).write_bytes(raw)
   path=directory/case['id'];path.mkdir();setup={'input':{'profile':'stacked'}}
   current,origin=base.prepare(driver,observer,vision,setup,path,args.timeout)
   for index in range(3):current=base.act(driver,vision,current,'hold',path/f'prepare-hold-{index}.png',args.timeout)
   year=current['turn']
   def observe(name):
    readings=[];deadline=time.monotonic()+args.timeout;latest=None
    while time.monotonic()<deadline:
     driver.snapshot(path/(name+'.png'));image=vision.Image.open(path/(name+'.png'));native=base.native(driver)
     try:
      dialog=picker(vision,image)
      state={'year_delta':native['turn']-year,'picker':dialog,'selected':native['selected'],
             'units':[{'role':u['role'],'order':u['order'],'movement_spent':u['movement_spent']} for u in native['units']]}
      readings.append(state)
      if len(readings)>=2 and readings[-1]==readings[-2]:return state
     except VisionError as error:latest=str(error);readings=[]
     time.sleep(.2)
    raise ProtocolError('Activation observation did not settle: '+str(latest))
   trace=[observe('initial')]
   keys={'open':'a','down':'Down','up':'Up','home':'Home','end':'End','enter':'Return','escape':'Escape'}
   for index,action in enumerate(case['input']['actions']):
    if action in keys:base.raw_key(driver,keys[action])
    elif action.startswith('click'):driver.click(400,342+40*int(action[-1]))
    else:driver.click(360 if action=='ok' else 660,470)
    time.sleep(.5);trace.append(observe(f'{index:02d}-{action}'))
   output={'trace':trace};(path/'observed.json').write_text(json.dumps(output,indent=2)+'\n');rows.append({'id':case['id'],'status':'ok','output':output})
   print('Captured original activation picker: '+case['id'],file=sys.stderr,flush=True)
  if fingerprint()!=initial:raise ProtocolError('Activation observer changed during capture')
  digest=hashlib.sha256(base.arid_map())
  for profile,files in sorted(profiles.items()):
   digest.update(profile.encode()+b'\0')
   for name,raw in sorted(files.items()):digest.update(name.encode()+b'\0'+raw)
  write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,source_profiles_sha256=digest.hexdigest(),
                      observation='Actual visible picker caption, ordered row names, icon-frame highlight and buttons; actual native selected identity/orders/movement',
                      fixture='Same fresh stacked three-unit Gaians/Citizen/standard fixture as unit_selection.v1; actual Hold on all three; Scout/Former/Pod healthy and unmoved; no selected unit; optional paired common/expansion PICKUNIT caption edit',
                      units='Caption uppercase/whitespace normalized OCR; recognized visible unit roles in actual row order; native movement spent in thirds and turn difference',
                      ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
 finally:
  if driver:driver.close()
  observer.vision.close();vision.vision.close()


if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:print('Original activation capture failed:',error,file=sys.stderr);sys.exit(1)
