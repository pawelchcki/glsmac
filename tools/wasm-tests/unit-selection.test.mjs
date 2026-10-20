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
const artifacts = new URL('build/artifacts/', import.meta.url);
const references = process.env.SELECTION_REFERENCE ? [process.env.SELECTION_REFERENCE]
  : ['unit-selection-core', 'unit-selection-lifecycle', 'unit-selection-spread', 'unit-selection-held-turn', 'unit-selection-held-subsets'];
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

function world(profile) {
  const positions = profile === 'spread' ? [[8, 8], [9, 9], [7, 9]] : [[8, 8], [8, 8], [8, 8]];
  return `return (game) => {
    const owner = game.get_player(); const tm = game.get_tm();
    game.get_bm().on('base_spawn', (e) => {
      if (e.base.get_size() == 0) {
        const tile = tm.get_tile(8, 6); const data = {type: 'WORKER'}; data.worked_tile = tile;
        const pop = e.base.create_pop(data); game.get('f_base_pop_work_tile')(e.base, pop, tile);
      }
    });
    game.event('add_production_choice', {player: owner, id: 'FORMERS', data: {type: 'unit', id: 'Formers', cost: 20, cost_rows: 2, population_cost: 0}});
    game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS'], production_choice: 'FORMERS'});
    ${['ScoutPatrol', 'Formers', 'ColonyPod'].map((type, i) => `game.event('spawn_unit', {type: '${type}', owner: owner, tile: tm.get_tile(${positions[i]}), morale: 2, health: 1.0});`).join('\n')}
  };`;
}

// This observer reads native identities, orders and movement. K provides only
// initial Scout focus and clean exit; all case actions use real controls.
const main = String.raw`
#main((glsmac) => {
  #include('game/game')(glsmac); #include('ui/ui')(glsmac);
  const preview = #include('ui/parts/game/bottom_bar/object_preview');
  const role = (unit) => {
    if (unit.def == 'ScoutPatrol') { return 'scout'; }
    if (unit.def == 'Formers') { return 'former'; }
    if (unit.def == 'ColonyPod') { return 'colony'; }
    throw Error('Unexpected selection unit definition');
  };
  glsmac.on('configure_game', (e) => {
    const game = e.game; let selected = null; let status = 'none'; let started = false;
    game.on('unit_select', (e) => { selected = e.unit.id + 0; #print('SELECT_FOCUSED|' + role(e.unit)); });
    game.on('tile_select', (e) => { selected = null; });
    game.on('turn', (e) => { selected = null; });
    game.on('turn_status', (e) => { status = e.status; });
    game.on('event_result', (e) => { if (!e.success) { #print('SELECT_REJECT|' + e.name); } });
    game.on('error', (e) => { #print('SELECT_ERROR'); });
    game.on('start_ui', (e) => {
      const initial = game.get_turn(); const um = game.get_um();
      const units = () => {
        const found = {}; let count = 0;
        for (point of [[8, 8], [9, 9], [7, 9]]) {
          for (unit of game.get_tm().get_tile(point[0], point[1]).get_units()) {
            const name = role(unit); found[name] = unit.id + 0; count++;
          }
        }
        if (count != 3 || !#is_defined(found.scout) || !#is_defined(found.former) || !#is_defined(found.colony)) { throw Error('Selection fixture must retain exactly its three native units'); }
        return found;
      };
      const report = () => {
        const ids = units();
        #print('SELECT_BEGIN|' + #to_string(game.get_turn() - initial) + '|' + (selected == null ? 'none' : role(um.get_unit(selected))));
        for (name of ['scout', 'former', 'colony']) {
          const unit = um.get_unit(ids[name]); const tile = unit.get_tile();
          if (unit.get_order() != 'NO_ORDERS' && unit.get_order() != 'HOLD') { throw Error('Unexpected browser selection order'); }
          #print('SELECT_UNIT|' + name + '|' + #to_string(tile.x - 8) + '|' + #to_string(tile.y - 8) + '|' +
            (unit.get_order() == 'HOLD' ? 'hold' : 'none') + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
        }
        #print('SELECT_CONTROL|' + (preview.order_pending == null ? 'ready' : 'pending') + '|' + status);
        #print('SELECT_DONE');
      };
      #async(0, () => {
        const handle_key = (e) => {
          if (e.modifiers != {}) { return false; }
          if (e.code == 'K') {
            if (started) { #print('SELECT_EXITING'); glsmac.exit(); }
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

for (const input of cases) test(`real three-unit selection matches original (${input.id})`, {
  skip: !assets && 'Requires installed SMAC assets', timeout: 180000,
}, async t => {
  mkdirSync(artifacts, {recursive: true});
  const scripts = Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`, {recursive: true}).filter(n => n.endsWith('.gls.js')).sort()
    .map(n => [`GLSMAC_data/default/${n}`, readFileSync(`${root}GLSMAC_data/default/${n}`, 'utf8')]));
  t.diagnostic(`Scripts SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  t.diagnostic(`WASM SHA-256: ${createHash('sha256').update(readFileSync(`${build}/GLSMAC.wasm`)).digest('hex')}`);
  const address = await serve(t); const errors = [];
  const browser = await chromium.launch({headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(e.stack || String(e))); page.on('crash', () => errors.push('Chromium page crashed'));
  t.after(async () => { try { writeFileSync(new URL(`unit-selection-${input.id}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000})); }
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
  }, {scripts, main, world: world(input.input.profile)});
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('SELECT_READY') || document.body.dataset.state === 'failed');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal); assert.deepEqual(errors, []);
  // start_ui precedes the frontend's initial automatic focus. Await it before
  // sending our explicit setup focus, then await its own fresh acknowledgement.
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('SELECT_FOCUSED|scout'));
  const focusCount = (await page.locator('#log').textContent()).split('SELECT_FOCUSED|scout').length - 1;
  await page.keyboard.press('k');
  await page.waitForFunction(({count, fatal}) => document.querySelector('#log').textContent.split('SELECT_FOCUSED|scout').length - 1 > count
    || new RegExp(fatal).test(document.querySelector('#log').textContent), {count: focusCount, fatal: fatal.source});
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('SELECT_DONE').length - 1;
    await page.keyboard.press('p');
    await page.waitForFunction(({count, fatal}) => document.querySelector('#log').textContent.split('SELECT_DONE').length - 1 > count
      || new RegExp(fatal).test(document.querySelector('#log').textContent) || document.body.dataset.state === 'failed', {count, fatal: fatal.source});
    const log = await page.locator('#log').textContent(); assert.doesNotMatch(log, fatal); assert.deepEqual(errors, []);
    const start = [...log.matchAll(/SELECT_BEGIN\|(\d+)\|([^\r\n]+)/g)].at(-1); assert.ok(start);
    const body = log.slice(start.index); const units = [...body.matchAll(/SELECT_UNIT\|([^|]+)\|(-?\d+)\|(-?\d+)\|([^|]+)\|(\d+)/g)]
      .map(m => ({role: m[1], x_delta: +m[2], y_delta: +m[3], order: m[4], movement_spent: +m[5]}));
    const control = body.match(/SELECT_CONTROL\|(ready|pending)\|([^\r\n]+)/); assert.ok(control); assert.equal(units.length, 3);
    return {state: {year_delta: +start[1], selected: start[2] === 'none' ? null : start[2], units}, ready: control[1] === 'ready', status: control[2]};
  };
  const expected = evidence.find(o => o.id === input.id).output.trace;
  assert.deepEqual((await probe()).state, expected[0]);
  for (const [index, action] of input.input.actions.entries()) {
    const deadline = Date.now() + +(process.env.SELECTION_CHECKPOINT_TIMEOUT_MS || 60000);
    if (action === 'advance') {
      let observed;
      do { observed = await probe(); if (observed.status === 'turn_complete') break; await page.waitForTimeout(100); } while (Date.now() < deadline);
      assert.equal(observed.status, 'turn_complete');
      const box = await page.locator('#canvas').boundingBox(); await page.mouse.click(box.x + box.width * 899 / 1024, box.y + box.height * 585 / 768);
    } else await page.keyboard.press({wait: 'w', tab: 'Tab', hold: 'h', skip: 'Space'}[action]);
    let observed;
    do { observed = await probe(); if (observed.ready && isDeepStrictEqual(observed.state, expected[index + 1])) break; await page.waitForTimeout(100); } while (Date.now() < deadline);
    assert.deepEqual(observed.state, expected[index + 1], `${input.id} checkpoint ${index + 1}: ${action}`);
    assert.ok(observed.ready);
  }
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`unit-selection-${input.id}.png`, artifacts))});
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
