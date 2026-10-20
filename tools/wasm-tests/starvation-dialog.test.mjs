import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import {chromium} from 'playwright';
import {overrideTextAssets} from './rules-asset-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const scriptsRoot = process.env.WASM_SCRIPTS_ROOT || root;
const artifacts = new URL('build/artifacts/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('../behavior-tests/ui/cases/starvation-dialog.json', import.meta.url))).cases;
const evidence = JSON.parse(readFileSync(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-starvation-dialog.json', import.meta.url))).observations;

function terrain() {
  const width = 16, height = 16, count = width * height / 2, offset = 15 + 0xaa4;
  const aw = Math.ceil(width / 5), ah = Math.ceil(height / 5), ac = Math.floor((aw + 1) / 2) * ah;
  const bytes = Buffer.alloc(offset + count * 44 + ac);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary'); bytes.writeUInt32LE(5, 11);
  for (const [at, value] of [[0, width], [4, height], [20, count], [0xa24, aw], [0xa28, ah], [0xa2c, ac]]) bytes.writeUInt32LE(value, 15 + at);
  for (let i = 0; i < count; ++i) { bytes[offset + i * 44] = 96; bytes[offset + i * 44 + 1] = 64; }
  return bytes;
}
const world = `return (game) => {
 const owner = game.get_player(); const tm = game.get_tm();
 // This synthetic project is deliberately incomplete. Its price and mineral
 // lifecycle are not observations or asserted original-game behavior.
 game.get_bm().on('base_spawn', (e) => {
  if (e.base.get_size() == 0) {
   owner.add_production_choice('STARVATION_FORMERS', {type: 'unit', id: 'Formers', cost: 1000, cost_rows: 100, population_cost: 0});
   e.base.create_pop({type: 'DOCTOR'}); e.base.set('accumulated_nutrients', 0);
   e.base.restore_production({choice_id: 'STARVATION_FORMERS', minerals: 9, last_processed_turn: 0}, '');
  }
 });
 game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS']});
 for (type of ['ScoutPatrol', 'Formers', 'ColonyPod']) { game.event('spawn_unit', {type: type, owner: owner, tile: tm.get_tile(8, 8), morale: 2, health: 1.0}); }
};`;
const main = String.raw`
#main((glsmac) => {
 #print('STARVE_BOOT');
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const popup = #include('ui/parts/game/popup/popup');
 const screen = #include('ui/parts/game/popup/base_screen');
 const strip = #include('ui/parts/game/popup/base_screen/bottom_bar/middle_area');
 const notice = #include('ui/parts/game/popup/starvation');
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 glsmac.on('configure_game', (e) => {
  const game = e.game; let started = false; let status = 'none'; let selected = null;
  game.on('unit_select', (e) => { selected = e.unit.def; #print('STARVE_FOCUS|' + selected); });
  game.on('tile_select', () => { selected = null; });
  game.on('turn_status', (e) => { status = e.status; });
  game.on('event_result', (e) => { if (!e.success) { #print('STARVE_REJECT|' + e.name); } });
  game.on('error', () => { #print('STARVE_GAME_ERROR'); });
  game.on('start_ui', () => {
   #print('STARVE_UI_START');
   const bases = game.get_bm().get_bases(); if (#sizeof(bases) != 1) { throw Error('Expected one declared native city'); }
   const base = bases[0]; const base_id = base.id + 0; const base_name = base.name + ''; const initial = game.get_year(); const origin = base.get_tile(); const ids = {}; const original_pops = {};
   const um = game.get_um();
   for (unit of origin.get_units()) { const def = unit.def; ids[def] = unit.id + 0; }
   const report = () => {
    if (popup.sliding_timer != null || popup.popup_hiding) { return; }
    let context = 'map';
    if (popup.is_shown()) {
     if (popup.popup.id == 'starvation') { context = 'notice'; }
     else if (popup.popup.id == 'base_screen' && screen.is_open && screen.base == base && strip.base_id == base_id && strip.basename.text == base_name) { context = 'base'; }
     else { throw Error('Unexpected starvation popup context'); }
    }
    if (#sizeof(game.get_bm().get_bases()) != 1 || base.id != base_id || base.name != base_name || base.get_owner().id != game.get_player().id || base.get_tile() != origin || origin.get_base() != base) { throw Error('Starvation replaced or moved native city'); }
    let workers = 0; let doctors = 0;
    for (pop of base.get_pops()) {
     if (pop.get_type() == 'WORKER') { workers++; } else if (pop.get_type() == 'DOCTOR') { doctors++; } else { throw Error('Unexpected native specialist'); }
     if (pop.has('worked_tile') && pop.get('worked_tile').get('working_pop') != pop) { throw Error('Broken worker graph'); }
    }
    #print('STARVE_BEGIN|' + #to_string(game.get_year() - initial) + '|' + context + '|' + status + '|' + (selected == null ? 'none' : selected));
    #print('STARVE_BASE|' + #to_string(base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(base.get_worked_tiles())) + '|1');
    const roles = ['scout', 'former']; const defs = ['ScoutPatrol', 'Formers']; let i = 0;
    for (def of defs) {
     const id = ids[def]; if (!um.has_unit(id)) { throw Error('Starvation lost companion'); } const unit = um.get_unit(id);
     if (unit.def != def || unit.get_tile() != origin || unit.owner != game.get_player().id || unit.health != 1.0) { throw Error('Starvation companion identity changed'); }
     const order = unit.get_order(); let code = (0 - 1); if (order == 'NO_ORDERS') { code = 0; } if (order == 'SENTRY') { code = 1; } if (order == 'HOLD') { code = 2; }
     if (code < 0) { throw Error('Unexpected companion order'); }
     #print('STARVE_UNIT|' + roles[i] + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0))); i++;
    }
    if (context == 'notice') {
     if (!notice.active) { throw Error('Notification window is hidden'); }
     #print('STARVE_NAME|' + base_name); #print('STARVE_CAPTION|' + notice.header.text);
     for (node of notice.texts) { if (#typeof(node.text) != 'String' || node.text == '') { throw Error('Missing notification text'); } #print('STARVE_BODY|' + node.text); }
     for (node of notice.rows) { #print('STARVE_CHOICE|' + node.text); }
     if (notice.rows[notice.selected].border != 'rgb(120,164,212),2') { throw Error('Notification selection paint disagrees'); }
     #print('STARVE_SELECTED|' + #to_string(notice.selected)); #print('STARVE_BUTTON|' + notice.suppress.text); #print('STARVE_BUTTON|' + notice.ok.text);
    }
    if (context == 'base') {
     // A complete mounted HUD, not merely a matching popup id.
     for (type of ['nutrients', 'minerals', 'energy']) { const labels = screen.sections.resources.labels[type]; if (#typeof(labels.left.text) != 'String' || #typeof(labels.right.text) != 'String' || labels.left.text == '' || labels.right.text == '') { throw Error('Incomplete Zoom resource HUD'); } }
    }
    #print('STARVE_CONTROL|' + (preview.order_pending == null && preview.founding_pending_id == null ? 'ready' : 'pending'));
    #print('STARVE_DONE');
   };
   #async(150, () => { if (started) { try { report(); } catch { : (error) => { #print('STARVE_PROBE_ERROR|' + #to_string(error)); } } } return true; });
   #async(0, () => {
    glsmac.ui.root.on('keydown', (e) => {
     if (e.modifiers != {} || e.code != 'K') { return false; }
     if (started) { started = false; glsmac.exit(); }
     else { game.select_unit(um.get_unit(ids.ScoutPatrol)); started = true; }
     return true;
    }); #print('STARVE_READY'); return false;
   });
  });
 }); glsmac.run();
});`;

async function serve(t) {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], {cwd: root});
  t.after(() => server.kill());
  return new Promise((resolve, reject) => {
    let log = ''; const timer = setTimeout(() => reject(new Error(`Asset server timeout: ${log}`)), 60000);
    server.stderr.on('data', data => { log += data; });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${log}`)); });
    server.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
  });
}
const normalize = value => value.replaceAll('’', "'").trim().replace(/\s+/g, ' ').toUpperCase();
for (const input of cases) test(`real starvation notification matches original (${input.id})`, {skip: !assets && 'Requires installed SMAC assets', timeout: 180000}, async t => {
  mkdirSync(artifacts, {recursive: true});
  const scripts = Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`, {recursive: true}).filter(n => n.endsWith('.gls.js')).sort().map(n => [`GLSMAC_data/default/${n}`, readFileSync(`${scriptsRoot}/GLSMAC_data/default/${n}`, 'utf8')]));
  t.diagnostic(`Scripts SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  t.diagnostic(`WASM SHA-256: ${createHash('sha256').update(readFileSync(`${build}/GLSMAC.wasm`)).digest('hex')}`);
  const address = await serve(t); const errors = []; const browser = await chromium.launch({headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  let latestLog = '';
  for (const suffix of ['-console.log', '-errors.log']) writeFileSync(new URL(`starvation-${input.id}${suffix}`, artifacts), '');
  const crashed = new Promise((resolve, reject) => { page.once('crash', () => reject(new Error('Chromium page crashed'))); });
  crashed.catch(() => {});
  const logPath = new URL(`starvation-${input.id}.log`, artifacts);
  page.on('console', message => { writeFileSync(new URL(`starvation-${input.id}-console.log`, artifacts), message.text() + '\n', {flag: 'a'}); });
  page.on('pageerror', e => { errors.push(e.stack || String(e)); writeFileSync(new URL(`starvation-${input.id}-errors.log`, artifacts), errors.join('\n')); });
  page.on('crash', () => { errors.push('Chromium page crashed'); writeFileSync(new URL(`starvation-${input.id}-errors.log`, artifacts), errors.join('\n')); });
  const logTimer = setInterval(async () => { try { latestLog = await page.locator('#log').textContent({timeout: 1000}); writeFileSync(logPath, latestLog); } catch {} }, 500);
  t.after(() => clearInterval(logTimer));
  t.after(async () => { writeFileSync(logPath, latestLog); await browser.close(); });
  const sourceInput = JSON.parse(execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tools/behavior-tests');from ui.starvation_dialog_inputs import browser_declarations;print(json.dumps(browser_declarations(sys.argv[1],sys.argv[2])))", assets, input.input.text_profile], {cwd: root, encoding: 'utf8'}));
  const {sourceReads} = await overrideTextAssets(page, Object.fromEntries(Object.entries(sourceInput).map(([name, text]) => [name, Buffer.from(text, 'latin1')])));
  const fatal = /STARVE_REJECT|STARVE_GAME_ERROR|STARVE_PROBE_ERROR|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({name: 'starvation-arid.MP', mimeType: 'application/octet-stream', buffer: terrain()}); await page.locator('#import-maps').click();
  await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('starvation-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) { const path = `/starvation-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source); }
    Module.FS.writeFile('/starvation-snapshot/GLSMAC_data/default/browser_starvation_main.gls.js', main);
    Module.FS.writeFile('/starvation-snapshot/GLSMAC_data/default/game/world/browser_starvation.gls.js', world);
    const callMain = Module.callMain; Module.callMain = args => callMain([...args, '--datapath', '/starvation-snapshot/GLSMAC_data', '--mainscript', 'browser_starvation_main', '--worldscript', 'browser_starvation', '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/starvation-arid.MP', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main, world});
  await page.locator('#start').click();
  await Promise.race([crashed, page.waitForFunction(() => document.querySelector('#log').textContent.includes('STARVE_READY') || /worker sent an error!|Unhandled exception|Aborted\(|\[Error\]/i.test(document.querySelector('#log').textContent) || document.body.dataset.state === 'failed')]).catch(error => { console.error('STARTUP LOG', latestLog, errors); throw error; });
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('STARVE_FOCUS|ScoutPatrol') || /worker sent an error!|Unhandled exception|Aborted\(/i.test(document.querySelector('#log').textContent));
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  const focusCount = (await page.locator('#log').textContent()).split('STARVE_FOCUS|ScoutPatrol').length - 1;
  await page.keyboard.press('k');
  await page.waitForFunction(({count, fatal}) => document.querySelector('#log').textContent.split('STARVE_FOCUS|ScoutPatrol').length - 1 > count || new RegExp(fatal).test(document.querySelector('#log').textContent), {count: focusCount, fatal: fatal.source});
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('STARVE_DONE').length - 1;
    await page.waitForFunction(({count, fatal}) => document.querySelector('#log').textContent.split('STARVE_DONE').length - 1 > count || new RegExp(fatal).test(document.querySelector('#log').textContent) || document.body.dataset.state === 'failed', {count, fatal: fatal.source});
    const log = await page.locator('#log').textContent(); assert.doesNotMatch(log, fatal); assert.deepEqual(errors, []);
    const complete = log.slice(0, log.lastIndexOf('STARVE_DONE') + 'STARVE_DONE'.length);
    const start = [...complete.matchAll(/STARVE_BEGIN\|(\d+)\|(notice|base|map)\|([^|\r\n]+)\|([^\r\n]+)/g)].at(-1); assert.ok(start);
    const body = complete.slice(start.index); const row = body.match(/STARVE_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/); assert.ok(row);
    const units = [...body.matchAll(/STARVE_UNIT\|(scout|former)\|(\d+)\|(\d+)/g)].map(m => ({role: m[1], order_code: +m[2], movement_spent: +m[3]})); assert.equal(units.length, 2);
    let dialog = null;
    if (start[2] === 'notice') {
      const name = body.match(/STARVE_NAME\|([^\r\n]+)/); const caption = body.match(/STARVE_CAPTION\|([^\r\n]+)/); const selected = body.match(/STARVE_SELECTED\|([01])/); assert.ok(name && caption && selected);
      dialog = {caption: normalize(caption[1]), body: normalize([...body.matchAll(/STARVE_BODY\|([^\r\n]+)/g)].map(m => m[1]).join(' ')).replaceAll(normalize(name[1]), '{BASE}'), choices: [...body.matchAll(/STARVE_CHOICE\|([^\r\n]+)/g)].map(m => normalize(m[1])), selected: +selected[1], buttons: [...body.matchAll(/STARVE_BUTTON\|([^\r\n]+)/g)].map(m => normalize(m[1]))};
    }
    return {status: start[3], selected: start[4], ready: body.includes('STARVE_CONTROL|ready'), state: {year_delta: +start[1], screen: start[2], base: {population: +row[1], workers: +row[2], doctors: +row[3], worked_tiles: +row[4], owned_count: +row[5]}, units, dialog}};
  };
  const wait = async predicate => { const deadline = Date.now() + 20000; let result; do { result = await probe(); if (predicate(result)) return result; } while (Date.now() < deadline); assert.fail(JSON.stringify(result)); };
  for (const key of ['w', 'w', 'b', 'Enter', 'Escape', 'h', 'h']) {
    const before = await probe(); await page.keyboard.press(key);
    if (key === 'Enter') await wait(row => row.ready && row.state.screen === 'base' && row.state.base.population === 2);
    else if (key === 'Escape') await wait(row => row.ready && row.state.screen === 'map');
    else await wait(row => row.ready && (row.selected !== before.selected || row.state.base.population !== before.state.base.population || row.status !== before.status));
  }
  await wait(row => row.status === 'turn_complete');
  const box = await page.locator('#canvas').boundingBox(); await page.mouse.click(box.x + box.width * 899 / 1024, box.y + box.height * 585 / 768);
  const expected = evidence.find(row => row.id === input.id).output.trace;
  const compare = async index => {
    const wanted = expected[index]; const {after_action, ...state} = wanted;
    const observed = await wait(row => row.ready && isDeepStrictEqual(row.state, state));
    assert.deepEqual(observed.state, state); return observed;
  };
  await compare(0); await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`starvation-${input.id}-notice.png`, artifacts))});
  for (const [index, action] of input.input.actions.entries()) {
    await page.keyboard.press({down: 'ArrowDown', up: 'ArrowUp', confirm: 'Enter', close: 'Escape'}[action]); const observed = await compare(index + 1);
    if (observed.state.screen === 'base') await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`starvation-${input.id}-zoom.png`, artifacts))});
  }
  assert.ok(sourceReads.get('script.txt') > 0 && sourceReads.get('labels.txt') > 0, 'Actual production source consumers loaded verified inputs');
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`starvation-${input.id}-final.png`, artifacts))});
  await page.keyboard.press('k'); await page.waitForFunction(() => document.body.dataset.state === 'exited'); assert.deepEqual(errors, []);
});
