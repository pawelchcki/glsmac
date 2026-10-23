"""Observe natural original pod landing; all native accesses are read-only."""
import argparse,hashlib,json,subprocess,sys,tempfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui.drivers import OriginalDriver
from ui.vision import VisionError
from ui.probe import observe
from ui.faction_setup_original_v2 import FactionVision
from ui.citizen_job_original import JobVision
from ui.faction_identity_original import opening_dialog
from ui.opening_sequence_original import native_turn
from ui import opening_sequence_original,pod_landing_vision,pod_landing_contract
from ui.pod_landing_contract import ALGORITHM,FRAME_SAMPLES,validate_input,validate_output

def fingerprint():
    h=hashlib.sha256(opening_sequence_original.fingerprint().encode())
    for path in [Path(__file__),Path(pod_landing_vision.__file__),Path(pod_landing_contract.__file__)]:h.update(path.read_bytes())
    return h.hexdigest()

def run(args,cases):
    original_fingerprint=fingerprint();args.artifacts.mkdir(parents=True,exist_ok=True)
    work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
    observer=FactionVision();vision=JobVision();driver=None;recorder=None;log=None;results=[]
    try:
        driver=OriginalDriver(args.assets,args.wine,work)
        for case in cases:
            directory=work/case['id'];directory.mkdir();driver.reset()
            for index,label in enumerate(['START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN']):
                _,controls=observe(driver,observer.vision,directory/f'prelude-{index}.png',60,startup=index==0)
                matches=[row for row in controls if row['text']==label]
                if len(matches)!=1:raise ProtocolError('Original opening control absent: '+label)
                driver.click(matches[0]['x'],matches[0]['y'])
            _,controls=observe(driver,observer.vision,directory/'prelude-rules.png',30)
            matches=[row for row in controls if row['text'].startswith('PLAY WITH STANDARD RULE')]
            if len(matches)!=1:raise ProtocolError('Actual standard-rules control absent')
            driver.click(matches[0]['x'],matches[0]['y'])
            roster=observer.wait(driver,directory/'prelude-factions.png',30)
            if roster['screen']!='factions' or roster['selected']!=0 or roster['random'] or not roster['items'][0].startswith('The Cybernetic Consciousness|'):
                raise ProtocolError('Wrong actual faction context')
            driver.key('Enter');name=observer.wait(driver,directory/'prelude-name.png',30)
            if name['screen']!='name' or name['values']!=['Aki Zeta-5']:raise ProtocolError('Wrong actual leader context')
            driver.key('Enter');vision.wait(driver,lambda image:opening_dialog(observer,image),directory/'planetfall.png',60)
            phases=[dict(phase='planetfall',native_turn=native_turn(driver))]
            log=(directory/'video.log').open('w')
            recorder=subprocess.Popen(['ffmpeg','-nostdin','-y','-f','x11grab','-video_size','1024x768','-framerate','30','-i',driver.env['DISPLAY'],'-t','5','-an','-c:v','ffv1','-threads','2',str(directory/'landing.mkv')],env=driver.env,stdout=log,stderr=log)
            time.sleep(.5)
            if case['input']['confirmation']=='keyboard':driver.key('Enter')
            else:driver.click(707,737)
            time.sleep(.7);driver.snapshot(directory/'landing-mid.png')
            phases.append(dict(phase='landing',native_turn=native_turn(driver)))
            recorder.wait(timeout=12)
            if recorder.returncode!=0:raise ProtocolError('Original landing video failed')
            recorder=None;log.close();log=None
            vision.wait(driver,lambda image:vision.require_text(image,(260,256,765,286),'FIRST BASE'),directory/'first-base-name.png',30)
            phases.append(dict(phase='first-base-name',native_turn=native_turn(driver)))
            subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(directory/'landing.mkv'),'-vsync','0',str(directory/'video-%03d.png')],check=True,timeout=20)
            frames,positions=pod_landing_vision.inspect_sequence(directory,args.assets,FRAME_SAMPLES,with_positions=True)
            # Establish ordering from independently visible text, after all sampled frames.
            mid=vision.Image.open(directory/'landing-mid.png')
            try:vision.require_text(mid,(260,256,765,286),'FIRST BASE');early_name=True
            except VisionError:early_name=False
            first_name_index=None
            for index,path in enumerate(sorted(directory.glob('video-*.png'))):
                if index%3:continue
                image=vision.Image.open(path).convert('RGB')
                # The actual editor heading is a distinctive complete text line.
                if sum(p==(103,91,181) for p in image.crop((264,335,751,353)).getdata())>3000:
                    first_name_index=index;break
            (directory/'raw-motion.json').write_text(json.dumps(dict(frames=frames,capture_positions=positions,first_name_capture=first_name_index,early_name=early_name),indent=2)+'\n')
            projected=[dict(index=row['index'],motion_x=(row['dx']>0)-(row['dx']<0)) for row in frames]
            output=dict(phases=phases,frames=projected,name_after_animation=(not early_name and first_name_index is not None and first_name_index>max(positions)),completed=True,failure=None)
            validate_output(output,case);results.append(dict(id=case['id'],status='ok',output=output))
            (directory/'actual-output.json').write_text(json.dumps(output,indent=2)+'\n')
            print('Captured original pod landing '+case['id'],file=sys.stderr,flush=True)
        if fingerprint()!=original_fingerprint:raise ProtocolError('Landing observer changed during recording')
        metadata=dict(driver.metadata,adapter_sha256=original_fingerprint,viewport=[1024,768],
            pod_sha256=hashlib.sha256((args.assets/'drop_pod.flc').read_bytes()).hexdigest(),
            observation='Actual Enter or pointer Planetfall acknowledgement, unchanged natural new game; actual rendered asset frames recognized by multiple independent pixel strips; horizontal translation signs relative to first sampled frame; native turns read only.',
            boundaries='Only declared Tiny/Citizen/Cybernetic path and sampled installed frames. Unseeded world excluded. Exact translations, vertical movement, frame presentation cadence, complete trajectory, smoke compositing, audio, map, camera, fog, fonts and full-frame parity remain unmeasured.')
        write_response(metadata,results)
    finally:
        if recorder and recorder.poll() is None:recorder.terminate();recorder.wait(timeout=5)
        if log:log.close()
        if driver:driver.close()
        observer.vision.close();vision.vision.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args()
    cases=load_request()['cases']
    for case in cases:
        if case['algorithm']!=ALGORITHM:raise ProtocolError('Unsupported pod landing algorithm')
        validate_input(case['input'])
    run(args,cases)
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,VisionError,subprocess.SubprocessError) as error:
        print('Original pod landing failed: '+str(error),file=sys.stderr);sys.exit(1)
