import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import {chromium} from 'playwright';
import {overrideRulesAsset} from './rules-asset-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = new URL('build/artifacts/', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-former-work-core.json', import.meta.url)));
const cases = JSON.parse(readFileSync(new URL('../behavior-tests/ui/cases/former-work-core.json', import.meta.url))).cases;

function terrain() {
  const width = 16, height = 16, count = width * height / 2, offset = 15 + 0xaa4;
  const aw = Math.ceil(width / 5), ah = Math.ceil(height / 5), ac = Math.floor((aw + 1) / 2) * ah;
  const bytes = Buffer.alloc(offset + count * 44 + ac);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary'); bytes.writeUInt32LE(5, 11);
  for (const [at, value] of [[0, width], [4, height], [20, count], [0xa24, aw], [0xa28, ah], [0xa2c, ac]]) bytes.writeUInt32LE(value, 15 + at);
  for (let i = 0; i < count; ++i) { bytes[offset + i * 44] = 3 * 32; bytes[offset + i * 44 + 1] = 64; }
  return bytes;
}

const world = String.raw`
return (game) => {
  const owner = game.get_player(); const tm = game.get_tm();
  game.get_bm().on('base_spawn', (e) => {
    if (e.base.get_size() == 0) {
      const tile = tm.get_tile(8, 6); const data = {type: 'WORKER'}; data.worked_tile = tile;
      const pop = e.base.create_pop(data); game.get('f_base_pop_work_tile')(e.base, pop, tile);
    }
  });
  game.event('add_production_choice', {player: owner, id: 'FORMERS', data: {type: 'unit', id: 'Formers', cost: 20, cost_rows: 2, population_cost: 0}});
  game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS'], production_choice: 'FORMERS'});
  game.event('spawn_unit', {type: 'Formers', owner: owner, tile: tm.get_tile(8, 6), morale: 2, health: 1.0});
};`;

// Read-only observations and initial selection/exit helpers. Commands and turn
// advancement use the shipped controls, events, native lifecycle and renderer.
const main = String.raw`
#main((glsmac) => {
  #include('game/game')(glsmac); #include('ui/ui')(glsmac);
  const preview = #include('ui/parts/game/bottom_bar/object_preview');
  glsmac.on('configure_game', (e) => {
    const game = e.game; let status = 'none'; let exiting = false; let selected = false;
    game.on('turn_status', (e) => { status = e.status; });
    game.on('event_result', (e) => { if (!e.success) { #print('FW_REJECT|' + e.name); } });
    game.on('error', (e) => { #print('FW_ERROR'); });
    game.on('start_ui', (e) => {
      const initial = game.get_turn();
      glsmac.ui.on('loader_show', (e) => { if (selected && !exiting) { #print('FW_UNEXPECTED_LOADER'); } });
      game.get_map().on('unit_preview', (e) => { if (e.unit != null && e.unit.def == 'Formers') { #print('FW_SELECTED'); } });
      #async(0, () => {
        glsmac.ui.root.on('keydown', (e) => {
          if (e.modifiers != {}) { return false; }
          if (e.code == 'K') {
            if (selected) { exiting = true; #print('FW_EXITING'); glsmac.exit(); }
            else {
              for (unit of game.get_tm().get_tile(8, 6).get_units()) { if (unit.def == 'Formers') { game.select_unit(unit); } }
              selected = true;
            }
            return true;
          }
          if (e.code != 'P') { return false; }
          for (unit of game.get_tm().get_tile(8, 6).get_units()) {
            if (unit.def == 'Formers') {
              const state = unit.get_terraforming(); const tile = unit.get_tile();
              const flags = game.get_tm().get_terraforming(tile.x, tile.y); const order = unit.get_order();
              #print('FW_STATE|' + #to_string(game.get_turn() - initial) + '|' + (order == 'TERRAFORM' ? state.action : (order == 'HOLD' ? 'hold' : 'none')) + '|' +
                #to_string(#round((1.0 - unit.movement) * 3.0)) + '|' + #to_string(state.work_units) + '|' +
                #to_string(flags.road) + '|' + #to_string(flags.farm) + '|' + #to_string(flags.mine) + '|' + #to_string(flags.forest) + '|' + status);
              const yields = tile.get_resources(game.get_player());
              #print('FW_YIELD|' + #to_string(yields.NUTRIENTS) + '|' + #to_string(yields.MINERALS) + '|' + #to_string(yields.ENERGY));
            }
          }
          if (preview.order_label != null) { #print('FW_LABEL|' + preview.order_label.text); }
          #print('FW_CONTROL|' + (preview.order_pending == null ? 'ready' : 'pending'));
          #print('FW_DONE'); return true;
        });
        #print('FW_READY'); return false;
      });
    });
  });
  glsmac.run();
});`;

async function serve(t) {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], {cwd: root});
  t.after(() => server.kill());
  return new Promise((resolve, reject) => {
    let log = ''; server.stderr.on('data', data => { log += data; });
    const timer = setTimeout(() => reject(new Error(`Asset server timeout: ${log}`)), 60000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Asset server exited ${code}: ${log}`)); });
    server.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
  });
}

for (const input of cases) test(`real Former controls reproduce frozen work trace (${input.id})`, {
  skip: !assets && 'Requires installed SMAC assets', timeout: 180000,
}, async t => {
  mkdirSync(artifacts, {recursive: true});
  const scripts = Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`, {recursive: true}).filter(n => n.endsWith('.gls.js')).sort()
    .map(n => [`GLSMAC_data/default/${n}`, readFileSync(`${root}GLSMAC_data/default/${n}`, 'utf8')]));
  t.diagnostic(`Production scripts SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  t.diagnostic(`Runtime WASM SHA-256: ${createHash('sha256').update(readFileSync(`${build}/GLSMAC.wasm`)).digest('hex')}`);
  const address = await serve(t);
  const browser = await chromium.launch({headless: true, executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(m.text())) errors.push(m.text()); });
  t.after(async () => {
    try {
      writeFileSync(new URL(`former-work-${input.id}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000}));
      writeFileSync(new URL(`former-work-${input.id}-status.json`, artifacts), JSON.stringify(await page.evaluate(() => ({
        state: document.body.dataset.state, status: document.querySelector('#status').textContent,
        assets: document.querySelector('#asset-progress')?.textContent, start: document.querySelector('#start').disabled,
      })), null, 2));
      if (await page.locator('#canvas').isVisible()) {
        await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`former-work-${input.id}-final.png`, artifacts))});
      }
    }
    finally { await browser.close(); }
  });
  let source = readFileSync(`${assets}/alphax.txt`, 'latin1');
  if (input.input.profile === 'edited') {
    const lines = source.split(/\r?\n/); let row = 0, inside = false;
    for (let i = 0; i < lines.length; ++i) {
      const text = lines[i].split(';')[0].trim();
      if (text.startsWith('#')) { inside = text === '#TERRAIN'; continue; }
      if (!inside || !text) continue;
      const rate = {0: 2, 2: 3, 4: 2, 5: 3}[row++];
      if (rate !== undefined) { const fields = lines[i].split(','); fields[4] = String(rate); lines[i] = fields.join(','); }
    }
    source = lines.join('\n');
  }
  const override = await overrideRulesAsset(page, source);
  const fatal = /FW_REJECT|FW_ERROR|FW_UNEXPECTED_LOADER|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
  const wait = async (marker, count = 1) => {
    try { await page.waitForFunction(({marker, count, fatal}) => new RegExp(fatal).test(document.querySelector('#log').textContent)
      || document.body.dataset.state === 'failed' || document.querySelector('#log').textContent.split(marker).length - 1 >= count,
    {marker, count, fatal: fatal.source}, {polling: 100}); }
    catch (error) { throw new Error(`${await page.locator('#status').textContent()}\n${(await page.locator('#log').textContent()).slice(-7000)}`, {cause: error}); }
    assert.doesNotMatch(await page.locator('#log').textContent(), fatal); assert.deepEqual(errors, []);
    assert.ok((await page.locator('#log').textContent()).split(marker).length - 1 >= count, `Missing ${marker}`);
  };
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({name: 'former-arid.MP', mimeType: 'application/octet-stream', buffer: terrain()});
  await page.locator('#import-maps').click(); await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('former-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) {
      const path = `/former-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source);
    }
    Module.FS.writeFile('/former-snapshot/GLSMAC_data/default/browser_former_main.gls.js', main);
    Module.FS.writeFile('/former-snapshot/GLSMAC_data/default/game/world/browser_former.gls.js', world);
    const callMain = Module.callMain;
    Module.callMain = args => callMain([...args, '--datapath', '/former-snapshot/GLSMAC_data', '--mainscript', 'browser_former_main', '--worldscript', 'browser_former',
      '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/former-arid.MP', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main, world});
  await page.locator('#start').click(); await wait('FW_READY'); assert.ok(override.reads() > 0);
  await page.keyboard.press('k'); await wait('FW_SELECTED');
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('FW_DONE').length - 1;
    await page.keyboard.press('p'); await wait('FW_DONE', count + 1);
    const log = await page.locator('#log').textContent(); const m = [...log.matchAll(/FW_STATE\|(\d+)\|([^|]+)\|(\d+)\|(\d+)\|(true|false)\|(true|false)\|(true|false)\|(true|false)\|([^\r\n]+)/g)].at(-1);
    const control = [...log.matchAll(/FW_CONTROL\|(ready|pending)/g)].at(-1);
    assert.ok(m && control); return {state: {year_delta: +m[1], order: m[2], movement_spent: +m[3], work_units: +m[4],
      terrain: Object.fromEntries(['road', 'farm', 'mine', 'forest'].map((name, i) => [name, m[i + 5] === 'true']))}, status: m[9], ready: control[1] === 'ready'};
  };
  const expected = evidence.observations.find(o => o.id === input.id).output.trace;
  assert.deepEqual((await probe()).state, expected[0]);
  for (const [index, action] of input.input.actions.entries()) {
    if (action === 'advance') {
      let state = await probe(); const deadline = Date.now() + 60000;
      while (state.status !== 'turn_complete' && Date.now() < deadline) { await page.waitForTimeout(100); state = await probe(); }
      assert.equal(state.status, 'turn_complete');
      const box = await page.locator('#canvas').boundingBox(); await page.mouse.click(box.x + box.width * 899 / 1024, box.y + box.height * 585 / 768);
      do { state = await probe(); if (state.ready && isDeepStrictEqual(state.state, expected[index + 1])) break; await page.waitForTimeout(100); } while (Date.now() < deadline);
      assert.deepEqual(state.state, expected[index + 1]);
      assert.ok(state.ready, 'The actual control must settle after native turn delivery');
    } else {
      await page.keyboard.press({farm: 'f', mine: 'm', forest: 'Shift+f', road: 'r', cancel_work: 'a'}[action]);
      let state; const deadline = Date.now() + 60000;
      do { state = await probe(); if (state.ready && isDeepStrictEqual(state.state, expected[index + 1])) break; await page.waitForTimeout(100); } while (Date.now() < deadline);
      assert.deepEqual(state.state, expected[index + 1]);
      assert.ok(state.ready, 'Wait for the authoritative result before sending the next shortcut');
    }
  }
  const log = await page.locator('#log').textContent();
  assert.match(log, input.input.profile === 'edited' ? /FW_LABEL\|Construct Mine/ : /FW_LABEL\|Cultivate Farm/);
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`former-work-${input.id}.png`, artifacts))});
  await page.keyboard.press('k'); await wait('FW_EXITING');
  // Engine exit stops animation frames; observe the DOM lifecycle on a timer.
  await page.waitForFunction(() => document.body.dataset.state === 'exited', null, {polling: 100});
  assert.deepEqual(errors, []);
});
