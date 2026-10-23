// Real keyboard-driven popup latency. PNG analysis runs only after lossless capture stops.
// Chrome CPU deltas are diagnostic aggregates, not attribution to an individual function.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from '../wasm-tests/node_modules/playwright/index.mjs';
import {PNG} from '../wasm-tests/node_modules/pngjs/lib/png.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm/bin`;
const sourceRoot = process.env.WASM_SCRIPTS_ROOT || root;
const assets = process.env.SMAC_ASSETS_DIR;
assert.ok(assets, 'SMAC_ASSETS_DIR is required');
const artifactBase = process.env.POPUP_PERF_ARTIFACTS || '/tmp/glsmac-popup-latency';
mkdirSync(artifactBase, {recursive:true});
// Preserve earlier evidence, but never include it in this execution's frames.
const artifacts = mkdtempSync(`${artifactBase}/run-`);
const sessions=Number(process.env.POPUP_PERF_SESSIONS||3);assert.ok(Number.isInteger(sessions)&&sessions>=1&&sessions<=10,'POPUP_PERF_SESSIONS must be1..10');
const request={cases:Array.from({length:sessions},(_,n)=>({id:`session-${n}`}))};
const cachePath=`${build}/../CMakeCache.txt`;
const buildProfile=readFileSync(cachePath,'utf8').match(/^CMAKE_BUILD_TYPE:STRING=(.+)$/m)?.[1]||null;
const hash = x=>createHash('sha256').update(x).digest('hex');
const production = Object.fromEntries(readdirSync(`${sourceRoot}/GLSMAC_data/default`,{recursive:true}).filter(x=>x.endsWith('.gls.js')).sort().map(x=>[`GLSMAC_data/default/${x}`,readFileSync(`${sourceRoot}/GLSMAC_data/default/${x}`,'utf8')]));
const scripts={...production};
function observe(file,marker,replacement){assert.equal(scripts[file].split(marker).length,2,`One observational marker ${marker}`);scripts[file]=scripts[file].replace(marker,replacement);}
const sliding='GLSMAC_data/default/ui/parts/mainmenu/sliding.gls.js';
observe(sliding,"this.manager.push('sliding', data);","this.manager.push('sliding', data); #print('OSEQ_MENU_BEGIN');");
observe(sliding,'const itembody = create_item(entry[0], bottom);',"const itembody = create_item(entry[0], bottom); #print('OSEQ_ROW|' + entry[0]);");
observe(sliding,"(entry.obj).addclass('menublock-item-active');","(entry.obj).addclass('menublock-item-active'); #print('OSEQ_SELECTED|' + #to_string(active_entry_index));");
observe(sliding,'current_menublock.right = 0;',"current_menublock.right = 0; #print('OSEQ_MENU_REST');");
observe('GLSMAC_data/default/ui/parts/mainmenu/popup.gls.js',"this.manager.push('popup', data);","this.manager.push('popup', data); #print('OSEQ_POPUP|' + data.title);");
observe('GLSMAC_data/default/ui/parts/mainmenu/popup.gls.js', 'return {};', "#print('OSEQ_POPUP_END|' + data.title); return {};");
const implementation={name:'GLSMAC popup latency through Chromium/SDL',kind:'candidate',build_profile:buildProfile,capture_root:artifacts,scripts_sha256:hash(JSON.stringify(production)),observed_scripts_sha256:hash(JSON.stringify(scripts)),observer_sha256:hash(readFileSync(fileURLToPath(import.meta.url))),node:process.version,fontconfig_file:process.env.FONTCONFIG_FILE||null,runtime_js_sha256:hash(readFileSync(`${build}/GLSMAC.js`)),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`))};
const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});let serverLog='';server.stderr.on('data',x=>serverLog+=x);
let browser;let browserCDP;const results=[];
try{
 const origin=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(serverLog)),60000);server.on('error',reject);server.on('exit',c=>reject(Error(`Server exited ${c}: ${serverLog}`)));server.stdout.on('data',x=>{out+=x;const m=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 implementation.browser=browser.version();
 browserCDP=await browser.newBrowserCDPSession();
 for(const item of request.cases){
  const dir=`${artifacts}/${item.id}`;mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport:{width:1024,height:768},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',x=>errors.push(String(x)));page.on('console',x=>{if(/RuntimeError:|worker sent an error!|(?:WebGL|GL_).*(?:INVALID|error)/i.test(x.text()))errors.push(x.text());});
  const log=()=>page.locator('#log').textContent();
  const healthy=async()=>{assert.deepEqual(errors,[]);assert.equal(await page.locator('body').getAttribute('data-state'),'running');assert.doesNotMatch(await log(),/FATAL ERROR|Unhandled exception|Aborted\(/i);};
  const menu=async()=>{const text=await log();const begin=text.lastIndexOf('OSEQ_MENU_BEGIN');const tail=text.slice(begin);return{begin,rows:[...tail.matchAll(/OSEQ_ROW\|([^\r\n]+)/g)].map(x=>x[1].toUpperCase()),selected:Number([...tail.matchAll(/OSEQ_SELECTED\|(\d+)/g)].at(-1)?.[1]),rest:tail.includes('OSEQ_MENU_REST')};};
  const waitMenu=async(previous=-1)=>{for(let n=0;n<150;n++){await healthy();const m=await menu();if(m.begin>previous&&m.rest&&m.rows.length){await page.waitForTimeout(150);return m;}await page.waitForTimeout(100);}throw Error('Actual production menu did not settle');};
  const choose=async(label)=>{const m=await waitMenu();const target=m.rows.indexOf(label);assert.ok(target>=0,`Actual menu control ${label}`);for(let i=0;i<m.selected;i++)await page.keyboard.press('ArrowUp');for(let i=0;i<target;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');return waitMenu(m.begin);};
  const samples=[]; const captures=[];let cdp=null;let runtimeFailure=null;
  const popupCount=async()=>((await log()).match(/OSEQ_POPUP_END\|/g)||[]).length;
  const cpu=async()=>Object.fromEntries((await browserCDP.send('SystemInfo.getProcessInfo')).processInfo.map(x=>[x.id,x.cpuTime]));
  const measure=async(name,key)=>{
   const previous=await popupCount();captures.length=0;
   const before=await cpu();const started=Date.now()/1000;
   await page.keyboard.press(key);
   await page.waitForFunction(previous=>(document.querySelector('#log').textContent.match(/OSEQ_POPUP_END\|/g)||[]).length>previous,previous);
   const ended=Date.now()/1000;const after=await cpu();await healthy();
   await page.waitForTimeout(500);
   const final=await page.locator('#canvas').screenshot();
   const sample={name,index:samples.filter(x=>x.name===name).length,input_epoch:started,end_epoch:ended,handler_upper_ms:(ended-started)*1000,cpu_ms:1000*Object.entries(after).reduce((n,[id,t])=>n+t-(before[id]||0),0),captures:captures.map(x=>({timestamp:x.timestamp,buffer:x.buffer}))};
   sample.final=final;samples.push(sample);
  };
  try{
   await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.state==='ready');await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${origin}/assets/manifest.json`);
   await page.evaluate(scripts=>{for(const[n,s]of Object.entries(scripts)){const p=`/opening-sequence/${n}`;Module.FS.mkdirTree(p.slice(0,p.lastIndexOf('/')));Module.FS.writeFile(p,s);}const run=Module.callMain;Module.callMain=args=>run([...args,'--datapath','/opening-sequence/GLSMAC_data']);},scripts);
   await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.state==='running');await page.addStyleTag({content:'#canvas {position:fixed;left:0;top:0;margin:0;max-width:none;z-index:10}'});
   await waitMenu();for(const label of ['START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN'])await choose(label);
   cdp=await context.newCDPSession(page);
   cdp.on('Page.screencastFrame',event=>{void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(error=>errors.push(String(error)));captures.push({timestamp:event.metadata.timestamp,buffer:Buffer.from(event.data,'base64')});});
   await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1});
   await measure('faction','Enter');
   for(let n=0;n<4;n++){await measure('leader-name','Enter');await measure('faction','Escape');}
   await cdp.send('Page.stopScreencast');
   for(let ordinal=0;ordinal<samples.length;ordinal++){const sample=samples[ordinal];const name=sample.name;const final=sample.final;
   writeFileSync(`${dir}/${ordinal}-${name}-final.png`,final);
   const target=PNG.sync.read(final);assert.deepEqual([target.width,target.height],[1024,768]);
   const w=name==='faction'?800:660;const h=name==='faction'?340:130;const left=(1024-w)/2;const top=(768-h)/2;
   for(const edge of [top,top+h-1]){let visible=false;for(let dy=-3;dy<=3;dy++){let matching=0;let total=0;for(let x=left+8;x<left+w-8;x+=8){const at=((edge+dy)*1024+x)*4;total++;if(Math.abs(target.data[at]-73)<5&&Math.abs(target.data[at+1]-108)<5&&Math.abs(target.data[at+2]-61)<5)matching++;}if(matching>total*0.8)visible=true;}assert.ok(visible,'Actual popup border visible');}
   let painted=null;let changes=null;
   for(let n=0;n<sample.captures.length;n++){
    const f=sample.captures[n];const image=PNG.sync.read(f.buffer);assert.deepEqual([image.width,image.height],[1024,768]);assert.equal(image.data.length,target.data.length);let diff=0;
    for(let i=0;i<image.data.length;i+=4){if(image.data[i]!==target.data[i]||image.data[i+1]!==target.data[i+1]||image.data[i+2]!==target.data[i+2])diff++;if(diff>0)break;}
    writeFileSync(`${dir}/${ordinal}-${name}-frame-${String(n).padStart(3,'0')}.png`,f.buffer);
    if(diff===0&&f.timestamp>=sample.input_epoch&&painted===null){painted=(f.timestamp-sample.input_epoch)*1000;changes=diff;}
   }
   assert.ok(painted!==null&&painted>=0,'Actual final popup frame must be observed after input');sample.paint_ms=painted;sample.accepted_pixel_differences=changes;sample.capture_count=sample.captures.length;sample.maximum_captured_frame_gap_ms=sample.captures.slice(1).reduce((largest,frame,n)=>Math.max(largest,(frame.timestamp-sample.captures[n].timestamp)*1000),0);delete sample.captures;delete sample.final;console.error(JSON.stringify(sample));
   }

  }catch(error){runtimeFailure=String(error);console.error(runtimeFailure);for(const sample of samples){delete sample.captures;delete sample.final;}await page.locator('#canvas').screenshot({path:`${dir}/failure.png`,timeout:3000}).catch(()=>{});}
  finally{writeFileSync(`${dir}/application.log`,await log().catch(()=>''));writeFileSync(`${dir}/metadata.json`,JSON.stringify({implementation,errors},null,2));await context.close();}
  results.push({samples,runtimeFailure});
 }
}finally{await browser?.close();server.kill();writeFileSync(`${artifacts}/server.log`,serverLog);}
const response={version:1,kind:'popup-latency',implementation,results}; if(results.some(x=>x.runtimeFailure!==null))process.exitCode=1;writeFileSync(`${artifacts}/candidate.json`,JSON.stringify(response,null,2));process.stdout.write(JSON.stringify(response)+'\n');
