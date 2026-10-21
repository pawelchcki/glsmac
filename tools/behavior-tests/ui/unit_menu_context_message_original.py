"""Reference experiment using queued, real Windows control messages."""
import hashlib,json,os,subprocess,sys,tempfile,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from ui import unit_menu_context_paced_original as base

runtime=Path(os.environ['SMAC_UI_WINDOWS_PYTHON_ROOT']).resolve()
helper=Path(__file__).with_name('win32_menu_input.py')
old_fingerprint=base.fingerprint

def fingerprint():
    digest=hashlib.sha256(old_fingerprint().encode()+Path(__file__).read_bytes()+helper.read_bytes())
    for path in sorted(runtime.iterdir()):
        if path.is_file():digest.update(path.name.encode()+hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()

def winpath(path):return 'Z:'+str(path).replace('/',chr(92))

def click(driver,x,y,park=(700,620)):
    index=getattr(driver,'message_sequence',0);driver.message_sequence=index+1
    receipt=Path(driver.log.name).parent/('control-message-'+str(index)+'.json')
    result=subprocess.run([str(driver.wine),str(runtime/'pythonw.exe'),winpath(helper),winpath(receipt),str(x),str(y)],
                          env=driver.env,stdout=driver.log,stderr=driver.log,timeout=20)
    data=json.loads(receipt.read_text()) if receipt.exists() else {}
    if result.returncode or data.get('ok') is not True:raise base.ProtocolError('Original Windows control input failed: '+repr(data))
    time.sleep(1)
    # Leave the pointer at the clicked control until the next real input.

def queued_tab(driver):
    index=getattr(driver,'key_sequence',0);driver.key_sequence=index+1
    receipt=Path(driver.log.name).parent/('control-key-'+str(index)+'.json')
    result=subprocess.run([str(driver.wine),str(runtime/'pythonw.exe'),winpath(helper),winpath(receipt),'key','Tab'],
                          env=driver.env,stdout=driver.log,stderr=driver.log,timeout=20)
    data=json.loads(receipt.read_text()) if receipt.exists() else {}
    if result.returncode or data.get('ok') is not True:raise base.ProtocolError('Original Windows key input failed: '+repr(data))
    time.sleep(1)

def paced_key(driver,key):
    if key=='Tab':return queued_tab(driver)
    # The retained trace read the old selected unit before the second Tab was
    # consumed. One fixed edge and settle interval; never retry an action.
    subprocess.run(['xdotool','keydown','--clearmodifiers',key,'sleep','.18',
                    'keyup',key,'sleep','1.0'],env=driver.env,check=True,timeout=10)

# The retained wizard trace missed the faction click using X11 polling. All
# declared pointer controls use ordinary queued Windows messages; game state
# and actual visible wizard choices remain guarded by the original observer.
base.ContextDriver.click=lambda driver,x,y:click(driver,x,y)
base.paced_key=paced_key
base.previous.base.raw_key=paced_key
base.previous.click_menu_control=click
base.fingerprint=fingerprint

def parallel_capture(args,cases,initial_hash):
    # At most two isolated original processes. Repeated reference probes remain
    # sequential so this internal partition never creates four app workers.
    groups=[cases[:6],cases[6:]]
    def capture_group(item):
        index,group=item
        worker=args.artifacts/('worker-'+str(index));worker.mkdir(parents=True,exist_ok=True)
        root=Path(tempfile.mkdtemp(prefix='probe-',dir=worker))
        request=dict(version=1,cases=group)
        command=[sys.executable,str(Path(__file__).resolve()),'--child','--assets',str(args.assets),
                 '--wine',args.wine,'--artifacts',str(root)]
        child_env=dict(os.environ,GLSMAC_CONTEXT_BOOTSTRAP_LOCK=str(args.artifacts/'wine-bootstrap.lock'))
        result=subprocess.run(command,input=base.canonical(request),text=True,capture_output=True,
                              timeout=580,env=child_env)
        (root/'request.json').write_text(base.canonical(request))
        (root/'response.json').write_text(result.stdout)
        (root/'stderr.log').write_text(result.stderr)
        if result.returncode:raise base.ProtocolError('Original message worker failed: '+str(root)+'; '+result.stderr[-1500:])
        response=base.decode_json(result.stdout);base.validate_response(response,request)
        return response
    with ThreadPoolExecutor(max_workers=2) as workers:
        responses=list(workers.map(capture_group,enumerate(groups)))
    if fingerprint()!=initial_hash or responses[0]['implementation']!=responses[1]['implementation']:
        raise base.ProtocolError('Original message worker metadata/source changed')
    rows={row['id']:row for response in responses for row in response['results']}
    if len(rows)!=len(cases):raise base.ProtocolError('Incomplete original message workers')
    base.write_response(dict(responses[0]['implementation'],recording_workers=2),[rows[case['id']] for case in cases])

base.parallel_capture=parallel_capture

if __name__=='__main__':base.main()
