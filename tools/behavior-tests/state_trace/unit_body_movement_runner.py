"""ONE movement census boundary; SOURCE/PURE only until separately granted.

prepare hashes explicit source/web/assets/tool paths, never launches candidate.
execute requires that reviewed SHA and a separate exclusive game grant. Native
Current-checkout metadata consistency is not verified compile provenance.
Historical23e54/Defaulta69/v8 evidence remains immutable. No automatic retry; real Popen/wait and scoped
identity cleanup, not TAP/DOM/APP substitution. No in-engine native watchdog.
"""
from pathlib import Path
import argparse,hashlib,json,os,signal,stat,subprocess,sys,time,shutil

# Acceptance uses assertions below. Fail before imports/CLI/API case credit when
# Python would erase them, including an explicitly supplied optimization env.
if not __debug__ or sys.flags.optimize or "PYTHONOPTIMIZE" in os.environ:
    raise RuntimeError("unit-body movement acceptance requires unoptimized Python without PYTHONOPTIMIZE")
if __package__ in (None, ""):
    # Direct file CLI must resolve the parent protocol/compare modules first.
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from state_trace.unit_body_movement_proof import BUDGETS



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
        # Never re-adopt a recycled tracked PID through a still-owned parent.
        added={key for key,value in table.items() if value['ppid'] in owned and
               (key not in tracked or value['start_ticks']==tracked[key])}
        if added<=owned:break
        owned|=added
    rows=[]
    for key in sorted(owned):
        if key in table:
            row=table[key];tracked.setdefault(key,row['start_ticks']);rows.append(row)
    return {'monotonic':time.monotonic(),'node_visible':pid in owned,'observed_owned':rows,
            'proc_stat_read_failures':failures,'exhaustive_host_inventory':False}


def group_probe(pgid):
    try:os.killpg(pgid,0);return 'present'
    except ProcessLookupError:return 'absent'
    except PermissionError:return 'permission-denied'


def dependency_contents(root):
    """All installed bytes of the two executable Playwright packages.

    Future preflights only: the historical v2 capture pinned manifests/browser,
    not these package trees. Reject symlinks rather than hashing their targets
    outside the declared dependency roots or silently skipping their contents.
    """
    result={}
    for name in ('playwright','playwright-core'):
        package=Path(root)/name
        assert package.is_dir() and not package.is_symlink(), 'Actual package directory required'
        files={}
        pending=[package]
        while pending:
            # rglob can suppress nested scan OSError. An incomplete listing
            # must never become an accepted dependency pin or postflight match.
            for path in pending.pop().iterdir():
                assert not path.is_symlink(), 'Symlinked package content is unsupported'
                if path.is_file():files[str(path.relative_to(package))]=sha(path)
                else:
                    assert path.is_dir(), 'Unsupported package content type'
                    pending.append(path)
        assert 'package.json' in files and files, 'Missing package content'
        result[name]=dict(sorted(files.items()))
    return result


def unchanged_dependencies(pre):
    assert dependency_contents(Path(pre['dependency_symlink']))==pre['dependency_contents_sha256'], 'Executable dependency contents changed'


PROFILE_VERSION=2
PROFILE='current-checkout'


def tool_pin(path):
    path=Path(path)
    assert path.is_absolute(), 'Tool path must be absolute'
    path=path.resolve(strict=True)
    assert path.is_file() and os.access(path,os.X_OK), 'Executable tool required'
    return {'path':str(path),'sha256':sha(path)}


def verify_tool(pin):
    assert type(pin) is dict and set(pin)=={'path','sha256'}, 'Invalid tool binding'
    assert tool_pin(Path(pin['path']))==pin, 'Pinned executable changed'
    assert str(Path(pin['path']).resolve(strict=True))==pin['path'], 'Canonical tool path required'


def verify_tools(tools):
    assert set(tools)=={'git','python'}, 'Explicit Git/Python bindings required'
    for pin in tools.values():verify_tool(pin)
    assert Path(sys.executable).resolve(strict=True)==Path(tools['python']['path']), 'Different outer Python interpreter'


def git_read(tools,root,*args):
    verify_tools(tools)
    return subprocess.check_output([tools['git']['path'],*args],cwd=root,text=True,timeout=10).strip()


def default_scripts(root,head,tools):
    """Actual mounted UTF8 bytes must equal HEAD blobs, not just Git status.

    assume-unchanged/skip-worktree can hide edits from status and diff. Inspect
    the complete mounted inventory and compare it to real pinned-Git objects.
    """
    verify_tools(tools)
    prefix='GLSMAC_data/default';directory=Path(root)/prefix
    assert directory.is_dir() and not directory.is_symlink(), 'Default root must be a real directory'
    files={};scripts={};pending=[directory]
    while pending:
        for path in pending.pop().iterdir():
            info=path.lstat()
            assert not stat.S_ISLNK(info.st_mode), 'Symlinked Default input unsupported'
            if stat.S_ISDIR(info.st_mode):pending.append(path)
            else:
                assert stat.S_ISREG(info.st_mode), 'Nonregular Default input unsupported'
                if not path.name.endswith('.gls.js'):continue
                name=path.relative_to(root).as_posix();raw=path.read_bytes()
                scripts[name]=raw.decode('utf-8')
                files[name]={'sha256':hashlib.sha256(raw).hexdigest(),
                             'mode':'100755' if info.st_mode&0o111 else '100644'}
    args=[tools['git']['path'],'ls-tree','-rz','--full-tree',head,'--',prefix]
    tree=subprocess.check_output(args,cwd=root,timeout=10)
    expected={};objects=[]
    for entry in tree.split(b'\0'):
        if not entry:continue
        metadata,encoded=entry.split(b'\t',1);mode,kind,oid=metadata.decode('ascii').split()
        name=encoded.decode('utf-8')
        if not name.endswith('.gls.js'):continue
        assert kind=='blob' and mode in ('100644','100755'), 'Nonregular HEAD Default script'
        assert name not in expected and name.startswith(prefix+'/'), 'Invalid HEAD Default inventory'
        expected[name]={'mode':mode};objects.append((name,oid))
    assert expected and set(files)==set(expected), 'Mounted Default inventory differs from HEAD'
    # One bounded real Git batch; never hundreds of per-script child processes.
    batch=subprocess.check_output([tools['git']['path'],'cat-file','--batch'],
        input=''.join(oid+'\n' for _,oid in objects).encode('ascii'),cwd=root,timeout=10)
    offset=0
    for name,oid in objects:
        end=batch.index(b'\n',offset);actual,kind,size=batch[offset:end].decode('ascii').split();size=int(size)
        assert actual==oid and kind=='blob' and size>=0, 'Unexpected Git object response'
        start=end+1;raw=batch[start:start+size];offset=start+size+1
        assert len(raw)==size and batch[start+size:offset]==b'\n', 'Truncated Git blob'
        expected[name]['sha256']=hashlib.sha256(raw).hexdigest()
    assert offset==len(batch), 'Extra Git object response'
    verify_tools(tools)
    assert files==expected, 'Mounted Default bytes/modes differ from HEAD'
    # JavaScript default string sort uses UTF16 units, not Python codepoints.
    order=lambda name:name.encode('utf-16-be')
    scripts=dict(sorted(scripts.items(),key=lambda item:order(item[0])))
    digest=hashlib.sha256(json.dumps(scripts,ensure_ascii=False,separators=(',',':')).encode('utf-8')).hexdigest()
    return {'production_default_files':dict(sorted(files.items(),key=lambda item:order(item[0]))),
            'production_default_sha256':digest}


def current_profile(root,head,web,provenance_path,tools):
    """Clean source + declared runtime metadata/bytes; never a compile proof."""
    verify_tools(tools)
    assert len(head)==40 and all(c in '0123456789abcdef' for c in head), 'Full expected source SHA required'
    assert git_read(tools,root,'rev-parse','HEAD')==head, 'Different source HEAD'
    native=git_read(tools,root,'rev-parse','HEAD:src')
    default=git_read(tools,root,'rev-parse','HEAD:GLSMAC_data/default')
    assert all(len(tree)==40 and all(c in '0123456789abcdef' for c in tree) for tree in (native,default))
    assert git_read(tools,root,'status','--porcelain','--untracked-files=no')=='', 'Dirty source checkout'
    assert set(git_read(tools,root,'ls-files','--others','--exclude-standard').splitlines()) <= {'tools/wasm-tests/node_modules'}, 'Unexpected untracked source'
    provenance_path=Path(provenance_path);web=Path(web)
    provenance=json.loads(provenance_path.read_text())
    assert provenance['source_tree']==native and provenance['default_tree']==default, 'Runtime/source metadata mismatch'
    runtime={name:sha(provenance_path.parent/name) for name in ('GLSMAC.js','GLSMAC.wasm')}
    assert provenance['runtime']==runtime, 'Runtime bytes differ from supplied metadata'
    assert provenance['owned_build_workers_reaped'] is True, 'Build cleanup metadata missing'
    assert all(sha(web/name)==digest for name,digest in runtime.items()), 'Web/runtime bytes differ'
    static=provenance['web_static_sha256']
    assert type(static) is dict and {'index.html','bootstrap.js','asset-store.js'}<=set(static), 'Web metadata incomplete'
    for name,digest in static.items():
        assert type(name) is str and not Path(name).is_absolute() and '..' not in Path(name).parts, 'Invalid web metadata path'
        assert sha(web/name)==digest, 'Web static bytes differ'
    assert sha(web/'provenance.json')==sha(provenance_path), 'Different web provenance bytes'
    return dict(version=PROFILE_VERSION,profile=PROFILE,head=head,native_tree=native,default_tree=default,
                **default_scripts(root,head,tools),
                runtime=runtime,runtime_provenance_sha256=sha(provenance_path),runtime_binding='metadata-consistent',
                independent_compile_proof_verified=False,fidelity_passing_cases=0)


def unchanged(pre):
    assert pre['version']==PROFILE_VERSION and pre['profile']==PROFILE, 'Unsupported future capture profile'
    verify_tools(pre['tools'])
    assert pre['command']==[pre['node'],'--test','--test-concurrency=1','tools/wasm-tests/unit-body-movement-browser.test.mjs'], 'Different pinned Node command'
    root=Path(pre['host']);web=Path(pre['web_shell'])
    profile=current_profile(root,pre['head'],web,pre['runtime_provenance'],pre['tools'])
    assert all(pre[key]==value for key,value in profile.items()), 'Current profile changed'
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


def audited_child(child,command,args,cwd):
    # An Error.status===0 (the actual EPERM counterexample) is never evidence
    # of an OS spawn/exit. Require all lifecycle facts, not a status in isolation.
    assert child['command']==command and child['args']==args and Path(child['cwd']).resolve()==Path(cwd).resolve()
    assert type(child['pid']) is int and child['pid']>0 and child['spawned'] is True and child['wait_completed'] is True
    assert type(child['status']) is int and child['status']==0 and child['signal'] is None
    assert child['error'] is None and child['spawn_error_code'] is None
    assert all(child[key] is False for key in ('timed_out','cancelled','output_limit','unknown_wait'))
    assert child['timeout_ms']==10000 and child['term_ms']==1000 and child['kill_wait_ms']==1000


def default_report(pre,report):
    assert report['production_default_tree']==pre['default_tree']
    assert report['production_default_files']==pre['production_default_files']
    assert report['production_default_sha256']==pre['production_default_sha256']


def audit(pre,result,out):
    # These are the actual Popen return/wait facts, not in-game or parsed TAP results.
    assert type(result['raw_node_exit']) is int and result['raw_node_exit']==0,'Actual OS Node exit zero required'
    assert result['os_wait_completed'] is True and result['outer_timeout'] is False
    assert result['owned_group_after_cleanup']=='absent'
    assert result['tracked_descendants_after_cleanup']==[],'Tracked descendant remains present'
    assert result['forced_cleanup'] is False,'Forced cleanup is retained as failure'
    assert result['postrun_bindings_match'] is True
    report=json.loads((out/'report.json').read_text())
    assert report['status']=='complete-native-movement-census-match' and report['native_complete'] is True
    assert type(report['native_raw_exit_code']) is int and report['native_raw_exit_code']==0
    assert report['server_reaped'] is True and report['asset_server_pid']>0
    assert report['tool_executables']==pre['tools']
    assert report['preflight_sha256']==pre['preflight_sha256_for_audit']
    assert report['runtime_binding']=='metadata-consistent' and report['independent_compile_proof_verified'] is False and report['fidelity_passing_cases']==0
    assert report['asset_server_command']=={'command':pre['tools']['python']['path'],'args':['tools/serve-wasm.py',pre['web_shell'],'--port','0','--assets',pre['assets']],'cwd':pre['host']}
    assert report['asset_server_exit']['code']==0 or report['asset_server_exit']['signal']=='SIGTERM'
    assert report['browser_errors']==[] and report.get('server_close_error') is None
    assert report['manifest_id']==pre['asset_manifest_id'] and report['native_source_tree']==pre['native_tree']
    default_report(pre,report)
    assert report['runtime_provenance_sha256']==pre['runtime_provenance_sha256']
    assert report['runtime_js_sha256']==pre['runtime']['GLSMAC.js'] and report['runtime_wasm_sha256']==pre['runtime']['GLSMAC.wasm']
    assert report['host_head']==pre['head'] and report['fixture_main_sha256']==pre['fixture_sha256']['main']
    assert report['fixture_world_sha256']==pre['fixture_sha256']['world']
    assert report['declared_input']['map_bytes_sha256']==pre['fixture_sha256']['terrain']
    assert report['budgets']==pre['budgets']==BUDGETS and report['native_watchdog_supported'] is False
    assert report['runtime_sampling_trigger']==pre['runtime_sampling_trigger'] and report['endpoint_gate']==pre['endpoint_gate']
    children=report['setup_children']
    git_args=[['rev-parse','HEAD:src'],['rev-parse','HEAD:GLSMAC_data/default'],['diff','--exit-code','HEAD','--','src','GLSMAC_data/default'],['ls-files','--others','--exclude-standard','--','src','GLSMAC_data/default'],['rev-parse','HEAD']]
    assert len(children)==len(git_args)
    for child,args in zip(children,git_args):
        audited_child(child,pre['tools']['git']['path'],args,pre['host'])
        assert child['tool_unchanged'] is True
    assert [json.loads(line) for line in (out/'setup-processes.jsonl').read_text().splitlines()]==children
    audited_child(report['evaluator_process'],pre['tools']['python']['path'],['-m','state_trace.unit_body_movement_proof',str(out/'application.log'),str(out/'receipt-acceptance.json'),str(out/'movement-result.json')],Path(pre['host'])/'tools/behavior-tests')
    assert report['evaluator_process']['tool_unchanged'] is True
    assert report['evaluator_exit_code']==0 and report['evaluator_error'] is None and report['evaluator_signal'] is None
    raw=(out/'application.log').read_bytes(); text=raw.decode('utf-8'); digest=hashlib.sha256(raw).hexdigest()
    transport=report['log_transport'];assert transport['sealed'] is True and transport['partial'] is False
    assert transport['settled_failure'] is None and transport['raw_sha256']==digest==transport['joined_chunk_sha256']
    assert transport['retained_utf8']==len(raw)
    chunks=audit_chunks(text,(out/'application-log-chunks.jsonl').read_text().splitlines())
    sys.path.insert(0,str(Path(pre['host'])/'tools/behavior-tests'))
    from protocol import decode_json,canonical
    from state_trace.unit_body_movement_proof import evaluate
    acceptance=decode_json((out/'receipt-acceptance.json').read_text())
    packets=[json.loads(line) for line in (out/'application-log-chunks.jsonl').read_text().splitlines()]
    assert acceptance['acquisition']==[{key:packet[key] for key in ('start_utf16','end_utf16','acquired_monotonic_ms')} for packet in packets]
    proof=evaluate(text,acceptance)
    assert canonical(proof)==canonical(report['movement_result'])==canonical(decode_json((out/'movement-result.json').read_text()))
    return {'actual_native_exit':0,'log_sha256':digest,'log_bytes':len(raw),'chunk_count':chunks,
            'moving_unit_id':proof['moving_unit_id'],'unit_count':proof['unit_count'],'census_reads':proof['census_reads'],'sampled_intermediate_ordinals':proof['sampled_intermediate_ordinals'],
            'asset_server_pid':report['asset_server_pid'],'asset_server_exit':report['asset_server_exit'],
            'artifact_sha256':{name:sha(out/name) for name in ('report.json','application.log','application-log-chunks.jsonl',
                 'receipt-acceptance.json','movement-result.json','setup-processes.jsonl','node.log','asset-server.stdout','asset-server.stderr')}}



def capture_child(command,*,cwd,env,out,limits=None):
    """Real owned process boundary; also exercised by tiny Python children only.

    No browser/native launch occurs on import or in unit tests. Unknown waits and
    namespace limits remain explicit. Caller owns its fresh artifact directory.
    """
    limits=dict(BUDGETS if limits is None else limits)
    assert all(type(limits[k]) in (int,float) and limits[k]>0 for k in ('outer_seconds','term_seconds','kill_wait_seconds','cleanup_seconds','postkill_seconds'))
    result={'command':list(command),'cwd':str(cwd),'process_pid':None,'process_group':None,
            'raw_node_exit':None,'os_wait_completed':False,'outer_timeout':False,'forced_cleanup':False,
            'exhaustive_host_descendants_supported':False,
            'namespace_scope':'Exact Popen child plus visible /proc tracked identities and owned group only; not exhaustive host inventory'}
    start=time.monotonic();process=None;tracked={};raw=b'';sample_path=out/'owned-process-samples.jsonl'
    try:
        process=subprocess.Popen(command,cwd=str(cwd),env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
        result.update(process_pid=process.pid,process_group=process.pid)
        save(out,'owned-process.json',result)
        deadline=start+limits['outer_seconds']
        while True:
            sample=own_sample(process.pid,tracked)
            with sample_path.open('a') as stream:stream.write(json.dumps(sample)+'\n')
            remaining=deadline-time.monotonic()
            if remaining<=0:raise subprocess.TimeoutExpired(command,limits['outer_seconds'])
            try:raw,_=process.communicate(timeout=min(1,remaining));break
            except subprocess.TimeoutExpired:pass
    except subprocess.TimeoutExpired:
        result['outer_timeout']=True;result['forced_cleanup']=True
        if process is not None:
            try:os.killpg(process.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:raw,_=process.communicate(timeout=limits['term_seconds'])
            except subprocess.TimeoutExpired:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass

                try:raw,_=process.communicate(timeout=limits['kill_wait_seconds'])
                except subprocess.TimeoutExpired as error:
                    raw=error.output or raw;result['kill_wait_incomplete']=True
    except Exception as error:
        result['executor_error']=repr(error)
        if process is not None:
            result['forced_cleanup']=True
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass

            try:raw,_=process.communicate(timeout=limits['kill_wait_seconds'])
            except subprocess.TimeoutExpired as error:
                raw=error.output or raw;result['kill_wait_incomplete']=True
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
                cleanup_deadline=time.monotonic()+limits['cleanup_seconds']
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
                after_kill_deadline=time.monotonic()+limits['postkill_seconds']
                while time.monotonic()<after_kill_deadline:
                    sample=own_sample(process.pid,tracked)
                    if not [row for row in sample['observed_owned'] if row['pid']!=process.pid]:break
                    time.sleep(0.1)
            sample=own_sample(process.pid,tracked)
            result['owned_group_after_cleanup']=group_probe(process.pid)
            result['tracked_descendants_after_cleanup']=[row for row in sample['observed_owned'] if row['pid']!=process.pid]
            result['visible_proc_root_observed']=process.pid in tracked
            result['tracked_identity_count']=len(tracked)
    result['elapsed_seconds']=time.monotonic()-start
    result['deadline_seconds']=limits['outer_seconds']
    return result,raw

# Historical capture constants only; current prepare never requires these trees.
SOURCE='23e54d08b7dbb00f6b42d325c180a8c868b30ee2'
DEFAULT='a69dd4e0a9620f90bd12c8eb8636ca22e24ed47c'
RUNTIME_HASHES={'GLSMAC.js':'32446906441924bb1b1ad7a505682757c590ef8ebdcacd186a0e3fd259d8bea1',
                'GLSMAC.wasm':'cdc6d8f29400451fdca33a60909a24ad62b3c04b5bacbb2123006ca619177a22'}

SHARED_HASHES={
    'browser-log-cursor.mjs':'959cd36fec3d798f889a9de6d8889d23808195a2a2cfc37830497c061cc1eed3',
    'browser-native-log-hook.mjs':'4c2db225508623cdbfa9a5e9b03b7e16100dabeb598899b6e4f14978af2b24b1',
    'runtime-fetch-barrier.mjs':'b4344d20102ae78bda621cea22f4cbae23fc9606962403507e91f505b5bb8e74',
    'terraform-browser-inputs.mjs':'80171fb84092c3f9fb1c0cff4aef213f2f0674f06c3496ed0f1c7838fd3ac8e3',
}

def add_arguments(parser):
    for name in ('source-root','web','runtime-provenance','assets','artifacts','dependencies','browser','fontconfig','playwright-browsers-path'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--expected-head',required=True)
    parser.add_argument('--node',type=Path,default=Path(shutil.which('node') or 'node'))
    parser.add_argument('--git',type=Path,default=Path(shutil.which('git') or 'git'))
    parser.add_argument('--python',type=Path,default=Path(sys.executable))


def prepare(args,driver):
    ROOT=args.source_root.resolve();OUT=args.artifacts.resolve();WEB=args.web.resolve()
    PROVENANCE=args.runtime_provenance.resolve();RUNTIME=PROVENANCE.parent
    DRIVER=driver.resolve();ASSETS=args.assets.resolve();DEPS=args.dependencies.resolve();HEAD=args.expected_head
    assert DRIVER==ROOT/'tools/behavior-tests/state_trace/unit_body_movement_runner.py','Run the portable boundary from the declared source checkout'
    assert len(HEAD)==40 and all(char in '0123456789abcdef' for char in HEAD),'Full expected source SHA required'
    tools={'git':tool_pin(args.git),'python':tool_pin(args.python)}
    assert not OUT.exists(),'Fresh artifact directory required; preserve any old result'
    assert OUT!=ROOT and ROOT not in OUT.parents,'Keep capture artifacts outside the immutable source checkout'
    profile=current_profile(ROOT,HEAD,WEB,PROVENANCE,tools)
    assert (ROOT/'tools/wasm-tests/node_modules').is_dir()
    assert (ROOT/'tools/wasm-tests/node_modules').resolve()==DEPS
    prov=PROVENANCE
    files=['tools/behavior-tests/state_trace/unit_body_movement_runner.py','tools/behavior-tests/test_unit_body_movement_runner.py',
           'tools/wasm-tests/unit-body-movement-browser.test.mjs','tools/wasm-tests/unit-body-movement-browser-fixture.mjs',
           'tools/wasm-tests/unit-stack-order-browser-fixture.mjs','tools/wasm-tests/unit-workshop-browser-fixture.mjs',
           'tools/behavior-tests/state_trace/unit_body_census.py','tools/behavior-tests/state_trace/unit_body_census_proof.py','tools/behavior-tests/state_trace/unit_body_movement_proof.py',
           'tools/behavior-tests/test_unit_body_census.py','tools/behavior-tests/test_unit_body_movement_proof.py',
           'tools/behavior-tests/protocol.py','tools/behavior-tests/state_trace/terrain_observation.py',
           'tools/behavior-tests/state_trace/schema.py','tools/behavior-tests/fast.py','tools/serve-wasm.py','tools/wasm_assets.py',
           'GLSMAC_data/tests/_state_trace_observer.gls.js','GLSMAC_data/tests/_terrain_trace_observer.gls.js',
           'GLSMAC_data/tests/_terraform_cooperation_observer.gls.js',
           'src/game/backend/map/SMACMap.cpp','src/game/backend/Game.cpp','src/game/backend/unit/UnitManager.cpp','src/game/backend/unit/Unit.cpp','src/gc/Space.cpp','src/gse/Async.cpp','src/gse/GSE.cpp','src/game/backend/State.cpp',
           'GLSMAC_data/default/game/event/move_unit.gls.js','GLSMAC_data/default/game/movement_cost.gls.js',
           'src/GLSMAC.cpp','src/game/frontend/Game.h','src/game/frontend/unit/UnitManager.h','src/game/frontend/unit/Unit.h',
           'src/game/frontend/unit/Unit.cpp','src/game/frontend/unit/UnitDef.h','src/scene/actor/Instanced.h']
    shared=['browser-log-cursor.mjs','browser-native-log-hook.mjs','runtime-fetch-barrier.mjs','terraform-browser-inputs.mjs']
    for name in shared:
        relative='tools/wasm-tests/'+name;files.append(relative)
        # Current committed helper bytes are pinned below; old hashes are historical.
    node=args.node.resolve();browser=args.browser.resolve()
    fixture_script="import{createHash}from'node:crypto';import{movementMain,movementWorld,movementTerrain,movementBudgets}from'./tools/wasm-tests/unit-body-movement-browser-fixture.mjs';const h=v=>createHash('sha256').update(v).digest('hex');console.log(JSON.stringify({main:h(movementMain),world:h(movementWorld),terrain:h(movementTerrain()),budgets:movementBudgets}));"
    fixture=json.loads(subprocess.check_output([str(node),'--input-type=module','-e',fixture_script],cwd=ROOT,text=True))
    assert fixture['budgets']==BUDGETS
    assert fixture['world']=='614964b356e649998aea9cd72cbef780f3aa087cc220117c585976d59e4df27d'
    sys.path.insert(0,str(ROOT/'tools'));from wasm_assets import build_manifest,manifest_bytes
    manifest=build_manifest(ASSETS);assert manifest['id']=='12743b42e275842a7ae3862572ec769c6d86f647394f0edb1ff9db6d104888e3'
    pre={**profile,'status':'preflight only; zero candidate engines/browser launches',
         'host':str(ROOT),'tools':tools,
         'source_files_sha256':{name:sha(ROOT/name) for name in files},
         'runtime_provenance':str(prov),
         'web_shell':str(WEB),'web_files_sha256':{str(path.relative_to(WEB)):sha(path) for path in sorted(WEB.rglob('*')) if path.is_file()},
         'assets':str(ASSETS),'asset_manifest_id':manifest['id'],'asset_manifest_sha256':hashlib.sha256(manifest_bytes(manifest)).hexdigest(),
         'dependency_contents_sha256':dependency_contents(DEPS),'dependency_content_scope':'Future unexecuted profile: all files in playwright and playwright-core; historical v2 package content was not pinned',
         'dependency_symlink':str(DEPS),'dependency_package_sha256':{name:sha(DEPS/name/'package.json') for name in ('playwright','playwright-core')},
         'node':str(node),'node_sha256':sha(node),'node_version':subprocess.check_output([str(node),'--version'],text=True).strip(),
         'browser':str(browser),'browser_sha256':sha(browser),'fontconfig':str(args.fontconfig.resolve()),'fontconfig_sha256':sha(args.fontconfig.resolve()),'playwright_browsers_path':str(args.playwright_browsers_path.resolve()),
         'fixture_sha256':fixture,'driver':str(DRIVER),'driver_sha256':sha(DRIVER),
         'preflight_builder':str(Path(__file__).resolve()),'preflight_builder_sha256':sha(Path(__file__)),
         'executor_pure_tests':str(ROOT/'tools/behavior-tests/test_unit_body_movement_runner.py'),'executor_pure_tests_sha256':sha(ROOT/'tools/behavior-tests/test_unit_body_movement_runner.py'),'executor_pure_checks':'see exact unit-test result; no Native/game credit',
         'runtime_sampling_trigger':'29 fixed positive-delay census callbacks plus sole accepted receipt','endpoint_gate':'strict offline two actual endpoint samples before first pending query',
         'source_review':'Current-checkout metadata consistency is not independent compile proof. Separate final-source review and exclusive run authorization required',
         'budgets':BUDGETS,'native_watchdog_supported':False,'node_test_budget_seconds':180,'outer_timeout_seconds':190,'cleanup_seconds':8,
         'command':[str(node),'--test','--test-concurrency=1','tools/wasm-tests/unit-body-movement-browser.test.mjs'],
         'declared_input':{'players':7,'bases':7,'units':9,'tiles':128,'stack_tile':[8,8],'destination':[10,8],'native_flat_elevation':10,'census_reads':32,'physical_game_inputs':0,'movement_actions':1},
         'original_passing_cases':0,'candidate_engines_started':0,
         'namespace_scope':'OS Popen child/wait and owned process group plus visible /proc observed descendants only; not exhaustive host inventory'}
    OUT.mkdir();(OUT/'asset-manifest.json').write_bytes(manifest_bytes(manifest))
    (OUT/'preflight.json').write_text(json.dumps(pre,indent=2)+'\n')
    print(json.dumps({'head':HEAD,'preflight_sha256':sha(OUT/'preflight.json'),'driver_sha256':pre['driver_sha256'],
                      'native_tree':profile['native_tree'],'fixture_sha256':fixture,'candidate_engines_started':0,
                      'runtime_binding':'metadata-consistent','independent_compile_proof_verified':False,'fidelity_passing_cases':0},indent=2))



def execute(args):
    out=args.artifacts.resolve()
    assert args.manifest_sha256 and sha(out/'preflight.json')==args.manifest_sha256,'Reviewed preflight mismatch'
    pre=json.loads((out/'preflight.json').read_text())
    assert sha(Path(__file__))==pre['driver_sha256'] and pre['budgets']==BUDGETS
    assert not any((out/name).exists() for name in ('owned-process.json','raw-outcome.json','report.json','node.log')),'No overwrite/retry'
    unchanged(pre);assert sha(out/'asset-manifest.json')==pre['asset_manifest_sha256']
    pre['preflight_sha256_for_audit']=args.manifest_sha256
    env=dict(os.environ)
    for key in ('NODE_OPTIONS','NODE_TEST_CONTEXT','NODE_TEST_REQUIRES'):env.pop(key,None)
    env.update(WASM_SCRIPTS_ROOT=pre['host'],WASM_APP_DIR=pre['web_shell'],SMAC_ASSETS_DIR=pre['assets'],
               UNIT_BODY_MOVEMENT_RUNTIME_PROVENANCE=pre['runtime_provenance'],UNIT_BODY_MOVEMENT_ARTIFACTS_DIR=str(out),
               UNIT_BODY_MOVEMENT_PREFLIGHT_PATH=str(out/'preflight.json'),UNIT_BODY_MOVEMENT_PREFLIGHT_SHA256=args.manifest_sha256,
               FONTCONFIG_FILE=pre['fontconfig'],PLAYWRIGHT_BROWSERS_PATH=pre['playwright_browsers_path'],WASM_BROWSER_EXECUTABLE=pre['browser'])
    result,raw=capture_child(pre['command'],cwd=Path(pre['host']),env=env,out=out)
    result.update(kind='one actual movement census OS outcome',head=pre['head'],native_tree=pre['native_tree'],default_tree=pre['default_tree'],runtime=pre['runtime'],
                  preflight_sha256=args.manifest_sha256,driver_sha256=pre['driver_sha256'],original_passing_cases=0,strict_status='incomplete',
                  runtime_binding='metadata-consistent',independent_compile_proof_verified=False,fidelity_passing_cases=0)
    (out/'node.log').write_bytes(raw);(out/'raw-exit-status.txt').write_text(json.dumps(result['raw_node_exit'])+'\n')
    try:unchanged(pre);result['postrun_bindings_match']=True
    except Exception as error:result['postrun_bindings_match']=False;result['postrun_binding_error']=repr(error)
    try:result.update(audit(pre,result,out));result['strict_status']='passed'
    except Exception as error:
        result['acceptance_failure']=repr(error)
        result['strict_status']='timed-out' if result['outer_timeout'] else ('spawn-or-unknown-exit' if result['raw_node_exit'] is None else 'failed')
    save(out,'raw-outcome.json',result);print(json.dumps(result,indent=2))
    raise SystemExit(0 if result['strict_status']=='passed' else 1)


def main():
    parser=argparse.ArgumentParser(description=__doc__);commands=parser.add_subparsers(dest='mode',required=True)
    add_arguments(commands.add_parser('prepare',help='Prepare source/runtime/asset/command pins only; zero games'))
    run=commands.add_parser('execute',help='ONE actual case, separately authorized')
    run.add_argument('--artifacts',type=Path,required=True);run.add_argument('--manifest-sha256',required=True)
    args=parser.parse_args()
    if args.mode=='prepare':prepare(args,Path(__file__).resolve())
    else:execute(args)

if __name__=='__main__':main()
