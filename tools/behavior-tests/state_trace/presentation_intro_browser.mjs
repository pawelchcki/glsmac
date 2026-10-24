// Candidate-only intro observation. Missing video support is explicit; the real
// current logo/menu path is never relabelled a decoder failure or movie frame.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../wasm-tests/node_modules/playwright/index.mjs';
import {instrumentPresentation,installPresentationTransport,capturePresentation,waitPresentationQuiet} from './presentation_bridge.mjs';
import {createPresentationInputSession,presentationCheckpointPrefix} from './presentation_inputs.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const build=process.env.WASM_APP_DIR||`${root}build/wasm/bin`;
const assets=process.env.SMAC_ASSETS_DIR;assert.ok(assets,'SMAC_ASSETS_DIR required');
const artifacts=process.env.PRESENTATION_ARTIFACTS;assert.ok(artifacts,'PRESENTATION_ARTIFACTS required');mkdirSync(artifacts,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const production=Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`,{recursive:true}).filter(name=>name.endsWith('.gls.js')).sort().map(name=>[`GLSMAC_data/default/${name}`,readFileSync(`${root}GLSMAC_data/default/${name}`,'utf8')]));
const scripts={...production};instrumentPresentation(scripts);
const sliding='GLSMAC_data/default/ui/parts/mainmenu/sliding.gls.js';
const marker='current_menublock.right = 0;';assert.equal(scripts[sliding].split(marker).length,2);
scripts[sliding]=scripts[sliding].replace(marker,marker+" #print('PRESENTATION_MENU_READY');");
const implementation={name:'GLSMAC actual intro logo/menu with native raw observer',kind:'candidate',launch_method:'trusted-host-button-space',scripts_sha256:hash(JSON.stringify(production)),observed_scripts_sha256:hash(JSON.stringify(scripts)),runtime_js_sha256:hash(readFileSync(`${build}/GLSMAC.js`)),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`))};
const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});let serverLog='';server.stderr.on('data',value=>serverLog+=value);let browser,page;let failure=null,outcome=null;
try{
 const origin=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error(serverLog)),60000);server.on('error',reject);server.stdout.on('data',value=>{text+=value;const match=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1100,height:1100},deviceScaleFactor:1});page=await context.newPage();await installPresentationTransport(page);page.setDefaultTimeout(60000);
 await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.state==='ready');await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${origin}/assets/manifest.json`);
 await page.evaluate(scripts=>{for(const[name,source]of Object.entries(scripts)){const path=`/presentation-intro/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}const run=Module.callMain;Module.callMain=args=>run([...args,'--datapath','/presentation-intro/GLSMAC_data']);},scripts);
 // A trusted Space release activates the host button without pre-arming pointer motion.
 await page.locator('#start').focus();await page.keyboard.press('Space');
 implementation.launch_user_activation=await page.evaluate(()=>({has_been_active:navigator.userActivation.hasBeenActive}));assert.equal(implementation.launch_user_activation.has_been_active,true,'trusted launcher user activation');await page.waitForFunction(()=>document.body.dataset.state==='running');
 await page.waitForFunction(()=>window.__presentationArmed===1);
 const plan=JSON.parse(readFileSync(`${root}tools/behavior-tests/state_trace/presentation-cases.json`,'utf8')).cases.find(c=>c.id==='presentation-intro-launch').input;
 const ledger=createPresentationInputSession(page,plan);await ledger.validate();await ledger.end();await ledger.begin('intro-first-outcome');
 await page.waitForFunction(()=>document.querySelector('#log').textContent.includes('PRESENTATION_MENU_READY'),null,{timeout:15000});
 if(process.env.PRESENTATION_INPUT_PROBE==='1'){
   // Test-only trusted CDP mouse input; normal pinned route never executes it.
   const box=await page.locator('#canvas').boundingBox();
   const cdp=await context.newCDPSession(page);
   for(let pass=0;pass<4;pass++){
     await Promise.all(Array.from({length:40},(_,n)=>cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+25+n,y:box.y+40+pass,button:'none'})));
   }
   await page.keyboard.down('Shift');await page.keyboard.press('ArrowDown');await page.keyboard.up('Shift');
 }
 await ledger.end();await ledger.checkpoint('intro-first-outcome');
 await ledger.begin('skip-if-playing'); // Actual current path reaches menu, so no Escape is injected.
 await ledger.end();await ledger.checkpoint('after-conditional-skip');
 outcome={kind:'main-menu-reached',video_observation:'unsupported',conditional_skip:'not-playing-no-skip'};
 await page.locator('#canvas').screenshot({path:`${artifacts}/menu.png`});await waitPresentationQuiet(page);
 const log=await page.locator('#log').textContent();assert.doesNotMatch(log,/PTRACE(?:\||_ARMED)/,'observer output never reaches visible app log');
 const capture=await capturePresentation(page,log,{seal:true});
 writeFileSync(`${artifacts}/presentation-raw.json`,JSON.stringify(capture,null,2));
 if(process.env.PRESENTATION_INPUT_PROBE==='1'){
   // Concurrent CDP motion exposes the existing browser/SDL proxy coordinate
   // mismatch. Its complete browser and native ledgers must remain diagnostic;
   // never suppress the mismatch to label the burst completely attributed.
   assert.equal(capture.input_attribution.complete,false,'concurrent proxy mismatch stays explicitly incomplete');
   assert.ok(capture.input_attribution.gaps.some(gap=>gap.includes('payload or action differs')),'proxy payload mismatch retained');
   const events=capture.batches.flatMap(batch=>batch.events);
   assert.ok(events.some(e=>e.kind==='input.disposition'&&e.data.status==='coalesced'),'actual SDL motion coalescing observed');
   assert.ok(capture.browser_inputs.some(e=>e.type==='keyup'&&e.code==='ShiftLeft'),'unplanned modifier release retained');
 }
 for(const [index,point] of capture.input_checkpoints.entries())writeFileSync(`${artifacts}/presentation-checkpoint-${point.id}.json`,JSON.stringify(presentationCheckpointPrefix(capture,index+1,point.id,point.after_action),null,2));
} catch(error){failure=String(error);}
finally{
 if(page){writeFileSync(`${artifacts}/application.log`,await page.locator('#log').textContent().catch(()=>''));if(failure){writeFileSync(`${artifacts}/presentation-failed-transport.json`,JSON.stringify(await page.evaluate(()=>({batches:window.__presentationBatches,error:window.__presentationTransportError})).catch(()=>({unavailable:true})),null,2));}}
 await browser?.close();server.kill();writeFileSync(`${artifacts}/server.log`,serverLog);
 const result={implementation,outcome,failure,coverage:{semantic_profile:false,video_requests:false,video_frame_output:false,audio_output:false,prelaunch_history:false}};
 writeFileSync(`${artifacts}/intro.json`,JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result)+'\n');
}
