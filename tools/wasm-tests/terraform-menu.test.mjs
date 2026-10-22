import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import {chromium} from 'playwright';
import {overrideTextAssets} from './rules-asset-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const scriptsRoot = process.env.WASM_SCRIPTS_ROOT || root;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = new URL('build/artifacts/', import.meta.url);
const publicCasesPath = fileURLToPath(new URL('../behavior-tests/ui/cases/terraform-menu-work.json', import.meta.url));
const casesPath = process.env.TERRAFORM_MENU_CASES || publicCasesPath;
const observationsPath = process.env.TERRAFORM_MENU_OBSERVATIONS || fileURLToPath(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-terraform-menu-work.json', import.meta.url));
const cases = JSON.parse(readFileSync(casesPath)).cases.filter(row => process.env.TERRAFORM_MENU_CASE
  ? row.id === process.env.TERRAFORM_MENU_CASE
  : ['terraform-menu-0-synthetic', 'terraform-menu-4-terrain-edited'].includes(row.id));
assert.ok(cases.length, 'The browser selector must match declared Terraform cases');
assert.ok(cases.every(row => row.algorithm === 'ui.terraform_menu_work.v1'));
const hash = value => createHash('sha256').update(value).digest('hex');
const python = (source, args = [], input) => execFileSync('python3', ['-c', source, ...args],
  {cwd: root, encoding: 'utf8', input, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});

function loadEvidence() {
  return JSON.parse(python(`
import json,sys
sys.path.insert(0,'tools/behavior-tests')
from compare import read_json,validate_observations
from protocol import fingerprint,probe_request
from ui.terraform_menu_contract import validate_input,validate_output
suite,record,public=[read_json(path) for path in sys.argv[1:]]
declared={case['id']:case for case in probe_request(public)['cases']}
request=probe_request(suite)
for case in request['cases']:
    if case['id'] not in declared or fingerprint(case)!=fingerprint(declared[case['id']]):
        raise ValueError('Browser input differs from declared public case: '+case['id'])
    validate_input(case['input'])
outputs=validate_observations(record,suite)
for case in request['cases']: validate_output(outputs[case['id']],case['input']['actions'])
print(json.dumps(dict(outputs=outputs,repeat=record['repeat'])))
`, [casesPath, observationsPath, publicCasesPath]));
}

// Opaque installed input transport, shared in approach with the existing menu
// browser lane. Only the public synthetic TERRAIN block is replaced.
function patchTerrainSource(bytes, declaration) {
  const text = bytes.toString('latin1'); const starts = [...text.matchAll(/^#TERRAIN\s*\r?$/gm)];
  assert.equal(starts.length, 1); assert.match(declaration, /^#TERRAIN\n[\s\S]*\n#END\n$/);
  const start = starts[0].index, bodyStart = start + starts[0][0].length;
  const next = /^#[A-Z][A-Za-z0-9_]*\s*\r?$/m.exec(text.slice(bodyStart));
  const end = next ? bodyStart + next.index : text.length;
  return Buffer.from(text.slice(0, start) + declaration.replace(/#END\n$/, '').replaceAll('\n', text.includes('\r\n') ? '\r\n' : '\n') + text.slice(end), 'latin1');
}

function replaceOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, `One observational marker: ${marker}`);
  return source.replace(marker, replacement);
}

function instrument(scripts) {
  const menu = 'GLSMAC_data/default/ui/parts/game/menu/menu.gls.js';
  scripts[menu] = replaceOnce(scripts[menu], "item.on('click', (e) => {", "item.on('click', (e) => {\n                        #print('TMENU_NATIVE_CLICK|' + (#is_defined(entry.terrain_index) ? #to_string(entry.terrain_index) : 'header'));");
  const bar = 'GLSMAC_data/default/ui/parts/game/bottom_bar/bottom_bar.gls.js';
  scripts[bar] = replaceOnce(scripts[bar], "btn_left_menu.on('click',", "this.contract_menu_button = btn_left_menu;\n\t\tbtn_left_menu.on('click',");
}

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
  if (e.base.get_size() == 0) { e.base.create_pop({type: 'DOCTOR'}); e.base.set('accumulated_nutrients', 0);
   e.base.restore_production({choice_id: '', minerals: 9, last_processed_turn: 0}, ''); }
 });
 game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS']});
 for (spec of [['ScoutPatrol', 8, 8], ['Formers', 9, 9], ['ColonyPod', 7, 9]]) {
  game.event('spawn_unit', {type: spec[0], owner: owner, tile: tm.get_tile(spec[1], spec[2]), morale: 2, health: 1.0});
 }
};`;

// Read-only guards, native-node observation, declared initial selection and
// exit only. Work and later selection come from actual pointer/SDL controls.
const main = String.raw`
#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const menu = #include('ui/parts/game/menu/menu');
 const bar = #include('ui/parts/game/bottom_bar/bottom_bar');
 const popup = #include('ui/parts/game/popup/popup');
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const roles = ['scout', 'former', 'colony']; const defs = ['ScoutPatrol', 'Formers', 'ColonyPod'];
 glsmac.on('configure_game', (e) => {
  const game = e.game; let selected = null; let started = false; let serial = 0;
  game.on('unit_select', (e) => { selected = e.unit.id + 0; });
  for (event of ['tile_select', 'base_select']) { game.on(event, () => { selected = null; }); }
  game.on('event_result', (e) => { if (!e.success) { #print('TMENU_REJECT|' + e.name); } });
  game.on('error', () => { #print('TMENU_GAME_ERROR'); });
  game.on('start_ui', () => {
   const bases = game.get_bm().get_bases(); if (#sizeof(bases) != 1) { throw Error('Expected one declared city'); }
   const base = bases[0]; const base_id = base.id + 0; const owner = base.get_owner().id + 0;
   const base_tile = base.get_tile(); const initial = game.get_year(); const um = game.get_um();
   const pops = base.get_pops(); if (#sizeof(pops) != 1) { throw Error('Expected one native Doctor'); }
   const doctor = pops[0]; const doctor_id = doctor.id + 0;
   const production = base.get_production(); const nutrients = base.get('accumulated_nutrients');
   const ids = []; const tiles = [];
   for (spec of [[8, 8], [9, 9], [7, 9]]) {
    const tile = game.get_tm().get_tile(spec[0], spec[1]); const units = tile.get_units();
    if (#sizeof(units) != 1 || units[0].def != defs[#sizeof(ids)]) { throw Error('Invalid declared spread unit layout'); }
    ids :+ units[0].id + 0; tiles :+ tile;
   }
   const former = um.get_unit(ids[1]); const work_tile = former.get_tile();
   if (!work_tile.is_land || work_tile.moisture != 1 || work_tile.rockiness != 1 || work_tile.features.xenofungus || work_tile.get_base() != null) { throw Error('Former terrain is not declared arid non-base land'); }
   const watched = {};
   glsmac.ui.root.on('mousemove', (e) => { #print('TMENU_MOVE_ACK|' + #to_string(e.ax) + '|' + #to_string(e.ay)); return false; });
   const watch = (name, node, x, y) => {
    if (!#is_defined(watched[name]) || watched[name] != node) {
     watched[name] = node;
     node.on('mousemove', (e) => { #print('TMENU_HOVER|' + name + '|' + #to_string(e.ax) + '|' + #to_string(e.ay)); return false; });
    }
    #print('TMENU_TARGET|' + name + '|' + #to_string(x) + '|' + #to_string(y));
   };
   const report = () => {
    if (popup.is_shown()) { throw Error('Unexpected actual modal'); }
    if (preview.selected_unit_id != selected || menu.selected_unit_id != selected) { return; }
    if (#sizeof(game.get_bm().get_bases()) != 1 || base.id != base_id || base.get_owner().id != owner || base.get_tile() != base_tile || base_tile.get_base() != base || base.name != 'Gaia\'s Landing' || base.get_production() != production || base.get('accumulated_nutrients') != nutrients || #sizeof(base.get_worked_tiles()) != 0) { throw Error('Native city guard changed'); }
    const current = base.get_pops();
    if (#sizeof(current) != 1 || current[0] != doctor || doctor.id != doctor_id || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile')) { throw Error('Native citizen guard changed'); }
    let selected_role = 'none';
    for (let index = 0; index < 3; index++) {
     const unit = um.get_unit(ids[index]); const members = tiles[index].get_units();
     if (unit.def != defs[index] || unit.owner != owner || unit.health != 1.0 || unit.get_tile() != tiles[index] || #sizeof(members) != 1 || members[0].id != ids[index]) { throw Error('Native spread unit guard changed'); }
     if (index != 1 && (unit.movement != 1.0 || unit.get_order() != 'NO_ORDERS')) { throw Error('Companion unit changed'); }
     if (selected == unit.id) { selected_role = roles[index]; }
    }
    if (selected != null && selected_role == 'none') { throw Error('Unknown actual selected unit'); }
    const root = menu.menus.left_menu; let child = null;
    for (id in menu.menus) { const current = menu.menus[id];
     if (id != 'left_menu' && current.is_open) {
      if (!root.is_open || child != null || id != 'left_menu_terraform') { throw Error('Unexpected actual child menu'); }
      child = current;
     }
    }
    const state = former.get_terraforming(); const order = former.get_order();
    if (order != 'NO_ORDERS' && order != 'HOLD' && order != 'TERRAFORM') { throw Error('Unknown native Former order'); }
    const flags = game.get_tm().get_terraforming(work_tile.x, work_tile.y);
    #print('TMENU_BROWSE_BEGIN|' + #to_string(serial)); serial++;
    #print('TMENU_STATE|0|' + #to_string(game.get_year() - initial) + '|' + selected_role + '|' + (order == 'TERRAFORM' ? state.action : (order == 'HOLD' ? 'hold' : 'none')) + '|' + #to_string(#round((1.0 - former.movement) * 3.0)) + '|' + #to_string(state.work_units) + '|' + #to_string(flags.road) + '|' + #to_string(flags.farm) + '|' + #to_string(flags.mine) + '|' + #to_string(flags.forest) + '|' + #to_string(root.is_open) + '|' + (child == null ? 'none' : '5'));
    const button = bar.contract_menu_button;
    watch('menu', button, button.left + button.width / 2, glsmac.ui.get_height() - bar.height + button.top + button.height / 2);
    if (root.is_open) {
     const header = root.items[5].el;
     watch('header-5', header, root.el.left + header.width / 2, glsmac.ui.get_height() - root.el.bottom - root.el.height + header.top + header.height / 2);
     if (child != null) {
      const seen = {};
      for (control of child.items) {
       if (#is_defined(control.entry.terrain_index)) {
        const key = #to_string(control.entry.terrain_index);
        if (#is_defined(seen[key])) { throw Error('Duplicate actual terrain identity'); } seen[key] = true;
        const node = control.el; const left = #is_defined(node.left) ? node.left : 0;
        watch('terrain-' + key, node, child.el.left + left + node.width / 2, child.el.top + node.top + node.height / 2);
       }
      }
     }
    }
    #print('TMENU_BROWSE_DONE');
   };
   #async(1000, () => { if (started) { try { report(); } catch { : (error) => { #print('TMENU_PROBE_ERROR|' + #to_string(error)); } } } return true; });
   #async(0, () => {
    glsmac.ui.root.on('keydown', (e) => {
     if (e.code != 'K' || e.modifiers != {}) { return false; }
     if (started) { started = false; glsmac.exit(); } else { game.select_unit(former); started = true; }
     return true;
    });
    #print('TMENU_READY'); return false;
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
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Asset server exited ${code}: ${log}`)); });
    server.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
  });
}

for (const input of cases) test(`real Terraform pointer control matches recorded state (${input.id})`, {
  skip: !assets && 'Requires installed SMAC assets', timeout: 240000,
}, async t => {
  mkdirSync(artifacts, {recursive: true}); const evidence = loadEvidence(); const expected = evidence.outputs[input.id]?.trace;
  assert.ok(expected); assert.equal(expected.length, input.input.actions.length + 1);
  t.diagnostic(`Accepted original evidence: ${evidence.repeat} independent agreeing runs`);
  const scripts = Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`, {recursive: true}).filter(name => name.endsWith('.gls.js')).sort()
    .map(name => [`GLSMAC_data/default/${name}`, readFileSync(`${scriptsRoot}/GLSMAC_data/default/${name}`, 'utf8')]));
  t.diagnostic(`Production scripts SHA-256: ${hash(JSON.stringify(scripts))}`); instrument(scripts);
  t.diagnostic(`Executed scripts SHA-256: ${hash(JSON.stringify(scripts))}; observer/world: ${hash(JSON.stringify({main, world}))}; WASM: ${hash(readFileSync(`${build}/GLSMAC.wasm`))}`);
  t.diagnostic('Real pointer targets require native hover and one click; native city/companion identity, counters and positions are guarded. Global unit enumeration and pixels remain outside this observer.');
  const declarations = JSON.parse(python('import json,sys; sys.path.insert(0,"tools/behavior-tests"); from ui.terraform_menu_inputs import declarations; print(json.dumps(declarations(sys.argv[1])))', [input.input.text_profile]));
  const names = readdirSync(assets).filter(name => name.toLowerCase() === 'alphax.txt'); assert.equal(names.length, 1);
  const sources = {'menu.txt': Buffer.from(declarations['menu.txt'], 'ascii'), 'alphax.txt': patchTerrainSource(readFileSync(`${assets}/${names[0]}`), declarations['alphax.txt'])};
  const address = await serve(t); const errors = [];
  const browser = await chromium.launch({headless: true, executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.stack || String(error))); page.on('crash', () => errors.push('Chromium page crashed'));
  page.on('console', message => { if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(message.text())) errors.push(message.text()); });
  t.after(async () => { try {
    writeFileSync(new URL(`terraform-menu-${input.id}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000}));
    if (await page.locator('#canvas').isVisible()) await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`terraform-menu-${input.id}-last.png`, artifacts)), timeout: 5000});
  } finally { await browser.close(); } });
  const {sourceReads} = await overrideTextAssets(page, sources);
  const fatal = /TMENU_REJECT|TMENU_GAME_ERROR|TMENU_PROBE_ERROR|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({name: 'terraform-menu-arid.MP', mimeType: 'application/octet-stream', buffer: terrain()});
  await page.locator('#import-maps').click(); await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('terraform-menu-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) { const path = `/terraform-menu-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source); }
    Module.FS.writeFile('/terraform-menu-snapshot/GLSMAC_data/default/browser_terraform_menu_main.gls.js', main);
    Module.FS.writeFile('/terraform-menu-snapshot/GLSMAC_data/default/game/world/browser_terraform_menu.gls.js', world);
    const callMain = Module.callMain; Module.callMain = args => callMain([...args, '--datapath', '/terraform-menu-snapshot/GLSMAC_data', '--mainscript', 'browser_terraform_menu_main', '--worldscript', 'browser_terraform_menu', '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/terraform-menu-arid.MP', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main, world});
  await page.locator('#start').click(); await page.waitForFunction(() => document.querySelector('#log').textContent.includes('TMENU_READY') || document.body.dataset.state === 'failed');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal); await page.keyboard.press('k');
  let targets = {};
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('TMENU_BROWSE_DONE').length;
    await page.waitForFunction(({count, pattern}) => { const text = document.querySelector('#log').textContent;
      return text.split('TMENU_BROWSE_DONE').length > count || new RegExp(pattern, 'i').test(text);
    }, {count, pattern: fatal.source}, {timeout: 15000});
    const text = await page.locator('#log').textContent(); assert.doesNotMatch(text, fatal);
    const chunks = [...text.matchAll(/TMENU_BROWSE_BEGIN\|\d+([\s\S]*?)TMENU_BROWSE_DONE/g)]; assert.ok(chunks.length);
    const body = chunks.at(-1)[1];
    targets = Object.fromEntries([...body.matchAll(/TMENU_TARGET\|(menu|header-5|terrain-\d+)\|(-?[\d.]+)\|(-?[\d.]+)/g)].map(row => [row[1], [+row[2], +row[3]]]));
    const states = body.split('\n').map(line => line.replace(/^.*?\] /, '').trim()).filter(line => line.startsWith('TMENU_STATE|')); assert.equal(states.length, 1);
    return JSON.parse(python('import json,sys; sys.path.insert(0,"tools/behavior-tests"); from ui.terraform_menu_headless import parse_candidate; print(json.dumps(parse_candidate(sys.stdin.read(),[{"id":"browser","input":{"actions":[]}}])[0]["output"]["trace"][0]))', [],
      ['TMENU_CASE|browser', states[0], 'TMENU_DONE', 'All tests passed.'].join('\n')));
  };
  const compare = async index => {
    const deadline = Date.now() + 15000; let observed, previous = null;
    do { observed = await probe(); if (isDeepStrictEqual(observed, previous) && isDeepStrictEqual(observed, expected[index])) return; previous = observed; } while (Date.now() < deadline);
    assert.deepEqual(observed, expected[index], `${input.id} checkpoint ${index}`); assert.fail('Browser state did not stabilize twice');
  };
  const click = async name => {
    await probe(); assert.ok(targets[name], `Actual ${name} node geometry is required`); const [x, y] = targets[name];
    await page.locator('#canvas').scrollIntoViewIfNeeded(); await page.mouse.move(page.viewportSize().width - 1, 1);
    for (const offset of [0, -8, 8, -16, 16, -24, 24, -32, 32]) {
      const box = await page.locator('#canvas').boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= page.viewportSize().width && box.y + box.height <= page.viewportSize().height);
      const before = (await page.locator('#log').textContent()).length; const native = [x, y + offset];
      const pointer = [box.x + box.width * native[0] / 1024, box.y + box.height * native[1] / 768]; await page.mouse.move(...pointer);
      await page.waitForFunction(({before, native, pattern}) => {
        const text = document.querySelector('#log').textContent.slice(before);
        return [...text.matchAll(/TMENU_MOVE_ACK\|(-?[\d.]+)\|(-?[\d.]+)/g)].some(row => Math.abs(+row[1] - native[0]) <= 1 && Math.abs(+row[2] - native[1]) <= 1)
          || [...text.matchAll(/TMENU_HOVER\|[^|]+\|(-?[\d.]+)\|(-?[\d.]+)/g)].some(row => Math.abs(+row[1] - native[0]) <= 1 && Math.abs(+row[2] - native[1]) <= 1)
          || new RegExp(pattern, 'i').test(text);
      }, {before, native, pattern: fatal.source}, {timeout: 15000});
      const text = (await page.locator('#log').textContent()).slice(before); assert.doesNotMatch(text, fatal);
      const hit = [...text.matchAll(/TMENU_HOVER\|([^|]+)\|(-?[\d.]+)\|(-?[\d.]+)/g)].find(row => row[1] === name && Math.abs(+row[2] - native[0]) <= 1 && Math.abs(+row[3] - native[1]) <= 1);
      if (!hit) continue;
      assert.deepEqual(await page.locator('#canvas').boundingBox(), box, 'Canvas geometry must stay fixed after proven native hover');
      const clickedAt = (await page.locator('#log').textContent()).length; await page.mouse.click(...pointer, {delay: 100});
      if (name.startsWith('terrain-')) {
        await page.waitForFunction(before => document.querySelector('#log').textContent.slice(before).includes('TMENU_NATIVE_CLICK|'), clickedAt, {timeout: 15000});
        const clicks = [...(await page.locator('#log').textContent()).slice(clickedAt).matchAll(/TMENU_NATIVE_CLICK\|([^\r\n]+)/g)];
        assert.deepEqual(clicks.map(row => row[1]), [name.slice('terrain-'.length)], 'One real click must reach the declared native terrain row');
      }
      await page.waitForTimeout(200); await page.mouse.move(page.viewportSize().width - 1, 1); return;
    }
    assert.fail(`Pointer never reached actual ${name} node`);
  };
  await compare(0);
  for (const [index, action] of input.input.actions.entries()) {
    if (action === 'menu') await click('menu');
    else if (action === 'tab') await page.keyboard.press('Tab');
    else if (action === 'escape') await page.keyboard.press('Escape');
    else if (Number.isInteger(action.header)) await click(`header-${action.header}`);
    else if (Number.isInteger(action.terrain_index)) await click(`terrain-${action.terrain_index}`);
    else assert.fail('Unknown declared Terraform control');
    await compare(index + 1);
  }
  assert.ok(sourceReads.get('menu.txt') > 0 && sourceReads.get('alphax.txt') > 0);
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`terraform-menu-${input.id}.png`, artifacts))});
  await page.keyboard.press('k'); await page.waitForFunction(() => document.body.dataset.state === 'exited');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal); assert.deepEqual(errors, []);
});
