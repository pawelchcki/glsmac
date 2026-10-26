// Installed-data application proof, separate from original visual agreement.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = process.env.CVR_ARTIFACTS_DIR || `${root}tools/wasm-tests/build/artifacts/unit-cvr`;
const hash = value => createHash('sha256').update(value).digest('hex');

function terrain() {
  const width=16, height=16, count=width*height/2, offset=15+0xaa4;
  const aw=Math.ceil(width/5), ah=Math.ceil(height/5), ac=Math.floor((aw+1)/2)*ah;
  const bytes=Buffer.alloc(offset+count*44+ac);
  bytes.write('TERRANMAP\0\x1a',0,'binary'); bytes.writeUInt32LE(5,11);
  for (const [at,value] of [[0,width],[4,height],[20,count],[0xa24,aw],[0xa28,ah],[0xa2c,ac]]) bytes.writeUInt32LE(value,15+at);
  for (let i=0;i<count;++i) { bytes[offset+i*44]=96; bytes[offset+i*44+1]=64; }
  return bytes;
}

// Production defines the stock Former and chooses its verified component.
// Every player has a real city and unit, so foreign-state guards are nonempty.
const world = String.raw`return (game) => {
 game.get_bm().on('base_spawn',(e) => { if (e.base.get_size() == 0) { e.base.create_pop({type: 'DOCTOR'}); } });
 let index = 0;
 for (player of game.get_players()) {
  game.event('add_production_choice',{player: player,id: 'FORMERS',data: {type: 'unit',id: 'Formers',cost: 20,cost_rows: 2,population_cost: 0}});
  const tile = game.get_tm().get_tile(index * 2,2);
  game.event('spawn_base',{owner: player,tile: tile,facilities: ['HEADQUARTERS'],production_choice: 'FORMERS'});
  if (player.id != game.get_player().id) { game.event('spawn_unit',{type: 'ScoutPatrol',owner: player,tile: tile,morale: 2,health: 1.0}); }
  index++;
 }
 if (index != 7) { throw Error('CVR fixture requires all seven real participants'); }
 game.event('spawn_unit',{type: 'Formers',owner: game.get_player(),tile: game.get_tm().get_tile(8,8),morale: 2,health: 1.0});
};`;

const main = String.raw`#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const observers = #include('tests/_state_trace_observer');
 glsmac.on('configure_game',(e) => {
  const game = e.game; let selected = null;
  game.on('unit_select',(e) => { selected = e.unit.id + 0; #print('CVR_SELECTED|' + e.unit.def); });
  game.on('event_result',(e) => { if (!e.success) { #print('CVR_ERROR|rejected|' + e.name); } });
  game.on('error',(e) => { #print('CVR_ERROR|game'); });
  game.on('start_ui',(e) => {
   const sample = glsmac.ui.root.panel({left: 900,top: 16,width: 100,height: 75,background: 'black',zindex: 0.99});
   sample.surface({left: 0,top: 0,width: 100,height: 75,background: 'VT.cvr'});
   // The observer's fixture-shaped manager aliases are read-only references to
   // the actual application managers, not replacements for game behavior.
   const observed_game = {};
   observed_game.um = game.get_um(); observed_game.bm = game.get_bm();
   observed_game.get_tm = game.get_tm; observed_game.get_players = game.get_players;
   observed_game.get_turn = game.get_turn; observed_game.technologies = game.technologies;
   observed_game.get_research_state = game.get_research_state; observed_game.get_research_science = game.get_research_science;
   const observer = observers.make(observed_game,'economy-research-v1','explicit-world');
   const source = game.get_tm().get_tile(8,8); let mover = null;
   for (unit of source.get_units()) { if (unit.def == 'Formers') { mover = unit; } }
   if (mover == null) { throw Error('Missing installed component unit'); }
   let before = null;
   #async(0,() => {
    glsmac.ui.root.on('keydown',(e) => {
     if (e.modifiers != {}) { return false; }
     if (e.code == 'K') { game.select_unit(mover); return true; }
     if (e.code == 'P') {
      const snapshot = observer.read();
      if (#sizeof(snapshot.players) != 7 || #sizeof(snapshot.bases) != 7 || #sizeof(snapshot.units) != 7) { throw Error('Incomplete all-player native coverage'); }
      #print('CVR_NATIVE|' + #to_string(snapshot));
      if (before == null) {
       if (mover.get_tile() != source || mover.movement != 1.0 || selected != mover.id) { throw Error('Initial component state is not settled'); }
       before = snapshot; #print('CVR_BEFORE');
      } else {
       const tile = mover.get_tile();
       if (tile.x != 10 || tile.y != 8 || mover.movement != 0.0 || game.get_turn() != before.turn) { throw Error('Real east movement did not settle correctly'); }
       for (row of snapshot.units) {
        if (row.raw_id == mover.id) { row.x = 8; row.y = 8; row.movement = 1.0; }
       }
       if (snapshot != before) { throw Error('Movement changed another observed player, city or unit field'); }
       #print('CVR_AFTER|all-seven-native-guards');
      }
      return true;
     }
     if (e.code == 'Q') { glsmac.exit(); return true; }
     return false;
    });
    #print('CVR_READY'); return false;
   });
  });
 }); glsmac.run();
});`;

test('installed CVR component traverses asset bridge, HUD, billboard and real movement', {
  skip: !assets && 'Requires installed SMAC assets', timeout: 180000,
}, async t => {
  mkdirSync(artifacts,{recursive:true});
  const scripts=Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`,{recursive:true}).filter(n=>n.endsWith('.gls.js')).sort()
    .map(n=>[`GLSMAC_data/default/${n}`,readFileSync(`${root}GLSMAC_data/default/${n}`,'utf8')]));
  const observer=readFileSync(`${root}GLSMAC_data/tests/_state_trace_observer.gls.js`,'utf8');
  const report={version:1,scope:'production stock Former component application rendering/movement',
    original_visual_agreement:'unsupported', original_passing_cases:0,
    candidate_executed:false,status:'running',
    scripts_sha256:hash(JSON.stringify(scripts)),runtime_sha256:hash(readFileSync(`${build}/GLSMAC.wasm`)),
    runtime_js_sha256:hash(readFileSync(`${build}/GLSMAC.js`)),
    fixture_sha256:hash(world+main+observer),
    web_sha256:Object.fromEntries(['index.html','bootstrap.js','asset-store.js'].map(name=>[name,hash(readFileSync(`${build}/${name}`))])),
    component_sha256:hash(readFileSync(`${assets}/VT.cvr`)), captures:[]};
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
  const errors=[]; page.on('pageerror',error=>errors.push(error.stack||String(error))); page.on('crash',()=>errors.push('Chromium crashed'));
  t.after(async()=>{try{if(report.status!=='passed')report.status='failed-or-incomplete';
    writeFileSync(`${artifacts}/application.log`,await page.locator('#log').textContent({timeout:1000}));
    writeFileSync(`${artifacts}/report.json`,JSON.stringify(report,null,2)+'\n');}finally{await browser.close();}});
  const fatal=/CVR_ERROR|Unhandled exception|Uncaught|Unsupported image format|Assertion failed|Aborted\(|RuntimeError:|(?:worker|Pthread[^\n]*) sent an error!|\[Error\]/i;
  const waitLog=async marker=>{await page.waitForFunction(({marker,fatal})=>document.querySelector('#log').textContent.includes(marker)||new RegExp(fatal).test(document.querySelector('#log').textContent)||document.body.dataset.state==='failed',{marker,fatal:fatal.source});
    assert.doesNotMatch(await page.locator('#log').textContent(),fatal);assert.deepEqual(errors,[]);};
  await page.goto(address); await page.waitForFunction(()=>document.body.dataset.state==='ready');
  const manifest=await (await page.request.get(`${address}/assets/manifest.json`)).json();
  const entry=manifest.files.find(row=>row.path==='VT.cvr'); assert.ok(entry,'Real manifest must include the CVR resource');
  assert.equal(entry.sha256,report.component_sha256); report.manifest_id=manifest.id;
  await page.locator('#custom-maps').setInputFiles({name:'cvr-arid.MP',mimeType:'application/octet-stream',buffer:terrain()});
  await page.locator('#import-maps').click();
  await page.waitForFunction(()=>document.querySelector('#custom-map-list').textContent.includes('cvr-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  // Mount only application scripts and the synthetic world. CVR bytes enter
  // exclusively through the normal remote manifest/bridge/VFS product flow.
  await page.evaluate(({scripts,main,world,observer})=>{
    for(const [name,source] of Object.entries(scripts)){const path=`/cvr-snapshot/${name}`;Module.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));Module.FS.writeFile(path,source);}
    Module.FS.mkdirTree('/cvr-snapshot/GLSMAC_data/default/tests');
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/default/tests/_state_trace_observer.gls.js',observer);
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/default/browser_cvr_main.gls.js',main);
    Module.FS.writeFile('/cvr-snapshot/GLSMAC_data/default/game/world/browser_cvr.gls.js',world);
    const callMain=Module.callMain;
    Module.callMain=args=>callMain([...args,'--datapath','/cvr-snapshot/GLSMAC_data','--mainscript','browser_cvr_main','--worldscript','browser_cvr',
      '--quickstart','--quickstart-mapfile','/persist/glsmac/maps/cvr-arid.MP','--quickstart-faction','GAIANS']);
  },{scripts,main,world,observer});
  report.candidate_executed=true; await page.locator('#start').click(); await waitLog('CVR_READY');
  await page.keyboard.press('k'); await waitLog('CVR_SELECTED|Formers'); await page.waitForTimeout(500);
  await page.keyboard.press('p'); await waitLog('CVR_BEFORE');
  const capture=async name=>{const started=performance.now();const bytes=await page.locator('#canvas').screenshot({path:`${artifacts}/${name}.png`});
    report.captures.push({name,acquired_ms:performance.now()-started,sha256:hash(bytes)});return bytes;};
  const rendered=PNG.sync.read(await capture('selected-before'));
  const canvas=await page.locator('#canvas').evaluate(el=>({width:el.width,height:el.height}));
  assert.deepEqual(canvas,{width:1024,height:768});
  report.canvas={...canvas,screenshot_width:rendered.width,screenshot_height:rendered.height};
  // The product canvas has a CSS border, so its element screenshot can have an
  // extra row after CSS rounding. The engine framebuffer remains1024x768.
  assert.ok(rendered.width>=1024 && rendered.height>=768);
  let visible=0;const colors=new Map();
  for(let y=16;y<91;++y)for(let x=900;x<1000;++x){const at=(y*rendered.width+x)*4;
    if(rendered.data[at]||rendered.data[at+1]||rendered.data[at+2]){++visible;const key=[...rendered.data.subarray(at,at+3)].join(',');colors.set(key,(colors.get(key)||0)+1);}}
  assert.ok(visible>100 && visible<6000,'Installed component must render nonempty geometry with transparent margins');
  assert.ok(colors.size>2,'Installed physical palette must reach real rendered pixels');
  const dominant=[...colors].sort((a,b)=>b[1]-a[1])[0][0];let hudPixels=0;
  for(let y=576;y<642;++y)for(let x=5;x<132;++x){const at=(y*rendered.width+x)*4;
    if([...rendered.data.subarray(at,at+3)].join(',')===dominant)++hudPixels;}
  assert.ok(hudPixels>100,'Actual production Former HUD must display the loaded component palette, not a blank or citizen portrait');
  report.preview_pixels={nonblack:visible,distinct_rgb:colors.size,dominant_rgb:dominant,stock_former_hud_matching_pixels:hudPixels,
    scope:'application preview and stock HUD relation; no original pixel agreement'};
  const started=performance.now(); await page.keyboard.press('ArrowRight');
  for(let i=0;i<4;++i){await capture(`movement-${i}`);report.captures.at(-1).elapsed_from_input_ms=performance.now()-started;}
  await page.waitForTimeout(300); await page.keyboard.press('p'); await waitLog('CVR_AFTER|all-seven-native-guards');
  await capture('settled-after');
  report.native_guards='all-seven players/research, seven cities, seven units; only mover position/movement changes';
  await page.keyboard.press('q'); await page.waitForFunction(()=>document.body.dataset.state==='exited'); assert.deepEqual(errors,[]);
  report.status='passed';
});
