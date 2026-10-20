import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const scriptsRoot = process.env.WASM_SCRIPTS_ROOT || root;
const artifacts = new URL('build/artifacts/', import.meta.url);
// The raw-counter contract remains a strict pending probe, separate from citizens.
const mode = process.env.BASE_OPEN_CONTRACT || 'citizens';
assert.ok(['citizens', 'raw'].includes(mode), 'BASE_OPEN_CONTRACT must be citizens or raw');
const references = [mode === 'raw' ? 'base-open-recalc' : 'base-open-citizens'];
const cases = references.flatMap(name => JSON.parse(readFileSync(new URL(`../behavior-tests/ui/cases/${name}.json`, import.meta.url))).cases);
const evidence = references.flatMap(name => JSON.parse(readFileSync(new URL(`../behavior-tests/ui/observations/smacx-gog-2.0-${name}.json`, import.meta.url))).observations);
assert.equal(new Set(cases.map(c => c.id)).size, cases.length);

function terrain() {
  const width = 16, height = 16, count = width * height / 2, offset = 15 + 0xaa4;
  const aw = Math.ceil(width / 5), ah = Math.ceil(height / 5), ac = Math.floor((aw + 1) / 2) * ah;
  const bytes = Buffer.alloc(offset + count * 44 + ac);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary'); bytes.writeUInt32LE(5, 11);
  for (const [at, value] of [[0, width], [4, height], [20, count], [0xa24, aw], [0xa28, ah], [0xa2c, ac]]) bytes.writeUInt32LE(value, 15 + at);
  for (let i = 0; i < count; ++i) { bytes[offset + i * 44] = 96; bytes[offset + i * 44 + 1] = 64; }
  return bytes;
}

function world(input) {
  const positions = [[8, 8], [8, 8], [8, 8]];
  return `return (game) => {
    const owner = game.get_player(); const tm = game.get_tm();
    game.get_bm().on('base_spawn', (e) => {
      if (e.base.get_size() == 0) {
        e.base.create_pop({type: 'DOCTOR'});
        e.base.set('accumulated_nutrients', ${input.initial_base.nutrients});
        e.base.restore_production({choice_id: '', minerals: ${input.initial_base.minerals}, last_processed_turn: 0}, '');
      }
    });
    game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS']});
    ${['ScoutPatrol', 'Formers', 'ColonyPod'].map((type, i) => `game.event('spawn_unit', {type: '${type}', owner: owner, tile: tm.get_tile(${positions[i]}), morale: 2, health: 1.0});`).join('\n')}
  };`;
}

// This observer reads native identities, orders and movement. K provides only
// initial Scout focus and clean exit; all case actions use real controls.
const main = String.raw`
#main((glsmac) => {
  #include('game/game')(glsmac); #include('ui/ui')(glsmac);
  const preview = #include('ui/parts/game/bottom_bar/object_preview');
  const popup = #include('ui/parts/game/popup/popup');
  const screen = #include('ui/parts/game/popup/base_screen');
  const strip = #include('ui/parts/game/popup/base_screen/bottom_bar/middle_area');
  const role = (unit) => {
    if (unit.def == 'ScoutPatrol') { return 'scout'; }
    if (unit.def == 'Formers') { return 'former'; }
    if (unit.def == 'ColonyPod') { return 'colony'; }
    throw Error('Unexpected selection unit definition');
  };
  glsmac.on('configure_game', (e) => {
    const game = e.game; let selected = null; let status = 'none'; let started = false; const roles_by_id = {};
    game.on('unit_select', (e) => { selected = e.unit.id + 0; const key = #to_string(selected); roles_by_id[key] = role(e.unit); #print('SELECT_FOCUSED|' + role(e.unit)); });
    game.on('tile_select', (e) => { selected = null; });
    game.on('turn', (e) => { selected = null; });
    game.on('turn_status', (e) => { status = e.status; });
    game.on('event_result', (e) => { if (!e.success) { #print('SELECT_REJECT|' + e.name); } });
    game.on('error', (e) => { #print('SELECT_ERROR'); });
    game.on('start_ui', (e) => {
      const initial = game.get_turn(); const um = game.get_um(); const declared_bases = game.get_bm().get_bases(); const base_count = #sizeof(declared_bases);
      if (base_count != 1) { throw Error('Join browser fixture requires one native base'); }
      const base_id = declared_bases[0].id + 0; const declared_ids = {};
      const units = () => {
        const found = {}; let count = 0;
        for (point of [[8, 8], [9, 9], [7, 9]]) {
          for (unit of game.get_tm().get_tile(point[0], point[1]).get_units()) {
            const name = role(unit);
            if (#is_defined(declared_ids[name]) && declared_ids[name] != unit.id) { throw Error('Join replaced an existing unit'); }
            declared_ids[name] = unit.id + 0; found[name] = unit.id + 0; const key = #to_string(unit.id); roles_by_id[key] = name; count++;
          }
        }
        if ((count != 2 && count != 3) || !#is_defined(found.scout) || !#is_defined(found.former)) { throw Error('Selection fixture must retain exactly its three native units'); }
        return found;
      };
      const report = () => {
        // Await actual animation/close completion, independently of expected state.
        if (popup.sliding_timer != null || popup.popup_hiding) { return; }
        const ids = units();
        for (name of ['scout', 'former', 'colony']) { if (!#is_defined(ids[name]) && #is_defined(declared_ids[name]) && um.has_unit(declared_ids[name])) { throw Error('Live join unit left its declared stack'); } }
        if (#sizeof(game.get_bm().get_bases()) != base_count) { throw Error('Join changed global base count'); }
        const key = selected == null ? '' : #to_string(selected);
        #print('SELECT_BEGIN|' + #to_string(game.get_turn() - initial) + '|' + (selected == null ? 'none' : roles_by_id[key]));
        const shown = popup.is_shown();
        if (shown && (popup.popup.id != 'base_screen' || !screen.is_open || screen.base.id != base_id || strip.base_id != base_id)) { throw Error('Base opening context disagrees'); }
        if (!shown && screen.is_open) { throw Error('Hidden base screen remains open'); }
        #print('BASEOPEN_CONTEXT|' + (shown ? 'base' : 'map') + '|' + #to_string(shown && strip.basename.text == screen.base.name));
        for (name of ['scout', 'former', 'colony']) {
          if (!#is_defined(ids[name])) { continue; }
          const unit = um.get_unit(ids[name]); const tile = unit.get_tile();
          if (unit.get_order() != 'NO_ORDERS' && unit.get_order() != 'HOLD' && unit.get_order() != 'SENTRY') { throw Error('Unexpected browser selection order'); }
          if (tile.x != 8 || tile.y != 8 || unit.health != 1.0 || unit.owner != game.get_player().id) { throw Error('Sentry fixture moved or damaged'); }
          #print('SELECT_UNIT|' + name + '|' + #to_string(tile.x - 8) + '|' + #to_string(tile.y - 8) + '|' +
            (unit.get_order() == 'HOLD' ? 'hold' : (unit.get_order() == 'SENTRY' ? 'sentry' : 'none')) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
        }
        let owned = 0;
        for (base of game.get_bm().get_bases()) {
          if (base.get_owner().id != game.get_player().id) { continue; }
          owned++; const tile = base.get_tile();
          if (base.id != base_id || tile.x != 8 || tile.y != 8) { throw Error('Join fixture base moved or was replaced'); }
          let workers = 0; let doctors = 0;
          for (pop of base.get_pops()) {
            if (pop.get_type() == 'WORKER') { workers++; }
            else if (pop.get_type() == 'DOCTOR') { doctors++; }
            else { throw Error('Unexpected join citizen type'); }
          }
          const food = base.get('accumulated_nutrients');
          if (#typeof(food) != 'Int') { throw Error('Join food must be actual stored native state'); }
          #print('JOIN_BASE|' + #to_string(base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' +
            #to_string(#sizeof(base.get_worked_tiles())) + '|' + #to_string(food) + '|' + #to_string(base.get_production().minerals));
        }
        #print('JOIN_OWNED|' + #to_string(owned));
        #print('SELECT_CONTROL|' + (preview.order_pending == null && preview.founding_pending_id == null ? 'ready' : 'pending') + '|' + status);
        #print('SELECT_DONE');
      };
      // Read-only telemetry keeps running while the base popup owns keyboard
      // focus. It does not inject an action or bypass modal gameplay guards.
      #async(150, () => {
        if (started) { try { report(); } catch { : (error) => { #print('SELECT_PROBE_ERROR|' + #to_string(error)); } } }
        return true;
      });
      #async(0, () => {
        const handle_key = (e) => {
          if (e.modifiers != {}) { return false; }
          if (e.code == 'K') {
            if (started) { started = false; #print('SELECT_EXITING'); glsmac.exit(); }
            else { const ids = units(); game.select_unit(um.get_unit(ids.scout)); started = true; }
            return true;
          }
          if (e.code == 'P') { report(); return true; }
          return false;
        };
        glsmac.ui.root.on('keydown', (e) => {
          let handled = false;
          try { handled = handle_key(e); } catch { : (error) => { #print('SELECT_PROBE_ERROR|' + #to_string(error)); } }
          return handled;
        });
        #print('SELECT_READY'); return false;
      });
    });
  });
  glsmac.run();
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

for (const input of cases) test(`real base opening matches original (${input.id})`, {
  skip: !assets && 'Requires installed SMAC assets', timeout: 180000,
}, async t => {
  mkdirSync(artifacts, {recursive: true});
  const scripts = Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`, {recursive: true}).filter(n => n.endsWith('.gls.js')).sort()
    .map(n => [`GLSMAC_data/default/${n}`, readFileSync(`${scriptsRoot}/GLSMAC_data/default/${n}`, 'utf8')]));
  t.diagnostic(`Scripts SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  t.diagnostic(`WASM SHA-256: ${createHash('sha256').update(readFileSync(`${build}/GLSMAC.wasm`)).digest('hex')}`);
  const address = await serve(t); const errors = [];
  const browser = await chromium.launch({headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(e.stack || String(e))); page.on('crash', () => errors.push('Chromium page crashed'));
  t.after(async () => { try { writeFileSync(new URL(`base-open-${input.id}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000})); }
    finally { await browser.close(); } });
  const fatal = /SELECT_REJECT|SELECT_ERROR|SELECT_PROBE_ERROR|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({name: 'selection-arid.MP', mimeType: 'application/octet-stream', buffer: terrain()});
  await page.locator('#import-maps').click(); await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('selection-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) {
      const path = `/selection-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source);
    }
    Module.FS.writeFile('/selection-snapshot/GLSMAC_data/default/browser_selection_main.gls.js', main);
    Module.FS.writeFile('/selection-snapshot/GLSMAC_data/default/game/world/browser_selection.gls.js', world);
    const callMain = Module.callMain;
    Module.callMain = args => callMain([...args, '--datapath', '/selection-snapshot/GLSMAC_data', '--mainscript', 'browser_selection_main',
      '--worldscript', 'browser_selection', '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/selection-arid.MP', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main, world: world(input.input)});
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('SELECT_READY') || document.body.dataset.state === 'failed');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal); assert.deepEqual(errors, []);
  // start_ui precedes the frontend's initial automatic focus. Await it before
  // sending our explicit setup focus, then await its own fresh acknowledgement.
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('SELECT_FOCUSED|scout') || /worker sent an error!|Unhandled exception|Aborted\(/i.test(document.querySelector('#log').textContent));
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  const focusCount = (await page.locator('#log').textContent()).split('SELECT_FOCUSED|scout').length - 1;
  await page.keyboard.press('k');
  await page.waitForFunction(({count, fatal}) => document.querySelector('#log').textContent.split('SELECT_FOCUSED|scout').length - 1 > count
    || new RegExp(fatal).test(document.querySelector('#log').textContent), {count: focusCount, fatal: fatal.source});
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('SELECT_DONE').length - 1;
    await page.waitForFunction(({count, fatal}) => document.querySelector('#log').textContent.split('SELECT_DONE').length - 1 > count
      || new RegExp(fatal).test(document.querySelector('#log').textContent) || document.body.dataset.state === 'failed', {count, fatal: fatal.source});
    const log = await page.locator('#log').textContent(); assert.doesNotMatch(log, fatal); assert.deepEqual(errors, []);
    const start = [...log.matchAll(/SELECT_BEGIN\|(\d+)\|([^\r\n]+)/g)].at(-1); assert.ok(start);
    const body = log.slice(start.index); const units = [...body.matchAll(/SELECT_UNIT\|([^|]+)\|(-?\d+)\|(-?\d+)\|([^|]+)\|(\d+)/g)]
      .map(m => { assert.equal(+m[2], 0); assert.equal(+m[3], 0); const code = {none: 0, sentry: 1, hold: 2}[m[4]]; assert.ok(Number.isInteger(code)); return {role: m[1], order_code: code, movement_spent: +m[5]}; });
    const control = body.match(/SELECT_CONTROL\|(ready|pending)\|([^\r\n]+)/); assert.ok(control); assert.ok(units.length === 2 || units.length === 3);
    const towns = [...body.matchAll(/JOIN_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(-?\d+)\|(\d+)/g)]; assert.equal(towns.length, 1);
    const countOwned = body.match(/JOIN_OWNED\|(\d+)/); assert.ok(countOwned);
    const row = towns[0]; const base = {population:+row[1],workers:+row[2],doctors:+row[3],worked_tiles:+row[4],nutrients:+row[5],minerals:+row[6],owned_count:+countOwned[1]};
    if (input.algorithm === 'ui.base_open_citizens.v1') delete base.nutrients;
    const context = body.match(/BASEOPEN_CONTEXT\|(map|base)\|(true|false)/); assert.ok(context);
    return {state: {screen: context[1], title_matches_base: context[2] === 'true', year_delta: +start[1], selected: start[2] === 'none' ? null : start[2], units, base}, ready: control[1] === 'ready', status: control[2]};
  };
  // Initial city is declared input, not a replayed join outcome. Preparation
  // uses actual controls and waits only for real focus/acknowledgement changes.
  for (const action of input.input.setup) {
    const before = await probe(); await page.keyboard.press({wait:'w',skip:'Space',hold:'h',sleep:'l'}[action]);
    const deadline = Date.now() + 15000; let after;
    do { after = await probe(); if (after.ready && after.state.selected !== before.state.selected) break; await page.waitForTimeout(100); } while (Date.now() < deadline);
    assert.ok(after.ready && after.state.selected !== before.state.selected, `Preparation ${action} completed through real input`);
  }
  const expected = evidence.find(o => o.id === input.id).output.trace;
  assert.deepEqual((await probe()).state, expected[0]);
  let savedBaseFrame = false;
  for (const [index, action] of input.input.actions.entries()) {
    const deadline = Date.now() + +(process.env.SELECTION_CHECKPOINT_TIMEOUT_MS || 15000);
    if (action === 'advance') {
      let observed;
      do { observed = await probe(); if (observed.status === 'turn_complete') break; await page.waitForTimeout(100); } while (Date.now() < deadline);
      assert.equal(observed.status, 'turn_complete');
      const box = await page.locator('#canvas').boundingBox(); await page.mouse.click(box.x + box.width * 899 / 1024, box.y + box.height * 585 / 768);
    } else await page.keyboard.press({open:'Enter',close:'Escape',join:'b', sleep: 'l', wait: 'w', tab: 'Tab', hold: 'h', skip: 'Space'}[action]);
    let observed;
    do { observed = await probe(); if (observed.ready && isDeepStrictEqual(observed.state, expected[index + 1])) break; await page.waitForTimeout(100); } while (Date.now() < deadline);
    assert.deepEqual(observed.state, expected[index + 1], `${input.id} checkpoint ${index + 1}: ${action}`);
    assert.ok(observed.ready);
    if (action === 'open' && !savedBaseFrame) {
      await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`base-open-${input.id}-opened.png`, artifacts))});
      savedBaseFrame = true;
    }
  }
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`base-open-${input.id}.png`, artifacts))});
  await page.keyboard.press('k');
  const deadline = Date.now() + 60000; let state;
  do {
    assert.deepEqual(errors, []);
    state = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Shutdown probe timed out')), 5000);
      page.evaluate(() => document.body.dataset.state).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
    if (state === 'exited') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(state, 'exited'); await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await page.evaluate(() => document.body.dataset.state), 'exited'); assert.deepEqual(errors, []);
});
