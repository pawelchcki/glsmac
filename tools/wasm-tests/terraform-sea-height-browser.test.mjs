// Optional installed-data application proof. Source preparation is not a pass.
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
import {rateOneSource} from './terraform-browser-inputs.mjs';
import {HeightPresentation,completedHeightKey,nativeHeightWorld,verifyHeightCapture,heightFatal,verifyHeightFinalization} from './terraform-height-observation.mjs';
import {seaHeightTerrain,seaHeightInput,seaHeightOverrideManifest} from './terraform-sea-height-inputs.mjs';
import {auditPaidSeaHeight,verifySeaBootstrap,verifySeaRaiseMenu,verifySeaRaiseQuote,guardSeaBrowserCleanup} from './terraform-sea-height-observation.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const scriptsRoot=process.env.WASM_SCRIPTS_ROOT||root;
const build=process.env.WASM_APP_DIR||`${root}build/wasm-release/bin`;
const assets=process.env.SMAC_ASSETS_DIR;
const artifacts=process.env.TERRAFORM_SEA_HEIGHT_ARTIFACTS_DIR||`${root}tools/wasm-tests/build/artifacts/terraform-sea-height`;
const hash=value=>createHash('sha256').update(value).digest('hex');
const seed='1651011033:1377505029:3019448108:3247278135';

test('real produced SeaFormer Raise quote Cancel draft and paid completion preserve the seven-owner world',{
  skip:!assets&&'Requires installed assets and an exclusive browser slot',timeout:180000,
},async t=>{
  mkdirSync(artifacts,{recursive:true});
  const scripts=Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`,{recursive:true}).filter(name=>name.endsWith('.gls.js')).sort()
    .map(name=>[`GLSMAC_data/default/${name}`,readFileSync(`${scriptsRoot}/GLSMAC_data/default/${name}`,'utf8')]));
  const main=readFileSync(`${scriptsRoot}/tools/wasm-tests/fixtures/terraform-sea-height-main.gls.js`,'utf8');
  const world=readFileSync(`${scriptsRoot}/tools/wasm-tests/fixtures/terraform-sea-height-world.gls.js`,'utf8');
  const helperNames=['_state_trace_observer','_terrain_trace_observer','_terraform_cooperation_observer'];
  const helpers=Object.fromEntries(helperNames.map(name=>[name,readFileSync(`${scriptsRoot}/GLSMAC_data/tests/${name}.gls.js`,'utf8')]));
  const bootstrap=readFileSync(`${build}/bootstrap.js`,'utf8');
  const originalLogSource=bootstrap.match(/function log\(message\) \{\n[^]*?\n\}/)?.[0];assert.ok(originalLogSource);
  const runtime=readFileSync(`${build}/GLSMAC.js`,'utf8');
  for(const statement of ['if (Module["print"]) out = Module["print"];','if (Module["printErr"]) err = Module["printErr"];'])assert.ok(runtime.includes(statement));
  const originalRules=readFileSync(`${assets}/alphax.txt`),rules=rateOneSource(originalRules);
  assert.equal(hash(originalRules),'bb01e3ac23793da0a46713f4851d65e63b599c24aef8300ffe45e7e57b332c42');
  assert.equal(hash(rules),'7abf62aa4f4f562aaa86c785b67b7af2320e122cbda7901287ee3ed0ab4c5bd0');
  const report={version:1,sea_menu_contract_version:3,status:'running',candidate_executed:false,native_raw_exit_code:null,scope:'actual produced SeaFormer sea-preserving height application UI; explicit approximate height/fee policy',
    original_passing_cases:0,original_visual_agreement:'unsupported',
    host_head:execFileSync('git',['rev-parse','HEAD'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    native_source_tree:execFileSync('git',['rev-parse','HEAD:src'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    default_tree:execFileSync('git',['rev-parse','HEAD:GLSMAC_data/default'],{cwd:scriptsRoot,encoding:'utf8'}).trim(),
    driver_sha256:hash(readFileSync(fileURLToPath(import.meta.url))),
    height_observation_sha256:hash(readFileSync(new URL('terraform-height-observation.mjs',import.meta.url))),
    sea_observation_sha256:hash(readFileSync(new URL('terraform-sea-height-observation.mjs',import.meta.url))),sea_input_sha256:hash(readFileSync(new URL('terraform-sea-height-inputs.mjs',import.meta.url))),map_sha256:hash(seaHeightTerrain()),
    production_default_sha256:hash(JSON.stringify(scripts)),runtime_js_sha256:hash(runtime),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`)),
    observer_sha256:hash(main),world_input_sha256:hash(world),observer_helpers_sha256:hash(JSON.stringify(helpers)),seed_requested:seed,
    declared_input:{...seaHeightInput,bases:7,units:8,normal_source_funding:true},
    source_override:{scope:'test input only; twenty shared TERRAIN turns fields (index4) set to1 for both land/sea metadata; names and prerequisites unchanged',original_sha256:hash(originalRules),rate_one_sha256:hash(rules),bytes:rules.length,reads:0,rows:seaHeightOverrideManifest(originalRules,rules)},
    shared_helpers_sha256:Object.fromEntries(['browser-log-cursor.mjs','browser-native-log-hook.mjs','runtime-fetch-barrier.mjs','terraform-browser-geometry.mjs','terraform-browser-pointer.mjs'].map(name=>[name,hash(readFileSync(new URL(name,import.meta.url)))])),
    web_sha256:Object.fromEntries(['index.html','bootstrap.js','asset-store.js'].map(name=>[name,hash(readFileSync(`${build}/${name}`))])),
    native_log_configuration:{installations:0,debug_autoscroll:'unsupported',hook_source_sha256:hash(installNativeLogHook.toString()),original_log_source_sha256:hash(originalLogSource)},
    native_snapshots:[],processed_pointers:[],processed_keys:[],captures:[],errors:[]};
  assert.equal(report.native_source_tree,'115032ffc7f53ff7f0c3a9f997da12674e25e643');
  assert.equal(report.default_tree,'25ef18d3222f553507291d412330262169b2e418');
  assert.equal(report.runtime_js_sha256,'e71036c9365a3ac87bf818e7eb49fb2344077a15aa6836371a436572cedf7f82');
  assert.equal(report.runtime_wasm_sha256,'b2c7fa273042f2407335169eb4fca51f131f1f30656301d7b7573a201b28f5b7');
  writeFileSync(`${artifacts}/declared-map.MP`,seaHeightTerrain());
  writeFileSync(`${artifacts}/fixture-main.gls.js`,main);writeFileSync(`${artifacts}/fixture-world.gls.js`,world);
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
  const transferBrowserCleanup=guardSeaBrowserCleanup(t,browser);
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
    const joined=chunks.map(chunk=>chunk.text).join('');
    writeFileSync(`${artifacts}/application.log`,sealed.text);report.browser_errors=errors;
    report.log_transport={sealed:producerClosed,partial:report.status!=='passed'||!!report.log_capture_error||!producerClosed||sealed.failure!==null||joined!==sealed.text,raw_sha256:hash(sealed.text),joined_chunk_sha256:hash(joined),retained_utf16:sealed.text.length,retained_utf8:Buffer.byteLength(sealed.text),reads:sealed.reads,settled_failure:sealed.failure};
    let finalFailure=null;
    try{
      assert.equal(report.log_capture_error,undefined);assert.equal(report.hook_capture_error,undefined);assert.equal(report.browser_close_error,undefined);assert.ok(producerClosed);
      if(report.status==='passed'){
        verifyHeightFinalization({sealed,joined,producerClosed,errors,configuration:report.native_log_configuration,nativeExit:report.native_exit});
      }
    }catch(error){finalFailure=error;report.final_artifact_error=String(error);report.status='failed-or-incomplete';report.log_transport.partial=true;}
    report.log_transport.unread_tail=report.log_transport.partial?'unknown; complete success/closure/final suffix was not proved':false;
    writeFileSync(`${artifacts}/report.json`,JSON.stringify(report,null,2)+'\n');
    if(finalFailure)throw finalFailure;
  });
  transferBrowserCleanup();
  runtimeBarrier=await attachRuntimeLogBarrier(page,browser,{runtimeURL:`${address}/GLSMAC.js`,bootstrapURL:`${address}/bootstrap.js`,originalLogSource,metadata:report.native_log_configuration,onError:error=>errors.push(String(error))});
  const presentation=new HeightPresentation(),records=[],events=[];let consumed=0,fatalTail='';
  const fatal=heightFatal;
  const read=async()=>{
    const packet=await cursor.read(),text=fatalTail+packet.text;assert.doesNotMatch(text,fatal);fatalTail=text.slice(text.lastIndexOf('\n')+1);assert.deepEqual(errors,[]);
    const complete=cursor.text.lastIndexOf('\n')+1;
    for(const line of cursor.text.slice(consumed,complete).split('\n')){
      const match=line.match(/^\s*(?:\[[^\]]+\]\s*)?(TH_[A-Z_]+)\|(.+)$/);if(!match)continue;
      if(match[1]==='TH_TRACE'){const value=JSON.parse(JSON.parse(match[2]));presentation.ingest(value);events.push(...value.events);}
      else if(match[1]!=='TH_READY')records.push({kind:match[1],value:JSON.parse(match[2]),observed_node_ms:performance.now()});
    }
    consumed=complete;
  };
  const wait=async probe=>{
    const deadline=performance.now()+60000;
    while(performance.now()<deadline){await read();const value=probe();if(value)return value;const remaining=deadline-performance.now();assert.ok(remaining>0);await page.waitForFunction(offset=>document.querySelector('#log').textContent.length>offset,cursor.text.length,{timeout:remaining});}
    assert.fail('Fresh native observation did not arrive within the existing budget');
  };
  const latest=kind=>records.findLast(row=>row.kind===kind)?.value;
  const settled=()=>{const ui=latest('TH_STATE')?.ui;return ui&&!ui.sliding&&!ui.hiding?ui:null;};
  const key=async(shortcut,code,modifiers=0)=>{
    await read();const fence=presentation.sequence;await page.keyboard.press(shortcut);
    const receipt=await wait(()=>completedHeightKey(events,fence,code,modifiers));report.processed_keys.push({shortcut,...receipt});return receipt;
  };
  const click=async target=>{
    await read();const fence=presentation.sequence,viewport=latest('TH_STATE').ui.viewport;
    assert.ok(presentation.visible(target.id),'The actual target must still be mounted/visible');
    const box=await page.locator('#canvas').boundingBox(),point=nativeToCanvas(target.x,target.y,viewport,box);
    await page.mouse.move(point.x,point.y);
    const descendants=[...presentation.nodes.keys()].filter(id=>presentation.within(id,target.id));
    const hover=await wait(()=>nativeHover(events,fence,descendants,target.bounds));
    await page.mouse.down({button:'left'});await page.mouse.up({button:'left'});
    const receipt=await wait(()=>completedNativeClick(events,fence,target));
    report.processed_pointers.push({fence,target:structuredClone(target),viewport,canvas_css_rect:box,css:point,hover,...receipt});return receipt;
  };
  const observe=async checkpoint=>{
    const before=latest('TH_NATIVE')?.query??0,receipt=await key('Control+Alt+p','P',6);
    const record=await wait(()=>{const row=latest('TH_NATIVE');return row?.query>before?row:null;});
    verifyHeightCapture(record,before,receipt);
    report.native_snapshots.push({checkpoint,query_after_native_key:receipt.end.seq,observation:record});return record;
  };
  const capture=async name=>{
    const bytes=await page.locator('#canvas').screenshot({path:`${artifacts}/${name}.png`});
    report.captures.push({name,sha256:hash(bytes),scope:'candidate frame at fixed viewport; no original pixel or typed mesh comparison'});return bytes;
  };
  // The override enters the normal remote asset/manifest path. Both original
  // and changed hashes are retained; this is never an installed-stock-rate claim.
  await page.route('**/assets/manifest.json',async route=>{
    const response=await route.fetch();assert.equal(response.status(),200);const manifest=await response.json();
    const rows=manifest.files.filter(row=>row.path.toLowerCase()==='alphax.txt');assert.equal(rows.length,1);
    assert.equal(rows[0].sha256,hash(originalRules));rows[0].size=rules.length;rows[0].sha256=hash(rules);
    report.source_override.original_manifest_id=manifest.id;
    manifest.id=hash(JSON.stringify(manifest.files.map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))));
    report.source_override.manifest_id=manifest.id;await route.fulfill({json:manifest});
  });
  await page.route(/\/assets\/alphax\.txt$/i,async route=>{report.source_override.reads++;await route.fulfill({status:200,contentType:'application/octet-stream',body:rules});});
  await page.goto(address);await page.waitForFunction(()=>['ready','failed'].includes(document.body.dataset.state));
  assert.equal(await page.locator('body').getAttribute('data-state'),'ready');
  await page.locator('#custom-maps').setInputFiles({name:'sea-height-coast.MP',mimeType:'application/octet-stream',buffer:seaHeightTerrain()});
  await page.locator('#import-maps').click();await page.waitForFunction(()=>document.querySelector('#custom-map-list').textContent.includes('sea-height-coast.MP'));
  await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts,helpers,main,world,seed})=>{
    for(const[name,source]of Object.entries(scripts)){const path=`/height-snapshot/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}
    Module.FS.mkdirTree('/height-snapshot/GLSMAC_data/tests');
    for(const[name,source]of Object.entries(helpers))Module.FS.writeFile(`/height-snapshot/GLSMAC_data/tests/${name}.gls.js`,source);
    Module.FS.writeFile('/height-snapshot/GLSMAC_data/default/browser_height_main.gls.js',main);
    Module.FS.writeFile('/height-snapshot/GLSMAC_data/default/game/world/browser_height.gls.js',world);
    const callMain=Module.callMain;
    Module.callMain=args=>callMain([...args,'--datapath','/height-snapshot/GLSMAC_data','--mainscript','browser_height_main','--worldscript','browser_height','--quickstart','--quickstart-seed',seed,'--quickstart-mapfile','/persist/glsmac/maps/sea-height-coast.MP','--quickstart-faction','GAIANS']);
  },{scripts,helpers,main,world,seed});
  report.candidate_executed=true;await page.locator('#start').click();
  await page.waitForFunction(pattern=>document.querySelector('#log').textContent.includes('TH_READY')||new RegExp(pattern,'i').test(document.querySelector('#log').textContent)||document.body.dataset.state==='failed',heightFatal.source);await read();
  assert.ok(latest('TH_INPUTS'));report.native_input=latest('TH_INPUTS');
  report.sea_setup=latest('TH_SEA_SETUP');assert.ok(report.sea_setup);
  assert.equal(report.sea_setup.is_water,true);assert.equal(report.sea_setup.is_land,false);
  assert.equal(report.sea_setup.definition,report.sea_setup.declared.recipe.id);
  assert.equal(report.sea_setup.home,report.sea_setup.home_id);assert.equal(report.sea_setup.home_owner,0);
  assert.equal(report.sea_setup.declared.recipe.weapon_mode,9);assert.equal(report.sea_setup.declared.recipe.application_recipe,'foil-terraform-module-v1');
  report.production_bootstrap=verifySeaBootstrap(records,report.sea_setup);
  assert.equal(report.native_input.can_terraform,true);assert.equal(report.native_input.raise_rule.turns,1);assert.equal(report.native_input.raise_rule.sea.turns,1);
  assert.equal(report.sea_setup.declared.recipe.rows,5,'Fixed installed recipe must retain its source five-row composition');
  assert.equal(report.sea_setup.declared.restored.cost,40);
  assert.equal(report.sea_setup.declared.restored.minerals,report.sea_setup.declared.restored.cost+3);
  assert.ok(report.sea_setup.home_population>0);assert.equal(report.sea_setup.production.choice_id,report.sea_setup.declared.resumed_choice);
  assert.equal(report.native_input.energy.credits,report.native_input.starting_credits+report.native_input.faction_bonus);
  assert.ok(report.source_override.reads>0,'The rate override must be read through the actual loader');
  await key('Control+Alt+k','K',6);await wait(()=>{const ui=settled();return ui?.selected===ui?.actor&&ui;});
  // Reuse the proved controls HUD predicate. Native start_ui is earlier than
  // a rendered browser frame; no additional input or fixed sleep is needed.
  const renderDeadline=performance.now()+60000;let rendered=false;
  do{
    const frame=PNG.sync.read(await page.locator('#canvas').screenshot());let visible=0;const colors=new Set();
    for(let y=576;y<642;y++)for(let x=6;x<132;x++){const at=(y*frame.width+x)*4,rgb=frame.data.subarray(at,at+3);if(rgb.some(value=>value!==0)){visible++;colors.add([...rgb].join(','));}}
    if(visible>100&&colors.size>3){rendered=true;report.rendered_readiness={visible,distinct_rgb:colors.size,width:frame.width,height:frame.height};break;}
  }while(performance.now()<renderDeadline);
  assert.ok(rendered,'The actual game HUD must render before pointer input');
  const before=await observe('before-height');await capture('before-height');
  const nativeActor=before.world.units.find(row=>row.raw_id===before.ui.actor);assert.ok(nativeActor);
  assert.equal(report.sea_setup.home_id,Math.min(...before.world.bases.map(row=>row.raw_id)),'Source native base ordering must bind the first production receipt to the local producer');
  const nativeDetails=before.world.terrain_trace.unit_details[nativeActor.id];assert.equal(nativeDetails.movement_kind,'sea');
  assert.equal(nativeDetails.home_base_id,report.sea_setup.home_id);assert.equal(nativeDetails.can_terraform,true);
  assert.ok(before.ui.movement>0);
  const portQuote=Object.values(nativeDetails.quotes).find(row=>row?.destination.x===10&&row.destination.y===8);
  assert.ok(portQuote?.allowed_now,'Real production home port must remain traversable at the baseline');
  report.traversal={scope:'pure native movement quote only; no actual movement command',home_port_before:portQuote};
  for(const player of before.world.players){assert.ok(before.world.bases.some(base=>base.owner===player.id));assert.ok(before.world.units.some(unit=>unit.owner===player.id));}
  const pure=record=>assert.deepEqual(nativeHeightWorld(record),nativeHeightWorld(before),'Quote/draft/cancel must preserve all seven players, units, bases and every full terrain field');
  const viewport=before.ui.viewport;
  const openRaise=async()=>{
    if(!settled()?.root)await click(presentation.textButton('MENU',viewport));
    const headers=await wait(()=>latest('TH_HEADERS')),header=headers.filter(row=>row.id==='left_menu_terraform');assert.equal(header.length,1);
    await click(presentation.button('terraform-header',header[0].id,header[0].label,viewport));
    const rows=await wait(()=>latest('TH_ROWS')),raise=verifySeaRaiseMenu(rows,report.native_input,before);
    report.actual_sea_row=raise;
    await click(presentation.button('terraform-row','raise',raise.label,viewport));
    await wait(()=>{const ui=settled();return ui?.modal&&ui.popup_id==='terraforming_height'&&ui;});
  };
  await openRaise();const quoted=await observe('raise-quote');pure(quoted);await capture('raise-quote');
  const quote=quoted.ui.height_presentation.quote;
  verifySeaRaiseQuote(quote,report.native_input,quoted);
  assert.equal(quote.source_water,true);assert.equal(quote.destination_water,true);
  assert.ok(quote.source_elevation < -1000 && quote.destination_elevation < 0 && quote.destination_elevation > quote.source_elevation);
  assert.equal(quote.supported,true);assert.equal(quote.action,'raise');assert.equal(quote.unit_id,before.ui.actor);assert.equal(quote.owner,before.ui.owner);
  assert.equal(quote.mode,'functional_approximation');assert.equal(quote.policy,'application.band-slope-height.v1');assert.equal(quote.fee_policy,'application.band-fee.v1');
  assert.equal(quote.credits,report.native_input.energy.credits);assert.ok(Number.isSafeInteger(quote.fee)&&quote.fee>0&&quote.fee<=quote.credits);
  assert.equal(quoted.ui.choice,0,'Default choice is actual Cancel');assert.equal(quoted.ui.dialog.fee,quote.fee);assert.equal(quoted.ui.dialog.reserves,quote.credits);
  const dialogId=presentation.dialog();
  const cancel=await click(presentation.ok(viewport));
  await wait(()=>{const ui=settled();return ui&&!ui.modal&&ui.height_stage==='cancelled'&&ui;});
  await wait(()=>presentation.hiddenAfter(dialogId,cancel.up.seq));
  const cancelled=await observe('raise-cancel');pure(cancelled);await capture('raise-cancel');
  await openRaise();const reopened=await observe('raise-reopened');pure(reopened);
  assert.deepEqual(reopened.ui.height_presentation.quote,quote,'A cancelled quote did not change its authoritative intent');
  await click(presentation.choice(1,reopened.ui.dialog.choices[1],viewport));
  await wait(()=>{const ui=settled();return ui?.choice===1&&ui;});
  const draft=await observe('raise-payment-draft');pure(draft);await capture('raise-payment-draft');
  const confirmationFence=records.length;await click(presentation.ok(viewport));
  const receipt=await wait(()=>records.slice(confirmationFence).find(row=>row.kind==='TH_RECEIPT'&&row.value.name==='unit_terraform'&&row.value.success&&row.value.caller===quote.owner&&row.value.data.unit_id===quote.unit_id&&row.value.data.action==='raise')?.value);
  report.height_receipt=receipt;
  assert.equal(receipt.data.confirmed_height,true);assert.equal(typeof receipt.event_id,'string');
  // Event.cpp retains scalar-only receipt data. The nested peer quote is not
  // echoed; actual acceptance, fee and native effects bind the live UI quote.
  assert.equal(receipt.data.height_quote,undefined);
  report.peer_payload_quote_echo='unsupported: native event_result exposes scalar fields only';
  await wait(()=>{const ui=settled();return ui&&!ui.modal&&ui.pending===null&&!ui.native_pending&&!ui.tile_locked&&ui;});
  const completed=await observe('raise-paid-completion');await capture('raise-paid-completion');
  report.allowed_native_diff=auditPaidSeaHeight(before,completed,quote);
  report.expected_effect_from_live_quote=quote;
  const prior=nativeHeightWorld(before),after=nativeHeightWorld(completed),payer=before.world.players.find(row=>row.raw_id===quote.owner).id;
  assert.equal(after.terrain_trace.player_details[payer].energy.credits,prior.terrain_trace.player_details[payer].energy.credits-quote.fee);
  for(const player of before.world.players)if(player.id!==payer)assert.deepEqual(after.terrain_trace.player_details[player.id],prior.terrain_trace.player_details[player.id]);
  assert.equal(after.turn,prior.turn);assert.deepEqual(after.research,prior.research);assert.deepEqual(after.bases,prior.bases);assert.deepEqual(after.terrain_trace.base_details,prior.terrain_trace.base_details);
  assert.equal(completed.ui.movement_bits,0);assert.equal(completed.ui.order,'NO_ORDERS');assert.equal(completed.ui.work.work_units,0);
  const actorBefore=prior.units.find(row=>row.raw_id===quote.unit_id),actorAfter=after.units.find(row=>row.raw_id===quote.unit_id);
  assert.equal(actorAfter.x,actorBefore.x);assert.equal(actorAfter.y,actorBefore.y);assert.equal(actorAfter.prototype,actorBefore.prototype);
  for(const unit of prior.units)if(unit.raw_id!==quote.unit_id){assert.deepEqual(after.units.find(row=>row.raw_id===unit.raw_id),unit);assert.deepEqual(after.terrain_trace.unit_details[unit.id],prior.terrain_trace.unit_details[unit.id]);}
  const changed=[];
  for(const patch of quote.plan){const key=`${patch.x},${patch.y}`,tile=after.terrain_trace.tiles[key],old=prior.terrain_trace.tiles[key];assert.equal(tile.elevation.center,patch.canonical.elevation);assert.equal(tile.is_water,patch.canonical.is_water);assert.ok(tile.terrain_epoch>old.terrain_epoch);changed.push(key);}
  assert.ok(changed.includes(`${quote.x},${quote.y}`));assert.equal(after.terrain_trace.tiles[`${quote.x},${quote.y}`].elevation.center,quote.destination_elevation);
  report.effect={changed_quote_tiles:changed,actor_logical_position_preserved:true,actual_fee:quote.fee,domain:'sea remains sea',traversal:'actual native eight-neighbor quotes before/after; no physical move in this case'};
  report.unsupported=['original-game-height/fee/contour/climate/dome/victim agreement','water-to-land/coastline transitions, normal earned production timing and naval artwork fidelity','typed frontend mesh vertices/resident z/facing/tool frames','original animation timing/audio/music','live browser RNG-state getter','external debug-log autoscroll'];
  await key('Control+Alt+q','Q',6);await page.waitForFunction(()=>document.body.dataset.state==='exited');
  const exit=await page.evaluate(()=>({body_state:document.body.dataset.state,status_text:document.querySelector('#status').textContent}));
  assert.equal(exit.body_state,'exited');assert.equal(exit.status_text,'GLSMAC exited (0).');
  const code=exit.status_text.match(/^GLSMAC exited \((-?\d+)\)\.$/);assert.ok(code);
  report.native_raw_exit_code=Number(code[1]);report.native_exit={...exit,raw_code:report.native_raw_exit_code};
  assert.equal(report.native_raw_exit_code,0);assert.deepEqual(errors,[]);report.status='passed';
});
