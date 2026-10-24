// Real production opening controls, with read-only native/visible-node telemetry.
import assert from 'node:assert/strict';
import {instrumentPresentation, installPresentationTransport, capturePresentation, waitPresentationQuiet} from '../state_trace/presentation_bridge.mjs';
import {createPresentationInputSession,presentationCheckpointPrefix,presentationOpeningInputPlan} from '../state_trace/presentation_inputs.mjs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../wasm-tests/node_modules/playwright/index.mjs';
import {PNG} from '../../wasm-tests/node_modules/pngjs/lib/png.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm/bin`;
const sourceRoot = process.env.WASM_SCRIPTS_ROOT || root;
const assets = process.env.SMAC_ASSETS_DIR;
assert.ok(assets, 'SMAC_ASSETS_DIR is required');
const artifacts = process.env.OPENING_SEQUENCE_ARTIFACTS || `${root}tools/wasm-tests/build/artifacts/opening-sequence`;
mkdirSync(artifacts, {recursive:true});
const request = JSON.parse(await new Promise(resolve => {let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>text+=x);process.stdin.on('end',()=>resolve(text));}));
const hash = x=>createHash('sha256').update(x).digest('hex');
const production = Object.fromEntries(readdirSync(`${sourceRoot}/GLSMAC_data/default`,{recursive:true}).filter(x=>x.endsWith('.gls.js')).sort().map(x=>[`GLSMAC_data/default/${x}`,readFileSync(`${sourceRoot}/GLSMAC_data/default/${x}`,'utf8')]));
const scripts={...production};
const presentationEnabled = process.env.PRESENTATION_TRACE === '1';
const presentationSkipIntro = presentationEnabled && process.env.PRESENTATION_INTRO === 'disabled';
const presentationStepCount = presentationEnabled && process.env.PRESENTATION_STOP_AT_FIRST_PLAYABLE === '1' ? 4 : 5;
if (presentationEnabled) instrumentPresentation(scripts);
function observe(file,marker,replacement){assert.equal(scripts[file].split(marker).length,2,`One observational marker ${marker}`);scripts[file]=scripts[file].replace(marker,replacement);}
const sliding='GLSMAC_data/default/ui/parts/mainmenu/sliding.gls.js';
observe(sliding,"this.manager.push('sliding', data);","this.manager.push('sliding', data); #print('OSEQ_MENU_BEGIN');");
observe(sliding,'const itembody = create_item(entry[0], bottom);',"const itembody = create_item(entry[0], bottom); #print('OSEQ_ROW|' + entry[0]);");
observe(sliding,"(entry.obj).addclass('menublock-item-active');","(entry.obj).addclass('menublock-item-active'); #print('OSEQ_SELECTED|' + #to_string(active_entry_index));");
observe(sliding,'current_menublock.right = 0;',"current_menublock.right = 0; #print('OSEQ_MENU_REST');");
observe('GLSMAC_data/default/ui/parts/mainmenu/popup.gls.js',"this.manager.push('popup', data);","this.manager.push('popup', data); #print('OSEQ_POPUP|' + data.title);");
const hasOpening = existsSync(`${sourceRoot}/GLSMAC_data/default/ui/parts/game/opening.gls.js`);
const viewObservation = hasOpening ? `
const view = #include('ui/parts/game/opening');
if (view.visible_phase == null) { return true; }
const phase = view.visible_phase;
let caption = '~'; let value = '~'; let cx = 0; let cy = 0; let dx = 0; let dy = 0;
if (view.caption_node != null) { caption = #uppercase(view.caption_node.text); }
if (view.input != null) { value = #uppercase(view.input.value); }
if (view.confirm != null) { cx = view.confirm_x; cy = view.confirm_y; }
if (view.dismiss != null) { dx = view.dismiss_x; dy = view.dismiss_y; }
` : `const phase = 'map'; const caption = '~'; const value = '~'; const cx = 0; const cy = 0; const dx = 0; const dy = 0;`;
observe('GLSMAC_data/default/main.gls.js','glsmac.run();',`
glsmac.on('configure_game', (e) => {
 const game = e.game;
 game.on('start_ui', (e) => {
  #print('OSEQ_FACTION|' + game.get_player().get_faction().id);
  glsmac.ui.root.timer(100, () => {
   ${viewObservation}
   #print('OSEQ_STATE|' + phase + '|' + caption + '|' + value + '|' + #to_string(game.get_turn()) + '|' + #to_string(cx) + '|' + #to_string(cy) + '|' + #to_string(dx) + '|' + #to_string(dy));
   return true;
  });
 });
});
glsmac.run();`);
const implementation={name:'GLSMAC production opening sequence through Chromium/SDL',kind:'candidate',launch_method:presentationEnabled?'trusted-host-button-space':'trusted-host-button-pointer',scripts_sha256:hash(JSON.stringify(production)),observed_scripts_sha256:hash(JSON.stringify(scripts)),runtime_js_sha256:hash(readFileSync(`${build}/GLSMAC.js`)),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`))};
const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});let serverLog='';server.stderr.on('data',x=>serverLog+=x);
let browser;const results=[];
try{
 const origin=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(serverLog)),60000);server.on('error',reject);server.on('exit',c=>reject(Error(`Server exited ${c}: ${serverLog}`)));server.stdout.on('data',x=>{out+=x;const m=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const item of request.cases){
  const dir=`${artifacts}/${item.id}`;mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport:{width:1100,height:1100},deviceScaleFactor:1});const page=await context.newPage();if(presentationEnabled)await installPresentationTransport(page);page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',x=>errors.push(String(x)));page.on('console',x=>{if(/RuntimeError:|worker sent an error!|(?:WebGL|GL_).*(?:INVALID|error)/i.test(x.text()))errors.push(x.text());});
  const log=()=>page.locator('#log').textContent();
  const healthy=async()=>{assert.deepEqual(errors,[]);assert.equal(await page.locator('body').getAttribute('data-state'),'running');assert.doesNotMatch(await log(),/FATAL ERROR|Unhandled exception|Aborted\(/i);};
  const plan=presentationEnabled?presentationOpeningInputPlan(JSON.parse(readFileSync(`${root}tools/behavior-tests/state_trace/presentation-cases.json`,'utf8')).cases.find(c=>c.id==='presentation-opening-keyboard').input,{steps:presentationStepCount,confirmation:item.input.confirmation}):null;
  const ledger=presentationEnabled?createPresentationInputSession(page,plan):null;
  const act=async(id,fn)=>{if(ledger)await ledger.begin(id);await fn();if(ledger)await ledger.end();};
  const picture=async(name)=>{await healthy();if(presentationEnabled){assert.doesNotMatch(await log(),/PTRACE(?:\||_ARMED)/,'Raw observer payload never enters visible application log');writeFileSync(`${dir}/application-progress.log`,await log());writeFileSync(`${dir}/presentation-progress.json`,JSON.stringify(await capturePresentation(page,await log()),null,2));}const bytes=await page.locator('#canvas').screenshot({path:`${dir}/${name}.png`});const png=PNG.sync.read(bytes);assert.deepEqual([png.width,png.height],[1024,768]);return png;};
  const menu=async()=>{const text=await log();const begin=text.lastIndexOf('OSEQ_MENU_BEGIN');const tail=text.slice(begin);return{begin,rows:[...tail.matchAll(/OSEQ_ROW\|([^\r\n]+)/g)].map(x=>x[1].toUpperCase()),selected:Number([...tail.matchAll(/OSEQ_SELECTED\|(\d+)/g)].at(-1)?.[1]),rest:tail.includes('OSEQ_MENU_REST')};};
  const waitMenu=async(previous=-1)=>{for(let n=0;n<150;n++){await healthy();const m=await menu();if(m.begin>previous&&m.rest&&m.rows.length){await page.waitForTimeout(150);return m;}await page.waitForTimeout(100);}throw Error('Actual production menu did not settle');};
  const choose=async(label)=>{const m=await waitMenu();const target=m.rows.indexOf(label);assert.ok(target>=0,`Actual menu control ${label}`);for(let i=0;i<m.selected;i++)await page.keyboard.press('ArrowUp');for(let i=0;i<target;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');return waitMenu(m.begin);};
  const actual=async()=>{const m=[...(await log()).matchAll(/OSEQ_STATE\|([^|\r\n]+)\|([^|\r\n]+)\|([^|\r\n]+)\|(\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)/g)].at(-1);return m?{frame:{phase:m[1],caption:m[2]==='~'?null:m[2],value:m[3]==='~'?null:m[3],native_turn:Number(m[4])},confirm:[Number(m[5]),Number(m[6])],dismiss:[Number(m[7]),Number(m[8])]}:null;};
  const click=async([x,y])=>{assert.ok(x>0&&y>0,'Actual visible control coordinates exist');const b=await page.locator('#canvas').boundingBox();await page.mouse.click(b.x+x,b.y+y);};
  const frames=[];let failure=null;let runtimeFailure=null;
  const recordFailure=(error,stage)=>{const detail=`${stage}: ${String(error)}`;runtimeFailure=runtimeFailure?`${runtimeFailure}\n${detail}`:detail;};
  try{
   await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.state==='ready');await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${origin}/assets/manifest.json`);
   await page.evaluate(({scripts,skipIntro})=>{for(const[n,s]of Object.entries(scripts)){const p=`/opening-sequence/${n}`;Module.FS.mkdirTree(p.slice(0,p.lastIndexOf('/')));Module.FS.writeFile(p,s);}const run=Module.callMain;Module.callMain=args=>run([...args,'--datapath','/opening-sequence/GLSMAC_data',...(skipIntro?['--skipintro']:[])]);},{scripts,skipIntro:presentationSkipIntro});
   // Space activates the host button on release, preserving trusted browser user activation without pre-arming pointer motion.
   if(presentationEnabled){await page.locator('#start').focus();await page.keyboard.press('Space');}else await page.locator('#start').click();
   implementation.launch_user_activation=await page.evaluate(()=>({has_been_active:navigator.userActivation.hasBeenActive}));assert.equal(implementation.launch_user_activation.has_been_active,true,'trusted launcher user activation');await page.waitForFunction(()=>document.body.dataset.state==='running');await page.addStyleTag({content:'#canvas {position:fixed;left:0;top:0;margin:0;max-width:none;z-index:10}'});
   await waitMenu();
   if(ledger){await ledger.validate();await ledger.end();await ledger.checkpoint('main-menu');}
   for(const [id,label] of [['start-game','START GAME'],['random-map','MAKE RANDOM MAP'],['tiny','TINY PLANET'],['citizen','CITIZEN']])await act(id,()=>choose(label));
   const popupCount=(await log()).split('OSEQ_POPUP|').length;await act('standard-rules',async()=>{await page.keyboard.press('Enter');await page.waitForFunction(count=>document.querySelector('#log').textContent.split('OSEQ_POPUP|').length>count,popupCount);});
   const factionCount=(await log()).split('OSEQ_POPUP|').length;await act('initial-cybernetic-faction',async()=>{await page.keyboard.press('Enter');await page.waitForFunction(count=>document.querySelector('#log').textContent.split('OSEQ_POPUP|').length>count,factionCount);});await act('default-leader',()=>page.keyboard.press('Enter'));
   for(let step=0;step<presentationStepCount;step++){
    const phase=['planetfall','first-base-name','tour','map','map'][step];let observed;
    for(let n=0;n<300;n++){await healthy();observed=await actual();if(observed&&(observed.frame.phase===phase)&&(step!==4||observed.frame.native_turn!==frames.at(-1).native_turn))break;if(observed?.frame.phase==='map'&&step<3)break;await page.waitForTimeout(100);}
    if(!observed)throw Error(`No actual opening/UI phase was observed at step ${step}`);
    assert.match(await log(), /OSEQ_FACTION\|CONSCIOUSNESS(?:\r?\n|$)/, 'The declared Cybernetic faction was actually selected');
    if(ledger)await ledger.checkpoint(['planetfall','first-base-name','tour','first-playable-turn','after-next-turn'][step]);
    await picture(`phase-${step}`);frames.push(observed.frame);
    if(observed.frame.phase!==phase||(step===4&&observed.frame.native_turn===frames.at(-2)?.native_turn)){failure={step,reason:`Missing actual ${phase} control; visible ${observed.frame.phase}, native turn ${observed.frame.native_turn}`};break;}
    if(step<2){await act(step===0?'planetfall':'first-base-name',async()=>{if(item.input.confirmation==='keyboard')await page.keyboard.press('Enter');else await click(observed.confirm);});}
    else if(step===2)await act('dismiss-tour',()=>click(observed.dismiss));
    else if(step===3&&presentationStepCount>4)await act('advance-turn',()=>page.keyboard.press('Space'));
   }
  }catch(error){recordFailure(error,'opening sequence');await page.locator('#canvas').screenshot({path:`${dir}/failure.png`,timeout:3000}).catch(()=>{});}
  finally{if(presentationEnabled){try{await waitPresentationQuiet(page);}catch(error){recordFailure(error,'final quiet');}const observedLog=await log().catch(()=>'');try{const capture=await capturePresentation(page,observedLog,{seal:true});writeFileSync(`${dir}/presentation-raw.json`,JSON.stringify(capture,null,2));for(const [index,point] of capture.input_checkpoints.entries())writeFileSync(`${dir}/presentation-checkpoint-${point.id}.json`,JSON.stringify(presentationCheckpointPrefix(capture,index+1,point.id,point.after_action),null,2));}catch(error){recordFailure(error,'final capture');writeFileSync(`${dir}/presentation-failed-transport.json`,JSON.stringify(await page.evaluate(()=>({batches:window.__presentationBatches,error:window.__presentationTransportError,browser_inputs:window.__presentationBrowserInputs,input_checks:window.__presentationInputChecks,input_checkpoints:window.__presentationInputCheckpoints,input_plan:window.__presentationInputPlan})).catch(()=>({unavailable:true})),null,2));}}writeFileSync(`${dir}/application.log`,await log().catch(()=>''));writeFileSync(`${dir}/metadata.json`,JSON.stringify({implementation,errors,frames,failure,runtimeFailure},null,2));await context.close();}
  results.push(runtimeFailure ? {id:item.id,status:'error',reason:runtimeFailure} : {id:item.id,status:'ok',output:{frames,completed:failure===null&&frames.length===presentationStepCount,failure}});
 }
}finally{await browser?.close();server.kill();writeFileSync(`${artifacts}/server.log`,serverLog);}
const response={version:1,implementation,results};writeFileSync(`${artifacts}/candidate.json`,JSON.stringify(response,null,2));process.stdout.write(JSON.stringify(response)+'\n');
