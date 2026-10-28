// Optional installed-data application proof. Source preparation alone adds no
// passing browser, original Workshop, artwork, animation or audio cases.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {BrowserLogCursor} from './browser-log-cursor.mjs';
import {installNativeLogHook} from './browser-native-log-hook.mjs';
import {attachRuntimeLogBarrier} from './runtime-fetch-barrier.mjs';
import {nativeToCanvas} from './terraform-browser-geometry.mjs';
import {completedNativeClick,nativeHover} from './terraform-browser-pointer.mjs';
import {declaredTerrain} from './terraform-browser-inputs.mjs';
import {WorkshopPresentation} from './unit-workshop-presentation.mjs';
import {completedWorkshopKey} from './unit-workshop-key-receipt.mjs';
import {compareWorkshopMaterialMask} from './unit-workshop-preview-pixels.mjs';
import {workshopMain,workshopWorld} from './unit-workshop-browser-fixture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const scriptsRoot=process.env.WASM_SCRIPTS_ROOT||root;
const build=process.env.WASM_APP_DIR||`${root}build/wasm-release/bin`;
const assets=process.env.SMAC_ASSETS_DIR;
const artifacts=process.env.WORKSHOP_BROWSER_ARTIFACTS_DIR||`${root}tools/wasm-tests/build/artifacts/unit-workshop`;
const hash=value=>createHash('sha256').update(value).digest('hex');
const seed='1651011033:1377505029:3019448108:3247278135';
const nativeOnly=record=>{const world=structuredClone(record.world);delete world.terrain_trace.ui;return world;};

test('real Workshop Window browses existing designs and commits only normal production OK',{
  skip:!assets&&'Requires installed SMAC assets and an exclusive browser slot',timeout:180000,
},async t=>{
  mkdirSync(artifacts,{recursive:true});
  const scripts=Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`,{recursive:true}).filter(name=>name.endsWith('.gls.js')).sort()
    .map(name=>[`GLSMAC_data/default/${name}`,readFileSync(`${scriptsRoot}/GLSMAC_data/default/${name}`,'utf8')]));
  assert.ok(scripts['GLSMAC_data/default/ui/parts/game/popup/base_screen/workshop.gls.js'],'Requires the reviewed Workshop source');
  const helperNames=['_state_trace_observer','_terrain_trace_observer','_terraform_cooperation_observer','_unit_workshop_reader','_unit_workshop_query'];
  const helpers=Object.fromEntries(helperNames.map(name=>[name,readFileSync(`${scriptsRoot}/GLSMAC_data/tests/${name}.gls.js`,'utf8')]));
  const bootstrap=readFileSync(`${build}/bootstrap.js`,'utf8');
  const originalLogSource=bootstrap.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(originalLogSource);
  const runtime=readFileSync(`${build}/GLSMAC.js`,'utf8');
  for(const statement of ['if (Module["print"]) out = Module["print"];','if (Module["printErr"]) err = Module["printErr"];'])assert.ok(runtime.includes(statement),'Existing print configuration must be captured by the pinned runtime');
  const report={version:1,scope:'actual candidate Workshop Window, source designs and normal production submission',status:'running',candidate_executed:false,
    original_passing_cases:0,original_visual_agreement:'unsupported',host_head:execFileSync('git',['rev-parse','HEAD'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    native_source_tree:execFileSync('git',['rev-parse','HEAD:src'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    production_default_sha256:hash(JSON.stringify(scripts)),runtime_js_sha256:hash(runtime),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`)),
    observer_sha256:hash(workshopMain),world_input_sha256:hash(workshopWorld),observer_helpers_sha256:hash(JSON.stringify(helpers)),seed_requested:seed,
    key_receipt_matcher_sha256:hash(readFileSync(new URL('unit-workshop-key-receipt.mjs',import.meta.url))),
    web_sha256:Object.fromEntries(['index.html','bootstrap.js','asset-store.js'].map(name=>[name,hash(readFileSync(`${build}/${name}`))])),
    shared_helpers_sha256:Object.fromEntries(['browser-log-cursor.mjs','browser-native-log-hook.mjs','runtime-fetch-barrier.mjs','terraform-browser-geometry.mjs','terraform-browser-pointer.mjs'].map(name=>[name,hash(readFileSync(new URL(name,import.meta.url)))])),
    declared_input:{map:'source-declared16x16-arid',players:7,bases:7,units:8,recipes:'actual source basic and optional Sea Former; explicit fixture inventory'},
    native_log_configuration:{installations:0,hook_source_sha256:hash(installNativeLogHook.toString()),original_log_source_sha256:hash(originalLogSource)},
    native_snapshots:[],processed_pointers:[],processed_keys:[],captures:[],window_lifecycle:[],pane_lifecycle:[]};
  writeFileSync(`${artifacts}/fixture-main.gls.js`,workshopMain);writeFileSync(`${artifacts}/fixture-world.gls.js`,workshopWorld);
  const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});
  const serverDone=new Promise(resolve=>server.once('exit',(code,signal)=>resolve({code,signal})));
  t.after(async()=>{
    if(!server.pid||server.exitCode!==null||server.signalCode!==null)return;
    server.kill('SIGTERM');let timer;
    try{await Promise.race([serverDone,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Asset server did not stop')),5000);})]);}
    catch{server.kill('SIGKILL');await serverDone;}finally{clearTimeout(timer);}
  });
  const address=await new Promise((resolve,reject)=>{
    let text='';const timer=setTimeout(()=>reject(Error(`Asset server timeout: ${text}`)),60000);
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',code=>{clearTimeout(timer);reject(Error(`Asset server exited ${code}: ${text}`));});
    server.stderr.on('data',data=>{text+=data;});server.stdout.on('data',data=>{text+=data;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  });
  const browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.stack||String(error)));page.on('crash',()=>errors.push('Chromium crashed'));
  const chunksPath=`${artifacts}/application-log-chunks.jsonl`;writeFileSync(chunksPath,'');
  const cursor=new BrowserLogCursor(page,packet=>{if(packet.text)appendFileSync(chunksPath,JSON.stringify({start_utf16:packet.start,end_utf16:packet.end,text:packet.text})+'\n');});
  let runtimeBarrier=null;
  t.after(async()=>{
    if(report.status!=='passed')report.status='failed-or-incomplete';
    cursor.beginClose();
    try{let timer;try{await Promise.race([cursor.finalRead(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Final log suffix timeout')),1000);})]);}finally{clearTimeout(timer);}}
    catch(error){report.log_capture_error=String(error);report.status='failed-or-incomplete';}
    try{report.native_log_configuration.callbacks=await page.evaluate(()=>globalThis.__terraformNativeLogHook);}catch(error){report.hook_capture_error=String(error);}
    if(report.status!=='passed'){try{await page.locator('#canvas').screenshot({path:`${artifacts}/failed-frame.png`,timeout:1000});}catch(error){report.frame_error=String(error);}}
    try{await browser.close();}catch(error){report.browser_close_error=String(error);report.status='failed-or-incomplete';}
    runtimeBarrier?.stop();
    const producerClosed=!browser.isConnected();
    const sealed=producerClosed?await cursor.seal():{text:cursor.text,reads:structuredClone(cursor.reads),failure:'Producer close failed; retained prefix only'};
    const chunks=readFileSync(chunksPath,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
    const joined=chunks.map(chunk=>chunk.text).join('');if(producerClosed)assert.equal(joined,sealed.text);
    writeFileSync(`${artifacts}/application.log`,sealed.text);report.browser_errors=errors;
    report.log_transport={sealed:producerClosed,partial:report.status!=='passed'||!!report.log_capture_error||!producerClosed,raw_sha256:hash(sealed.text),joined_chunk_sha256:hash(joined),retained_utf16:sealed.text.length,retained_utf8:Buffer.byteLength(sealed.text),reads:sealed.reads,settled_failure:sealed.failure};
    let finalFailure=null;
    try{
      assert.equal(report.log_capture_error,undefined);assert.equal(report.hook_capture_error,undefined);assert.equal(report.browser_close_error,undefined);assert.ok(producerClosed);
      if(report.status==='passed'){
        assert.deepEqual(errors,[]);assert.equal(report.native_log_configuration.installations,1);
        assert.equal(report.native_log_configuration.barrier.continued,true,'Main runtime continuation must acknowledge success');
        assert.ok(report.native_log_configuration.worker_requests?.some(row=>row.continued===true),'An actual pthread runtime continuation must acknowledge success');
        assert.ok(report.native_log_configuration.callbacks?.first_callback);
        assert.equal(report.native_log_configuration.callbacks.first_callback.runtime_out_bound,true);
        assert.equal(report.native_log_configuration.callbacks.first_callback.runtime_err_bound,true);
      }
    }catch(error){finalFailure=error;report.final_artifact_error=String(error);report.status='failed-or-incomplete';}
    writeFileSync(`${artifacts}/report.json`,JSON.stringify(report,null,2)+'\n');
    if(finalFailure)throw finalFailure;
  });
  runtimeBarrier=await attachRuntimeLogBarrier(page,browser,{runtimeURL:`${address}/GLSMAC.js`,bootstrapURL:`${address}/bootstrap.js`,originalLogSource,metadata:report.native_log_configuration,onError:error=>errors.push(String(error))});
  const presentation=new WorkshopPresentation();const records=[];const events=[];let consumed=0;let fatalTail='';
  const fatal=/WS_ERROR|Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i;
  const read=async()=>{
    const packet=await cursor.read();const text=fatalTail+packet.text;assert.doesNotMatch(text,fatal);fatalTail=text.slice(text.lastIndexOf('\n')+1);assert.deepEqual(errors,[]);
    const complete=cursor.text.lastIndexOf('\n')+1;
    for(const line of cursor.text.slice(consumed,complete).split('\n')){
      const match=line.match(/^\s*(?:\[[^\]]+\]\s*)?(WS_[A-Z_]+)\|(.+)$/);if(!match)continue;
      if(match[1]==='WS_TRACE'){const value=JSON.parse(JSON.parse(match[2]));presentation.ingest(value);events.push(...value.events);}
      else if(['WS_STATE','WS_NATIVE','WS_BASE_POINT','WS_WINDOW','WS_PANE','WS_RECEIPT','WS_CONTEXT'].includes(match[1])){
        const row={kind:match[1],value:JSON.parse(match[2]),observed_node_ms:performance.now()};records.push(row);
        if(row.kind==='WS_WINDOW')report.window_lifecycle.push(row);
        if(row.kind==='WS_PANE')report.pane_lifecycle.push(row);
      }
    }
    consumed=complete;
  };
  const wait=async probe=>{
    const deadline=performance.now()+60000;
    while(performance.now()<deadline){await read();const value=probe();if(value)return value;const remaining=deadline-performance.now();assert.ok(remaining>0);await page.waitForFunction(offset=>document.querySelector('#log').textContent.length>offset,cursor.text.length,{timeout:remaining});}
    assert.fail('Fresh native observation did not arrive within the existing budget');
  };
  const latest=kind=>records.findLast(row=>row.kind===kind)?.value;
  const settledBase=()=>{const ui=latest('WS_STATE')?.ui;return ui?.base_open&&!ui.popup_sliding&&!ui.popup_hiding;};
  const key=async(shortcut,code,modifiers=0)=>{
    await read();const fence=presentation.sequence;await page.keyboard.press(shortcut);
    const receipt=await wait(()=>completedWorkshopKey(events,fence,code,modifiers));
    report.processed_keys.push({shortcut,...receipt});return receipt;
  };
  const click=async target=>{
    await read();const fence=presentation.sequence;const viewport=latest('WS_STATE')?.ui.viewport;assert.ok(viewport);
    if(target.id){assert.ok(presentation.nodes.has(target.id)&&!presentation.destroyed.has(target.id));presentation.target(target.id,target.label,viewport);}
    const box=await page.locator('#canvas').boundingBox();const point=nativeToCanvas(target.x,target.y,viewport,box);
    await page.mouse.move(point.x,point.y);
    let hover=null;
    if(target.id){const descendants=[...presentation.nodes.keys()].filter(id=>presentation.within(id,target.id));hover=await wait(()=>nativeHover(events,fence,descendants,target.bounds));}
    await page.mouse.down({button:'left'});await page.mouse.up({button:'left'});
    const receipt=await wait(()=>completedNativeClick(events,fence,target));
    report.processed_pointers.push({fence,target:structuredClone(target),viewport,canvas_css_rect:box,css:point,hover,...receipt});return receipt;
  };
  const observe=async checkpoint=>{
    const before=latest('WS_NATIVE')?.query??0;const receipt=await key('Control+Alt+p','P',6);
    const record=await wait(()=>{const value=latest('WS_NATIVE');return value?.query>before?value:null;});
    assert.equal(record.query,before+1,'One fresh queued snapshot per actual native query key');
    assert.equal(receipt.end.data.handled,true,'The observer must preserve the actual consumer key handling result');
    const owner=record.query_observer;assert.equal(owner.query,record.query);assert.equal(owner.coalesced,0,'One actual serial ingress must produce one pending observation');
    assert.equal(owner.base_id,record.ui.base_id);assert.equal(owner.owner_session,record.ui.base_bar_scope.session);
    assert.ok(Number.isSafeInteger(owner.token)&&owner.token>0);
    const expectedScope=record.ui.workshop_open?'workshop':record.ui.production_open?'production':'base';assert.equal(owner.scope,expectedScope);
    if(expectedScope==='production'){
      assert.equal(owner.source,`production:${owner.token}`);
      const pane=presentation.unique('workshop-observer-pane',owner.source),dialog=presentation.unique('dialog','game.popup.base_screen');
      assert.ok(presentation.within(pane.id,dialog.id));assert.deepEqual(presentation.parts.get(pane.id),{owner:dialog.id,relation:'workshop-observer-pane'});
      assert.ok(report.pane_lifecycle.some(row=>row.value.kind==='attached'&&row.value.token===owner.token&&row.value.source===owner.source));
    }
    report.native_snapshots.push({checkpoint,query_after_native_key:receipt.end.seq,observation:record,lifecycle:presentation.lifecycle()});return record;
  };
  const capture=async(name,preview)=>{
    const began=performance.now();const bytes=await page.locator('#canvas').screenshot({path:`${artifacts}/${name}.png`});
    report.captures.push({name,sha256:hash(bytes),acquired_ms:performance.now()-began,native_preview:preview??null,scope:'retained candidate pixels; no original pixel comparison'});
    return bytes;
  };
  const baseButton=label=>presentation.buttonInDialog('game.popup.base_screen',label,latest('WS_STATE').ui.viewport);
  const queueChangeButton=()=>{
    const ui=latest('WS_STATE').ui;assert.equal(ui.base_open,true);const dialog=presentation.unique('dialog','game.popup.base_screen');
    const scope=ui.base_bar_scope;assert.equal(scope.base_id,ui.base_id);assert.ok(Number.isSafeInteger(scope.session)&&scope.session>0);
    assert.equal(scope.source,`game.popup.base_screen:${ui.base_id}:${scope.session}`);
    return presentation.buttonInScope('workshop-base-bar',scope.source,'CHANGE',ui.viewport,{owner:dialog.id,relation:'workshop-base-bar'});
  };
  const workshopButton=label=>presentation.buttonInDialog('game.unit_workshop',label,latest('WS_STATE').ui.viewport);
  const choose=async id=>click(presentation.choice('designs',id,latest('WS_STATE').ui.viewport));
  const noProductionAfter=record=>assert.equal(records.filter(row=>row.kind==='WS_RECEIPT'&&row.value.name==='set_base_production').length,record);
  const stockFormer=ui=>{
    const choices=ui.choices.filter(choice=>choice.unit_id==='Formers');assert.equal(choices.length,1);
    const rules=ui.rules.filter(rule=>rule.id==='Formers');assert.equal(rules.length,1);const rule=rules[0];
    const source=ui.former_weapon_source;assert.ok(source);
    assert.deepEqual(rule.source_components,{prototype:1,chassis:0,weapon:source.weapon_index,armor:0,reactor:0},'Only the bounded stock Former component profile is covered');
    assert.ok(Number.isSafeInteger(source.weapon_index)&&source.weapon_index>=0);assert.equal(source.prototype,1);
    assert.ok(typeof source.unit_weapon==='string'&&source.unit_weapon.length>0);assert.equal(source.unit_weapon,source.weapon_shortname);
    assert.equal(source.weapon_mode,9,'Actual Native-loaded UNITS and WEAPONS linkage must retain the Terraforming module role');
    assert.equal(rule.movement,1);assert.equal(rule.weapon_mode,9);assert.deepEqual(rule.combat,{kind:'civilian',offense:0,defense:1,reactor:1});return choices[0];
  };
  await page.goto(address);await page.waitForFunction(()=>document.body.dataset.state==='ready');
  const manifest=await(await page.request.get(`${address}/assets/manifest.json`)).json();
  const component=manifest.files.filter(row=>row.path==='VT.cvr');assert.equal(component.length,1);
  assert.equal(component[0].sha256,'076df434678a92b0de70965a0c3c1a400de31924d9365c8c96998f0bb2e13c19','Accepted installed stock Former chassis fingerprint');
  report.manifest_id=manifest.id;report.component_sha256=component[0].sha256;
  await page.locator('#custom-maps').setInputFiles({name:'workshop-arid.MP',mimeType:'application/octet-stream',buffer:declaredTerrain()});await page.locator('#import-maps').click();
  await page.waitForFunction(()=>document.querySelector('#custom-map-list').textContent.includes('workshop-arid.MP'));
  await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts,main,world,helpers,seed})=>{
    for(const[name,source]of Object.entries(scripts)){const path=`/workshop-snapshot/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}
    Module.FS.mkdirTree('/workshop-snapshot/GLSMAC_data/tests');
    for(const[name,source]of Object.entries(helpers))Module.FS.writeFile(`/workshop-snapshot/GLSMAC_data/tests/${name}.gls.js`,source);
    Module.FS.writeFile('/workshop-snapshot/GLSMAC_data/default/browser_workshop_main.gls.js',main);
    Module.FS.writeFile('/workshop-snapshot/GLSMAC_data/default/game/world/browser_workshop.gls.js',world);
    const callMain=Module.callMain;
    Module.callMain=args=>callMain([...args,'--datapath','/workshop-snapshot/GLSMAC_data','--mainscript','browser_workshop_main','--worldscript','browser_workshop','--quickstart','--quickstart-seed',seed,'--quickstart-mapfile','/persist/glsmac/maps/workshop-arid.MP','--quickstart-faction','GAIANS']);
  },{scripts,main:workshopMain,world:workshopWorld,helpers,seed});
  report.candidate_executed=true;await page.locator('#start').click();
  const basePoint=await wait(()=>latest('WS_BASE_POINT'));await wait(()=>latest('WS_STATE'));
  report.initial_base_point=basePoint;await click(basePoint);
  await wait(settledBase);const initial=await observe('base-open-before-production');
  assert.equal(initial.world.players.length,7);assert.equal(initial.world.bases.length,7);assert.equal(initial.world.units.length,8);assert.equal(Object.keys(initial.world.terrain_trace.tiles).length,128);
  for(const owner of initial.world.players){assert.ok(initial.world.bases.some(base=>base.owner===owner.id));assert.ok(initial.world.units.some(unit=>unit.owner===owner.id));}
  const baseline=nativeOnly(initial);const former=stockFormer(initial.ui);
  const initialProductionReceipts=records.filter(row=>row.kind==='WS_RECEIPT'&&row.value.name==='set_base_production').length;
  await click(queueChangeButton());await wait(()=>latest('WS_STATE')?.ui.production_open);
  const draft=latest('WS_STATE').ui.draft;await click(baseButton('WORKSHOP'));await wait(()=>latest('WS_STATE')?.ui.workshop_open);
  let shown=await observe('workshop-open');
  assert.deepEqual(presentation.list('designs').items.map(row=>row.key).sort(),shown.ui.choices.map(row=>row.id).sort());
  await choose(former.id);shown=await observe('former-preview');
  const texts=presentation.texts('game.unit_workshop');assert.ok(texts.includes(former.name));assert.ok(texts.includes(`Cost: ${former.cost} minerals`));
  for(const text of ['Movement: 1 (land)','Offense: 0   Defense: 1','Reactor: 1','Terraforming module'])assert.ok(texts.includes(text));
  const preview=presentation.preview('game.unit_workshop','VT.cvr:crop(0,0,99,74)');
  const control=presentation.unique('workshop-pixel-control','VT.cvr');assert.ok(control.node.effective);
  const frame=PNG.sync.read(await capture('former-preview',preview));const box=await page.locator('#canvas').boundingBox();
  const crop=bounds=>{
    const viewport=shown.ui.viewport;const from=nativeToCanvas(bounds.left,bounds.top,viewport,box),to=nativeToCanvas(bounds.right,bounds.bottom,viewport,box);
    const left=Math.max(0,Math.ceil((from.x-box.x)*frame.width/box.width)),right=Math.min(frame.width,Math.floor((to.x-box.x)*frame.width/box.width));
    const top=Math.max(0,Math.ceil((from.y-box.y)*frame.height/box.height)),bottom=Math.min(frame.height,Math.floor((to.y-box.y)*frame.height/box.height));
    assert.ok(right>left&&bottom>top);return{left,top,right,bottom};
  };
  const reference=crop(control.node.effective),actual=crop(preview.bounds);
  report.preview_pixels={...compareWorkshopMaterialMask(frame,reference,actual),control_native_bounds:control.node.effective,workshop_native_bounds:preview.bounds,
    control_crop:reference,workshop_crop:actual,scope:'Candidate installed-component relation only; no original pixel, complete-assembly or timing agreement'};
  assert.equal(shown.ui.draft,draft);assert.deepEqual(nativeOnly(shown),baseline);noProductionAfter(initialProductionReceipts);
  await click(workshopButton('CANCEL'));shown=await observe('pointer-cancel');assert.equal(shown.ui.workshop_open,false);assert.equal(shown.ui.draft,draft);assert.deepEqual(nativeOnly(shown),baseline);
  await click(baseButton('WORKSHOP'));await wait(()=>latest('WS_STATE')?.ui.workshop_open);await choose(former.id);await key('Escape','ESCAPE');
  shown=await observe('keyboard-cancel');assert.equal(shown.ui.workshop_open,false);assert.equal(shown.ui.draft,draft);assert.deepEqual(nativeOnly(shown),baseline);noProductionAfter(initialProductionReceipts);
  await click(baseButton('WORKSHOP'));await wait(()=>latest('WS_STATE')?.ui.workshop_open);await choose(former.id);await click(workshopButton('SELECT'));
  const selected=await observe('draft-transferred');assert.equal(selected.ui.workshop_open,false);assert.equal(selected.ui.draft,former.id);assert.deepEqual(nativeOnly(selected),baseline);noProductionAfter(initialProductionReceipts);
  await click(baseButton('OK'));await wait(()=>records.filter(row=>row.kind==='WS_RECEIPT'&&row.value.name==='set_base_production'&&row.value.success).length>initialProductionReceipts);
  const committed=await observe('normal-production-OK');assert.equal(committed.ui.production_open,false);noProductionAfter(initialProductionReceipts+1);
  const adjusted=nativeOnly(committed);const city=adjusted.bases.find(base=>base.raw_id===initial.ui.base_id);assert.ok(city);
  const oldCity=baseline.bases.find(base=>base.raw_id===city.raw_id);const detail=adjusted.terrain_trace.base_details[city.id];const oldDetail=baseline.terrain_trace.base_details[city.id];
  const quote=selected.ui.native_quotes[former.id];assert.equal(quote.accepted,true);assert.equal(quote.reason,null);
  assert.ok(Number.isSafeInteger(quote.loss)&&quote.loss>=0,'Chosen land Former needs an actual accepted native quote');
  assert.equal(detail.production.choice_id,former.id);assert.equal(detail.production.minerals,oldDetail.production.minerals-quote.loss);assert.equal(detail.production.last_processed_turn,baseline.turn);
  city.project=oldCity.project;city.resources.minerals=oldCity.resources.minerals;detail.production=structuredClone(oldDetail.production);
  assert.deepEqual(adjusted,baseline,'Only the source-selected base production fields may change');
  await key('Control+Alt+j','J',6);await click(queueChangeButton());const staleFence=presentation.sequence;await click(baseButton('WORKSHOP'));
  await wait(()=>records.some(row=>row.kind==='WS_CONTEXT'));await wait(()=>settledBase()&&!latest('WS_STATE').ui.workshop_open&&!latest('WS_STATE').ui.production_open);
  const refreshed=await observe('native-base-refresh-cleans-stale-workshop');assert.deepEqual(nativeOnly(refreshed),nativeOnly(committed));noProductionAfter(initialProductionReceipts+1);
  const staleWindows=presentation.roles.filter(row=>row.sequence>staleFence&&row.role==='dialog'&&row.source==='game.unit_workshop');assert.equal(staleWindows.length,1);
  assert.ok(presentation.destroyed.has(staleWindows[0].id)&&!presentation.nodes.has(staleWindows[0].id),'The actual invalidated native Workshop Window must be destroyed');report.stale_window=staleWindows[0];
  const dialogId=presentation.unique('dialog','game.popup.base_screen').id;
  const closeReceipt=await key('Escape','ESCAPE');
  await wait(()=>{const ui=latest('WS_STATE')?.ui;return ui?.base_open===false&&!ui.popup_sliding&&!ui.popup_hiding&&presentation.hiddenAfter(dialogId,closeReceipt.begin.seq);});
  assert.equal(presentation.visible(dialogId),false);
  report.base_hide_receipt={id:dialogId,key_begin:closeReceipt.begin.seq,key_end:closeReceipt.end.seq,native_hide:presentation.hideEvents.get(dialogId),scope:'Actual same-Window hide after Escape plus settled script state; no visibility inference from script flags'};
  await click(basePoint);await wait(settledBase);const reopened=await observe('reopened-base-has-no-stale-draft');
  assert.equal(reopened.ui.production_open,false);assert.equal(reopened.ui.workshop_open,false);assert.deepEqual(nativeOnly(reopened),nativeOnly(committed));noProductionAfter(initialProductionReceipts+1);
  await capture('final-base');await key('Control+Alt+q','Q',6);await page.waitForFunction(()=>document.body.dataset.state==='exited');
  assert.match(await page.locator('#status').textContent(),/GLSMAC exited \(0\)/);assert.deepEqual(errors,[]);
  report.native_raw_exit_code=0;report.input_ledger={enabled:true,dropped:0,events};report.final_lifecycle=presentation.lifecycle();
  report.unsupported=['original Workshop layout/behavior','custom authoring/save/upgrade','full assembled art','original pixel agreement','facing/tool/limb animation','animation cadence/audio','native frontend rendered-unit identity'];
  report.status='passed';
});
