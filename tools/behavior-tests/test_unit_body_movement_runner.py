"""No game/server/browser. Unicode, scoped identity and cheap real OS wait proofs."""
from pathlib import Path
import copy
import hashlib
import shutil
import shlex
import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from state_trace import unit_body_movement_runner as runner


def packet(start,text):return dict(start_utf16=start,end_utf16=start+len(text.encode('utf-16-le',errors='surrogatepass'))//2,text=text)

class MovementRunnerTests(unittest.TestCase):
    def test_valid_utf16_surrogate_split_joins_actual_utf8(self):
        rows=[packet(0,'a\ud83d'),packet(2,'\ude80z')]
        self.assertEqual(runner.audit_chunks('a🚀z',[json.dumps(p) for p in rows]),2)

    def test_missing_reordered_or_unequal_chunks_reject(self):
        rows=[packet(0,'a'),packet(1,'b')]
        for values in (rows[:1],rows[::-1],[dict(rows[0],end_utf16=2),rows[1]],rows+[packet(2,'x')]):
            with self.subTest(values=values),self.assertRaises(AssertionError):runner.audit_chunks('ab',[json.dumps(p) for p in values])

    def test_unpaired_surrogate_tail_remains_unsupported(self):
        with self.assertRaises(UnicodeError):runner.audit_chunks('a',[json.dumps(packet(0,'a\ud83d'))])

    def test_pid_reuse_does_not_claim_foreign_children(self):
        current={10:dict(pid=10,start_ticks=99,ppid=1),11:dict(pid=11,start_ticks=3,ppid=10)}
        with patch.object(runner,'process_table',return_value=(current,0)):
            result=runner.own_sample(10,{10:2})
        self.assertEqual(result['observed_owned'],[]);self.assertFalse(result['exhaustive_host_inventory'])

    def test_reparented_same_identity_is_retained_and_foreign_sibling_omitted(self):
        current={11:dict(pid=11,start_ticks=3,ppid=1),12:dict(pid=12,start_ticks=4,ppid=999)}
        with patch.object(runner,'process_table',return_value=(current,0)):
            result=runner.own_sample(10,{10:2,11:3})
        self.assertEqual([r['pid'] for r in result['observed_owned']],[11])

    def child(self,code,**changes):
        limits=dict(runner.BUDGETS);limits.update(outer_seconds=2,term_seconds=.2,kill_wait_seconds=1,cleanup_seconds=.1,postkill_seconds=.1);limits.update(changes)
        with tempfile.TemporaryDirectory() as directory:
            result,raw=runner.capture_child([sys.executable,'-c',code],cwd=Path(directory),env=dict(os.environ),out=Path(directory),limits=limits)
            self.assertTrue((Path(directory)/'owned-process.json').exists())
        self.assertFalse(result['exhaustive_host_descendants_supported'])
        self.assertEqual(result['owned_group_after_cleanup'],'absent');self.assertEqual(result['tracked_descendants_after_cleanup'],[])
        return result,raw

    def test_real_owned_zero_child_is_os_waited(self):
        result,raw=self.child("print('owned-child-only',flush=True)")
        self.assertEqual(result['raw_node_exit'],0);self.assertTrue(result['os_wait_completed'])
        self.assertIn(b'owned-child-only',raw);self.assertFalse(result['forced_cleanup']);self.assertFalse(result['outer_timeout'])

    def test_real_nonzero_cannot_be_promoted_by_printed_pass(self):
        result,raw=self.child("print('GLSMAC exited (0)\\nAll tests passed.',flush=True);raise SystemExit(7)")
        self.assertEqual(result['raw_node_exit'],7);self.assertTrue(result['os_wait_completed'])
        self.assertIn(b'All tests passed.',raw)
        with tempfile.TemporaryDirectory() as directory,self.assertRaises(AssertionError):runner.audit({},result,Path(directory))

    def test_successful_synthetic_outer_audit_returns_mover_without_inventing_selection(self):
        # Full return-path model, not an OS/native execution receipt. Keep the
        # real child-receipt, transport, equality and movement-effect checks;
        # only the existing synthetic terrain schema boundary is stubbed.
        from test_unit_body_movement_proof import fixture,text,acceptance
        from state_trace import unit_body_movement_proof as movement
        from state_trace import unit_body_census_proof as static
        log=text(fixture());control=acceptance(log);digest=hashlib.sha256(log.encode()).hexdigest()
        with tempfile.TemporaryDirectory() as folder,patch.object(static.terrain_observation,'validate_snapshot',side_effect=lambda world:world) as terrain:
            out=Path(folder);host=Path(__file__).resolve().parents[2]
            proof=movement.evaluate(log,control)
            # This is the exact old final-return lookup, after all proof gates.
            with self.assertRaises(KeyError):proof['selected_unit_id']
            tools={name:{'path':'/synthetic-only/'+name,'sha256':'a'*64} for name in ('git','python')}
            pre=dict(tools=tools,host=str(host),web_shell='/synthetic-web',assets='/synthetic-assets',
                preflight_sha256_for_audit='a'*64,asset_manifest_id='model-assets',native_tree='b'*40,default_tree='c'*40,
                production_default_files={'GLSMAC_data/default/main.gls.js':{'sha256':'d'*64,'mode':'100644'}},production_default_sha256='e'*64,
                runtime_provenance_sha256='f'*64,runtime={'GLSMAC.js':'1'*64,'GLSMAC.wasm':'2'*64},head='3'*40,
                fixture_sha256=dict(main='4'*64,world='5'*64,terrain='6'*64),budgets=dict(runner.BUDGETS),
                runtime_sampling_trigger='synthetic fixed samples',endpoint_gate='synthetic actual endpoints')
            def child(command,args,cwd):
                return dict(command=command,args=args,cwd=str(cwd),pid=123,spawned=True,wait_completed=True,status=0,signal=None,error=None,
                    spawn_error_code=None,timed_out=False,cancelled=False,output_limit=False,unknown_wait=False,
                    timeout_ms=10000,term_ms=1000,kill_wait_ms=1000,tool_unchanged=True)
            git_args=[['rev-parse','HEAD:src'],['rev-parse','HEAD:GLSMAC_data/default'],['diff','--exit-code','HEAD','--','src','GLSMAC_data/default'],['ls-files','--others','--exclude-standard','--','src','GLSMAC_data/default'],['rev-parse','HEAD']]
            children=[child(tools['git']['path'],args,host) for args in git_args]
            evaluator=child(tools['python']['path'],['-m','state_trace.unit_body_movement_proof',str(out/'application.log'),str(out/'receipt-acceptance.json'),str(out/'movement-result.json')],host/'tools/behavior-tests')
            report=dict(status='complete-native-movement-census-match',native_complete=True,native_raw_exit_code=0,server_reaped=True,asset_server_pid=124,
                tool_executables=tools,preflight_sha256=pre['preflight_sha256_for_audit'],runtime_binding='metadata-consistent',independent_compile_proof_verified=False,fidelity_passing_cases=0,
                asset_server_command=dict(command=tools['python']['path'],args=['tools/serve-wasm.py',pre['web_shell'],'--port','0','--assets',pre['assets']],cwd=str(host)),
                asset_server_exit=dict(code=0,signal=None),browser_errors=[],manifest_id=pre['asset_manifest_id'],native_source_tree=pre['native_tree'],
                production_default_tree=pre['default_tree'],production_default_files=pre['production_default_files'],production_default_sha256=pre['production_default_sha256'],
                runtime_provenance_sha256=pre['runtime_provenance_sha256'],runtime_js_sha256=pre['runtime']['GLSMAC.js'],runtime_wasm_sha256=pre['runtime']['GLSMAC.wasm'],
                host_head=pre['head'],fixture_main_sha256=pre['fixture_sha256']['main'],fixture_world_sha256=pre['fixture_sha256']['world'],declared_input=dict(map_bytes_sha256=pre['fixture_sha256']['terrain']),
                budgets=pre['budgets'],native_watchdog_supported=False,runtime_sampling_trigger=pre['runtime_sampling_trigger'],endpoint_gate=pre['endpoint_gate'],
                setup_children=children,evaluator_process=evaluator,evaluator_exit_code=0,evaluator_error=None,evaluator_signal=None,
                log_transport=dict(sealed=True,partial=False,settled_failure=None,raw_sha256=digest,joined_chunk_sha256=digest,retained_utf8=len(log.encode())),movement_result=proof)
            (out/'report.json').write_text(json.dumps(report));(out/'application.log').write_text(log)
            (out/'receipt-acceptance.json').write_text(json.dumps(control));(out/'movement-result.json').write_text(json.dumps(proof))
            (out/'application-log-chunks.jsonl').write_text(json.dumps(dict(control['acquisition'][0],text=log))+'\n')
            (out/'setup-processes.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in children))
            for name in ('node.log','asset-server.stdout','asset-server.stderr'):(out/name).write_text('Synthetic model only; no child or candidate started.\n')
            outer=dict(raw_node_exit=0,os_wait_completed=True,outer_timeout=False,owned_group_after_cleanup='absent',tracked_descendants_after_cleanup=[],forced_cleanup=False,postrun_bindings_match=True)
            result=runner.audit(pre,outer,out)
            self.assertEqual(terrain.call_count,4);self.assertEqual(result['moving_unit_id'],8);self.assertNotIn('selected_unit_id',result)
            self.assertEqual(result['census_reads'],32);self.assertEqual(result['log_sha256'],digest)
            self.assertEqual(len(result['artifact_sha256']),9);self.assertFalse(proof['candidate_executed'])

    def test_real_deadline_term_and_kill_oswait_are_bounded(self):
        result,raw=self.child("import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);print('ready-only',flush=True);time.sleep(10)",outer_seconds=.2)
        self.assertTrue(result['outer_timeout']);self.assertTrue(result['forced_cleanup']);self.assertTrue(result['os_wait_completed'])
        self.assertEqual(result['raw_node_exit'],-signal.SIGKILL);self.assertLess(result['elapsed_seconds'],3)
        self.assertIn(b'ready-only',raw)

    def test_unknown_kill_wait_is_not_inferred_zero_and_no_unbounded_communicate(self):
        class Unknown:
            pid=7654321;returncode=None
            def __init__(self):self.timeouts=[]
            def communicate(self,timeout):
                self.timeouts.append(timeout);raise subprocess.TimeoutExpired(['fake'],timeout,output=b'partial')
        process=Unknown()
        sample=dict(observed_owned=[],node_visible=False,exhaustive_host_inventory=False)
        limits=dict(runner.BUDGETS,outer_seconds=.001,term_seconds=.001,kill_wait_seconds=.001,cleanup_seconds=.001,postkill_seconds=.001)
        with tempfile.TemporaryDirectory() as directory,patch.object(runner.subprocess,'Popen',return_value=process),patch.object(runner,'own_sample',return_value=sample),patch.object(runner,'group_probe',return_value='absent'),patch.object(runner.os,'killpg'):
            result,raw=runner.capture_child(['fake'],cwd=Path(directory),env={},out=Path(directory),limits=limits)
        self.assertIsNone(result['raw_node_exit']);self.assertFalse(result['os_wait_completed']);self.assertTrue(result['kill_wait_incomplete'])
        self.assertEqual(raw,b'partial');self.assertTrue(all(t is not None and t>0 for t in process.timeouts))

    def test_browser_fixture_source_has_no_backend_mutable_read_in_sampler(self):
        root=Path(__file__).resolve().parents[2]
        fixture=(root/'tools/wasm-tests/unit-body-movement-browser-fixture.mjs').read_text()
        sample=fixture.split("if (phase == 'sampling') {",1)[1].split("if (phase == 'pending')",1)[0]
        for forbidden in ('get_unit(', 'get_tile(', 'has_pending_actions(', 'observer.read(', 'is_locked(', 'movement', 'project('):
            self.assertNotIn(forbidden,sample)
        self.assertIn("if (sampled < 29)",sample);self.assertIn('receipt_seq != null',sample)
        self.assertIn("timer(10,",fixture);self.assertNotIn('timer(0,',fixture)

    def helper(self,code):
        root=Path(__file__).resolve().parents[2]
        uri=(root/'tools/wasm-tests/unit-body-movement-browser-fixture.mjs').as_uri()
        script="import{movementChild}from"+json.dumps(uri)+";"+code
        env=dict(os.environ);env.pop('SMAC_ASSETS_DIR',None)
        completed=subprocess.run(['node','--input-type=module','-e',script],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=5,text=True)
        self.assertEqual(completed.returncode,0,completed.stdout)
        line=next(line for line in completed.stdout.splitlines() if line.startswith('RESULT|'))
        return json.loads(line.removeprefix('RESULT|'))

    def test_async_real_readonly_git_preserves_source_tree_and_waits(self):
        result=self.helper("const r=await movementChild('git',['rev-parse','HEAD:src'],{cwd:process.cwd()});console.log('RESULT|'+JSON.stringify(r));")
        self.assertEqual(result['stdout'].strip(),subprocess.check_output(['git','rev-parse','HEAD:src'],cwd=Path(__file__).resolve().parents[2],text=True).strip());self.assertEqual(result['status'],0)
        self.assertTrue(result['spawned']);self.assertTrue(result['wait_completed']);self.assertIsNone(result['error'])
        self.assertTrue(result['spawned']);self.assertTrue(result['wait_completed']);self.assertFalse(result['unknown_wait'])

    def test_async_git_in_actual_default_node_worker_has_persisted_body_receipt(self):
        root=Path(__file__).resolve().parents[2];uri=(root/'tools/wasm-tests/unit-body-movement-browser-fixture.mjs').as_uri()
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory);receipt=folder/'actual-body.json';source=folder/'metadata-only.test.mjs'
            source.write_text("import{test}from'node:test';import assert from'node:assert/strict';import{writeFileSync}from'node:fs';import{movementChild}from"+json.dumps(uri)+";test('read-only metadata only',async()=>{const r=await movementChild('git',['rev-parse','HEAD:src'],{cwd:"+json.dumps(str(root))+"});writeFileSync("+json.dumps(str(receipt))+",JSON.stringify(r));assert.equal(r.error,null);assert.equal(r.status,0);assert.equal(r.wait_completed,true);});")
            env=dict(os.environ);env.pop('SMAC_ASSETS_DIR',None)
            limits=dict(runner.BUDGETS,outer_seconds=3,term_seconds=.2,kill_wait_seconds=.5,cleanup_seconds=.2,postkill_seconds=.2)
            outcome,raw=runner.capture_child(['node','--test','--test-concurrency=1',str(source)],cwd=root,env=env,out=folder,limits=limits)
            self.assertEqual(outcome['raw_node_exit'],0,raw.decode(errors='replace'));self.assertTrue(outcome['os_wait_completed'])
            self.assertEqual(outcome['owned_group_after_cleanup'],'absent');self.assertEqual(outcome['tracked_descendants_after_cleanup'],[])
            self.assertTrue(receipt.exists(),'No actual inner body receipt; file PASS alone is insufficient')
            result=json.loads(receipt.read_text());self.assertTrue(result['spawned']);self.assertTrue(result['wait_completed']);self.assertEqual(result['status'],0)
            self.assertEqual(result['stdout'].strip(),subprocess.check_output(['git','rev-parse','HEAD:src'],cwd=Path(__file__).resolve().parents[2],text=True).strip())
            self.assertTrue(result['spawned']);self.assertTrue(result['wait_completed']);self.assertFalse(result['unknown_wait'])

    def test_async_actual_nonzero_is_not_promoted_by_fake_pass_output(self):
        result=self.helper("const r=await movementChild('python3',['-c',\"print('All tests passed.');raise SystemExit(7)\"],{cwd:process.cwd()});console.log('RESULT|'+JSON.stringify(r));")
        self.assertEqual(result['status'],7);self.assertTrue(result['wait_completed']);self.assertIn('All tests passed.',result['stdout'])
        self.assertTrue(result['spawned']);self.assertTrue(result['wait_completed']);self.assertFalse(result['unknown_wait'])

    def test_async_spawn_error_status_zero_counterexample_never_reports_exit_zero(self):
        result=self.helper("import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';import{EventEmitter}from'node:events';import{PassThrough}from'node:stream';cp.spawn=()=>{const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();process.nextTick(()=>{const e=Object.assign(Error('spawn git EPERM'),{code:'EPERM',status:0});p.emit('error',e);});return p;};syncBuiltinESMExports();const r=await movementChild('git',['rev-parse','HEAD:src'],{cwd:process.cwd()});console.log('RESULT|'+JSON.stringify(r));")
        self.assertIsNone(result['status']);self.assertFalse(result['spawned']);self.assertFalse(result['wait_completed'])
        self.assertEqual(result['spawn_error_code'],'EPERM');self.assertIn('EPERM',result['error'])

    def test_async_timeout_kills_and_waits_owned_child(self):
        result=self.helper("const r=await movementChild('python3',['-c','import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);print(123,flush=True);time.sleep(10)'],{cwd:process.cwd(),timeout_ms:400,term_ms:50,kill_wait_ms:500});console.log('RESULT|'+JSON.stringify(r));")
        self.assertTrue(result['timed_out']);self.assertTrue(result['wait_completed']);self.assertFalse(result['unknown_wait'])
        self.assertNotEqual(result['status'],0);self.assertLess(result['elapsed_ms'],2000)
        self.assertTrue(result['spawned']);self.assertTrue(result['wait_completed']);self.assertFalse(result['unknown_wait'])

    def test_async_cancellation_reaps_instead_of_leaving_owned_child(self):
        result=self.helper("const c=new AbortController();const p=movementChild('python3',['-c','import time;time.sleep(10)'],{cwd:process.cwd(),signal:c.signal,timeout_ms:1000,term_ms:50,kill_wait_ms:500});setTimeout(()=>c.abort(),200);const r=await p;console.log('RESULT|'+JSON.stringify(r));")
        self.assertTrue(result['cancelled']);self.assertTrue(result['wait_completed']);self.assertFalse(result['unknown_wait'])
        self.assertTrue(result['spawned']);self.assertTrue(result['wait_completed']);self.assertFalse(result['unknown_wait'])

    def test_async_signal_in_normal_after_hook_remains_usable(self):
        result=self.helper("import{test}from'node:test';test('cheap helper lifecycle only',async t=>{t.after(async()=>{const r=await movementChild('python3',['-c','print(1)'],{cwd:process.cwd(),signal:t.signal});console.log('RESULT|'+JSON.stringify(r));});});")
        self.assertFalse(result['cancelled']);self.assertEqual(result['status'],0);self.assertTrue(result['wait_completed'])

    def test_child_audit_rejects_error_status_zero_missing_wait_or_cancel(self):
        value=dict(command='git',args=['rev-parse','HEAD:src'],cwd='/tmp',pid=123,spawned=True,wait_completed=True,status=0,signal=None,error=None,spawn_error_code=None,timed_out=False,cancelled=False,output_limit=False,unknown_wait=False,timeout_ms=10000,term_ms=1000,kill_wait_ms=1000)
        runner.audited_child(value,'git',value['args'],'/tmp')
        for key,replacement in [('error','spawnSync git EPERM'),('spawned',False),('wait_completed',False),('cancelled',True),('timed_out',True),('pid',None),('status',True)]:
            with self.subTest(key=key),self.assertRaises(AssertionError):runner.audited_child(dict(value,**{key:replacement}),'git',value['args'],'/tmp')


    def test_reused_child_under_owned_parent_is_never_readopted(self):
        tracked={10:2,11:3}
        table={10:dict(pid=10,start_ticks=2,ppid=1),
               11:dict(pid=11,start_ticks=99,ppid=10),
               12:dict(pid=12,start_ticks=100,ppid=11)}
        with patch.object(runner,'process_table',return_value=(table,0)):
            sample=runner.own_sample(10,tracked)
        self.assertEqual([r['pid'] for r in sample['observed_owned']],[10])
        self.assertEqual(tracked,{10:2,11:3})

    def test_waited_pid_reused_by_foreign_group_is_never_signalled(self):
        def row(pid,start,ppid):return dict(pid=pid,start_ticks=start,ppid=ppid,pgid=100,session=100,state='S')
        original={100:row(100,1,1),101:row(101,2,100)}
        foreign={100:row(100,90,1),101:row(101,91,100)}
        class Waited:
            pid=100;returncode=0
            def communicate(self,timeout):return b'owned-wait-complete',b''
        with tempfile.TemporaryDirectory() as directory,patch.object(runner.subprocess,'Popen',return_value=Waited()),patch.object(runner,'process_table',side_effect=[(original,0),(foreign,0),(foreign,0)]),patch.object(runner,'group_probe',return_value='present'),patch.object(runner.os,'killpg') as group_signal,patch.object(runner.os,'kill') as pid_signal:
            result,raw=runner.capture_child(['dummy'],cwd=Path(directory),env={},out=Path(directory))
        self.assertTrue(result['os_wait_completed']);self.assertEqual(result['raw_node_exit'],0)
        self.assertTrue(result['group_ownership_unknown']);self.assertEqual(result['tracked_descendants_after_cleanup'],[])
        group_signal.assert_not_called();pid_signal.assert_not_called()

    def test_package_code_changes_reject_with_unchanged_manifests(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ('playwright','playwright-core'):
                (root/name/'lib').mkdir(parents=True)
                (root/name/'package.json').write_text('{"version":"test"}')
                (root/name/'lib/driver.js').write_text('original executable bytes')
            pre=dict(dependency_symlink=str(root),dependency_contents_sha256=runner.dependency_contents(root))
            runner.unchanged_dependencies(pre)
            for name in ('playwright','playwright-core'):
                path=root/name/'lib/driver.js';original=path.read_text();path.write_text('modified executable bytes')
                with self.assertRaises(AssertionError):runner.unchanged_dependencies(pre)
                path.write_text(original)
            extra=root/'playwright/lib/added.js';extra.write_text('new executable bytes')
            with self.assertRaises(AssertionError):runner.unchanged_dependencies(pre)
            extra.unlink();(root/'playwright/lib/driver.js').unlink()
            with self.assertRaises(AssertionError):runner.unchanged_dependencies(pre)

    def test_unreadable_nested_package_directory_cannot_create_or_match_a_partial_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ('playwright','playwright-core'):
                (root/name/'lib').mkdir(parents=True)
                (root/name/'package.json').write_text('{}')
                (root/name/'lib/driver.js').write_text('readable by a known executable path')
            baseline=runner.dependency_contents(root)
            actual_scandir=os.scandir
            for name in ('playwright','playwright-core'):
                for error in (PermissionError,OSError):
                    with self.subTest(package=name,error=error.__name__):
                        denied=root/name/'lib'
                        def denied_nested_listing(path):
                            if Path(path)==denied:raise error('deterministic inaccessible package directory')
                            return actual_scandir(path)
                        self.assertTrue((denied/'driver.js').read_bytes())
                        with patch.object(os,'scandir',side_effect=denied_nested_listing):
                            with self.assertRaises(error):runner.dependency_contents(root)
                            # Old rglob could prepare this partial map, then
                            # accept matching omissions during every post-scan.
                            partial=copy.deepcopy(baseline);partial[name].pop('lib/driver.js')
                            pre=dict(dependency_symlink=str(root),dependency_contents_sha256=partial)
                            with self.assertRaises(error):runner.unchanged_dependencies(pre)
            self.assertEqual(runner.dependency_contents(root),baseline)

    def test_package_symlink_cannot_escape_content_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ('playwright','playwright-core'):
                (root/name).mkdir();(root/name/'package.json').write_text('{}')
            (root/'outside.js').write_text('outside declared package')
            (root/'playwright/escape.js').symlink_to(root/'outside.js')
            with self.assertRaises(AssertionError):runner.dependency_contents(root)

    def test_python_optimization_rejected_before_import_cli_or_case_credit(self):
        root=Path(__file__).resolve().parents[2];script=root/'tools/behavior-tests/state_trace/unit_body_movement_runner.py'
        base=dict(os.environ);base.pop('PYTHONOPTIMIZE',None);base['PYTHONPATH']=str(root/'tools/behavior-tests')
        variants=[(['-O'],None),(['-OO'],None),([], '1'),([], '0')]
        entries=[['-c',"import state_trace.unit_body_movement_runner;print('UNSAFE_CASE_CREDIT')"],['-m','state_trace.unit_body_movement_runner','--help'],[str(script),'--help']]
        for flags,optimize in variants:
            for entry in entries:
                env=dict(base)
                if optimize is not None:env['PYTHONOPTIMIZE']=optimize
                with self.subTest(flags=flags,env=optimize,entry=entry):
                    child=subprocess.run([sys.executable,*flags,*entry],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=5)
                    self.assertNotEqual(child.returncode,0);self.assertIn('requires unoptimized Python',child.stderr);self.assertNotIn('UNSAFE_CASE_CREDIT',child.stdout)
        for entry in entries:
            child=subprocess.run([sys.executable,*entry],cwd=root,env=base,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=5)
            self.assertEqual(child.returncode,0,child.stderr)


    def test_historical_freeze_is_retained_without_substituting_execution_identity(self):
        import hashlib
        ui=Path(__file__).resolve().parents[2]/'tools/behavior-tests/ui'
        original=(ui/'unit-body-movement-source-freeze-v2.json').read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(),'41fd6d3bbf06a19144efec9176c3559ba0d655894fea2cb34a7d7a8de2b807bf')
        freeze=json.loads(original);mapping=json.loads((ui/'unit-body-movement-source-equivalence-v2.json').read_text())
        self.assertEqual(mapping['actual_executed_commit'],freeze['head'])
        self.assertNotEqual(mapping['actual_executed_commit'],mapping['public_equivalent_commit'])
        self.assertFalse(mapping['public_commit_was_game_executed'])
        self.assertEqual(len(mapping['source_files_sha256']),41)
        for path,digest in freeze['changed_files_sha256'].items():self.assertEqual(mapping['source_files_sha256'][path],digest)
        self.assertEqual(mapping['native_tree'],runner.SOURCE);self.assertEqual(mapping['default_tree'],runner.DEFAULT)

    def test_proposed_profile_matches_fixed_executable_boundaries(self):
        self.assertEqual(runner.BUDGETS,dict(node_ms=180000,observation_ms=120000,outer_seconds=190,term_seconds=3,kill_wait_seconds=5,cleanup_seconds=8,postkill_seconds=2,census_calls=32,sample_delay_ms=10))
        self.assertEqual(runner.SOURCE,'23e54d08b7dbb00f6b42d325c180a8c868b30ee2')
        self.assertEqual(runner.DEFAULT,'a69dd4e0a9620f90bd12c8eb8636ca22e24ed47c')



class CurrentMovementProfileTests(unittest.TestCase):
    """Real metadata/cheap child boundaries; supplied bytes are never a runtime."""
    def inputs(self,folder):
        folder=Path(folder);root=folder/'source';root.mkdir()
        for name,value in {'src/declared.cpp':'// declared source only\n','GLSMAC_data/default/main.gls.js':'// never parsed\n','tools/wasm_assets.py':'# tracked helper\n','runner.py':'# source metadata test only\n'}.items():
            path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(value)
        git=Path(shutil.which('git')).resolve();node=Path(shutil.which('node')).resolve()
        subprocess.run([str(git),'init','-q'],cwd=root,check=True)
        subprocess.run([str(git),'add','.'],cwd=root,check=True)
        subprocess.run([str(git),'-c','user.name=Public fixture','-c','user.email=fixture@example.invalid','commit','-qm','Declared source metadata'],cwd=root,check=True)
        tools={'git':runner.tool_pin(git),'python':runner.tool_pin(Path(sys.executable).resolve())}
        head=runner.git_read(tools,root,'rev-parse','HEAD')
        runtime=folder/'runtime';web=folder/'web';runtime.mkdir();web.mkdir()
        for name in ('GLSMAC.js','GLSMAC.wasm'):
            (runtime/name).write_bytes(b'not executable runtime input');(web/name).write_bytes((runtime/name).read_bytes())
        for name in ('index.html','bootstrap.js','asset-store.js'):(web/name).write_bytes(b'not served web input')
        metadata=dict(source_tree=runner.git_read(tools,root,'rev-parse','HEAD:src'),default_tree=runner.git_read(tools,root,'rev-parse','HEAD:GLSMAC_data/default'),
                      runtime={name:runner.sha(runtime/name) for name in ('GLSMAC.js','GLSMAC.wasm')},
                      owned_build_workers_reaped=True,web_static_sha256={name:runner.sha(web/name) for name in ('index.html','bootstrap.js','asset-store.js')})
        provenance=runtime/'provenance.json';provenance.write_text(json.dumps(metadata));(web/'provenance.json').write_bytes(provenance.read_bytes())
        return root,head,web,provenance,tools,node

    def node(self,code,env=None):
        root=Path(__file__).resolve().parents[2];uri=(root/'tools/wasm-tests/unit-body-movement-browser-fixture.mjs').as_uri()
        script='import{movementProfile,movementBoundChild,movementAssetServer,movementTool,movementMain,movementWorld,movementTerrain,movementBudgets}from'+json.dumps(uri)+';'+code
        environ=dict(os.environ if env is None else env);environ.pop('SMAC_ASSETS_DIR',None)
        child=subprocess.run([str(Path(shutil.which('node')).resolve()),'--input-type=module','-e',script],cwd=root,env=environ,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=10)
        self.assertEqual(child.returncode,0,child.stderr)
        return json.loads(next(line[7:] for line in child.stdout.splitlines() if line.startswith('RESULT|')))

    def test_current_committed_trees_and_metadata_are_consistent_without_compile_credit(self):
        with tempfile.TemporaryDirectory() as folder:
            root,head,web,prov,tools,node=self.inputs(folder)
            profile=runner.current_profile(root,head,web,prov,tools)
            self.assertNotEqual(profile['native_tree'],runner.SOURCE);self.assertNotEqual(profile['default_tree'],runner.DEFAULT)
            self.assertEqual(profile['profile'],'current-checkout');self.assertEqual(profile['version'],2)
            self.assertEqual(profile['runtime_binding'],'metadata-consistent')
            self.assertFalse(profile['independent_compile_proof_verified']);self.assertEqual(profile['fidelity_passing_cases'],0)

    def test_hidden_Default_edits_reject_even_when_status_and_diff_are_clean(self):
        for flag in ('--assume-unchanged','--skip-worktree'):
            with self.subTest(flag=flag),tempfile.TemporaryDirectory() as folder:
                root,head,web,prov,tools,node=self.inputs(folder)
                old=runner.current_profile(root,head,web,prov,tools)
                name='GLSMAC_data/default/main.gls.js'
                runner.git_read(tools,root,'update-index',flag,name)
                (root/name).write_text('// hidden modification, not a new accepted baseline\n')
                self.assertEqual(runner.git_read(tools,root,'status','--porcelain','--untracked-files=no'),'')
                self.assertEqual(runner.git_read(tools,root,'diff','--exit-code','HEAD','--','GLSMAC_data/default'),'')
                with self.assertRaisesRegex(AssertionError,'Default bytes/modes'):
                    runner.current_profile(root,head,web,prov,tools)
                # Same pre-existing reviewed profile must reject at execute's
                # unchanged boundary before later dependency/runtime checks.
                pre=dict(old,tools=tools,host=str(root),web_shell=str(web),runtime_provenance=str(prov),node=str(node),
                    command=[str(node),'--test','--test-concurrency=1','tools/wasm-tests/unit-body-movement-browser.test.mjs'])
                with self.assertRaisesRegex(AssertionError,'Default bytes/modes'):runner.unchanged(pre)

    def test_complete_Default_inventory_modes_UTF8_symlinks_and_scan_errors_fail_closed(self):
        for mode in ('missing','extra','executable','invalid-utf8','symlink','nested-scan'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as folder:
                root,head,web,prov,tools,node=self.inputs(folder);path=root/'GLSMAC_data/default/main.gls.js'
                if mode=='missing':path.unlink()
                elif mode=='extra':path.with_name('extra.gls.js').write_text('// not committed')
                elif mode=='executable':path.chmod(0o755)
                elif mode=='invalid-utf8':path.write_bytes(b'\xff')
                elif mode=='symlink':
                    path.unlink();path.symlink_to(root/'runner.py')
                else:
                    nested=path.parent/'nested';nested.mkdir();original=Path.iterdir
                    def denied(value):
                        if value==nested:raise PermissionError('owned synthetic scan denial')
                        return original(value)
                    with patch.object(Path,'iterdir',denied),self.assertRaises(PermissionError):runner.default_scripts(root,head,tools)
                    continue
                with self.assertRaises((AssertionError,UnicodeError)):runner.default_scripts(root,head,tools)

    def test_Default_Unicode_producer_serialization_and_report_join(self):
        with tempfile.TemporaryDirectory() as folder:
            root,head,web,prov,tools,node=self.inputs(folder);directory=root/'GLSMAC_data/default'
            for name in ('\ue000.gls.js','🚀.gls.js'):(directory/name).write_text('BOM:\ufeff emoji🚀\n\t"\\\u2028',encoding='utf-8')
            runner.git_read(tools,root,'add','.');runner.git_read(tools,root,'-c','user.name=Public fixture','-c','user.email=fixture@example.invalid','commit','-qm','Unicode metadata')
            head=runner.git_read(tools,root,'rev-parse','HEAD');profile=runner.default_scripts(root,head,tools)
            uri=(Path(__file__).resolve().parents[2]/'tools/wasm-tests/unit-body-movement-browser.test.mjs').as_uri()
            code='const{movementDefaultScripts}=await import('+json.dumps(uri)+');const root='+json.dumps(str(root))+';const pre='+json.dumps(profile)+';const scripts=movementDefaultScripts(root,pre);const bad=[];for(const field of ["production_default_sha256","production_default_files"]){const changed=structuredClone(pre);if(field==="production_default_sha256")changed[field]="0".repeat(64);else delete changed[field][Object.keys(changed[field])[0]];try{movementDefaultScripts(root,changed);bad.push(false);}catch{bad.push(true);}}console.log("RESULT|"+JSON.stringify({keys:Object.keys(scripts),bad}));'
            values=self.node(code)
            self.assertLess(values['keys'].index('GLSMAC_data/default/🚀.gls.js'),values['keys'].index('GLSMAC_data/default/\ue000.gls.js'))
            self.assertEqual(values['bad'],[True,True])
            pre=dict(profile,default_tree='a'*40);report=dict(profile,production_default_tree='a'*40)
            runner.default_report(pre,report)
            for key in ('production_default_tree','production_default_files','production_default_sha256'):
                bad=copy.deepcopy(report);bad[key]='bad'
                with self.subTest(key=key),self.assertRaises(AssertionError):runner.default_report(pre,bad)

    def test_current_profile_rejects_head_source_runtime_metadata_and_web_changes(self):
        variants=('head','dirty-helper','native','default','js','wasm','web','static','web-provenance')
        for variant in variants:
            with self.subTest(variant=variant),tempfile.TemporaryDirectory() as folder:
                root,head,web,prov,tools,node=self.inputs(folder);metadata=json.loads(prov.read_text())
                if variant=='head':head='0'*40
                if variant=='dirty-helper':(root/'tools/wasm_assets.py').write_text('# changed tracked input\n')
                if variant in ('native','default'):
                    metadata['source_tree' if variant=='native' else 'default_tree']='0'*40
                    prov.write_text(json.dumps(metadata));(web/'provenance.json').write_bytes(prov.read_bytes())
                if variant in ('js','wasm'):(prov.parent/('GLSMAC.js' if variant=='js' else 'GLSMAC.wasm')).write_bytes(b'different runtime bytes')
                if variant=='web':(web/'GLSMAC.js').write_bytes(b'different served runtime')
                if variant=='static':(web/'bootstrap.js').write_bytes(b'different bootstrap')
                if variant=='web-provenance':(web/'provenance.json').write_bytes(b'different metadata')
                with self.assertRaises(AssertionError):runner.current_profile(root,head,web,prov,tools)

    def test_postflight_rejects_changed_tracked_source_helper(self):
        with tempfile.TemporaryDirectory() as folder:
            root,head,web,prov,tools,node=self.inputs(folder)
            modules=Path(folder)/'packages'
            for name in ('playwright','playwright-core'):
                (modules/name).mkdir(parents=True);(modules/name/'package.json').write_text('{}')
            (root/'tools/wasm-tests').mkdir();(root/'tools/wasm-tests/node_modules').symlink_to(modules,target_is_directory=True)
            font=Path(folder)/'font';font.write_text('not used')
            pre=dict(runner.current_profile(root,head,web,prov,tools),tools=tools,host=str(root),web_shell=str(web),runtime_provenance=str(prov),
                command=[str(node),'--test','--test-concurrency=1','tools/wasm-tests/unit-body-movement-browser.test.mjs'],
                dependency_symlink=str(modules),source_files_sha256={name:runner.sha(root/name) for name in ('tools/wasm_assets.py','runner.py')},
                web_files_sha256={path.name:runner.sha(path) for path in web.iterdir()},driver=str(root/'runner.py'),driver_sha256=runner.sha(root/'runner.py'),
                node=str(node),node_sha256=runner.sha(node),browser=str(node),browser_sha256=runner.sha(node),fontconfig=str(font),fontconfig_sha256=runner.sha(font),
                dependency_package_sha256={name:runner.sha(modules/name/'package.json') for name in ('playwright','playwright-core')},dependency_contents_sha256=runner.dependency_contents(modules))
            runner.unchanged(pre)
            (root/'tools/wasm_assets.py').write_text('# changed after preparation\n')
            with self.assertRaisesRegex(AssertionError,'Dirty source'):runner.unchanged(pre)

    def test_tool_replacement_absence_permissions_relative_path_and_outer_python_reject(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'owned-tool';original=b'#!/bin/sh\nexit 0\n';path.write_bytes(original);path.chmod(0o700)
            pin=runner.tool_pin(path);runner.verify_tool(pin)
            for variant in ('changed','missing','permissions','relative'):
                with self.subTest(variant=variant):
                    path.write_bytes(original);path.chmod(0o700);bad=copy.deepcopy(pin)
                    if variant=='changed':path.write_bytes(b'#!/bin/sh\nexit 7\n')
                    if variant=='missing':path.unlink()
                    if variant=='permissions':path.chmod(0o600)
                    if variant=='relative':bad['path']='owned-tool'
                    with self.assertRaises((AssertionError,OSError)):runner.verify_tool(bad)
            tools={'git':runner.tool_pin(Path(shutil.which('git')).resolve()),'python':runner.tool_pin(Path(shutil.which('node')).resolve())}
            with self.assertRaisesRegex(AssertionError,'Different outer Python'):runner.verify_tools(tools)

    def test_changed_PATH_cannot_substitute_actual_git_or_python_children(self):
        with tempfile.TemporaryDirectory() as folder:
            root,head,web,prov,tools,node=self.inputs(folder);sentinels=Path(folder)/'PATH';sentinels.mkdir();marker=Path(folder)/'wrong-tool-used'
            for name in ('git','python3'):
                path=sentinels/name;path.write_text('#!/bin/sh\necho wrong > '+shlex.quote(str(marker))+'\nexit 99\n');path.chmod(0o700)
            env=dict(os.environ,PATH=str(sentinels)+os.pathsep+os.environ.get('PATH',''))
            # Real old bare-command counterexample, not a game invocation: these
            # controlled wrappers ignore arguments, mark their use and exit99.
            for bare in ('git','python3'):
                old=subprocess.run([bare,'--version'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=2)
                self.assertEqual(old.returncode,99);self.assertTrue(marker.exists());marker.unlink()
            with patch.dict(os.environ,env,clear=True):self.assertEqual(runner.git_read(tools,root,'rev-parse','HEAD'),head)
            code='const tools='+json.dumps(tools)+';const git=await movementBoundChild(tools.git,["rev-parse","HEAD"],{cwd:'+json.dumps(str(root))+'});const python=await movementBoundChild(tools.python,["-c","print(42)"],{cwd:'+json.dumps(str(root))+'});console.log("RESULT|"+JSON.stringify({git,python}));'
            result=self.node(code,env)
            for name in ('git','python'):
                child=result[name];self.assertEqual(child['command'],tools[name]['path']);self.assertTrue(child['spawned']);self.assertTrue(child['wait_completed']);self.assertTrue(child['tool_unchanged']);self.assertEqual(child['status'],0);self.assertIsNone(child['error'])
            self.assertEqual(result['git']['stdout'].strip(),head);self.assertEqual(result['python']['stdout'].strip(),'42');self.assertFalse(marker.exists())

    def test_browser_consumes_exact_current_manifest_and_rejects_digest_schema_tools(self):
        with tempfile.TemporaryDirectory() as folder:
            root,head,web,prov,tools,node=self.inputs(folder)
            pre=dict(runner.current_profile(root,head,web,prov,tools),tools=tools,node=str(node),node_sha256=runner.sha(node))
            path=Path(folder)/'preflight.json';cases=[]
            for variant in ('valid','digest','version','compile-credit','relative-tool','tool-hash','tool-set'):
                changed=copy.deepcopy(pre)
                if variant=='version':changed['version']=1
                if variant=='compile-credit':changed['independent_compile_proof_verified']=True
                if variant=='relative-tool':changed['tools']['git']['path']='git'
                if variant=='tool-hash':changed['tools']['python']['sha256']='0'*64
                if variant=='tool-set':del changed['tools']['git']
                target=path.with_name(variant+'.json');target.write_text(json.dumps(changed));cases.append([str(target),'0'*64 if variant=='digest' else runner.sha(target)])
            code='const cases='+json.dumps(cases)+';const values=cases.map(([path,sha])=>{try{return {accepted:true,profile:movementProfile(path,sha).profile};}catch(e){return {accepted:false,error:String(e)};}});console.log("RESULT|"+JSON.stringify(values));'
            values=self.node(code);self.assertTrue(values[0]['accepted']);self.assertTrue(all(not row['accepted'] for row in values[1:]))

    def test_asset_server_spawn_boundary_uses_pinned_python_without_starting_server(self):
        pin=runner.tool_pin(Path(sys.executable).resolve())
        code='import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";let requested=null;cp.spawn=(command,args,options)=>{requested={command,args,cwd:options.cwd};return {test_only_no_OS_child:true};};syncBuiltinESMExports();const result=movementAssetServer('+json.dumps(pin)+',{web:"/declared-web",assets:"/declared-assets",cwd:"/declared-host"});console.log("RESULT|"+JSON.stringify({requested,declared:result.command,no_child:result.child.test_only_no_OS_child}));'
        result=self.node(code)
        self.assertEqual(result['requested'],dict(command=pin['path'],args=['tools/serve-wasm.py','/declared-web','--port','0','--assets','/declared-assets'],cwd='/declared-host'))
        self.assertEqual(result['requested'],result['declared']);self.assertTrue(result['no_child'])

    def test_absolute_child_receipt_cannot_be_replaced_by_bare_command_or_fake_success(self):
        tool=runner.tool_pin(Path(sys.executable).resolve())
        child=dict(command=tool['path'],args=['-c','print(1)'],cwd='/tmp',pid=123,spawned=True,wait_completed=True,status=0,signal=None,error=None,spawn_error_code=None,timed_out=False,cancelled=False,output_limit=False,unknown_wait=False,timeout_ms=10000,term_ms=1000,kill_wait_ms=1000)
        runner.audited_child(child,tool['path'],child['args'],'/tmp')
        for key,value in [('command','python3'),('status',True),('spawned',False),('wait_completed',False),('error','spawn EPERM status0')]:
            with self.subTest(key=key),self.assertRaises(AssertionError):runner.audited_child(dict(child,**{key:value}),tool['path'],child['args'],'/tmp')

    def test_generated_movement_inputs_and_budgets_still_equal_historical_case(self):
        values=self.node('import{createHash}from"node:crypto";const h=v=>createHash("sha256").update(v).digest("hex");console.log("RESULT|"+JSON.stringify({main:h(movementMain),world:h(movementWorld),terrain:h(movementTerrain()),budgets:movementBudgets}));')
        self.assertEqual(values['main'],'1a709eae23b96d02d7359e98775458fcd8a97c92adc46a667566657e03dbfd8d')
        self.assertEqual(values['world'],'614964b356e649998aea9cd72cbef780f3aa087cc220117c585976d59e4df27d')
        self.assertEqual(values['terrain'],'a2bac027296c614e8bf036a350d5bc5e6e0db2605af8a51eb27a84fb0756f5f8')
        self.assertEqual(values['budgets'],runner.BUDGETS)

if __name__=='__main__':unittest.main()
