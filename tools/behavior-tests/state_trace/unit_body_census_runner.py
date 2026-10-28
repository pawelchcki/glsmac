"""Portable successor to the actual c2a13e executor; NEVER game-executed.

One explicit reviewed static-census launch; actual OS child exit, never TAP inference.

Default invocation does not run. Requires execute plus the reviewed immutable
preflight SHA. No retries. Tracks only its Popen session and visible descendants.

Run from tools/behavior-tests, using the matching reviewed v8/source profile:
  python3 -m state_trace.unit_body_census_runner prepare --source-root SOURCE
    --web WEB --runtime-provenance PROVENANCE --assets ASSETS --artifacts NEW_DIR
    --dependencies NODE_MODULES --browser CHROME --fontconfig FONTCONFIG
    --playwright-browsers-path CACHE --expected-head FULL_SOURCE_SHA [--node NODE]
Prepare hashes inputs only; it never starts a game. The artifact directory must
be fresh and outside source. After independent review and separate authorization:
  python3 -m state_trace.unit_body_census_runner execute --artifacts NEW_DIR
    --manifest-sha256 REVIEWED_SHA
This successor is source/pure-verified only. Historical actual game evidence is
still bound to the immutable external c2a13e driver, not this portable module.
Native23/Defaulta69 and the actual v8 runtime/fixture/helper hashes remain strict;
rebased or changed source/runtime requires its own reviewed profile and proof.
"""
from pathlib import Path
import argparse,hashlib,json,os,signal,subprocess,sys,time

# Assertions are part of this portable acceptance boundary. Reject optimized
# import/CLI use before it can prepare, execute, audit or award case credit.
if not __debug__ or sys.flags.optimize or "PYTHONOPTIMIZE" in os.environ:
    raise RuntimeError("unit-body census acceptance requires unoptimized Python without PYTHONOPTIMIZE")
if __package__ in (None, ""):
    # Keep direct file CLI imports on the behavior-tests parent module path.
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from state_trace.unit_body_census_preflight import dependency_contents



def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()


def save(out,name,value):
    (out/name).write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')


def process_table():
    """Visible proc namespace only. No commands/environments from unrelated PIDs."""
    table={};failures=0
    for path in Path('/proc').iterdir():
        if not path.name.isdecimal():continue
        try:
            raw=(path/'stat').read_text(); fields=raw[raw.rfind(')')+2:].split()
            table[int(path.name)]={'pid':int(path.name),'state':fields[0],'ppid':int(fields[1]),
                                  'pgid':int(fields[2]),'session':int(fields[3]),'start_ticks':int(fields[19])}
        except (OSError,ValueError,IndexError):failures+=1
    return table,failures


def own_sample(pid,tracked):
    table,failures=process_table()
    owned={pid} if pid in table and (pid not in tracked or table[pid]['start_ticks']==tracked[pid]) else set()
    # Persist observed identity even after an owned descendant reparents.
    for key,start in tracked.items():
        if key in table and table[key]['start_ticks']==start:owned.add(key)
    while True:
        added={key for key,value in table.items() if value['ppid'] in owned}
        if added<=owned:break
        owned|=added
    rows=[]
    for key in sorted(owned):
        if key in table:
            row=table[key];tracked[key]=row['start_ticks'];rows.append(row)
    return {'monotonic':time.monotonic(),'node_visible':pid in owned,'observed_owned':rows,
            'proc_stat_read_failures':failures,'exhaustive_host_inventory':False}


def group_probe(pgid):
    try:os.killpg(pgid,0);return 'present'
    except ProcessLookupError:return 'absent'
    except PermissionError:return 'permission-denied'


def unchanged_dependencies(pre):
    assert dependency_contents(Path(pre['dependency_symlink']))==pre['dependency_contents_sha256'], 'Executable dependency contents changed'


def unchanged(pre):
    root=Path(pre['host']);web=Path(pre['web_shell'])
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==pre['head']
    assert subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=root,text=True).strip()==''
    assert set(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines()) <= {'tools/wasm-tests/node_modules'}
    assert (root/'tools/wasm-tests/node_modules').is_dir() and str((root/'tools/wasm-tests/node_modules').resolve())==pre['dependency_symlink']
    assert all(sha(root/name)==value for name,value in pre['source_files_sha256'].items())
    assert all(sha(web/name)==value for name,value in pre['web_files_sha256'].items())
    assert sha(Path(pre['runtime_provenance']))==pre['runtime_provenance_sha256']
    assert sha(Path(pre['driver']))==pre['driver_sha256']
    assert sha(Path(pre['node']))==pre['node_sha256'] and sha(Path(pre['browser']))==pre['browser_sha256']
    assert sha(Path(pre['fontconfig']))==pre['fontconfig_sha256']
    assert all(sha(Path(pre['dependency_symlink'])/name/'package.json')==value for name,value in pre['dependency_package_sha256'].items())
    unchanged_dependencies(pre)


def audit_chunks(text,lines):
    offset=0;joined=[];chunks=0
    for line in lines:
        packet=json.loads(line)
        assert type(packet['start_utf16']) is int and packet['start_utf16']==offset
        assert type(packet['text']) is str
        # JS cursor slices are UTF16 code units and may divide an emoji pair.
        offset+=len(packet['text'].encode('utf-16-le',errors='surrogatepass'))//2
        assert type(packet['end_utf16']) is int and packet['end_utf16']==offset
        joined.append(packet['text']);chunks+=1
    normalized=''.join(joined).encode('utf-16-le',errors='surrogatepass').decode('utf-16-le')
    assert normalized==text and chunks>0
    return chunks


def audit(pre,result,out):
    # These are the actual Popen return/wait facts, not in-game or parsed TAP results.
    assert type(result['raw_node_exit']) is int and result['raw_node_exit']==0,'Actual OS Node exit zero required'
    assert result['os_wait_completed'] is True and result['outer_timeout'] is False
    assert result['owned_group_after_cleanup']=='absent'
    assert result['tracked_descendants_after_cleanup']==[],'Tracked descendant remains present'
    assert result['forced_cleanup'] is False,'Forced cleanup is retained as failure'
    assert result['postrun_bindings_match'] is True
    report=json.loads((out/'report.json').read_text())
    assert report['status']=='complete-native-static-census-match' and report['native_complete'] is True
    assert type(report['native_raw_exit_code']) is int and report['native_raw_exit_code']==0
    assert report['server_reaped'] is True and report['asset_server_pid']>0
    assert report['asset_server_exit']['code']==0 or report['asset_server_exit']['signal']=='SIGTERM'
    assert report['browser_errors']==[] and report.get('server_close_error') is None
    assert report['manifest_id']==pre['asset_manifest_id'] and report['native_source_tree']==pre['native_tree']
    assert report['production_default_tree']==pre['default_tree']
    assert report['runtime_provenance_sha256']==pre['runtime_provenance_sha256']
    assert report['runtime_js_sha256']==pre['runtime']['GLSMAC.js'] and report['runtime_wasm_sha256']==pre['runtime']['GLSMAC.wasm']
    assert report['host_head']==pre['head'] and report['fixture_main_sha256']==pre['fixture_sha256']['main']
    assert report['fixture_world_sha256']==pre['fixture_sha256']['world']
    assert report['evaluator_exit_code']==0 and report['evaluator_error'] is None and report['evaluator_signal'] is None
    raw=(out/'application.log').read_bytes(); text=raw.decode('utf-8'); digest=hashlib.sha256(raw).hexdigest()
    transport=report['log_transport'];assert transport['sealed'] is True and transport['partial'] is False
    assert transport['settled_failure'] is None and transport['raw_sha256']==digest==transport['joined_chunk_sha256']
    assert transport['retained_utf8']==len(raw)
    chunks=audit_chunks(text,(out/'application-log-chunks.jsonl').read_text().splitlines())
    sys.path.insert(0,str(Path(pre['host'])/'tools/behavior-tests'))
    from protocol import decode_json,canonical
    from state_trace.unit_body_census_proof import evaluate
    acceptance=decode_json((out/'receipt-acceptance.json').read_text())
    proof=evaluate(text,acceptance)
    assert canonical(proof)==canonical(report['census_result'])==canonical(decode_json((out/'census-result.json').read_text()))
    return {'actual_native_exit':0,'log_sha256':digest,'log_bytes':len(raw),'chunk_count':chunks,
            'selected_unit_id':proof['selected_unit_id'],'unit_count':proof['unit_count'],'census_reads':proof['census_reads'],
            'asset_server_pid':report['asset_server_pid'],'asset_server_exit':report['asset_server_exit'],
            'artifact_sha256':{name:sha(out/name) for name in ('report.json','application.log','application-log-chunks.jsonl',
                 'receipt-acceptance.json','census-result.json','node.log','asset-server.stdout','asset-server.stderr')}}


def execute(args):
    out=args.artifacts.resolve()
    assert args.manifest_sha256 and sha(out/'preflight.json')==args.manifest_sha256,'Reviewed preflight mismatch'
    pre=json.loads((out/'preflight.json').read_text())
    assert sha(Path(__file__))==pre['driver_sha256'],'Reviewed driver mismatch'
    assert not any((out/name).exists() for name in ('owned-process.json','raw-outcome.json','report.json','node.log')),'Refuse to overwrite a prior attempt'
    unchanged(pre)
    assert sha(out/'asset-manifest.json')==pre['asset_manifest_sha256']
    env=dict(os.environ)
    removed=[key for key in ('NODE_OPTIONS','NODE_TEST_CONTEXT','NODE_TEST_REQUIRES') if key in env]
    for key in removed:env.pop(key)
    env.update(WASM_SCRIPTS_ROOT=pre['host'],WASM_APP_DIR=pre['web_shell'],SMAC_ASSETS_DIR=pre['assets'],
               UNIT_BODY_CENSUS_RUNTIME_PROVENANCE=pre['runtime_provenance'],UNIT_BODY_CENSUS_ARTIFACTS_DIR=str(out),
               FONTCONFIG_FILE=pre['fontconfig'],PLAYWRIGHT_BROWSERS_PATH=pre['playwright_browsers_path'],
               WASM_BROWSER_EXECUTABLE=pre['browser'])
    result={'kind':'one static body census actual OS process outcome','strict_status':'incomplete',
            'head':pre['head'],'native_tree':pre['native_tree'],'default_tree':pre['default_tree'],
            'runtime':pre['runtime'],'preflight_sha256':args.manifest_sha256,'driver_sha256':pre['driver_sha256'],
            'command':pre['command'],'cwd':pre['host'],'sanitized_node_environment_keys':removed,
            'node_test_budget_seconds':pre['node_test_budget_seconds'],'outer_timeout_seconds':pre['outer_timeout_seconds'],
            'process_pid':None,'process_group':None,'raw_node_exit':None,'os_wait_completed':False,'outer_timeout':False,
            'forced_cleanup':False,'candidate_frontend_reported_executed':None,'original_passing_cases':0,
            'namespace_scope':pre['namespace_scope'],'exhaustive_host_descendants_supported':False}
    start=time.monotonic();process=None;tracked={};raw=b'';sample_path=out/'owned-process-samples.jsonl'
    try:
        process=subprocess.Popen(pre['command'],cwd=pre['host'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
        result.update(process_pid=process.pid,process_group=process.pid)
        save(out,'owned-process.json',result)
        deadline=start+pre['outer_timeout_seconds']
        while True:
            sample=own_sample(process.pid,tracked)
            with sample_path.open('a') as stream:stream.write(json.dumps(sample)+'\n')
            remaining=deadline-time.monotonic()
            if remaining<=0:raise subprocess.TimeoutExpired(pre['command'],pre['outer_timeout_seconds'])
            try:raw,_=process.communicate(timeout=min(1,remaining));break
            except subprocess.TimeoutExpired:pass
    except subprocess.TimeoutExpired:
        result['outer_timeout']=True;result['forced_cleanup']=True
        if process is not None:
            try:os.killpg(process.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:raw,_=process.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                raw,_=process.communicate()
    except Exception as error:
        result['executor_error']=repr(error)
        if process is not None:
            result['forced_cleanup']=True
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            raw,_=process.communicate()
    finally:
        if process is not None:
            # communicate() performs the OS wait and populates this exact child's returncode.
            result['raw_node_exit']=process.returncode;result['os_wait_completed']=process.returncode is not None
            probe=group_probe(process.pid);sample=own_sample(process.pid,tracked)
            remaining=[row for row in sample['observed_owned'] if row['pid']!=process.pid]
            result['owned_group_before_cleanup']=probe;result['tracked_descendants_before_cleanup']=remaining
            # An existing numeric group without a current observed owned member
            # is unknown after wait; do not signal a potentially reused group ID.
            proven_group=any(row['pgid']==process.pid for row in sample['observed_owned'])
            if probe=='present' and not proven_group:
                result['group_ownership_unknown']=True
            if (probe=='present' and proven_group) or remaining:
                result['forced_cleanup']=True
                if proven_group:
                    try:os.killpg(process.pid,signal.SIGTERM)
                    except ProcessLookupError:pass
                # Any different-session browser processes must match a previously
                # observed start identity before a signal; never signal arbitrary PIDs.
                for row in remaining:
                    current,_=process_table();value=current.get(row['pid'])
                    if value and value['start_ticks']==tracked[row['pid']] and value['state'] not in ('Z','X'):
                        try:os.kill(row['pid'],signal.SIGTERM)
                        except ProcessLookupError:pass
                cleanup_deadline=time.monotonic()+pre['cleanup_seconds']
                while time.monotonic()<cleanup_deadline:
                    sample=own_sample(process.pid,tracked);probe=group_probe(process.pid)
                    remaining=[row for row in sample['observed_owned'] if row['pid']!=process.pid]
                    if probe=='absent' and not remaining:break
                    time.sleep(0.1)
                if probe=='present' and any(row['pgid']==process.pid for row in sample['observed_owned']):
                    try:os.killpg(process.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                for row in remaining:
                    current,_=process_table();value=current.get(row['pid'])
                    if value and value['start_ticks']==tracked[row['pid']] and value['state'] not in ('Z','X'):
                        try:os.kill(row['pid'],signal.SIGKILL)
                        except ProcessLookupError:pass
                after_kill_deadline=time.monotonic()+2
                while time.monotonic()<after_kill_deadline:
                    sample=own_sample(process.pid,tracked)
                    if not [row for row in sample['observed_owned'] if row['pid']!=process.pid]:break
                    time.sleep(0.1)
            sample=own_sample(process.pid,tracked)
            result['owned_group_after_cleanup']=group_probe(process.pid)
            result['tracked_descendants_after_cleanup']=[row for row in sample['observed_owned'] if row['pid']!=process.pid]
            result['visible_proc_root_observed']=process.pid in tracked
            result['tracked_identity_count']=len(tracked)
        (out/'node.log').write_bytes(raw);(out/'raw-exit-status.txt').write_text(json.dumps(result['raw_node_exit'])+'\n')
        result['node_output_sha256']=sha(out/'node.log');result['elapsed_seconds']=time.monotonic()-start
        try:unchanged(pre);result['postrun_bindings_match']=True
        except Exception as error:result['postrun_bindings_match']=False;result['postrun_binding_error']=repr(error)
        try:
            if (out/'report.json').exists():result['candidate_frontend_reported_executed']=json.loads((out/'report.json').read_text()).get('candidate_executed')
            result.update(audit(pre,result,out));result['strict_status']='passed'
        except Exception as error:
            result['acceptance_failure']=repr(error)
            result['strict_status']='timed-out' if result['outer_timeout'] else ('spawn-or-unknown-exit' if result['raw_node_exit'] is None else 'failed')
        save(out,'raw-outcome.json',result)
    print(json.dumps(result,indent=2));print(raw.decode('utf-8',errors='replace')[-5000:])
    raise SystemExit(0 if result['strict_status']=='passed' else 1)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='mode',required=True)
    from state_trace.unit_body_census_preflight import add_arguments,prepare
    add_arguments(commands.add_parser('prepare',help='Prepare bindings only; zero candidate engines'))
    run=commands.add_parser('execute',help='ONE actual browser case; requires separate authorization')
    run.add_argument('--artifacts',type=Path,required=True)
    run.add_argument('--manifest-sha256',required=True)
    args=parser.parse_args()
    if args.mode=='prepare':prepare(args,Path(__file__).resolve())
    else:execute(args)


if __name__=='__main__':main()
