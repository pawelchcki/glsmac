// Real production opening controls, with read-only native/visible-node telemetry.
import assert from 'node:assert/strict';
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
const artifacts = process.env.INTERFACE_TOUR_ARTIFACTS || `${root}tools/wasm-tests/build/artifacts/interface-tour`;
mkdirSync(artifacts, {recursive:true});
const request = JSON.parse(await new Promise(resolve => {let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>text+=x);process.stdin.on('end',()=>resolve(text));}));
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
const hasTour = existsSync(`${sourceRoot}/GLSMAC_data/default/ui/parts/game/interface_tour.gls.js`);
const tourSource = hasTour ? "const guided = #include('ui/parts/game/interface_tour');" : 'const guided = null;';
const viewObservation = `
const view = #include('ui/parts/game/opening');
if (view.visible_phase == null) { return true; }
const phase = view.visible_phase;
let caption = '~'; let value = '~'; let cx = 0; let cy = 0; let dx = 0; let dy = 0;
if (view.caption_node != null) { caption = #uppercase(view.caption_node.text); }
if (view.input != null) { value = #uppercase(view.input.value); }
if (view.confirm != null) { cx = view.confirm_x; cy = view.confirm_y; }
if (view.dismiss != null) { dx = view.dismiss_x; dy = view.dismiss_y; }
${tourSource}
const stage = guided != null && guided.active ? 'guided' : (phase == 'tour' ? 'tour-prompt' : phase);
let body = ''; let nodes = [];
if (stage == 'guided' && #is_defined(guided.paragraph_nodes)) { nodes = guided.paragraph_nodes; }
else if (stage == 'tour-prompt' && #is_defined(view.paragraph_nodes)) { nodes = view.paragraph_nodes; }
for (node of nodes) { if (body != '') { body += ' '; } body += node.text; }
let labels = ''; let points = '';
if (guided != null && guided.active) {
 for (control of guided.controls) {
  if (labels != '') { labels += '~'; points += '~'; }
  labels += #uppercase(control.node.text); points += #to_string(control.x) + ',' + #to_string(control.y);
 }
} else if (phase == 'tour') {
 if (#is_defined(view.tour_control) && view.tour_control != null) {
  labels = #uppercase(view.tour_control.text) + '~'; points = #to_string(view.tour_x) + ',' + #to_string(view.tour_y) + '~';
 }
 if (view.dismiss != null) { labels += #uppercase(view.dismiss.text); points += #to_string(dx) + ',' + #to_string(dy); }
}
const menu = view.p.modules.menu;
const key = stage + '|' + body + '|' + labels;
if (key != last_view) {
 last_view = key; observed_serial++;
 let units = ''; const tm = game.get_tm();
 for (let y = 0; y < tm.get_map_height(); y++) {
  for (let x = y % 2; x < tm.get_map_width(); x += 2) {
   for (unit of tm.get_tile(x,y).get_units()) {
    if (unit.owner == game.get_player().id) {
     units += #to_string(unit.id) + ',' + unit.def + ',' + #to_string(x) + ',' + #to_string(y) + ',' + #to_string(unit.health) + ',' + #to_string(unit.movement) + ',' + unit.get_order() + ',' + #to_string(unit.moved_this_turn) + ';';
    }
   }
  }
 }
 #print('ITOUR_UNITS|' + #to_string(observed_serial) + '|' + units);
}
let base_name = ''; let unit_name = '';
const state = game.get_opening_state();
for (base of game.get_bm().get_bases()) {
 if (base.id == state.base_id) {
  base_name = base.name + '';
  for (unit of base.get_tile().get_units()) { if (unit.owner == game.get_player().id && unit_name == '') { unit_name = unit.get_def().name + ''; } }
 }
}
#print('ITOUR_STATE|' + #to_string(observed_serial) + '|' + stage + '|' + labels + '|' + #to_string(menu.menus.left_menu.is_open) + '|' + #to_string(menu.menus.right_menu.is_open) + '|' + #to_string(game.get_turn()) + '|' + points + '|' + body + '|' + base_name + '|' + unit_name);

`;
observe('GLSMAC_data/default/main.gls.js','glsmac.run();',`
glsmac.on('configure_game', (e) => {
 const game = e.game;
 game.on('start_ui', (e) => {
  #print('OSEQ_FACTION|' + game.get_player().get_faction().id);
  let last_view = null; let observed_serial = 0;
  glsmac.ui.root.timer(100, () => {
   ${viewObservation}
   #print('OSEQ_STATE|' + phase + '|' + caption + '|' + value + '|' + #to_string(game.get_turn()) + '|' + #to_string(cx) + '|' + #to_string(cy) + '|' + #to_string(dx) + '|' + #to_string(dy));
   return true;
  });
 });
});
glsmac.run();`);
const implementation={name:'GLSMAC production guided interface Tour through Chromium/SDL',kind:'candidate',scripts_sha256:hash(JSON.stringify(production)),observed_scripts_sha256:hash(JSON.stringify(scripts)),runtime_js_sha256:hash(readFileSync(`${build}/GLSMAC.js`)),runtime_wasm_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`))};
const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});let serverLog='';server.stderr.on('data',x=>serverLog+=x);
let browser;const results=[];
try{
 const origin=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(serverLog)),60000);server.on('error',reject);server.on('exit',c=>reject(Error(`Server exited ${c}: ${serverLog}`)));server.stdout.on('data',x=>{out+=x;const m=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 browser=await chromium.launch({headless:true,executablePath:process.env.WASM_BROWSER_EXECUTABLE||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const item of request.cases){
  const dir=`${artifacts}/${item.id}`;mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport:{width:1100,height:1100},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',x=>errors.push(String(x)));page.on('console',x=>{if(/RuntimeError:|worker sent an error!|(?:WebGL|GL_).*(?:INVALID|error)/i.test(x.text()))errors.push(x.text());});
  const log=()=>page.locator('#log').textContent();
  const healthy=async()=>{assert.deepEqual(errors,[]);assert.equal(await page.locator('body').getAttribute('data-state'),'running');assert.doesNotMatch(await log(),/FATAL ERROR|Unhandled exception|Aborted\(/i);};
  const picture=async(name)=>{await healthy();const bytes=await page.locator('#canvas').screenshot({path:`${dir}/${name}.png`});const png=PNG.sync.read(bytes);assert.deepEqual([png.width,png.height],[1024,768]);return png;};
  const menu=async()=>{const text=await log();const begin=text.lastIndexOf('OSEQ_MENU_BEGIN');const tail=text.slice(begin);return{begin,rows:[...tail.matchAll(/OSEQ_ROW\|([^\r\n]+)/g)].map(x=>x[1].toUpperCase()),selected:Number([...tail.matchAll(/OSEQ_SELECTED\|(\d+)/g)].at(-1)?.[1]),rest:tail.includes('OSEQ_MENU_REST')};};
  const waitMenu=async(previous=-1)=>{for(let n=0;n<150;n++){await healthy();const m=await menu();if(m.begin>previous&&m.rest&&m.rows.length){await page.waitForTimeout(150);return m;}await page.waitForTimeout(100);}throw Error('Actual production menu did not settle');};
  const choose=async(label)=>{const m=await waitMenu();const target=m.rows.indexOf(label);assert.ok(target>=0,`Actual menu control ${label}`);for(let i=0;i<m.selected;i++)await page.keyboard.press('ArrowUp');for(let i=0;i<target;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');return waitMenu(m.begin);};
  const actual=async()=>{const m=[...(await log()).matchAll(/OSEQ_STATE\|([^|\r\n]+)\|([^|\r\n]+)\|([^|\r\n]+)\|(\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)/g)].at(-1);return m?{frame:{phase:m[1],caption:m[2]==='~'?null:m[2],value:m[3]==='~'?null:m[3],native_turn:Number(m[4])},confirm:[Number(m[5]),Number(m[6])],dismiss:[Number(m[7]),Number(m[8])]}:null;};
  const click=async([x,y])=>{assert.ok(x>0&&y>0,'Actual visible control coordinates exist');const b=await page.locator('#canvas').boundingBox();await page.mouse.click(b.x+x,b.y+y);};
  const frames=[];let failure=null;let runtimeFailure=null;let unitsUnchanged=null;
  try{
   await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.state==='ready');await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${origin}/assets/manifest.json`);
   await page.evaluate(scripts=>{for(const[n,s]of Object.entries(scripts)){const p=`/interface-tour/${n}`;Module.FS.mkdirTree(p.slice(0,p.lastIndexOf('/')));Module.FS.writeFile(p,s);}const run=Module.callMain;Module.callMain=args=>run([...args,'--datapath','/interface-tour/GLSMAC_data']);},scripts);
   await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.state==='running');await page.addStyleTag({content:'#canvas {position:fixed;left:0;top:0;margin:0;max-width:none;z-index:10}'});
   await waitMenu();for(const label of ['START GAME','MAKE RANDOM MAP','TINY PLANET','CITIZEN'])await choose(label);
   const popupCount=(await log()).split('OSEQ_POPUP|').length;await page.keyboard.press('Enter');await page.waitForFunction(count=>document.querySelector('#log').textContent.split('OSEQ_POPUP|').length>count,popupCount);
   const factionCount=(await log()).split('OSEQ_POPUP|').length;await page.keyboard.press('Enter');await page.waitForFunction(count=>document.querySelector('#log').textContent.split('OSEQ_POPUP|').length>count,factionCount);await page.keyboard.press('Enter');
   for(const phase of ['planetfall','first-base-name']){
    await page.waitForFunction(phase=>[...document.querySelector('#log').textContent.matchAll(/OSEQ_STATE\|([^|\r\n]+)/g)].at(-1)?.[1]===phase,phase);
    await page.keyboard.press('Enter');
   }
   await page.waitForFunction(()=>{const current=[...document.querySelector('#log').textContent.matchAll(/ITOUR_STATE\|\d+\|([^|\r\n]+)/g)].at(-1);return current?.[1]==='tour-prompt'||current?.[1]==='map';});
   let baselineUnits=null;
   const readTour=async()=>{
    const text=await log();const m=[...text.matchAll(/ITOUR_STATE\|(\d+)\|([^|\r\n]+)\|([^|\r\n]*)\|(true|false)\|(true|false)\|(\d+)\|([^|\r\n]*)\|([^|\r\n]*)\|([^|\r\n]*)\|([^\r\n]*)/g)].at(-1);
    assert.ok(m,'Actual Tour view is observable');
    const units=[...text.matchAll(/ITOUR_UNITS\|([^|\r\n]+)\|([^\r\n]*)/g)].filter(x=>x[1]===m[1]).at(-1);
    assert.ok(units,'Actual native human units were observed');
    const state=units[2].split(';').filter(Boolean).sort();
    if(baselineUnits===null)baselineUnits=state;
    unitsUnchanged=(unitsUnchanged??true)&&JSON.stringify(state)===JSON.stringify(baselineUnits);
    return {frame:{observed_stage:m[2],mounted_body:m[8],native_bindings:{'$BASENAME0':m[9],'$UNITNAME0':m[10],'$UNITNAME1':m[10]},buttons:m[3]?m[3].split('~'):[],menu_open:m[4]==='true',commlink_open:m[5]==='true',native_turn:Number(m[6])},points:m[7]?m[7].split('~').map(x=>x.split(',').map(Number)):[],raw:m[1]};
   };
   const limit=item.input.finish==='early'?3:15;
   for(let step=0;step<limit;step++){
    await healthy();const observed=await readTour();frames.push(observed.frame);await picture(`tour-${step}`);
    let action;
    if(step===0) action='TOUR';
    else if(observed.frame.observed_stage==='map'){if(step!==limit-1)failure={step,reason:`Tour returned to actual map after ${frames.length} checkpoints`};break;}
    else if(item.input.finish==='early') action='END TOUR';
    else action=observed.frame.buttons.length===1&&observed.frame.buttons[0]==='CLOSE'?'CLOSE':'CONTINUE';
    const index=observed.frame.buttons.indexOf(action);
    if(index<0){failure={step,reason:`Actual ${action} control absent; visible controls ${observed.frame.buttons.join(', ')}`};break;}
    if(step===0||item.input.finish==='early')await click(observed.points[index]);else await page.keyboard.press('Enter');
    let changed=false;
    for(let n=0;n<100;n++){await healthy();if((await readTour()).raw!==observed.raw){changed=true;break;}await page.waitForTimeout(100);}
    if(!changed){failure={step,reason:`Actual ${action} control did not change mounted paragraph text`};break;}
   }
   if(failure===null&&(frames.length!==limit||frames.at(-1)?.observed_stage!=='map'))failure={step:Math.min(frames.length,limit-1),reason:'Actual Tour did not reach its final playable-map checkpoint'};

  }catch(error){runtimeFailure=String(error);await page.locator('#canvas').screenshot({path:`${dir}/failure.png`,timeout:3000}).catch(()=>{});}
  finally{writeFileSync(`${dir}/application.log`,await log().catch(()=>''));writeFileSync(`${dir}/metadata.json`,JSON.stringify({implementation,errors},null,2));await context.close();}
  results.push(runtimeFailure ? {id:item.id,status:'error',reason:runtimeFailure} : {id:item.id,status:'ok',output:{frames,completed:failure===null&&frames.length===(item.input.finish==='early'?3:15),failure,units_unchanged:unitsUnchanged}});
 }
}finally{await browser?.close();server.kill();writeFileSync(`${artifacts}/server.log`,serverLog);}
const response={version:1,implementation,results};writeFileSync(`${artifacts}/candidate.json`,JSON.stringify(response,null,2));process.stdout.write(JSON.stringify(response)+'\n');
