#!/usr/bin/env python3
"""Record remaining original difficulty witnesses in private independent games."""
import argparse,fcntl,hashlib,json,re,subprocess,sys,tempfile
from collections import Counter
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import science_timing_variants_original as timing
from ui.science_difficulty_contract import ALGORITHM,PROFILES,validate_input,validate_output
from ui.vision import VisionError

def fingerprint():
    return hashlib.sha256(timing.fingerprint().encode()+Path(__file__).read_bytes()+Path(__file__).with_name('science_difficulty_contract.py').read_bytes()).hexdigest()

class DifficultyVision(timing.VariantVision):
    def report(self,image):
        try:return super().report(image)
        except VisionError:pass
        self.require_text(image,(270,578,750,602),'LABORATORY SUMMARY')
        crop=image.convert('RGB').crop((390,600,730,622));mask=self.Image.new('L',crop.size,255)
        mask.putdata([0 if p==(88,140,44) else 255 for p in crop.getdata()]);mask=self.vision.ImageOps.expand(mask,8,255)
        reads=[]
        for scale in (4,7,8):
            text=self.vision.text(mask.resize((mask.width*scale,mask.height*scale),self.Image.Resampling.LANCZOS))
            values=re.findall(r':\s*([O0-9]+)\b',text)
            reads.append(tuple(int(x.replace('O','0')) for x in values) if len(values)==3 else None)
        values,votes=Counter(reads).most_common(1)[0]
        if values is None or votes<2:raise VisionError('additional science decimal scales disagree: '+repr(reads))
        return dict(zip(('cost','accumulated','per_turn'),values))

class LockedDriver(timing.previous.OriginalDriver):
    def __init__(self,assets,wine,work,lockpath):
        # Serialize only private Wine-prefix bootstrap. Original processes,
        # installed copies, maps, screenshots and fixture state stay isolated.
        with lockpath.open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            try:super().__init__(assets,wine,work)
            finally:fcntl.flock(lock,fcntl.LOCK_UN)

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);p.add_argument('--wine',required=True);p.add_argument('--artifacts',type=Path,required=True);args=p.parse_args();cases=load_request()['cases'];initial=fingerprint()
    for c in cases:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown additional difficulty contract')
        validate_input(c['input'])
    args.artifacts.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts));observer=timing.previous.FactionVision();vision=DifficultyVision();driver=None;rows=[]
    print('Original difficulty timing artifacts: '+str(work),file=sys.stderr,flush=True)
    try:
        driver=LockedDriver(args.assets,args.wine,work,args.artifacts/'wine-bootstrap.lock')
        for c in cases:
            directory=work/c['id'];directory.mkdir();allocation,income=timing.prepare(driver,observer,vision,directory,dict(slot=0,difficulty=PROFILES[c['input']['difficulty']]))
            trace=[timing.open_report(driver,vision,directory/'checkpoint-0.png',1)]
            for i in range(c['input']['advances']):
                timing.previous.click(driver,630,520);timing.hold_units(driver);timing.previous.click(driver,890,584);timing.map_ready(driver,vision,directory/f'map-{i+1}.png',i+2);timing.hold_units(driver)
                trace.append(timing.open_report(driver,vision,directory/f'checkpoint-{i+1}.png',i+2))
            output=dict(initial_allocation=allocation,initial_labs_income=income,trace=trace);validate_output(output);rows.append(dict(id=c['id'],status='ok',output=output));(directory/'observed.json').write_text(json.dumps(output,indent=2)+'\n');print('Captured difficulty timing: '+c['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('additional difficulty observer changed during capture')
        write_response(dict(driver.metadata,contract=ALGORITHM,adapter_sha256=initial,map_sha256=hashlib.sha256(timing.previous.arid_map()).hexdigest(),fixture='Stock Gaians with Specialist/Librarian/Thinker/Transcend setup choices, flat-arid40x80, Blind-off target5; actual allocation/base Labs total; ready units held; channels declined; five real advances',observation='Actual Laboratories values and native timing/ownership/city/unit context, actual initial base Labs income; fresh private game per case',scope='Optional asset-backed declared difficulty witnesses only; no inferred threshold, internal credit algorithm or acquisition claim',ocr_version=vision.vision.version,ocr_model_sha256=vision.vision.model_sha256),rows)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close()
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as e:print('Original difficulty timing failed: '+str(e),file=sys.stderr);sys.exit(1)
