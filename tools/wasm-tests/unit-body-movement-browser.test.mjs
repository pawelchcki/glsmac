// Candidate-only normal move; zero physical controls, no pose/original oracle.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {test} from 'node:test';
import {BrowserLogCursor} from './browser-log-cursor.mjs';
import {installNativeLogHook} from './browser-native-log-hook.mjs';
import {attachRuntimeLogBarrier} from './runtime-fetch-barrier.mjs';
import {movementMain,movementWorld,movementTerrain,movementBudgets,movementBoundChild,movementTool,movementProfile,movementAssetServer} from './unit-body-movement-browser-fixture.mjs';
import {performance} from 'node:perf_hooks';

function bounded(operation,deadline,label){
  const remaining=deadline-performance.now();assert.ok(remaining>0,label+' deadline exceeded');
  let timer;return Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' deadline exceeded')),remaining);})]).finally(()=>clearTimeout(timer));
}

const root=fileURLToPath(new URL('../../',import.meta.url));
const scriptsRoot=process.env.WASM_SCRIPTS_ROOT||root;
const build=process.env.WASM_APP_DIR||`${root}build/wasm-release/bin`;
const assets=process.env.SMAC_ASSETS_DIR;
const artifacts=process.env.UNIT_BODY_MOVEMENT_ARTIFACTS_DIR||`${root}tools/wasm-tests/build/artifacts/unit-body-movement`;
const hash=value=>createHash('sha256').update(value).digest('hex');
const seed='1651011033:1377505029:3019448108:3247278135';

// Asset-free metadata helper. No runtime/server/browser entry occurs here.
export function movementDefaultScripts(source,pre){
  const directory=`${source}/GLSMAC_data/default`,pending=[directory],entries=[],files={};
  const top=lstatSync(directory);assert.ok(top.isDirectory()&&!top.isSymbolicLink());
  while(pending.length){
    const parent=pending.pop();
    for(const name of readdirSync(parent)){
      const path=`${parent}/${name}`,info=lstatSync(path);assert.ok(!info.isSymbolicLink(),'Symlinked Default input unsupported');
      if(info.isDirectory()){pending.push(path);continue;}
      assert.ok(info.isFile(),'Nonregular Default input unsupported');
      if(!name.endsWith('.gls.js'))continue;
      const key=path.slice(source.length+1),bytes=readFileSync(path),text=bytes.toString('utf8');
      assert.ok(Buffer.from(text,'utf8').equals(bytes),'Default input must be strict UTF8');
      files[key]={sha256:hash(bytes),mode:info.mode&0o111?'100755':'100644'};entries.push([key,text]);
    }
  }
  entries.sort(([a],[b])=>a<b?-1:a>b?1:0);
  const scripts=Object.fromEntries(entries);
  assert.deepEqual(files,pre.production_default_files,'Mounted Default inventory/bytes/modes differ from reviewed HEAD blobs');
  assert.equal(hash(JSON.stringify(scripts)),pre.production_default_sha256,'Mounted Default producer digest differs');
  return scripts;
}

test('one normal Scout move has actual intermediate body samples and guarded all-owner native effects',{
  skip:!assets&&'Requires installed assets and an explicitly exclusive candidate browser lease',timeout:movementBudgets.node_ms,
},async t=>{
  const preflightDigest=process.env.UNIT_BODY_MOVEMENT_PREFLIGHT_SHA256;
  const pre=movementProfile(process.env.UNIT_BODY_MOVEMENT_PREFLIGHT_PATH,preflightDigest);
  assert.equal(pre.host,resolve(scriptsRoot));assert.equal(pre.host,resolve(root));
  assert.equal(pre.web_shell,resolve(build));assert.equal(pre.assets,resolve(assets));assert.equal(pre.command[0],process.execPath);
  assert.equal(resolve(process.env.UNIT_BODY_MOVEMENT_PREFLIGHT_PATH),`${resolve(artifacts)}/preflight.json`);
  mkdirSync(artifacts,{recursive:true});
  const scripts=movementDefaultScripts(resolve(scriptsRoot),pre);
  const names=['_state_trace_observer','_terrain_trace_observer','_terraform_cooperation_observer'];
  const helpers=Object.fromEntries(names.map(name=>[name,readFileSync(`${scriptsRoot}/GLSMAC_data/tests/${name}.gls.js`,'utf8')]));
  const bootstrap=readFileSync(`${build}/bootstrap.js`,'utf8');
  const originalLogSource=bootstrap.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(originalLogSource);
  const runtime=readFileSync(`${build}/GLSMAC.js`,'utf8');
  for(const statement of ['if (Module["print"]) out = Module["print"];','if (Module["printErr"]) err = Module["printErr"];'])assert.ok(runtime.includes(statement));
  const setupChildren=[];
  const gitRead=async args=>{
    const result=await movementBoundChild(pre.tools.git,args,{cwd:scriptsRoot,timeout_ms:10000,signal:t.signal});
    setupChildren.push(result);appendFileSync(`${artifacts}/setup-processes.jsonl`,JSON.stringify(result)+'\n');
    assert.equal(result.tool_unchanged,true);assert.equal(result.error,null);assert.equal(result.spawned,true);assert.equal(result.wait_completed,true);
    assert.equal(result.timed_out,false);assert.equal(result.cancelled,false);assert.equal(result.output_limit,false);
    assert.equal(result.status,0,`Read-only Git failed: ${result.stderr}`);assert.equal(result.signal,null);
    return result.stdout;
  };
  const nativeSource=(await gitRead(['rev-parse','HEAD:src'])).trim();
  const defaultTree=(await gitRead(['rev-parse','HEAD:GLSMAC_data/default'])).trim();
  await gitRead(['diff','--exit-code','HEAD','--','src','GLSMAC_data/default']);
  assert.equal((await gitRead(['ls-files','--others','--exclude-standard','--','src','GLSMAC_data/default'])).trim(),'');
  assert.equal(nativeSource,pre.native_tree);assert.equal(defaultTree,pre.default_tree);
  const provenancePath=process.env.UNIT_BODY_MOVEMENT_RUNTIME_PROVENANCE;
  assert.ok(provenancePath,'An explicit reviewed immutable native-build provenance file is required');
  assert.equal(resolve(provenancePath),pre.runtime_provenance);
  const provenanceBytes=readFileSync(provenancePath),provenance=JSON.parse(provenanceBytes);
  assert.equal(hash(provenanceBytes),pre.runtime_provenance_sha256);
  assert.equal(hash(runtime),pre.runtime['GLSMAC.js']);assert.equal(hash(readFileSync(`${build}/GLSMAC.wasm`)),pre.runtime['GLSMAC.wasm']);
  assert.equal(provenance.source_tree,nativeSource);assert.equal(provenance.default_tree,defaultTree);
  assert.equal(provenance.runtime?.['GLSMAC.js'],hash(runtime));
  assert.equal(provenance.runtime?.['GLSMAC.wasm'],hash(readFileSync(`${build}/GLSMAC.wasm`)));
  const {chromium}=await import('playwright');
  const sourcePins=Object.fromEntries(['src/GLSMAC.cpp','src/game/frontend/Game.h','src/game/frontend/unit/UnitManager.h','src/game/frontend/unit/Unit.h','src/game/frontend/unit/Unit.cpp','src/game/frontend/unit/UnitDef.h','src/scene/actor/Instanced.h'].map(name=>[name,hash(readFileSync(`${scriptsRoot}/${name}`))]));
  const hostHead=(await gitRead(['rev-parse','HEAD'])).trim();assert.equal(hostHead,pre.head);
  const report={version:2,profile:'current-checkout',preflight_sha256:preflightDigest,tool_executables:pre.tools,
    runtime_binding:'metadata-consistent',independent_compile_proof_verified:false,fidelity_passing_cases:0,status:'running',candidate_executed:false,original_passing_cases:0,
    scope:'Sampled existing native billboard translation under one normal move, exact all-owner native delta; no GPU/pose/original claim',
    budgets:movementBudgets,native_watchdog_supported:false,
    runtime_sampling_trigger:'29 fixed positive-delay census callbacks plus sole accepted receipt',
    endpoint_gate:'strict offline two actual endpoint samples before first pending query',
    host_head:hostHead,setup_children:setupChildren,
    native_source_tree:nativeSource,observer_cpp_sha256:sourcePins,production_default_tree:defaultTree,runtime_provenance_sha256:hash(provenanceBytes),
    production_default_files:pre.production_default_files,production_default_sha256:hash(JSON.stringify(scripts)),runtime_js_sha256:hash(runtime),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`)),
    fixture_main_sha256:hash(movementMain),fixture_world_sha256:hash(movementWorld),observer_helpers_sha256:hash(JSON.stringify(helpers)),
    fixture_module_sha256:hash(readFileSync(new URL('unit-body-movement-browser-fixture.mjs',import.meta.url))),
    evaluator_sha256:hash(readFileSync(`${root}tools/behavior-tests/state_trace/unit_body_movement_proof.py`)),
    decoder_sha256:hash(readFileSync(`${root}tools/behavior-tests/state_trace/unit_body_census.py`)),
    shared_helpers_sha256:Object.fromEntries(['browser-log-cursor.mjs','browser-native-log-hook.mjs','runtime-fetch-barrier.mjs','terraform-browser-inputs.mjs'].map(name=>[name,hash(readFileSync(new URL(name,import.meta.url)))])),
    web_sha256:Object.fromEntries(['index.html','bootstrap.js','asset-store.js'].map(name=>[name,hash(readFileSync(`${build}/${name}`))])),
    native_log_configuration:{installations:0,hook_source_sha256:hash(installNativeLogHook.toString()),original_log_source_sha256:hash(originalLogSource)},
    declared_input:{seed,map:'source-declared16x16-contour60-flat10',map_bytes_sha256:hash(movementTerrain()),players:7,bases:7,units:9,stack_tile:[8,8],a_morale:2,b_morale:1,
      requests:['actual Native focus_owned_base readiness','actual Native tile select','ONE normal Native move_unit actual handles','32 read-only get_unit_body_census(game) calls'],physical_game_inputs:0,movement_actions:1,census_reads:32},
    unsupported:['GPU/map pixels or frame identity','native motion cadence/all ticks','gameplay facing','animation/limb/tool binding','original appearance/policy','cross-session continuity']};
  writeFileSync(`${artifacts}/fixture-main.gls.js`,movementMain);writeFileSync(`${artifacts}/fixture-world.gls.js`,movementWorld);
  const {child:server,command:serverCommand}=movementAssetServer(pre.tools.python,{web:pre.web_shell,assets:pre.assets,cwd:pre.host});
  report.asset_server_command=serverCommand;
  const serverDone=new Promise(resolve=>server.once('exit',(code,signal)=>{report.asset_server_exit={code,signal};resolve({code,signal});}));
  report.asset_server_pid=server.pid;
  writeFileSync(`${artifacts}/asset-server.stdout`,'');writeFileSync(`${artifacts}/asset-server.stderr`,'');
  server.stdout.on('data',data=>appendFileSync(`${artifacts}/asset-server.stdout`,data));
  server.stderr.on('data',data=>appendFileSync(`${artifacts}/asset-server.stderr`,data));
  const stopServer=async()=>{
    if(!server.pid||server.exitCode!==null||server.signalCode!==null)return;
    server.kill('SIGTERM');let timer;
    try{await Promise.race([serverDone,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Asset server did not stop')),5000);})]);}
    catch{server.kill('SIGKILL');await bounded(()=>serverDone,performance.now()+5000,'Asset server KILL wait');}finally{clearTimeout(timer);}
  };
  t.after(stopServer);
  const address=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error(`Asset server timeout: ${output}`)),60000);
    server.once('error',error=>{clearTimeout(timer);reject(error);});server.once('exit',code=>{clearTimeout(timer);reject(Error(`Asset server exited ${code}: ${output}`));});
    server.stderr.on('data',data=>{output+=data;});server.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  });
  const browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.stack||String(error)));page.on('crash',()=>errors.push('Chromium crashed'));
  const chunksPath=`${artifacts}/application-log-chunks.jsonl`;writeFileSync(chunksPath,'');
  const acquisition=[];
  const cursor=new BrowserLogCursor(page,packet=>{if(packet.text){const row={start_utf16:packet.start,end_utf16:packet.end,acquired_monotonic_ms:performance.now()};acquisition.push(row);appendFileSync(chunksPath,JSON.stringify({...row,text:packet.text})+'\n');}});
  let barrier=null;
  t.after(async()=>{
    let failure=null;
    cursor.beginClose();
    try{let timer;try{await Promise.race([cursor.finalRead(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Final log suffix timeout')),1000);})]);}finally{clearTimeout(timer);}}
    catch(error){report.log_capture_error=String(error);failure=error;}
    try{report.native_log_configuration.callbacks=await page.evaluate(()=>globalThis.__terraformNativeLogHook);}catch(error){report.hook_capture_error=String(error);failure??=error;}
    try{await browser.close();}catch(error){report.browser_close_error=String(error);failure??=error;}
    barrier?.stop();const producerClosed=!browser.isConnected();
    try{await stopServer();report.server_reaped=server.exitCode!==null||server.signalCode!==null;}catch(error){report.server_close_error=String(error);failure??=error;}
    const sealed=producerClosed?await cursor.seal():{text:cursor.text,reads:structuredClone(cursor.reads),failure:'Producer close failed; retained prefix only'};
    const joined=readFileSync(chunksPath,'utf8').split('\n').filter(Boolean).map(row=>JSON.parse(row).text).join('');
    report.log_transport={sealed:producerClosed,partial:true,raw_sha256:hash(sealed.text),joined_chunk_sha256:hash(joined),retained_utf8:Buffer.byteLength(sealed.text),reads:sealed.reads,settled_failure:sealed.failure};
    report.browser_errors=errors;writeFileSync(`${artifacts}/application.log`,sealed.text);
    try{
      movementTool(pre.tools.git);movementTool(pre.tools.python);
      movementDefaultScripts(resolve(scriptsRoot),pre);
      assert.ok(producerClosed);assert.equal(joined,sealed.text);assert.equal(sealed.failure,null);
      assert.equal(report.log_capture_error,undefined);assert.equal(report.hook_capture_error,undefined);assert.equal(report.browser_close_error,undefined);assert.deepEqual(errors,[]);
      assert.equal(report.native_raw_exit_code,0,'Actual native exit zero is required before any visible mismatch claim');
      const config=report.native_log_configuration;assert.equal(config.installations,1);assert.equal(config.barrier.continued,true);
      assert.equal(config.barrier.ack?.installed_before_runtime_capture,true);assert.equal(config.barrier.before_unmodified_runtime_response,true);
      assert.equal(config.worker_requests?.length,8);assert.equal(new Set(config.worker_requests.map(worker=>worker.target_id)).size,8);for(const worker of config.worker_requests)assert.equal(worker.continued,true);assert.ok(config.callbacks?.first_callback);
      assert.equal(config.callbacks.first_callback.runtime_out_bound,true);assert.equal(config.callbacks.first_callback.runtime_err_bound,true);assert.equal(config.callbacks.first_callback.runtime_callMain_present,true);
      assert.doesNotMatch(sealed.text,/Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i);
      const acceptance={native_exit_code:report.native_raw_exit_code,browser_closed:producerClosed,server_reaped:report.server_reaped,
        budgets:movementBudgets,native_watchdog_supported:false,observation_clock:report.observation_clock,acquisition,
        log:{sealed:producerClosed,partial:false,raw_sha256:hash(sealed.text),joined_chunk_sha256:hash(joined)},
        hook:{main_acknowledgements:config.barrier.continued&&config.barrier.ack.installed_before_runtime_capture?1:0,worker_acknowledgements:config.worker_requests.filter(worker=>worker.continued).length,
          runtime_out_bound:config.callbacks.first_callback.runtime_out_bound,runtime_err_bound:config.callbacks.first_callback.runtime_err_bound,runtime_callMain_present:config.callbacks.first_callback.runtime_callMain_present}};
      writeFileSync(`${artifacts}/receipt-acceptance.json`,JSON.stringify(acceptance,null,2)+'\n');
      const evaluation=await movementBoundChild(pre.tools.python,['-m','state_trace.unit_body_movement_proof',`${artifacts}/application.log`,`${artifacts}/receipt-acceptance.json`,`${artifacts}/movement-result.json`],
        {cwd:`${root}tools/behavior-tests`,timeout_ms:10000,signal:t.signal});
      writeFileSync(`${artifacts}/evaluator.stdout`,evaluation.stdout||'');writeFileSync(`${artifacts}/evaluator.stderr`,evaluation.stderr||'');
      report.evaluator_process=evaluation;report.evaluator_exit_code=evaluation.status;report.evaluator_signal=evaluation.signal;report.evaluator_error=evaluation.error?String(evaluation.error):null;
      assert.equal(evaluation.tool_unchanged,true);assert.equal(evaluation.spawned,true);assert.equal(evaluation.wait_completed,true);assert.equal(evaluation.timed_out,false);assert.equal(evaluation.cancelled,false);assert.equal(evaluation.output_limit,false);
      assert.equal(evaluation.status,0,`Complete native census invariant rejected: ${evaluation.stderr}`);
      const result=JSON.parse(readFileSync(`${artifacts}/movement-result.json`,'utf8'));assert.equal(result.complete,true);assert.equal(result.match,true);
      report.movement_result=result;report.native_complete=true;report.log_transport.partial=false;report.status='complete-native-movement-census-match';
    }catch(error){failure??=error;if(!report.native_complete)report.status=report.evaluator_exit_code!==undefined?'native-observation-rejected-by-invariant':'incomplete-or-unsupported';report.failure=String(error);}
    writeFileSync(`${artifacts}/report.json`,JSON.stringify(report,null,2)+'\n');if(failure)throw failure;
  });
  barrier=await attachRuntimeLogBarrier(page,browser,{runtimeURL:`${address}/GLSMAC.js`,bootstrapURL:`${address}/bootstrap.js`,originalLogSource,
    metadata:report.native_log_configuration,onError:error=>errors.push(String(error))});
  await page.goto(address);await page.waitForFunction(()=>document.body.dataset.state==='ready');
  const manifest=await(await page.request.get(`${address}/assets/manifest.json`)).json();report.manifest_id=manifest.id;
  assert.equal(manifest.id,'12743b42e275842a7ae3862572ec769c6d86f647394f0edb1ff9db6d104888e3','The declared installed assets must match before starting native execution');
  await page.locator('#custom-maps').setInputFiles({name:'unit-body-movement-arid.MP',mimeType:'application/octet-stream',buffer:movementTerrain()});await page.locator('#import-maps').click();
  await page.waitForFunction(()=>document.querySelector('#custom-map-list').textContent.includes('unit-body-movement-arid.MP'));
  await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  assert.deepEqual(movementDefaultScripts(resolve(scriptsRoot),pre),scripts);
  await page.evaluate(({scripts,helpers,main,world,seed})=>{
    for(const[name,source]of Object.entries(scripts)){const path=`/unit-body-snapshot/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}
    Module.FS.mkdirTree('/unit-body-snapshot/GLSMAC_data/tests');for(const[name,source]of Object.entries(helpers))Module.FS.writeFile(`/unit-body-snapshot/GLSMAC_data/tests/${name}.gls.js`,source);
    Module.FS.writeFile('/unit-body-snapshot/GLSMAC_data/default/browser_unit_body_census_main.gls.js',main);Module.FS.writeFile('/unit-body-snapshot/GLSMAC_data/default/game/world/unit_body_census.gls.js',world);
    const callMain=Module.callMain;Module.callMain=args=>callMain([...args,'--datapath','/unit-body-snapshot/GLSMAC_data','--mainscript','browser_unit_body_census_main','--worldscript','unit_body_census','--quickstart','--quickstart-seed',seed,'--quickstart-mapfile','/persist/glsmac/maps/unit-body-movement-arid.MP','--quickstart-faction','GAIANS']);
  },{scripts,helpers,main:movementMain,world:movementWorld,seed});
  const started=performance.now(),deadline=started+movementBudgets.observation_ms;
  report.observation_clock={start_ms:started,deadline_ms:deadline,exit_ms:null};
  report.candidate_executed=true;await bounded(()=>page.locator('#start').click({timeout:Math.max(1,deadline-performance.now())}),deadline,'Start dispatch');
  let partialLine='';
  while(true){
    const packet=await bounded(()=>cursor.read(),deadline,'Native log read'),fresh=partialLine+packet.text;
    assert.doesNotMatch(fresh,/UM_UNSUPPORTED|UM_ERROR|TRACE_UNSUPPORTED|Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i);
    partialLine=fresh.slice(fresh.lastIndexOf('\n')+1);assert.deepEqual(errors,[]);
    if(await bounded(()=>page.evaluate(()=>document.body.dataset.state==='exited'),deadline,'Exit status'))break;
    const remaining=deadline-performance.now();assert.ok(remaining>0,'Native fixture did not exit within the existing bounded observation window');
    await bounded(()=>page.waitForFunction(offset=>document.querySelector('#log').textContent.length>offset||document.body.dataset.state==='exited',cursor.text.length,{timeout:remaining}),deadline,'Native log wait');
  }
  assert.match(await bounded(()=>page.locator('#status').textContent(),deadline,'Native exit text'),/GLSMAC exited \(0\)/);report.native_raw_exit_code=0;
  report.observation_clock.exit_ms=performance.now();assert.ok(report.observation_clock.exit_ms<=deadline);
  await bounded(()=>cursor.read(),deadline,'Exited suffix'); // Capture the complete exited producer before the bounded final suffix read.
});
