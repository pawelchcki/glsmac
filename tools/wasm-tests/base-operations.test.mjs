import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scriptsRoot = process.env.WASM_SCRIPTS_ROOT || root;
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = new URL('build/artifacts/', import.meta.url);

function terrain() {
  const width=16,height=16,count=width*height/2,offset=15+0xaa4;
  const aw=Math.ceil(width/5),ah=Math.ceil(height/5),ac=Math.floor((aw+1)/2)*ah;
  const bytes=Buffer.alloc(offset+count*44+ac);
  bytes.write('TERRANMAP\0\x1a',0,'binary');bytes.writeUInt32LE(5,11);
  for(const [at,value] of [[0,width],[4,height],[20,count],[0xa24,aw],[0xa28,ah],[0xa2c,ac]])bytes.writeUInt32LE(value,15+at);
  for(let i=0;i<count;i++){bytes[offset+i*44]=96;bytes[offset+i*44+1]=64;}
  return bytes;
}

const world = `return (game) => {
 const positions = [[2,2],[6,2],[10,2],[2,6],[6,6],[10,6],[2,10]];
 game.get_bm().on('base_spawn', (e) => {
  if (e.base.get_size() == 0) { e.base.create_pop({type:'DOCTOR'}); e.base.set('accumulated_nutrients',0); }
 });
 let index = 0;
 for (owner of game.get_players()) {
  const point = positions[index]; const tile = game.get_tm().get_tile(point[0],point[1]);
  let project = '';
  for(rule of game.get('starting_unit_rules')){
   let available = rule.prerequisite == 'None';
   for(token of owner.get_faction().starting_technologies){if(token==rule.prerequisite){available=true;}}
   if(available){
    game.event('add_production_choice',{player:owner,id:rule.choice,data:{type:'unit',id:rule.id,cost:rule.rows*10,cost_rows:rule.rows,population_cost:rule.population}});
    if(rule.id=='ColonyPod' || rule.id=='Formers'){project=rule.choice+'';}
   }
  }
  game.event('spawn_base',{owner:owner,tile:tile,facilities:['HEADQUARTERS'],production_choice:project});
  game.event('spawn_unit',{type:'ScoutPatrol',owner:owner,tile:tile,morale:2,health:1.0});index++;
 }
};`;

const main = String.raw`
#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const popup = #include('ui/parts/game/popup/popup');
 const menu = #include('ui/parts/game/menu/menu');
 const view = #include('ui/parts/game/popup/base_operations');
 const management = #include('ui/parts/game/popup/base_screen');
 let armed = false; let baseline = null; const watched = {};
 glsmac.on('configure_game',(configured) => {
  const game = configured.game;
  const snapshot = () => {
   const state = {turn:game.get_turn(),players:[],units:[],bases:[]};
   for (player of game.get_players()) {
    const owned = []; for(let id=0;id<89;id++){if(game.technologies.has_tech(id,player.id+1)){owned :+ id;}}
    const row = {id:player.id+0,type:player.type+'',name:player.name+'',identity:#clone(player.get_faction().identity),owned:owned,
     research:#clone(game.get_research_state(player.id)),science:#clone(game.get_research_science(player.id))};
    state.players :+ row;
   }
   const tm=game.get_tm();
   for(let y=0;y<tm.get_map_height();y++){
    for(let x=y%2;x<tm.get_map_width();x=x+2){
     for(unit of tm.get_tile(x,y).get_units()){
      state.units :+ {id:unit.id+0,owner:unit.owner+0,def:unit.get_def().id+'',x:x+0,y:y+0,health:unit.health+0.0,morale:unit.morale+0,movement:unit.movement+0.0,order:unit.get_order()+''};
     }
    }
   }
   for(base of game.get_bm().get_bases()){
    const tile=base.get_tile();const row={id:base.id+0,owner:base.get_owner().id+0,name:base.name+'',x:tile.x+0,y:tile.y+0,
     size:base.get_size(),production:#clone(base.get_production()),nutrients:base.get('accumulated_nutrients'),
     intake:#clone(base.get_intake()),consumption:#clone(base.get_consumption()),pops:[],facilities:[]};
    for(pop of base.get_pops()){
     const citizen={id:pop.id+0,type:pop.get_type()+'',x:null,y:null};
     if(pop.has('worked_tile')){const point=pop.get('worked_tile');citizen.x=point.x+0;citizen.y=point.y+0;}
     row.pops :+ citizen;
    }
    const facilities=base.get_facilities();for(entry in facilities){row.facilities :+ facilities[entry].name+'';}
    state.bases :+ row;
   }
   return state;
  };
  const watch = (name,node) => {
   if(#is_defined(watched[name]) && watched[name]==node){return;}
   watched[name]=node;
   node.on('mousemove',(e)=>{#print('BASEOPS_HOVER|'+name+'|'+#to_string(e.ax-e.x)+'|'+#to_string(e.ay-e.y)+'|'+#to_string(node.width)+'|'+#to_string(node.height));return false;});
  };
  game.on('error',()=>{#print('BASEOPS_GAME_ERROR');});
  game.on('event_result',(e)=>{if(!e.success){#print('BASEOPS_REJECT|'+e.name);}});
  game.on('start_ui',()=>{
   glsmac.ui.root.on('keydown',(e)=>{
    if(e.modifiers=={} && e.code=='K'){
     if(armed){armed=false;glsmac.exit();}
     else{baseline=snapshot();if(#sizeof(baseline.players)!=7 || #sizeof(baseline.bases)!=7){throw Error('Expected seven actual native owners/bases');}armed=true;}
     return true;
    }
    return false;
   });
   #async(120,()=>{
    if(!armed){#print('BASEOPS_READY');return true;}
    try{
     const current=snapshot();
     if(current!=baseline){throw Error('Report browser input changed native seven-owner world');}
     if(popup.sliding_timer!=null || popup.popup_hiding){return true;}
     const screen = !popup.is_shown()?'map':popup.popup.id;
     #print('BASEOPS_BROWSER|'+screen+'|'+#to_string(#sizeof(current.players))+'|'+#to_string(#sizeof(current.units))+'|'+#to_string(#sizeof(current.bases)));
     if(menu.menus.left_menu.is_open){
      const frame=menu.menus.left_menu.el;
      #print('BASEOPS_TARGET|hq|'+#to_string(frame.left+frame.width/2)+'|'+#to_string(glsmac.ui.get_height()-frame.bottom-frame.height+27));
     }
     if(#is_defined(menu.menus.left_menu_hq) && menu.menus.left_menu_hq.is_open){
      const frame=menu.menus.left_menu_hq.el;
      for(row of menu.menus.left_menu_hq.items){
       if(#is_defined(row.entry.source_index) && row.entry.source_index==7){#print('BASEOPS_TARGET|entry|'+#to_string(frame.left+frame.width/2)+'|'+#to_string(frame.top+row.el.top+9));}
      }
     }
     if(screen=='base_operations'){
      #print('BASEOPS_CONTENT|'+view.header.text+'|'+view.tabs[0].text+'|'+view.tabs[1].text+'|'+view.tabs[2].text);
      watch('datalinks',view.datalinks);watch('close',view.close);
      watch('production',view.tabs[0]);watch('body',view.body);
      const frame=popup.popup.el;
      #print('BASEOPS_WINDOW|'+#to_string(frame.top)+'|'+#to_string(frame.width)+'|'+#to_string(frame.height)+'|'+#to_string(glsmac.ui.get_width()));
      #print('BASEOPS_FOOTER|'+view.datalinks.text+'|'+view.close.text);
      if(#sizeof(view.rows)!=1){throw Error('Only the actual local city belongs in the report');}
      const row=view.rows[0];watch('row',row.el);
      #print('BASEOPS_ROWSTATE|'+row.name.text+'|'+row.project.text+'|'+#to_string(row.el.border=='rgb(0,235,0),1'));
     }
     if(screen=='base_screen'){
      const bar=management.sections.bottom_bar.parts;
      #print('BASEOPS_CITY|'+bar.middle_area.basename.text+'|'+bar.production.production_title.text);
     }
     #print('BASEOPS_BROWSER_DONE');
    }catch{:(error)=>{#print('BASEOPS_PROBE_ERROR|'+#to_string(error));}}
    return true;
   });
  });
 });
 glsmac.run();
});`;

async function serve(t){
 const server=spawn('python3',['tools/serve-wasm.py',build,'--port','0','--assets',assets],{cwd:root});t.after(()=>server.kill());
 return new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error(log)),60000);
  server.stderr.on('data',d=>log+=d);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server ${code}: ${log}`)));
  server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
 });
}

test('Base Operations actual pointer row selection, double-click, native city and Escape roundtrip',{
 skip:!assets&&'Requires installed assets',timeout:240000,
},async t=>{
 mkdirSync(artifacts,{recursive:true});
 const scripts=Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`,{recursive:true}).filter(n=>n.endsWith('.gls.js')).sort().map(n=>[`GLSMAC_data/default/${n}`,readFileSync(`${scriptsRoot}/GLSMAC_data/default/${n}`,'utf8')]));
 t.diagnostic(`Scripts ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
 t.diagnostic(`WASM ${createHash('sha256').update(readFileSync(`${build}/GLSMAC.wasm`)).digest('hex')}`);
 const address=await serve(t);const errors=[];
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(String(e)));page.on('crash',()=>errors.push('Chromium crash'));
 t.after(async()=>{try{
  writeFileSync(new URL('base-operations-browser.log',artifacts),await page.locator('#log').textContent({timeout:1000}));
  if(await page.locator('#canvas').isVisible())await page.locator('#canvas').screenshot({path:fileURLToPath(new URL('base-operations-final.png',artifacts)),timeout:3000});
 }finally{await browser.close();}});
 const fatal=/BASEOPS_PROBE_ERROR|BASEOPS_GAME_ERROR|BASEOPS_REJECT|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
 const log=async()=>{const text=await page.locator('#log').textContent();assert.doesNotMatch(text,fatal);assert.deepEqual(errors,[]);return text;};
 await page.goto(address);await page.waitForFunction(()=>document.body.dataset.state==='ready');
 await page.locator('#custom-maps').setInputFiles({name:'base-report.MP',mimeType:'application/octet-stream',buffer:terrain()});
 await page.locator('#import-maps').click();await page.waitForFunction(()=>document.querySelector('#custom-map-list').textContent.includes('base-report.MP'));
 await page.locator('#asset-source').selectOption('remote');await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
 await page.evaluate(({scripts,main,world})=>{
  for(const[name,source]of Object.entries(scripts)){const path=`/base-report-snapshot/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}
  Module.FS.writeFile('/base-report-snapshot/GLSMAC_data/default/browser_base_report.gls.js',main);
  Module.FS.writeFile('/base-report-snapshot/GLSMAC_data/default/game/world/browser_base_report.gls.js',world);
  const run=Module.callMain;Module.callMain=args=>run([...args,'--datapath','/base-report-snapshot/GLSMAC_data','--mainscript','browser_base_report','--worldscript','browser_base_report','--quickstart','--quickstart-mapfile','/persist/glsmac/maps/base-report.MP','--quickstart-faction','GAIANS']);
 },{scripts,main,world});
 await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#log').textContent.includes('BASEOPS_READY')||/Unhandled exception|worker sent an error!|Pthread .* error!/.test(document.querySelector('#log').textContent)||document.body.dataset.state==='failed');await log();
 await page.keyboard.press('k');
 const wait=async(expression,since=0)=>{await page.waitForFunction(({source,fatal,since})=>new RegExp(source).test(document.querySelector('#log').textContent.slice(since))||new RegExp(fatal).test(document.querySelector('#log').textContent),{source:expression.source,fatal:fatal.source,since});return log();};
 await wait(/BASEOPS_BROWSER\|map\|7\|7\|7/);
 const point=async(x,y)=>{const box=await page.locator('#canvas').boundingBox();return{x:box.x+box.width*x/1024,y:box.y+box.height*y/768};};
 const click=async(x,y)=>{const p=await point(x,y);await page.mouse.click(p.x,p.y);};
 const target=async(name,since=0)=>{const text=await wait(new RegExp(`BASEOPS_TARGET\\|${name}\\|`),since);const matches=[...text.matchAll(new RegExp(`BASEOPS_TARGET\\|${name}\\|([0-9.]+)\\|([0-9.]+)`,'g'))];assert.ok(matches.length);return[+matches.at(-1)[1],+matches.at(-1)[2]];};
 await click(65,539);await click(...await target('hq'));await click(...await target('entry'));
 await wait(/BASEOPS_CONTENT\|GAIAN BASE OPERATIONS\|PRODUCTION\|CITIZENS\|GARRISON/);
 await wait(/BASEOPS_ROWSTATE\|[^|]+\|Formers\|false/);
 const productionPoint=await point(305,55);await page.mouse.move(productionPoint.x,productionPoint.y);await wait(/BASEOPS_HOVER\|production\|/);
 const hover=await point(500,92);await page.mouse.move(hover.x,hover.y);const hovered=await wait(/BASEOPS_HOVER\|row\|/);
 const row=[...hovered.matchAll(/BASEOPS_HOVER\|row\|([0-9.]+)\|([0-9.]+)/g)].at(-1);assert.ok(row);
 const rowPoint=await point(+row[1]+100,+row[2]+21);
 await page.mouse.click(rowPoint.x,rowPoint.y);await wait(/BASEOPS_ROWSTATE\|[^|]+\|Formers\|true/);
 await page.waitForTimeout(450); // Distinguish the single selection from its subsequent two-click open.
 await page.mouse.dblclick(rowPoint.x,rowPoint.y,{delay:60});await wait(/BASEOPS_CITY\|/);
 await page.locator('#canvas').screenshot({path:fileURLToPath(new URL('base-operations-city.png',artifacts))});
 const count=(await log()).split('BASEOPS_ROWSTATE|').length;
 await page.keyboard.press('Escape');await page.waitForFunction(count=>document.querySelector('#log').textContent.split('BASEOPS_ROWSTATE|').length>count,count);await log();
 await wait(/BASEOPS_FOOTER\|DATALINKS\|CLOSE/);
 for(const[name,x]of[['datalinks',365],['close',665]]){
  const footer=await point(x,520);await page.mouse.move(footer.x,footer.y);await wait(new RegExp(`BASEOPS_HOVER\\|${name}\\|`));
 }
 const rect=name=>{
  const hits=[...(awaitedLayout.matchAll(new RegExp(`BASEOPS_HOVER\\|${name}\\|([0-9.]+)\\|([0-9.]+)\\|([0-9.]+)\\|([0-9.]+)`,'g')))];
  assert.ok(hits.length,`${name} reached through its native rendered hit target`);const[x,y,w,h]=hits.at(-1).slice(1).map(Number);assert.ok(w>0&&h>0);return{x,y,w,h};
 };
 const awaitedLayout=await log();const body=rect('body'),tab=rect('production'),rowRect=rect('row'),datalinks=rect('datalinks'),close=rect('close');
 // Native Window's full-screen blocker consumes mousemove before its own
 // handler; its effective width/height and root-relative top remain readable.
 const windowSample=[...awaitedLayout.matchAll(/BASEOPS_WINDOW\|([0-9.]+)\|([0-9.]+)\|([0-9.]+)\|([0-9.]+)/g)].at(-1);assert.ok(windowSample);
 const[top,width,height,viewport]=windowSample.slice(1).map(Number);const windowRect={x:(viewport-width)/2,y:top,w:width,h:height};
 for(const footer of[datalinks,close]){
  assert.ok(footer.y>=Math.max(tab.y+tab.h,rowRect.y+rowRect.h),'Footer is below tabs and row');
  for(const outer of[body,windowRect])assert.ok(footer.x>=outer.x&&footer.y>=outer.y&&footer.x+footer.w<=outer.x+outer.w&&footer.y+footer.h<=outer.y+outer.h,'Footer remains inside its rendered parent');
 }
 assert.ok(datalinks.x+datalinks.w<=close.x||close.x+close.w<=datalinks.x,'Footer click targets do not overlap');
 await page.locator('#canvas').screenshot({path:fileURLToPath(new URL('base-operations-returned.png',artifacts))});
 assert.match((await log()).match(/BASEOPS_ROWSTATE\|[^\r\n]+/g).at(-1),/\|true$/);
 const maps=(await log()).split('BASEOPS_BROWSER|map|').length;await page.keyboard.press('Escape');
 await page.waitForFunction(count=>document.querySelector('#log').textContent.split('BASEOPS_BROWSER|map|').length>count,maps);await log();
 const reopen=(await log()).length;await click(65,539);await click(...await target('hq',reopen));await click(...await target('entry',reopen));await wait(/BASEOPS_FOOTER\|DATALINKS\|CLOSE/,reopen);
 const closeFence=(await log()).length;await click(close.x+close.w/2,close.y+close.h/2);await wait(/BASEOPS_BROWSER\|map\|7\|7\|7/,closeFence);
 await page.keyboard.press('k');await page.waitForFunction(()=>document.body.dataset.state==='exited');assert.deepEqual(errors,[]);
});
