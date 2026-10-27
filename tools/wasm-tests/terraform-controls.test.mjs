// Installed-data application proof, separate from original visual agreement.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {fixtureSources} from './terraform-browser-inputs.mjs';
import {TerraformGeometry,nativeToCanvas} from './terraform-browser-geometry.mjs';
import {BrowserLogCursor} from './browser-log-cursor.mjs';
import {completedNativeClick,nativeHover} from './terraform-browser-pointer.mjs';
import {installNativeLogHook} from './browser-native-log-hook.mjs';
import {attachRuntimeLogBarrier} from './runtime-fetch-barrier.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scriptsRoot = process.env.WASM_SCRIPTS_ROOT || root;
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = process.env.TERRAFORM_CONTROLS_ARTIFACTS_DIR || `${root}tools/wasm-tests/build/artifacts/terraform-controls`;
const hash = value => createHash('sha256').update(value).digest('hex');
const initialSeed='1651011033:1377505029:3019448108:3247278135';

function terrain() {
  const width=16, height=16, count=width*height/2, offset=15+0xaa4;
  const aw=Math.ceil(width/5), ah=Math.ceil(height/5), ac=Math.floor((aw+1)/2)*ah;
  const bytes=Buffer.alloc(offset+count*44+ac);
  bytes.write('TERRANMAP\0\x1a',0,'binary'); bytes.writeUInt32LE(5,11);
  for (const [at,value] of [[0,width],[4,height],[20,count],[0xa24,aw],[0xa28,ah],[0xa2c,ac]]) bytes.writeUInt32LE(value,15+at);
  for (let i=0;i<count;++i) { bytes[offset+i*44]=96; bytes[offset+i*44+1]=64; }
  return bytes;
}

const {world,main}=fixtureSources(scriptsRoot,{water:false});

test('complete Terraform menu and actual target pointer lifecycle preserve seven-owner world', {
  skip: !assets && 'Requires installed SMAC assets', timeout: 180000,
}, async t => {
  mkdirSync(artifacts,{recursive:true});
  const scripts=Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`,{recursive:true}).filter(n=>n.endsWith('.gls.js')).sort()
    .map(n=>[`GLSMAC_data/default/${n}`,readFileSync(`${scriptsRoot}/GLSMAC_data/default/${n}`,'utf8')]));
  // Diagnostic overlay only: preserve uninstrumented product fingerprints,
  // then observe the existing root handler without replacing any input path.
  const originalScriptsHash=hash(JSON.stringify(scripts));
  const diagnosticPath='GLSMAC_data/default/ui/parts/game/game.gls.js';
  const originalRoot=scripts[diagnosticPath];
  const rootDiagnosticEnabled=process.env.TERRAFORM_ROOT_DIAGNOSTIC==='1';
  if(rootDiagnosticEnabled){
  const registry=`const terraform_browser_registry = () => {
    const local_preview = p.modules.bottom_bar.pp.sections.object_preview;
    const root_present = #is_defined(p.modules.terraforming_target);
    const child_present = #is_defined(p.modules.bottom_bar.pp.modules.terraforming_target);
    const target = local_preview.terraforming_target;
    return {root_present:root_present,child_present:child_present,
      root_type:#typeof(p.modules.terraforming_target),child_type:#typeof(p.modules.bottom_bar.pp.modules.terraforming_target),
      preview_active:target.is_active(),root_active:root_present ? p.modules.terraforming_target.is_active() : null,
      root_is_preview:root_present ? p.modules.terraforming_target == target : null,
      child_is_preview:child_present ? p.modules.bottom_bar.pp.modules.terraforming_target == target : null,
      selected:local_preview.selected_unit_id,modal:p.modules.popup.is_shown()};
   };
   #print('TF_DIAGNOSTIC_REGISTRY|' + #json_text_exact(terraform_browser_registry()));
   `;
  const rootMarker="m.root.on('keydown', (e) => {";assert.equal(originalRoot.split(rootMarker).length,2);
  scripts[diagnosticPath]=originalRoot.replace(rootMarker,registry+rootMarker+`
    if (e.code == 'ESCAPE' || e.code == 'TAB') {
     #print('TF_DIAGNOSTIC_ROOT_KEY|' + #json_text_exact({code:e.code,modifiers:e.modifiers,registry:terraform_browser_registry()}));
    }
   `);
  const cancelMarker='p.modules.terraforming_target.cancel(); return true;';assert.equal(scripts[diagnosticPath].split(cancelMarker).length,2);
  scripts[diagnosticPath]=scripts[diagnosticPath].replace(cancelMarker,"p.modules.terraforming_target.cancel(); #print('TF_DIAGNOSTIC_ROOT_AFTER|' + #json_text_exact(terraform_browser_registry())); return true;");
  const quitMarker='p.maybe_quit(true);';assert.equal(scripts[diagnosticPath].split(quitMarker).length,2);
  scripts[diagnosticPath]=scripts[diagnosticPath].replace(quitMarker,"p.maybe_quit(true); #print('TF_DIAGNOSTIC_ROOT_AFTER|' + #json_text_exact(terraform_browser_registry()));");
  }
  writeFileSync(`${artifacts}/diagnostic-root-original.gls.js`,originalRoot);
  writeFileSync(`${artifacts}/diagnostic-root-overlay.gls.js`,scripts[diagnosticPath]);
  const observer=readFileSync(`${scriptsRoot}/GLSMAC_data/tests/_state_trace_observer.gls.js`,'utf8');
  const terrainObserver=readFileSync(`${scriptsRoot}/GLSMAC_data/tests/_terrain_trace_observer.gls.js`,'utf8');
  const cooperationObserver=readFileSync(`${scriptsRoot}/GLSMAC_data/tests/_terraform_cooperation_observer.gls.js`,'utf8');
  const bootstrapSource=readFileSync(`${build}/bootstrap.js`,'utf8');
  const originalLogSource=bootstrapSource.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(originalLogSource);
  const runtimeSource=readFileSync(`${build}/GLSMAC.js`,'utf8');
  const printCapture='if (Module["print"]) out = Module["print"];',errorCapture='if (Module["printErr"]) err = Module["printErr"];';
  assert.ok(runtimeSource.includes(printCapture)&&runtimeSource.includes(errorCapture),'Pinned runtime must capture existing Module print configuration');
  const report={version:1,scope:'source-declared Terraform controls and native pointer target application invariants',
    original_visual_agreement:'unsupported', original_passing_cases:0,
    candidate_executed:false,status:'running',
    host_head:execFileSync('git',['rev-parse','HEAD'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    native_source_tree:execFileSync('git',['rev-parse','HEAD:src'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    initial_seed_requested:initialSeed,seed_binding:'existing Game.Start quickstart-seed path; no public live RNG-state getter',
    scripts_sha256:hash(JSON.stringify(scripts)),original_production_scripts_sha256:originalScriptsHash,diagnostic_overlay:{enabled:rootDiagnosticEnabled,path:diagnosticPath,before_sha256:hash(originalRoot),after_sha256:hash(scripts[diagnosticPath])},runtime_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`)),
    runtime_js_sha256:hash(readFileSync(`${build}/GLSMAC.js`)),
    fixture_sha256:hash(world+main+observer+terrainObserver+cooperationObserver),
    scripts_root:scriptsRoot,fixture_sources:{world:hash(world),main:hash(main),state_observer:hash(observer),terrain_observer:hash(terrainObserver),cooperation_observer:hash(cooperationObserver)},
    declared_input:{world:'all-seven nonempty controlled16x16',normal_policy:'default-ignore-technologies',source_rates:'unchanged-installed',unit_ownership:'actual-local-native-player'},native_snapshots:[],
    web_sha256:Object.fromEntries(['index.html','bootstrap.js','asset-store.js'].map(name=>[name,hash(readFileSync(`${build}/${name}`))])),
    component_sha256:hash(readFileSync(`${assets}/VT.cvr`)), captures:[],
    native_log_configuration:{scope:'test-only existing Module print configuration',debug_autoscroll:'unsupported',hook_source_sha256:hash(installNativeLogHook.toString()),original_log_source_sha256:hash(originalLogSource),runtime_capture_statements:[printCapture,errorCapture],installations:0}};
  const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});
  t.after(()=>server.kill());
  const address=await new Promise((resolve,reject)=>{
    let log=''; const timer=setTimeout(()=>reject(Error(`Asset server timeout: ${log}`)),60000);
    server.stderr.on('data',d=>{log+=d;}); server.once('error',reject);
    server.once('exit',code=>{clearTimeout(timer);reject(Error(`Asset server exited ${code}: ${log}`));});
    server.stdout.on('data',data=>{const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  });
  const browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1100,height:1000}}); page.setDefaultTimeout(60000);
  const logChunksPath=`${artifacts}/application-log-chunks.jsonl`;
  writeFileSync(logChunksPath,'');
  const logCursor=new BrowserLogCursor(page,packet=>{
    // JSON string escaping preserves even a UTF-16 surrogate split across
    // reads. These are lossless raw-text chunks, not reconstructed packets.
    if(packet.text)appendFileSync(logChunksPath,JSON.stringify({start_utf16:packet.start,end_utf16:packet.end,text:packet.text})+'\n');
  });
  await page.addInitScript(()=>{
    window.__terraformDomReceipt={events:[],dropped:0};
    for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
      const receipt=window.__terraformDomReceipt;
      if(receipt.events.length>=512){receipt.dropped++;return;}
      receipt.events.push({type,key:event.key,code:event.code,keyCode:event.keyCode,ctrl:event.ctrlKey,alt:event.altKey,shift:event.shiftKey,meta:event.metaKey,
        repeat:event.repeat,isTrusted:event.isTrusted,defaultPrevented:event.defaultPrevented,phase:'capture',timestamp:event.timeStamp,
        target:{tag:event.target?.tagName??null,id:event.target?.id??null},activeElement:{tag:document.activeElement?.tagName??null,id:document.activeElement?.id??null},
        documentFocus:document.hasFocus(),visibility:document.visibilityState});
    },{capture:true,passive:true});
  });
  const errors=[];report.navigation_timeline=[];
  const runtimeBarrier=await attachRuntimeLogBarrier(page,browser,{runtimeURL:`${address}/GLSMAC.js`,bootstrapURL:`${address}/bootstrap.js`,originalLogSource,metadata:report.native_log_configuration,onError:error=>errors.push(String(error))});
  const navigation=(kind,url)=>report.navigation_timeline.push({kind,url,observed_node_ms:performance.now()});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigation('main-frame-navigated',frame.url());});
  page.on('requestfailed',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())report.navigation_timeline.push({kind:'main-frame-request-failed',url:request.url(),failure:request.failure(),observed_node_ms:performance.now()});});
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigation('main-frame-navigation-request',request.url());});
  page.on('pageerror',error=>{errors.push(error.stack||String(error));navigation('page-error',page.url());});page.on('crash',()=>errors.push('Chromium crashed'));
  t.after(async()=>{try{if(report.status!=='passed')report.status='failed-or-incomplete';report.browser_errors=errors;
    logCursor.beginClose();
    try{let timer;try{await Promise.race([logCursor.finalRead(),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Final browser log suffix read timed out')),1000);})]);}finally{clearTimeout(timer);}}
    catch(error){report.log_capture_error=String(error);report.status='failed-or-incomplete';}
    try{report.dom_key_receipts=await page.evaluate(()=>window.__terraformDomReceipt);}catch(error){report.dom_capture_error=String(error);}
    try{report.native_log_configuration.callbacks=await page.evaluate(()=>globalThis.__terraformNativeLogHook);report.native_log_configuration.callback_metadata_partial=report.status!=='passed';}catch(error){report.native_log_configuration.capture_error=String(error);}
    if(report.status!=='passed'){try{await page.locator('#canvas').screenshot({path:`${artifacts}/failed-frame.png`,timeout:1000});}catch(error){report.frame_capture_error=String(error);}}
    try{await browser.close();}catch(error){report.browser_close_error=String(error);report.status='failed-or-incomplete';}
    runtimeBarrier.stop();
    const producerClosed=!browser.isConnected();
    const frozen=producerClosed?await logCursor.seal():{text:logCursor.text,reads:structuredClone(logCursor.reads),failure:'Producer close failed; prefix only'};
    const chunks=readFileSync(logChunksPath,'utf8').split('\n').filter(Boolean).map(row=>JSON.parse(row));
    const joined=chunks.map(row=>row.text).join('');
    if(producerClosed)assert.equal(joined,frozen.text,'Sealed raw text must equal every final received chunk');
    writeFileSync(`${artifacts}/application.log`,frozen.text);
    report.log_transport={offset_unit:'UTF-16-code-units',raw_chunk_file:'application-log-chunks.jsonl',sealed:producerClosed,partial:!!report.log_capture_error||report.status!=='passed'||!producerClosed,unread_tail:report.status!=='passed'?'unknown; application exit or final read failed':false,retained_utf16:frozen.text.length,retained_utf8:Buffer.byteLength(frozen.text,'utf8'),raw_sha256:hash(frozen.text),chunk_count:chunks.length,joined_chunk_sha256:hash(joined),reads:frozen.reads,settled_read_failure:frozen.failure};
    report.diagnostic_root_records=frozen.text.split('\n').filter(line=>line.includes('TF_DIAGNOSTIC_REGISTRY|')||line.includes('TF_DIAGNOSTIC_ROOT_KEY|')||line.includes('TF_DIAGNOSTIC_ROOT_AFTER|'));
    let verificationError;
    try{
      assert.equal(report.browser_close_error,undefined,'Producer closure must complete before artifact sealing');
      assert.equal(report.log_capture_error,undefined,'A successful browser proof requires its final raw log suffix');
      if(report.status==='passed'){
        assert.deepEqual(errors,[],'Late browser/barrier errors cannot leave a passing artifact');
        assert.equal(report.native_log_configuration.installations,1);
        assert.equal(report.native_log_configuration.barrier.continued,true,'Actual main runtime response must acknowledge continuation');
        assert.ok(report.native_log_configuration.worker_requests?.some(row=>row.continued===true),'At least one actual pthread runtime continuation must acknowledge success');
        assert.ok(report.native_log_configuration.callbacks?.first_callback,'Actual runtime callback must exercise the configured sink');
        assert.equal(report.native_log_configuration.callbacks.first_callback.runtime_out_bound,true);
        assert.equal(report.native_log_configuration.callbacks.first_callback.runtime_err_bound,true);
      }
    }catch(error){verificationError=error;report.final_artifact_verification_error=String(error);report.status='failed-or-incomplete';}
    writeFileSync(`${artifacts}/report.json`,JSON.stringify(report,null,2)+'\n');
    if(verificationError)throw verificationError;
  }finally{if(browser.isConnected())await browser.close();}});
  const fatal=/TF_ERROR|Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i;
  let fatalLineTail='';
  const log=async()=>{const packet=await logCursor.read();const freshText=fatalLineTail+packet.text;assert.doesNotMatch(freshText,fatal);fatalLineTail=freshText.slice(freshText.lastIndexOf('\n')+1);assert.deepEqual(errors,[]);return logCursor.text;};
  const waitLog=async marker=>{await page.waitForFunction(({marker,fatal})=>document.querySelector('#log').textContent.includes(marker)||new RegExp(fatal).test(document.querySelector('#log').textContent)||document.body.dataset.state==='failed',{marker,fatal:fatal.source});
    await log();};
  await page.goto(address); await page.waitForFunction(()=>['ready','failed'].includes(document.body.dataset.state));assert.deepEqual(errors,[]);assert.equal(await page.locator('body').getAttribute('data-state'),'ready');
  const manifest=await (await page.request.get(`${address}/assets/manifest.json`)).json();
  const entry=manifest.files.find(row=>row.path==='VT.cvr'); assert.ok(entry,'Real manifest must include the CVR resource');
  assert.equal(entry.sha256,report.component_sha256); report.manifest_id=manifest.id;
  await page.locator('#custom-maps').setInputFiles({name:'cvr-arid.MP',mimeType:'application/octet-stream',buffer:terrain()});
  await page.locator('#import-maps').click();
  await page.waitForFunction(()=>document.querySelector('#custom-map-list').textContent.includes('cvr-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  // Mount only application scripts and the synthetic world. CVR bytes enter
  // exclusively through the normal remote manifest/bridge/VFS product flow.
  await page.evaluate(({scripts,main,world,observer,terrainObserver,cooperationObserver,initialSeed})=>{
    for(const [name,source] of Object.entries(scripts)){const path=`/cvr-snapshot/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}
    Module.FS.mkdirTree('/cvr-snapshot/GLSMAC_data/tests');
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/tests/_state_trace_observer.gls.js',observer);
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/tests/_terrain_trace_observer.gls.js',terrainObserver);
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/tests/_terraform_cooperation_observer.gls.js',cooperationObserver);
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/default/browser_cvr_main.gls.js',main);
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/default/game/world/browser_cvr.gls.js',world);
    const callMain=Module.callMain;
    Module.callMain=args=>callMain([...args,'--datapath','/cvr-snapshot/GLSMAC_data','--mainscript','browser_cvr_main','--worldscript','browser_cvr',
      '--quickstart','--quickstart-seed',initialSeed,'--quickstart-mapfile','/persist/glsmac/maps/cvr-arid.MP','--quickstart-faction','GAIANS']);
  },{scripts,main,world,observer,terrainObserver,cooperationObserver,initialSeed});
  report.candidate_executed=true; await page.locator('#start').click(); await waitLog('TF_READY');
  let freshFence=null;
  const fresh=async(prefix,action)=>{const before=(await log()).length;const tail=fatalLineTail;freshFence={marker:prefix,log_offset:before,observed_node_ms:performance.now()};await action();await page.waitForFunction(({before,prefix,fatal,tail})=>{const suffix=document.querySelector('#log').textContent.slice(before);return suffix.includes(prefix)||new RegExp(fatal).test(tail+suffix);},{before,prefix,fatal:fatal.source,tail});return(await log()).slice(before);};
  const lines=(text,prefix)=>text.split('\n').filter(line=>line.includes(prefix)).map(line=>line.slice(line.indexOf(prefix)+prefix.length).trim());
  const geometry=new TerraformGeometry();report.input_ledger={enabled:true,dropped:0,events:[]};let traceCursor=0;
  const collect=text=>{
    const complete=text.lastIndexOf('\n')+1;
    for(const line of text.slice(traceCursor,complete).split('\n')){
      const found=line.match(/^\s*(?:\[[^\]]+\]\s*)?(TF_INPUT|TF_DIAGNOSTIC_TRACE)\|(.+)$/);
      if(found){const packet=JSON.parse(JSON.parse(found[2]));geometry.ingest(packet);report.input_ledger.events.push(...packet.events);}
    }
    traceCursor=complete;
  };
  const drain=async()=>{const before=report.input_ledger.events.length;await fresh('TF_INPUT|',()=>page.keyboard.press('Control+Alt+i'));collect(await log());return{enabled:true,dropped:0,events:report.input_ledger.events.slice(before)};};
  const processedKey=async(code,modifiers,fence)=>{
    const deadline=performance.now()+60000;
    while(performance.now()<deadline){
      const text=await log();collect(text);
      const begin=report.input_ledger.events.find(e=>e.seq>fence&&e.kind==='input.dispatch'&&e.data.phase==='begin'&&e.data.type==='keydown'&&e.data.code===code&&e.data.modifiers===modifiers);
      const end=begin&&report.input_ledger.events.find(e=>e.seq>begin.seq&&e.kind==='input.dispatch'&&e.data.phase==='end'&&e.data.ingress===begin.data.ingress);
      if(end){const receipt={begin,end,observed_node_ms:performance.now()};report.processed_keys??=[];report.processed_keys.push(receipt);return receipt;}
      const remaining=deadline-performance.now();assert.ok(remaining>0,'Actual native key processing must finish inside existing budget');
      await page.waitForFunction(length=>document.querySelector('#log').textContent.length>length,text.length,{timeout:remaining});
    }
    assert.fail(`Native ${code} did not produce its actual completed dispatch`);
  };
  const state=async(receipt,pointer)=>{const text=await fresh('TF_STATE|',async()=>{});const line=lines(text,'TF_STATE|').at(-1);const serial=Number(line.slice(0,line.indexOf('|')));const value=JSON.parse(line.slice(line.indexOf('|')+1));
    report.state_queries??=[];report.state_queries.push({observer_serial:serial,query_fence:structuredClone(freshFence),after_native_key:receipt?{ingress:receipt.begin.data.ingress,code:receipt.begin.data.code,modifiers:receipt.begin.data.modifiers,dispatch_end_sequence:receipt.end.seq}:null,after_native_pointer:pointer?{ingress:pointer.up.data.ingress,x:pointer.up.data.x,y:pointer.up.data.y,button:pointer.up.data.button,dispatch_end_sequence:pointer.end.seq}:null,value});return value;};
  const keyState=async(shortcut,code,modifiers)=>{collect(await log());const fence=geometry.sequence;await page.keyboard.press(shortcut);const receipt=await processedKey(code,modifiers,fence);return state(receipt);};
  const snapshot=async checkpoint=>{const text=await fresh('TF_NATIVE|',()=>page.keyboard.press('Control+Alt+p'));const value=JSON.parse(lines(text,'TF_NATIVE|').at(-1));report.native_snapshots.push({checkpoint,value});return value;};
  const nativeOnly=value=>{const copy=structuredClone(value);delete copy.terrain_trace.ui;return copy;};
  const point=async(x,y)=>{const box=await page.locator('#canvas').boundingBox();const result=nativeToCanvas(x,y,report.native_viewport,box);report.pointer_conversions??=[];report.pointer_conversions.push({native:{x,y},viewport:structuredClone(report.native_viewport),canvas_css_rect:box,css:result});return result;};
  let lastPointerReceipt=null;
  const click=async(x,y,semantic)=>{
    collect(await log());const fence=geometry.sequence;const p=await point(x,y);const deadline=performance.now()+60000;
    const target=semantic??{x,y};
    const hitNodes=semantic?[...geometry.nodes.keys()].filter(id=>{
      const seen=new Set();while(id!=null&&!seen.has(id)){if(id===semantic.id)return true;seen.add(id);id=geometry.nodes.get(id)?.parent;}return false;
    }):[];
    const awaitNative=async(probe,label)=>{
      while(performance.now()<deadline){
        const text=await log();collect(text);const receipt=probe();if(receipt)return receipt;
        const remaining=deadline-performance.now();assert.ok(remaining>0,`${label} must complete within the existing budget`);
        await page.waitForFunction(length=>document.querySelector('#log').textContent.length>length,text.length,{timeout:remaining});
      }
      assert.fail(`${label} did not produce its actual native receipt`);
    };
    // Playwright click already emits move/down/up. Fence that SAME move while
    // the semantic row is live, before SDL coalescing can defer it past click.
    await page.mouse.move(p.x,p.y);
    const hover=semantic?await awaitNative(()=>nativeHover(report.input_ledger.events,fence,hitNodes,semantic.bounds),'Intended native hover'):null;
    assert.equal(logCursor.phase,'open','Closed proof must not issue further pointer input');
    await page.mouse.down({button:'left'});await page.mouse.up({button:'left'});
    const receipt=await awaitNative(()=>completedNativeClick(report.input_ledger.events,fence,target),'Native left mouseup dispatch');
    receipt.hover=hover;receipt.target=structuredClone(target);receipt.pre_click_sequence=fence;receipt.observed_node_ms=performance.now();
    report.processed_pointers??=[];report.processed_pointers.push(receipt);lastPointerReceipt=receipt;return receipt;
  };
  const setup=await fresh('TF_BASE_POINT|',()=>page.keyboard.press('Control+Alt+k'));
  let basePoint=JSON.parse(lines(setup,'TF_BASE_POINT|').at(-1));report.base_point_receipts=[{point:structuredClone(basePoint),query_fence:structuredClone(freshFence)}];
  const selected=await state();assert.equal(selected.selected,selected.actor);report.native_viewport=selected.viewport;
  // Native start_ui precedes browser rendering. Await actual nonblank HUD
  // pixels within the existing startup budget, without extra gameplay input.
  const startupDeadline=performance.now()+60000;let hud;report.rendered_readiness=[];
  do{const bytes=await page.locator('#canvas').screenshot();const frame=PNG.sync.read(bytes);
    let visible=0;const colors=new Set();
    for(let y=576;y<642;y++)for(let x=6;x<132;x++){const at=(y*frame.width+x)*4;const rgb=frame.data.subarray(at,at+3);if(rgb.some(v=>v!==0)){visible++;colors.add([...rgb].join(','));}}
    hud={visible,distinct_rgb:colors.size,width:frame.width,height:frame.height};report.rendered_readiness.push(hud);
    if(visible>100&&colors.size>3)break;
  }while(performance.now()<startupDeadline);
  assert.ok(hud.visible>100&&hud.distinct_rgb>3,'Actual production HUD must render before the first pointer input');
  const initial=await snapshot('before-controls');
  await page.locator('#canvas').screenshot({path:`${artifacts}/before-controls.png`});
  assert.equal(initial.players.length,7);assert.equal(initial.bases.length,7);assert.equal(initial.units.length,8);assert.equal(Object.keys(initial.terrain_trace.tiles).length,128);
  for(const player of initial.players){assert.ok(initial.bases.some(base=>base.owner===player.id));assert.ok(initial.units.some(unit=>unit.owner===player.id));}
  assert.deepEqual(initial.terrain_trace.policy,{version:1,ignore_technologies:true});
  let text=await fresh('TF_HEADERS|',()=>click(65,539));
  report.headers=JSON.parse(lines(text,'TF_HEADERS|').at(-1));assert.deepEqual(report.headers.viewport,report.native_viewport);
  const headers=report.headers.rows.filter(row=>row.id==='left_menu_terraform');assert.equal(headers.length,1);
  assert.equal(new Set(report.headers.rows.map(row=>row.id)).size,report.headers.rows.length);
  await drain();const header=geometry.button('terraform-header',headers[0].id,headers[0].label,report.headers.viewport);
  report.header_target=header;
  text=await fresh('TF_ROWS|',()=>click(header.x,header.y,header));const rows=JSON.parse(lines(text,'TF_ROWS|').at(-1));
  const headerPacket=await drain();geometry.assertPointerHit({events:[lastPointerReceipt.hover,...headerPacket.events]},header);
  assert.equal(rows.length,29);assert.equal(new Set(rows.map(row=>row.id)).size,29);
  assert.ok(rows.find(row=>row.id==='soil_enricher'));assert.ok(rows.find(row=>row.id==='mag_tube'));
  assert.equal(rows.filter(row=>row.id==='monolith').length,0);
  for(const row of rows){const target=geometry.button('terraform-row',row.id,row.label,report.headers.viewport);Object.assign(row,{node_id:target.id,bounds:target.bounds,x:target.x,y:target.y});}
  report.rows=rows;await page.locator('#canvas').screenshot({path:`${artifacts}/complete-menu.png`});
  const road=rows.find(row=>row.id==='road_to');assert.ok(road.enabled);const roadTarget=geometry.button('terraform-row',road.id,road.label,report.headers.viewport);const roadPointer=await click(road.x,road.y,roadTarget);
  let current=await state(null,roadPointer);assert.equal(current.target.command,'road_to');assert.equal(current.modal,false);
  text=await fresh('TF_TILE|',()=>click(basePoint.x+100,basePoint.y+100));
  report.rejected_pointer=JSON.parse(lines(text,'TF_TILE|').at(-1));
  assert.notEqual(report.rejected_pointer.base_owner,selected.owner,'The declared rejection pointer must hit an empty or foreign-owned tile');
  current=await state(null,lastPointerReceipt);assert.ok(current.target,'Non-owned pointer must keep the owned-base picker active');
  current=await keyState('Escape','ESCAPE',0);assert.equal(current.target,null);assert.equal(current.modal,false);
  let after=await snapshot('after-pointer-Escape');assert.deepEqual(nativeOnly(after),nativeOnly(initial),'Menu/non-owned target/Escape must preserve every observed owner/tile');
  current=await keyState('Control+r','R',2);assert.equal(current.target.command,'road_to');
  current=await keyState('Tab','TAB',0);assert.equal(current.target,null);assert.equal(current.modal,false);
  after=await snapshot('after-target-Tab');assert.deepEqual(nativeOnly(after),nativeOnly(initial),'Target Tab cancellation must preserve native state');
  text=await fresh('TF_BASE_POINT|',()=>page.keyboard.press('Control+Alt+k'));basePoint=JSON.parse(lines(text,'TF_BASE_POINT|').at(-1));report.base_point_receipts.push({point:structuredClone(basePoint),query_fence:structuredClone(freshFence)});
  current=await keyState('Control+r','R',2);assert.equal(current.target.command,'road_to');
  text=await fresh('TF_RESULT|unit_terraform_plan|true|',()=>click(basePoint.x,basePoint.y));
  const result=JSON.parse(lines(text,'TF_RESULT|unit_terraform_plan|true|').at(-1));
  assert.equal(result.command,'road_to');assert.equal(result.target_x,0);assert.equal(result.target_y,2);
  await page.waitForTimeout(300);current=await state(null,lastPointerReceipt);assert.equal(current.target,null);assert.equal(current.pending,null);
  report.final_state=current;await snapshot('after-owned-base-request');
  await drain();
  assert.equal(report.input_ledger.enabled,true);assert.equal(report.input_ledger.dropped,0,'Native input observer must remain complete');
  assert.ok(report.input_ledger.events.some(event=>event.kind==='input.ingress'),'Actual SDL input ingress must be recorded');
  assert.ok(report.input_ledger.events.some(event=>event.kind==='input.dispatch'),'Actual engine input dispatch must be recorded');
  report.native_guards='Seven actual owners/cities and complete128tile map unchanged for open/non-owned-click/Escape/Tab; owned-base pointer submitted one actual authoritative plan';
  report.unsupported=['full36actioneffects','heightquote/payment','sea-controls','originalvisualagreement','animation/audio','livebrowserRNGstate','typedfrontendmesh/facing/frame telemetry','external-debug-log-autoscroll'];
  await page.locator('#canvas').screenshot({path:`${artifacts}/target-submitted.png`});
  await page.keyboard.press('Control+Alt+q');await page.waitForFunction(()=>document.body.dataset.state==='exited');assert.deepEqual(errors,[]);report.status='passed';
});
