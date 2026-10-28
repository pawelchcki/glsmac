// Candidate-only frontend consistency witness. No original selection/art oracle.
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {BrowserLogCursor} from './browser-log-cursor.mjs';
import {installNativeLogHook} from './browser-native-log-hook.mjs';
import {attachRuntimeLogBarrier} from './runtime-fetch-barrier.mjs';
import {declaredTerrain} from './terraform-browser-inputs.mjs';
import {bodyCensusMain,bodyCensusWorld} from './unit-body-census-browser-fixture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const scriptsRoot=process.env.WASM_SCRIPTS_ROOT||root;
const build=process.env.WASM_APP_DIR||`${root}build/wasm-release/bin`;
const assets=process.env.SMAC_ASSETS_DIR;
const artifacts=process.env.UNIT_BODY_CENSUS_ARTIFACTS_DIR||`${root}tools/wasm-tests/build/artifacts/unit-body-census`;
const hash=value=>createHash('sha256').update(value).digest('hex');
const seed='1651011033:1377505029:3019448108:3247278135';

test('actual cached unit bodies match two idle censuses and unchanged all-owner native worlds',{
  skip:!assets&&'Requires installed assets and an explicitly exclusive candidate browser lease',timeout:180000,
},async t=>{
  mkdirSync(artifacts,{recursive:true});
  const scripts=Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`,{recursive:true})
    .filter(name=>name.endsWith('.gls.js')).sort().map(name=>[`GLSMAC_data/default/${name}`,readFileSync(`${scriptsRoot}/GLSMAC_data/default/${name}`,'utf8')]));
  const names=['_state_trace_observer','_terrain_trace_observer','_terraform_cooperation_observer'];
  const helpers=Object.fromEntries(names.map(name=>[name,readFileSync(`${scriptsRoot}/GLSMAC_data/tests/${name}.gls.js`,'utf8')]));
  const bootstrap=readFileSync(`${build}/bootstrap.js`,'utf8');
  const originalLogSource=bootstrap.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(originalLogSource);
  const runtime=readFileSync(`${build}/GLSMAC.js`,'utf8');
  for(const statement of ['if (Module["print"]) out = Module["print"];','if (Module["printErr"]) err = Module["printErr"];'])assert.ok(runtime.includes(statement));
  const nativeSource=execFileSync('git',['rev-parse','HEAD:src'],{cwd:scriptsRoot,encoding:'utf8'}).trim();
  const defaultTree=execFileSync('git',['rev-parse','HEAD:GLSMAC_data/default'],{cwd:scriptsRoot,encoding:'utf8'}).trim();
  execFileSync('git',['diff','--exit-code','HEAD','--','src','GLSMAC_data/default'],{cwd:scriptsRoot});
  assert.equal(execFileSync('git',['ls-files','--others','--exclude-standard','--','src','GLSMAC_data/default'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),'');
  assert.equal(nativeSource,'23e54d08b7dbb00f6b42d325c180a8c868b30ee2');
  assert.equal(defaultTree,'a69dd4e0a9620f90bd12c8eb8636ca22e24ed47c');
  const provenancePath=process.env.UNIT_BODY_CENSUS_RUNTIME_PROVENANCE;
  assert.ok(provenancePath,'An explicit reviewed immutable native-build provenance file is required');
  const provenanceBytes=readFileSync(provenancePath),provenance=JSON.parse(provenanceBytes);
  assert.equal(provenance.source_tree,nativeSource);assert.equal(provenance.default_tree,defaultTree);
  assert.equal(provenance.runtime?.['GLSMAC.js'],hash(runtime));
  assert.equal(provenance.runtime?.['GLSMAC.wasm'],hash(readFileSync(`${build}/GLSMAC.wasm`)));
  const {chromium}=await import('playwright');
  const sourcePins=Object.fromEntries(['src/GLSMAC.cpp','src/game/frontend/Game.h','src/game/frontend/unit/UnitManager.h','src/game/frontend/unit/Unit.h','src/game/frontend/unit/Unit.cpp','src/game/frontend/unit/UnitDef.h','src/scene/actor/Instanced.h'].map(name=>[name,hash(readFileSync(`${scriptsRoot}/${name}`))]));
  const report={version:1,status:'running',candidate_executed:false,original_passing_cases:0,
    scope:'Static cached body resource/instance/normalized Float32 identity, unchanged all-owner worlds; no GPU or motion claim',
    host_head:execFileSync('git',['rev-parse','HEAD'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    native_source_tree:nativeSource,observer_cpp_sha256:sourcePins,production_default_tree:defaultTree,runtime_provenance_sha256:hash(provenanceBytes),
    production_default_sha256:hash(JSON.stringify(scripts)),runtime_js_sha256:hash(runtime),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`)),
    fixture_main_sha256:hash(bodyCensusMain),fixture_world_sha256:hash(bodyCensusWorld),observer_helpers_sha256:hash(JSON.stringify(helpers)),
    fixture_module_sha256:hash(readFileSync(new URL('unit-body-census-browser-fixture.mjs',import.meta.url))),
    evaluator_sha256:hash(readFileSync(`${root}tools/behavior-tests/state_trace/unit_body_census_proof.py`)),
    decoder_sha256:hash(readFileSync(`${root}tools/behavior-tests/state_trace/unit_body_census.py`)),
    shared_helpers_sha256:Object.fromEntries(['browser-log-cursor.mjs','browser-native-log-hook.mjs','runtime-fetch-barrier.mjs','terraform-browser-inputs.mjs'].map(name=>[name,hash(readFileSync(new URL(name,import.meta.url)))])),
    web_sha256:Object.fromEntries(['index.html','bootstrap.js','asset-store.js'].map(name=>[name,hash(readFileSync(`${build}/${name}`))])),
    native_log_configuration:{installations:0,hook_source_sha256:hash(installNativeLogHook.toString()),original_log_source_sha256:hash(originalLogSource)},
    declared_input:{seed,map:'source-declared16x16-arid',players:7,bases:7,units:9,stack_tile:[8,8],a_morale:2,b_morale:1,
      requests:['actual Native focus_owned_base readiness','actual Native tile select','two synchronous read-only get_unit_body_census(game) calls'],physical_game_inputs:0,movement_actions:0,census_reads:2},
    unsupported:['GPU/map pixels or frame identity','movement/cadence','gameplay facing','animation/limb/tool binding','original appearance/policy','cross-session continuity']};
  writeFileSync(`${artifacts}/fixture-main.gls.js`,bodyCensusMain);writeFileSync(`${artifacts}/fixture-world.gls.js`,bodyCensusWorld);
  const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});
  const serverDone=new Promise(resolve=>server.once('exit',(code,signal)=>{report.asset_server_exit={code,signal};resolve({code,signal});}));
  report.asset_server_pid=server.pid;
  writeFileSync(`${artifacts}/asset-server.stdout`,'');writeFileSync(`${artifacts}/asset-server.stderr`,'');
  server.stdout.on('data',data=>appendFileSync(`${artifacts}/asset-server.stdout`,data));
  server.stderr.on('data',data=>appendFileSync(`${artifacts}/asset-server.stderr`,data));
  const stopServer=async()=>{
    if(!server.pid||server.exitCode!==null||server.signalCode!==null)return;
    server.kill('SIGTERM');let timer;
    try{await Promise.race([serverDone,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Asset server did not stop')),5000);})]);}
    catch{server.kill('SIGKILL');await serverDone;}finally{clearTimeout(timer);}
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
  const cursor=new BrowserLogCursor(page,packet=>{if(packet.text)appendFileSync(chunksPath,JSON.stringify({start_utf16:packet.start,end_utf16:packet.end,text:packet.text})+'\n');});
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
      assert.ok(producerClosed);assert.equal(joined,sealed.text);assert.equal(sealed.failure,null);
      assert.equal(report.log_capture_error,undefined);assert.equal(report.hook_capture_error,undefined);assert.equal(report.browser_close_error,undefined);assert.deepEqual(errors,[]);
      assert.equal(report.native_raw_exit_code,0,'Actual native exit zero is required before any visible mismatch claim');
      const config=report.native_log_configuration;assert.equal(config.installations,1);assert.equal(config.barrier.continued,true);
      assert.equal(config.barrier.ack?.installed_before_runtime_capture,true);assert.equal(config.barrier.before_unmodified_runtime_response,true);
      assert.equal(config.worker_requests?.length,8);assert.equal(new Set(config.worker_requests.map(worker=>worker.target_id)).size,8);for(const worker of config.worker_requests)assert.equal(worker.continued,true);assert.ok(config.callbacks?.first_callback);
      assert.equal(config.callbacks.first_callback.runtime_out_bound,true);assert.equal(config.callbacks.first_callback.runtime_err_bound,true);assert.equal(config.callbacks.first_callback.runtime_callMain_present,true);
      assert.doesNotMatch(sealed.text,/Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i);
      const acceptance={native_exit_code:report.native_raw_exit_code,browser_closed:producerClosed,server_reaped:report.server_reaped,
        log:{sealed:producerClosed,partial:false,raw_sha256:hash(sealed.text),joined_chunk_sha256:hash(joined)},
        hook:{main_acknowledgements:config.barrier.continued&&config.barrier.ack.installed_before_runtime_capture?1:0,worker_acknowledgements:config.worker_requests.filter(worker=>worker.continued).length,
          runtime_out_bound:config.callbacks.first_callback.runtime_out_bound,runtime_err_bound:config.callbacks.first_callback.runtime_err_bound,runtime_callMain_present:config.callbacks.first_callback.runtime_callMain_present}};
      writeFileSync(`${artifacts}/receipt-acceptance.json`,JSON.stringify(acceptance,null,2)+'\n');
      const evaluation=spawnSync('python3',['-m','state_trace.unit_body_census_proof',`${artifacts}/application.log`,`${artifacts}/receipt-acceptance.json`,`${artifacts}/census-result.json`],
        {cwd:`${root}tools/behavior-tests`,encoding:'utf8',timeout:10000});
      writeFileSync(`${artifacts}/evaluator.stdout`,evaluation.stdout||'');writeFileSync(`${artifacts}/evaluator.stderr`,evaluation.stderr||'');
      report.evaluator_exit_code=evaluation.status;report.evaluator_signal=evaluation.signal;report.evaluator_error=evaluation.error?String(evaluation.error):null;
      assert.equal(evaluation.status,0,`Complete native census invariant rejected: ${evaluation.stderr}`);
      const result=JSON.parse(readFileSync(`${artifacts}/census-result.json`,'utf8'));assert.equal(result.complete,true);assert.equal(result.match,true);
      report.census_result=result;report.native_complete=true;report.log_transport.partial=false;report.status='complete-native-static-census-match';
    }catch(error){failure??=error;if(!report.native_complete)report.status=report.evaluator_exit_code!==undefined?'native-observation-rejected-by-invariant':'incomplete-or-unsupported';report.failure=String(error);}
    writeFileSync(`${artifacts}/report.json`,JSON.stringify(report,null,2)+'\n');if(failure)throw failure;
  });
  barrier=await attachRuntimeLogBarrier(page,browser,{runtimeURL:`${address}/GLSMAC.js`,bootstrapURL:`${address}/bootstrap.js`,originalLogSource,
    metadata:report.native_log_configuration,onError:error=>errors.push(String(error))});
  await page.goto(address);await page.waitForFunction(()=>document.body.dataset.state==='ready');
  const manifest=await(await page.request.get(`${address}/assets/manifest.json`)).json();report.manifest_id=manifest.id;
  assert.equal(manifest.id,'12743b42e275842a7ae3862572ec769c6d86f647394f0edb1ff9db6d104888e3','The declared installed assets must match before starting native execution');
  await page.locator('#custom-maps').setInputFiles({name:'unit-body-census-arid.MP',mimeType:'application/octet-stream',buffer:declaredTerrain()});await page.locator('#import-maps').click();
  await page.waitForFunction(()=>document.querySelector('#custom-map-list').textContent.includes('unit-body-census-arid.MP'));
  await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts,helpers,main,world,seed})=>{
    for(const[name,source]of Object.entries(scripts)){const path=`/unit-body-snapshot/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}
    Module.FS.mkdirTree('/unit-body-snapshot/GLSMAC_data/tests');for(const[name,source]of Object.entries(helpers))Module.FS.writeFile(`/unit-body-snapshot/GLSMAC_data/tests/${name}.gls.js`,source);
    Module.FS.writeFile('/unit-body-snapshot/GLSMAC_data/default/browser_unit_body_census_main.gls.js',main);Module.FS.writeFile('/unit-body-snapshot/GLSMAC_data/default/game/world/unit_body_census.gls.js',world);
    const callMain=Module.callMain;Module.callMain=args=>callMain([...args,'--datapath','/unit-body-snapshot/GLSMAC_data','--mainscript','browser_unit_body_census_main','--worldscript','unit_body_census','--quickstart','--quickstart-seed',seed,'--quickstart-mapfile','/persist/glsmac/maps/unit-body-census-arid.MP','--quickstart-faction','GAIANS']);
  },{scripts,helpers,main:bodyCensusMain,world:bodyCensusWorld,seed});
  report.candidate_executed=true;await page.locator('#start').click();
  const deadline=performance.now()+120000;let partialLine='';
  while(true){
    const packet=await cursor.read(),fresh=partialLine+packet.text;
    assert.doesNotMatch(fresh,/UB_UNSUPPORTED|UB_ERROR|Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i);
    partialLine=fresh.slice(fresh.lastIndexOf('\n')+1);assert.deepEqual(errors,[]);
    if(await page.evaluate(()=>document.body.dataset.state==='exited'))break;
    const remaining=deadline-performance.now();assert.ok(remaining>0,'Native fixture did not exit within the existing bounded observation window');
    await page.waitForFunction(offset=>document.querySelector('#log').textContent.length>offset||document.body.dataset.state==='exited',cursor.text.length,{timeout:remaining});
  }
  assert.match(await page.locator('#status').textContent(),/GLSMAC exited \(0\)/);report.native_raw_exit_code=0;
  await cursor.read(); // Capture the complete exited producer before the bounded final suffix read.
});
