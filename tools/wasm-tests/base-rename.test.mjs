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
const cases = JSON.parse(readFileSync(new URL('../behavior-tests/ui/cases/base-rename.json', import.meta.url))).cases
  .filter(input => !process.env.BASE_RENAME_CASE || input.id === process.env.BASE_RENAME_CASE);
const normalize = value => value.replaceAll('’', "'").trim().replace(/\s+/g, ' ').toUpperCase();

function terrain() {
  const width = 16, height = 16, count = width * height / 2, offset = 15 + 0xaa4;
  const aw = Math.ceil(width / 5), ah = Math.ceil(height / 5), ac = Math.floor((aw + 1) / 2) * ah;
  const bytes = Buffer.alloc(offset + count * 44 + ac);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary'); bytes.writeUInt32LE(5, 11);
  for (const [at, value] of [[0, width], [4, height], [20, count], [0xa24, aw], [0xa28, ah], [0xa2c, ac]]) bytes.writeUInt32LE(value, 15 + at);
  for (let i = 0; i < count; i++) { bytes[offset + i * 44] = 96; bytes[offset + i * 44 + 1] = 64; }
  return bytes;
}

const world = `return (game) => {
 const owner = game.get_player(); const tm = game.get_tm();
 game.get_bm().on('base_spawn', (e) => {
  if (e.base.get_size() == 0) {
   e.base.create_pop({type: 'DOCTOR'}); e.base.set('accumulated_nutrients', 0);
   e.base.restore_production({choice_id: '', minerals: 9, last_processed_turn: 0}, '');
  }
 });
 game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS']});
 for (type of ['ScoutPatrol', 'Formers', 'ColonyPod']) { game.event('spawn_unit', {type: type, owner: owner, tile: tm.get_tile(8, 8), morale: 2, health: 1.0}); }
};`;

// Read-only node/native telemetry. K supplies initial Scout focus and clean
// shutdown only; Rename, typing, buttons and close/reopen use real browser input.
const main = String.raw`
#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const popup = #include('ui/parts/game/popup/popup');
 const screen = #include('ui/parts/game/popup/base_screen');
 const strip = #include('ui/parts/game/popup/base_screen/bottom_bar/middle_area');
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const role = (unit) => {
  if (unit.def == 'ScoutPatrol') { return 'scout'; }
  if (unit.def == 'Formers') { return 'former'; }
  if (unit.def == 'ColonyPod') { return 'colony'; }
  throw Error('Unexpected native Rename unit');
 };
 glsmac.on('configure_game', (e) => {
  const game = e.game; let selected = null; let started = false;
  game.on('unit_select', (e) => { selected = role(e.unit); #print('RENAME_FOCUS|' + selected); });
  game.on('tile_select', () => { selected = null; });
  game.on('event_result', (e) => { if (!e.success) { #print('RENAME_REJECT|' + e.name); } });
  game.on('error', () => { #print('RENAME_GAME_ERROR'); });
  game.on('start_ui', () => {
   const bases = game.get_bm().get_bases(); if (#sizeof(bases) != 1) { throw Error('Expected one declared Rename city'); }
   const base = bases[0]; const base_id = base.id + 0; const owner = base.get_owner().id;
   const origin = base.get_tile(); const initial = game.get_year(); const um = game.get_um(); const ids = {};
   const pops = base.get_pops(); if (#sizeof(pops) != 1) { throw Error('Expected initial Rename Doctor'); }
   const doctor = pops[0]; const doctor_id = doctor.id + 0;
   for (unit of origin.get_units()) { const name = role(unit); if (#is_defined(ids[name])) { throw Error('Duplicate Rename role'); } ids[name] = unit.id + 0; }
   const watched = {};
   const watch = (name, node) => {
    if (#is_defined(watched[name]) && watched[name] == node) { return; }
    watched[name] = node;
    node.on('mousemove', (e) => {
     #print('RENAME_HOVER|' + name + '|' + #to_string(e.ax - e.x) + '|' + #to_string(e.ay - e.y) + '|' + #to_string(node.width) + '|' + #to_string(node.height));
     return false;
    });
   };
   const report = () => {
    if (popup.sliding_timer != null || popup.popup_hiding) { return; }
    let context = 'map'; let dialog = null;
    if (popup.is_shown()) {
     if (popup.popup.id != 'base_screen' || !screen.is_open || screen.base != base || strip.base_id != base_id) { throw Error('Unexpected Rename management context'); }
     context = 'base';
     if (#is_defined(screen.rename_dialog) && screen.rename_dialog != null) { context = 'rename'; dialog = screen.rename_dialog; }
     if (context == 'base') { for (type of ['nutrients', 'minerals', 'energy']) {
      const labels = screen.sections.resources.labels[type];
      if (#typeof(labels.left.text) != 'String' || #typeof(labels.right.text) != 'String' || labels.left.text == '' || labels.right.text == '') { throw Error('Incomplete real Rename resource HUD'); }
     }
     for (type of ['economy', 'labs', 'psych']) { const labels = screen.sections.energy.labels[type]; if (#typeof(labels.total.text) != 'String' || #typeof(labels.percentage.text) != 'String') { throw Error('Incomplete real Rename energy HUD'); } } }
    } else if (screen.is_open) { throw Error('Hidden Rename screen remains open'); }
    const map_label = glsmac.get_base_map_label(base_id);
    if (#typeof(map_label) != 'Object') { return; }
    if (context == 'map' && selected != null) {
     // Selection preview and popup visibility settle in separate native ticks.
     // Publish only a complete context; the browser's bounded probe still
     // requires this actual label before accepting a map checkpoint.
     if (!#is_defined(preview.contract_name_label) || preview.rendered_unit_id != ids[selected] || preview.contract_name_label.text != um.get_unit(ids[selected]).get_def().name) { return; }
    }
    #print('RENAME_BEGIN|' + context + '|' + #to_string(game.get_year() - initial) + '|' + (selected == null ? 'none' : selected));
    if (context != 'map') { #print('RENAME_TITLE|' + strip.basename.text); }
    if (context == 'base') {
     const frame = screen.sections.buttons.frame;
     for (button of screen.sections.buttons.buttons) {
      if (button.text == 'RENAME') {
       watch('rename', button);
       const x = glsmac.ui.get_width() / 2 - frame.width / 2 + button.left + button.width / 2;
       const y = popup.popup.el.top + screen.body.top + screen.body.height - frame.bottom - frame.height / 2;
       #print('RENAME_TARGET|rename|' + #to_string(x) + '|' + #to_string(y));
      }
     }
    }
    if (#sizeof(game.get_bm().get_bases()) != 1 || base.id != base_id || base.get_owner().id != owner || base.get_tile() != origin || origin.get_base() != base) { throw Error('Rename altered native city membership/identity/ownership/position'); }
    const current = base.get_pops();
    if (#sizeof(current) != 1 || current[0] != doctor || doctor.id != doctor_id || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile')) { throw Error('Rename altered original citizen/job'); }
    if (base.get('accumulated_nutrients') != 0 || base.get_production().minerals != 9) { throw Error('Rename altered stored resources'); }
    #print('RENAME_NAME|' + base.name);
    #print('RENAME_MAP_LABEL|' + map_label.text + '|' + #to_string(map_label.symbols) + '|' + #to_string(map_label.instances));
    #print('RENAME_BASE|' + #to_string(base.get_size()) + '|0|1|' + #to_string(#sizeof(base.get_worked_tiles())) + '|1');
    if (#sizeof(origin.get_units()) != 3) { throw Error('Rename altered stack membership'); }
    for (name of ['scout', 'former', 'colony']) {
     const unit = um.get_unit(ids[name]);
     if (role(unit) != name || unit.owner != owner || unit.health != 1.0 || unit.get_tile() != origin) { throw Error('Rename altered native companion identity/owner/health/position'); }
     const order = unit.get_order(); let code = (0 - 1);
     if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
     if (code < 0) { throw Error('Unexpected Rename companion order'); }
     #print('RENAME_UNIT|' + name + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
    }
    if (dialog != null) {
     #print('RENAME_CAPTION|' + dialog.caption.text); #print('RENAME_PROMPT|' + dialog.prompt.text); #print('RENAME_LABEL|' + dialog.label.text);
     #print('RENAME_VALUE|' + dialog.input.value); #print('RENAME_BUTTON|' + dialog.ok.text); #print('RENAME_BUTTON|' + dialog.cancel.text);
     const frame = dialog.frame;
     for (entry of [{name: 'input', node: dialog.input}, {name: 'ok', node: dialog.ok}, {name: 'cancel', node: dialog.cancel}]) {
      const node = entry.node;
      watch(entry.name, node);
      const x = glsmac.ui.get_width() / 2 - RENAME_WINDOW_WIDTH / 2 + node.left + node.width / 2;
      const y = glsmac.ui.get_height() / 2 - RENAME_WINDOW_HEIGHT / 2 + node.top + node.height / 2;
      #print('RENAME_TARGET|' + entry.name + '|' + #to_string(x) + '|' + #to_string(y));
     }
    }
    #print('RENAME_DONE');
   };
   #async(150, () => { if (started) { try { report(); } catch { : (error) => { #print('RENAME_PROBE_ERROR|' + #to_string(error)); } } } return true; });
   #async(0, () => {
    glsmac.ui.root.on('keydown', (e) => {
     if (e.code != 'K' || e.modifiers != {}) { return false; }
     if (started) { started = false; glsmac.exit(); } else { game.select_unit(um.get_unit(ids.scout)); started = true; }
     return true;
    });
    #print('RENAME_READY'); return false;
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

for (const input of cases) test(`real Rename controls match original (${input.id})`, {
  skip: !assets && 'Requires installed SMAC assets', timeout: 180000,
}, async t => {
  mkdirSync(artifacts, {recursive: true});
  const evidence = JSON.parse(readFileSync(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-base-rename.json', import.meta.url))).observations;
  const expected = evidence.find(row => row.id === input.id)?.output.trace; assert.ok(expected, 'Independently recorded Rename trace is required');
  const scripts = Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`, {recursive: true}).filter(name => name.endsWith('.gls.js')).sort()
    .map(name => [`GLSMAC_data/default/${name}`, readFileSync(`${scriptsRoot}/GLSMAC_data/default/${name}`, 'utf8')]));
  // The native Window blocker expands its reported child boundaries to the
  // viewport. Read the actual shipped window declaration for the initial
  // pointer estimate; native hover remains mandatory before every click.
  const geometry = scripts['GLSMAC_data/default/ui/parts/game/popup/base_screen/rename.gls.js']
    .match(/root\.window\(\{[^}]*\bwidth:\s*(\d+),\s*height:\s*(\d+)/);
  assert.ok(geometry, 'Production Rename window geometry must be declared');
  const executedMain = main.replaceAll('RENAME_WINDOW_WIDTH', geometry[1]).replaceAll('RENAME_WINDOW_HEIGHT', geometry[2]);
  t.diagnostic(`Uninstrumented scripts SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  // Retain the actual created native label solely for independent observation.
  const previewPath = 'GLSMAC_data/default/ui/parts/game/bottom_bar/object_preview.gls.js';
  const marker = "f_line(def.name, 13, 'center');";
  assert.equal(scripts[previewPath].split(marker).length, 2, 'Exactly one native unit-name label is instrumented');
  scripts[previewPath] = scripts[previewPath].replace(marker, `this.contract_name_label = ${marker}`);
  t.diagnostic(`Executed scripts SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  t.diagnostic(`Observer/world overlay SHA-256: ${createHash('sha256').update(JSON.stringify({main: executedMain, world})).digest('hex')}`);
  t.diagnostic(`WASM SHA-256: ${createHash('sha256').update(readFileSync(`${build}/GLSMAC.wasm`)).digest('hex')}`);
  const address = await serve(t); const errors = [];
  const browser = await chromium.launch({headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.stack || String(error))); page.on('crash', () => errors.push('Chromium page crashed'));
  t.after(async () => { try {
    writeFileSync(new URL(`base-rename-${input.id}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000}));
    if (await page.locator('#canvas').isVisible()) {
      await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`base-rename-${input.id}-final.png`, artifacts)), timeout: 5000});
    }
  } finally { await browser.close(); } });
  const declarations = JSON.parse(execFileSync('python3', ['-c', 'import json,sys; sys.path.insert(0,"tools/behavior-tests"); from ui.base_rename_inputs import declarations; print(json.dumps(declarations(sys.argv[1])))', input.input.text_profile], {cwd: root, encoding: 'utf8'}));
  t.diagnostic(`Declared source inputs SHA-256: ${createHash('sha256').update(JSON.stringify(declarations)).digest('hex')}`);
  const {sourceReads} = await overrideTextAssets(page, Object.fromEntries(Object.entries(declarations).map(([name, source]) => [name, Buffer.from(source, 'ascii')])));
  const fatal = /RENAME_REJECT|RENAME_GAME_ERROR|RENAME_PROBE_ERROR|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({name: 'rename-arid.MP', mimeType: 'application/octet-stream', buffer: terrain()}); await page.locator('#import-maps').click();
  await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('rename-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) { const path = `/rename-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source); }
    Module.FS.writeFile('/rename-snapshot/GLSMAC_data/default/browser_rename_main.gls.js', main);
    Module.FS.writeFile('/rename-snapshot/GLSMAC_data/default/game/world/browser_rename.gls.js', world);
    const callMain = Module.callMain; Module.callMain = args => callMain([...args, '--datapath', '/rename-snapshot/GLSMAC_data', '--mainscript', 'browser_rename_main', '--worldscript', 'browser_rename', '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/rename-arid.MP', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main: executedMain, world});
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('RENAME_READY') || document.body.dataset.state === 'failed');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('RENAME_FOCUS|scout'));
  const focused = (await page.locator('#log').textContent()).split('RENAME_FOCUS|scout').length;
  await page.keyboard.press('k');
  await page.waitForFunction(count => document.querySelector('#log').textContent.split('RENAME_FOCUS|scout').length > count, focused);
  let targets = {}; let mapLabel = null; let nativeDraft = '';
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('RENAME_DONE').length;
    await page.waitForFunction(({count, fatal}) => document.querySelector('#log').textContent.split('RENAME_DONE').length > count || new RegExp(fatal).test(document.querySelector('#log').textContent), {count, fatal: fatal.source});
    const log = await page.locator('#log').textContent(); assert.doesNotMatch(log, fatal); assert.deepEqual(errors, []);
    const complete = log.slice(0, log.lastIndexOf('RENAME_DONE'));
    const start = [...complete.matchAll(/RENAME_BEGIN\|(base|rename|map)\|(\d+)\|(scout|former|colony|none)/g)].at(-1); assert.ok(start);
    const body = complete.slice(start.index); const city = body.match(/RENAME_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/); assert.ok(city);
    targets = Object.fromEntries([...body.matchAll(/RENAME_TARGET\|(rename|input|ok|cancel)\|(-?[\d.]+)\|(-?[\d.]+)/g)].map(row => [row[1], [+row[2], +row[3]]]));
    const name = body.match(/RENAME_NAME\|([^\r\n]*)/); assert.ok(name);
    const map = body.match(/RENAME_MAP_LABEL\|([^|\r\n]*)\|(\d+)\|(\d+)/); assert.ok(map);
    mapLabel = {text: map[1], symbols: +map[2], instances: +map[3]};
    assert.ok(mapLabel.instances <= mapLabel.symbols, 'Actual glyph instances belong to the current name sprite');
    const title = body.match(/RENAME_TITLE\|([^\r\n]*)/);
    const units = [...body.matchAll(/RENAME_UNIT\|(scout|former|colony)\|(\d+)\|(\d+)/g)].map(row => ({role: row[1], order_code: +row[2], movement_spent: +row[3]})); assert.equal(units.length, 3);
    let dialog = null;
    if (start[1] === 'rename') {
      dialog = {};
      for (const [key, marker] of [['caption', 'CAPTION'], ['prompt', 'PROMPT'], ['label', 'LABEL'], ['value', 'VALUE']]) {
        const match = body.match(new RegExp(`RENAME_${marker}\\|([^\\r\\n]*)`)); assert.ok(match); dialog[key] = normalize(match[1]);
        if (key === 'value') nativeDraft = match[1];
      }
      dialog.buttons = [...body.matchAll(/RENAME_BUTTON\|([^\r\n]+)/g)].map(row => normalize(row[1])); assert.equal(dialog.buttons.length, 2);
    }
    return {screen: start[1], title: title ? normalize(title[1]) : null, year_delta: +start[2], selected: start[3] === 'none' ? null : start[3],
      base: {name: name[1], population: +city[1], workers: +city[2], doctors: +city[3], worked_tiles: +city[4], owned_count: +city[5]}, units, dialog};
  };
  const compare = async index => {
    const {after_action, ...wanted} = expected[index]; assert.equal(after_action, index - 1);
    const deadline = Date.now() + 15000; let observed;
    do { observed = await probe(); if (isDeepStrictEqual(observed, wanted) && mapLabel.text === wanted.base.name) {
      if (wanted.base.name === '') assert.equal(mapLabel.symbols, 0, 'Empty committed name removes the old map glyphs');
      else assert.ok(mapLabel.symbols > 0, 'Committed name has actual map glyphs');
      return observed;
    } } while (Date.now() < deadline);
    assert.deepEqual(observed, wanted, `${input.id} checkpoint ${index}`);
    assert.equal(mapLabel.text, wanted.base.name, 'Actual frontend map text catches up through the name update packet');
  };
  // The canvas stays at its native logical size; pointer coordinates scale
  // from the same 1024x768 production layout as the existing base controls.
  const click = async (x, y) => { const box = await page.locator('#canvas').boundingBox(); await page.mouse.click(box.x + box.width * x / 1024, box.y + box.height * y / 768, {delay: 80}); };
  const clickControl = async name => {
    await probe(); assert.ok(targets[name], `Actual mounted ${name} control geometry is required`);
    // Native width/height properties may include overflowing child boundaries.
    // Confirm the actual control receives the real pointer before clicking it.
    const [x, y] = targets[name];
    const offsets = [0, ...Array.from({length: 12}, (_, i) => [(i + 1) * -8, (i + 1) * 8]).flat()];
    for (const offset of offsets) {
      const logBefore = (await page.locator('#log').textContent()).length;
      const box = await page.locator('#canvas').boundingBox();
      await page.mouse.move(box.x + box.width * x / 1024, box.y + box.height * (y + offset) / 768);
      await page.waitForTimeout(50);
      const observed = (await page.locator('#log').textContent()).slice(logBefore);
      assert.doesNotMatch(observed, fatal);
      const hit = [...observed.matchAll(/RENAME_HOVER\|(rename|input|ok|cancel)\|(-?[\d.]+)\|(-?[\d.]+)\|([\d.]+)\|([\d.]+)/g)].find(row => row[1] === name);
      if (hit) { await click(+hit[2] + +hit[4] / 2, +hit[3] + +hit[5] / 2); return; }
    }
    assert.fail(`Real pointer did not reach the mounted ${name} control`);
  };
  const waitContext = async wanted => {
    const deadline = Date.now() + 15000; let observed;
    do { observed = await probe(); if (observed.screen === wanted) return observed; } while (Date.now() < deadline);
    assert.equal(observed.screen, wanted, 'Native context reaches the requested screen');
  };
  const editDraft = async text => {
    const before = await probe(); assert.equal(before.screen, 'rename', 'Actual Rename field must be mounted before typing');
    await clickControl('input');
    for (let i = 0; i < nativeDraft.length; i++) await page.keyboard.press('Backspace', {delay: 35});
    // SDL translates physical letter keys using Shift state. Deliver the
    // same real key combination a user types for capital ASCII letters.
    for (const character of text) {
      const key = /[A-Z]/.test(character) ? `Shift+${character.toLowerCase()}` : (character === ' ' ? 'Space' : character);
      await page.keyboard.press(key, {delay: 35});
    }
  };
  await page.keyboard.press('Enter'); await compare(0);
  for (const [index, action] of input.input.actions.entries()) {
    if (typeof action === 'object') {
      await editDraft(action.edit);
    } else if (action === 'rename') await clickControl('rename');
    else if (action === 'button-ok') await clickControl('ok');
    else if (action === 'button-cancel') await clickControl('cancel');
    else await page.keyboard.press({confirm: 'Enter', cancel: 'Escape', close: 'Escape', open: 'Enter'}[action]);
    await compare(index + 1);
  }
  if (input.id === 'rename-expansion-source') {
    // Separate application invariant beyond the immutable original trace:
    // map zoom shortcuts must leave printable x/z to the actual focused field.
    await clickControl('rename'); await waitContext('rename'); await editDraft('xz XZ');
    const editor = await probe(); assert.equal(editor.screen, 'rename'); assert.equal(nativeDraft, 'xz XZ');
    await page.keyboard.press('Escape'); await waitContext('base'); await compare(expected.length - 1);
    t.diagnostic('Additional application regression: real native editor preserves lowercase/uppercase x and z');
  }
  assert.ok(sourceReads.get('labels.txt') > 0, 'Production installed labels were loaded');
  assert.ok(sourceReads.get('script.txt') > 0 || sourceReads.get('xscript.txt') > 0, 'Production installed Rename source was loaded');
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`base-rename-${input.id}.png`, artifacts))});
  // Native modal input consumes printable K; return to the map before exit.
  let finalContext = await probe();
  if (finalContext.screen === 'rename') { await page.keyboard.press('Escape'); finalContext = await waitContext('base'); }
  if (finalContext.screen === 'base') { await page.keyboard.press('Escape'); await waitContext('map'); }
  await page.keyboard.press('k'); await page.waitForFunction(() => document.body.dataset.state === 'exited'); assert.deepEqual(errors, []);
});
