"""Fresh original base-screen captures with independent visible resource-label OCR."""
import argparse, hashlib, json, re, shlex, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path.cwd()
sys.path.insert(0, str(ROOT / 'tools/behavior-tests'))
from compare import run_probe
from protocol import ProtocolError, load_request, write_response
from ui import base_open_contract
from ui.vision import MenuVision, VisionError, consensus
ALGORITHM = 'ui.base_resource_hud.v1'
REGIONS = {
 'nutrients_left': (453,329,521,347), 'minerals_left': (453,351,521,369), 'energy_left': (453,373,521,391),
 'nutrients_right': (727,329,785,347), 'minerals_right': (727,351,785,369), 'energy_right': (727,373,785,391),
 'status': (714,390,839,408), 'economy': (449,441,492,460), 'labs': (449,463,492,482), 'psych': (449,484,492,504),
}
for kind,y in [('economy',441),('labs',462),('psych',483)]:
 for part,(left,right) in {'energy':(512,528),'bonus':(614,630),'total':(708,731)}.items():
  REGIONS[kind+'_'+part]=(left,y,right,y+19)
def read_label(vision, image, name):
 crop = image.crop(REGIONS[name]); mask = vision.Image.new('L', crop.size, 255)
 pix = crop.load(); dest = mask.load()
 for y in range(crop.height):
  for x in range(crop.width):
   if max(pix[x,y]) > (90 if name == 'status' else 150): dest[x,y] = 0
 readings = []
 for scale in (2,3,4):
  raw = vision.text(mask.resize((mask.width*scale, mask.height*scale), vision.Image.Resampling.NEAREST))
  if name != 'status': raw = raw.replace('O','0')
  readings.append(raw)
 return consensus(readings), readings

def parse_hud(vision, path):
 image = vision.Image.open(path).convert('RGB')
 if image.size != (1024,768): raise ProtocolError('Unexpected original screenshot dimensions')
 labels = {}; diagnostics = {}
 for name in REGIONS: labels[name], diagnostics[name] = read_label(vision,image,name)
 rows = {}
 for resource in ('nutrients','minerals','energy'):
  left = re.fullmatch(r'([0-9]{3}) - ([0-9]{3})', labels[resource+'_left'])
  right = re.fullmatch(r'= ([+-]?[0-9]{3})', labels[resource+'_right'])
  if left is None or right is None: raise ProtocolError('Unrecognized visible resource row: '+json.dumps(labels))
  rows[resource] = dict(intake=int(left[1]), consumption=int(left[2]), net=int(right[1]), visible_left=left[0], visible_right=right[0])
 status = re.fullmatch(r'= ([A-Z]+)', labels['status'])
 if status is None: raise ProtocolError('Unrecognized visible resource status')
 allocation = {}
 for kind in ('economy','labs','psych'):
  found = re.fullmatch(r'([0-9]{1,3})%',labels[kind])
  if found is None or not 0<=int(found[1])<=100: raise ProtocolError('Unrecognized visible allocation percentage')
  allocation[kind] = {'percent':int(found[1])}
  for part in ('energy','bonus','total'):
   raw=labels[kind+'_'+part]
   if re.fullmatch(r'[0-9]{1,3}',raw) is None:raise ProtocolError('Unrecognized visible allocation value')
   allocation[kind][part]=int(raw)
 path.with_suffix('.hud-ocr.json').write_text(json.dumps(dict(readings=diagnostics,labels=labels),indent=2)+'\n')
 return dict(rows=rows,status=status[1],allocation=allocation)

def main():
 p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args()
 request=load_request(); own_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 for case in request['cases']:
  if case['algorithm']!=ALGORITHM:raise ProtocolError('Unknown HUD algorithm')
  base_open_contract.validate_input(case['input'])
 args.artifacts.mkdir(parents=True,exist_ok=True);captured=Path(tempfile.mkdtemp(prefix='hud-',dir=args.artifacts))
 delegated=dict(version=1,cases=[dict(c,algorithm=base_open_contract.ALGORITHM) for c in request['cases']])
 command=shlex.join([sys.executable,str(Path(__file__).with_name('base_hud_capture_original.py')),'--assets',str(args.assets.resolve()),'--wine',args.wine,'--artifacts',str(captured.resolve())])
 response=run_probe(command,delegated,timeout=600);vision=MenuVision();results=[]
 try:
  for case,row in zip(request['cases'],response['results'],strict=True):
   if row['status']!='ok' or row['id']!=case['id']:raise ProtocolError('Fresh base-window capture was incomplete')
   trace=[]
   for i,action in enumerate(case['input']['actions']):
    if action!='open':continue
    state=row['output']['trace'][i+1]
    if state['screen']!='base' or state['title_matches_base'] is not True:raise ProtocolError('Original native and visible base context missing')
    paths=list(captured.glob(f'capture-*/{case["id"]}/{i}-open.png'))
    if len(paths)!=1:raise ProtocolError('Missing or ambiguous fresh original screenshot')
    hud=parse_hud(vision,paths[0]);hud['after_action']=i;hud['population']=state['base']['population'];trace.append(hud)
   results.append(dict(id=case['id'],status='ok',output=dict(trace=trace)))
  metadata=response['implementation'].copy();metadata['full_observer_sha256']=metadata['adapter_sha256'];metadata['adapter_sha256']=hashlib.sha256((metadata['adapter_sha256']+own_hash).encode()).hexdigest();metadata['contract']=ALGORITHM
  metadata['observation']='Actual base-window title/native guards followed by independent OCR of visible resource intake/consumption/net labels, summary status and allocation percentages, energy, bonus and total labels; no native nutrient-counter equivalence assumed'
  metadata['ocr']=dict(engine=vision.version,english_model_sha256=vision.model_sha256,passes=[2,3,4],numeric_normalization='O to zero only within declared numeric regions')
  metadata['boundaries']+='; only visible resource-panel/allocation labels on first and repeated openings; no income turn, allocation interaction or general economy formula established'
  if hashlib.sha256(Path(__file__).read_bytes()).hexdigest()!=own_hash:raise ProtocolError('HUD observer changed during capture')
  write_response(metadata,results)
 finally:vision.close()
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original HUD capture failed:',e,file=sys.stderr);sys.exit(1)
