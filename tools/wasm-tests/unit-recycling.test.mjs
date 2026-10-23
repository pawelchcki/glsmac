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
const publicCasesPath = fileURLToPath(new URL('../behavior-tests/ui/cases/unit-recycling.json', import.meta.url));
const publicFormerCasesPath = fileURLToPath(new URL('../behavior-tests/ui/cases/unit-recycling-former-city.json', import.meta.url));
const publicScoutFreeCasesPath = fileURLToPath(new URL('../behavior-tests/ui/cases/unit-recycling-scout-free.json', import.meta.url));
const casesPath = process.env.UNIT_RECYCLING_CASES || publicCasesPath;
const observationsPath = process.env.UNIT_RECYCLING_OBSERVATIONS || fileURLToPath(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-unit-recycling.json', import.meta.url));
const groups = [{casesPath, observationsPath}];
if (!process.env.UNIT_RECYCLING_CASES && !process.env.UNIT_RECYCLING_OBSERVATIONS) groups.push({casesPath: publicFormerCasesPath,
  observationsPath: fileURLToPath(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-unit-recycling-former-city.json', import.meta.url))});
if (!process.env.UNIT_RECYCLING_CASES && !process.env.UNIT_RECYCLING_OBSERVATIONS) groups.push({casesPath: publicScoutFreeCasesPath, observationsPath: fileURLToPath(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-unit-recycling-scout-free.json', import.meta.url))});
const cases = groups.flatMap(group => JSON.parse(readFileSync(group.casesPath)).cases.map(input => ({input, group})))
  .filter(({input}) => !process.env.UNIT_RECYCLING_CASE || input.id === process.env.UNIT_RECYCLING_CASE);
assert.ok(cases.length, 'The browser selector must match declared unit recycling cases');
assert.ok(cases.every(({input}) => input.algorithm === 'ui.unit_recycling.v1'));
const hash = value => createHash('sha256').update(value).digest('hex');
const python = (source, args = [], input) => execFileSync('python3', ['-c', source, ...args],
  {cwd: root, encoding: 'utf8', input, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});

function loadEvidence({casesPath, observationsPath}) {
  return JSON.parse(python(`
import json,sys
sys.path.insert(0,'tools/behavior-tests')
from compare import read_json,validate_observations
from protocol import fingerprint,probe_request
from ui.unit_recycling_contract import validate_input,validate_output
suite,record,*publics=[read_json(path) for path in sys.argv[1:]]
declared={case['id']:case for public in publics for case in probe_request(public)['cases']}
request=probe_request(suite)
for case in request['cases']:
    if case['id'] not in declared or fingerprint(case)!=fingerprint(declared[case['id']]):
        raise ValueError('Browser input differs from declared public case: '+case['id'])
    validate_input(case['input'])
outputs=validate_observations(record,suite)
for case in request['cases']: validate_output(outputs[case['id']],case['input']['actions'])
print(json.dumps(dict(outputs=outputs,repeat=record['repeat'])))
`, [casesPath, observationsPath, publicCasesPath, publicFormerCasesPath, publicScoutFreeCasesPath]));
}

function patchTerrainSource(bytes, declaration) {
  const text = bytes.toString('latin1'); const starts = [...text.matchAll(/^#TERRAIN\s*\r?$/gm)];
  assert.equal(starts.length, 1); assert.match(declaration, /^#TERRAIN\n[\s\S]*\n#END\n$/);
  const start = starts[0].index, bodyStart = start + starts[0][0].length;
  const next = /^#[A-Z][A-Za-z0-9_]*\s*\r?$/m.exec(text.slice(bodyStart));
  const end = next ? bodyStart + next.index : text.length;
  return Buffer.from(text.slice(0, start) + declaration.replace(/#END\n$/, '').replaceAll('\n', text.includes('\r\n') ? '\r\n' : '\n') + text.slice(end), 'latin1');
}


function patchDialogs(bytes, declaration) {
  const blocks = [...declaration.matchAll(/^#(DISBAND2?)\r?$/gm)];
  assert.deepEqual(blocks.map(row => row[1]), ['DISBAND', 'DISBAND2']);
  for (const [index, row] of blocks.entries()) {
    bytes = patchBlock(bytes, declaration.slice(row.index, blocks[index + 1]?.index ?? declaration.length), '#' + row[1]);
  }
  return bytes;
}

function replaceOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, `One observational marker: ${marker}`);
  return source.replace(marker, replacement);
}

function patchBlock(bytes, declaration, marker) {
  const text = bytes.toString('latin1');
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const starts = [...text.matchAll(new RegExp(`^${escaped}\\s*\\r?$`, 'gm'))];
  assert.equal(starts.length, 1, `One installed ${marker} section`);
  const start = starts[0].index, bodyStart = start + starts[0][0].length;
  const next = /^#[A-Z][A-Za-z0-9_]*\s*\r?$/m.exec(text.slice(bodyStart));
  const end = next ? bodyStart + next.index : text.length;
  return Buffer.from(text.slice(0,start) + declaration.replace(/#END\n$/, '').replaceAll('\n', text.includes('\r\n') ? '\r\n' : '\n') + text.slice(end), 'latin1');
}
function instrument(scripts) {
  const menu = 'GLSMAC_data/default/ui/parts/game/menu/menu.gls.js';
  scripts[menu] = replaceOnce(scripts[menu], "item.on('click', (e) => {", "item.on('click', (e) => {\n                        #print('FMENU_NATIVE_CLICK|' + (#is_defined(entry.source_index) ? #to_string(entry.source_index) : 'header'));");
  const bar = 'GLSMAC_data/default/ui/parts/game/bottom_bar/bottom_bar.gls.js';
  scripts[bar] = replaceOnce(scripts[bar], "btn_left_menu.on('click',", "this.contract_menu_button = btn_left_menu;\n\t\tbtn_left_menu.on('click',");
}
// Native declared input only. Actual pointer/SDL controls own every effect.
const worldTemplate = `return (game) => {
 const owner = game.get_player(); const tm = game.get_tm(); let first = true;
 const settings = game.get_settings().global;
 settings.map.preset_level = RECYCLING_PRICING.map_size_kind;
 settings.rules.set_mineral_cost_factor(RECYCLING_PRICING.mineral_rule_factor);
 if (owner.get_faction().social_ratings.industry != RECYCLING_PRICING.industry) { throw Error('Audited source industry differs'); }
 const valid = (tile) => { return tile.is_land && tile.moisture == 1 && tile.rockiness == 1 && !tile.features.xenofungus; };
 let origin = null;
 for (let y = 2; y < tm.get_map_height() - 2 && origin == null; y++) {
  for (let x = 2 + y % 2; x < tm.get_map_width() - 2 && origin == null; x += 2) {
   const tile = tm.get_tile(x,y);
   if (valid(tile) && valid(tm.get_tile(x + 1,y + 1)) && valid(tm.get_tile(x - 1,y + 1))) { origin = {x:x,y:y}; }
  }
 }
 if (origin == null) { throw Error('Generated map has no declared flat-arid native layout'); }
 game.set('recycling_browser_origin',origin);
 game.get_bm().on('base_spawn', (e) => {
  if (first) { first = false;
   if (e.base.get_size() == 0) { e.base.create_pop({type: 'DOCTOR'}); }
   e.base.set('accumulated_nutrients', 0);
   e.base.restore_production({choice_id: '', minerals: 9, last_processed_turn: 0}, '');
  }
 });
 for (unit of game.get('starting_unit_rules')) { game.event('add_production_choice', {player:owner,id:unit.choice,data:{type:'unit',id:unit.id,cost:unit.rows * 10,cost_rows:unit.rows,population_cost:unit.population}}); }
 game.event('spawn_base', {owner: owner, tile: tm.get_tile(origin.x, origin.y), facilities: ['HEADQUARTERS']});
 for (spec of RECYCLING_POSITIONS) {
  game.event('spawn_unit', {type: spec[0], owner: owner, tile: tm.get_tile(origin.x + spec[1],origin.y + spec[2]), morale: 2, health: 1.0});
 }
};`;

const mainTemplate = String.raw`
#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const menu = #include('ui/parts/game/menu/menu');
 const bar = #include('ui/parts/game/bottom_bar/bottom_bar');
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const normalize = (value) => { return #uppercase(value); };
 glsmac.on('configure_game', (e) => {
  const game = e.game; let selected = null; let started = false; let serial = 0; let initial_year = 0;
  game.on('unit_select', (e) => { selected = e.unit.id + 0; #print('FMENU_FOCUS|' + e.unit.def); });
  for (event of ['tile_select','base_select']) { game.on(event, () => { selected = null; }); }
  game.on('event_result', (e) => { if (!e.success) { #print('FMENU_REJECT|' + e.name); } });
  game.on('error', () => { #print('FMENU_GAME_ERROR'); });
  game.on('start_ui', () => {
   const bases = game.get_bm().get_bases(); if (#sizeof(bases) != 1) { throw Error('Expected one fixture city'); }
   const base = bases[0]; const owner = game.get_player().id + 0; const city_tile = base.get_tile();
   // Rename only the input city through its existing authoritative command.
   // This also removes its temporary source-pool name from the native registry.
   game.event('rename_base', {base_id: base.id + 0, turn_id: game.get_turn(), request_token: 1, previous_name: base.name + '', name: 'Gaia\'s Landing'});
   const um = game.get_um(); const ids = []; const tiles = [];
   for (spec of RECYCLING_POSITIONS) {
    const origin = game.get('recycling_browser_origin'); const tile = game.get_tm().get_tile(origin.x + spec[1],origin.y + spec[2]); let found = null;
    for (unit of tile.get_units()) { if (unit.def == spec[0]) { if (found != null) { throw Error('Duplicate declared native role'); } found = unit; } }
    if (found == null) { throw Error('Missing declared native role'); } ids :+ found.id + 0; tiles :+ tile;
   }
   const defs = ['ScoutPatrol','Formers','ColonyPod']; const roles = ['scout','former','colony'];
   const initial_pops = base.get_pops(); const doctor = initial_pops[0]; const nutrients = base.get('accumulated_nutrients'); const production = base.get_production();
   const mineral_baseline = production.minerals + 0; let retirement_target = null; const watched = {};
   glsmac.ui.root.on('mousemove', (e) => { #print('FMENU_MOVE_ACK|' + #to_string(e.ax) + '|' + #to_string(e.ay)); return false; });
   const watch = (name, node, x, y) => {
    if (!#is_defined(watched[name]) || watched[name] != node) {
     watched[name] = node;
     node.on('mousemove', (e) => { #print('FMENU_HOVER|' + name + '|' + #to_string(e.ax) + '|' + #to_string(e.ay)); return false; });
    }
    #print('FMENU_TARGET|' + name + '|' + #to_string(x) + '|' + #to_string(y));
   };
   const report = () => {
    if (preview.selected_unit_id != selected || menu.selected_unit_id != selected) { return; }
    const current_pops = base.get_pops(); const pricing = game.get_settings().global;
    if (pricing.map.type != 'random' || pricing.map.preset_level != RECYCLING_PRICING.map_size_kind || pricing.rules.get_mineral_cost_factor() != RECYCLING_PRICING.mineral_rule_factor || game.get_player().get_faction().social_ratings.industry != RECYCLING_PRICING.industry) { throw Error('Audited native pricing context changed'); }
    if (base.name != 'Gaia\'s Landing' || base.get_tile() != city_tile || base.get_tile().get_base() != base || base.get_owner().id != owner ||
        base.get_production().choice_id != production.choice_id || base.get_production().last_processed_turn != production.last_processed_turn || base.get('accumulated_nutrients') != nutrients || #sizeof(base.get_worked_tiles()) != 0 ||
        #sizeof(current_pops) != 1 || current_pops[0] != doctor || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile')) { throw Error('Old city changed'); }
    const all_bases = game.get_bm().get_bases();
    if (#sizeof(all_bases) != 1 || all_bases[0] != base) { throw Error('Unexpected native city membership'); }
    let owned = 0; for (current of all_bases) { if (current.get_owner().id == owner) { owned++; } }
    let role = 'none';
    for (let guard_index = 0; guard_index < 3; guard_index++) {
     if (!um.has_unit(ids[guard_index])) {
      if (ids[guard_index] != retirement_target) { throw Error('Wrong native unit removed'); }
      for (member of tiles[guard_index].get_units()) { if (member.id == ids[guard_index]) { throw Error('Removed unit left stale native tile membership'); } }
     } else {
     const unit = um.get_unit(ids[guard_index]); const members = tiles[guard_index].get_units();
     if (unit.def != defs[guard_index] || unit.owner != owner || unit.health != 1.0 || unit.get_tile() != tiles[guard_index] || unit.movement != 1.0 ||
         unit.get_order() != 'NO_ORDERS') { throw Error('Guarded native unit changed'); }
     let member_count = 0; for (member of members) { if (member == unit) { member_count++; } } if (member_count != 1) { throw Error('Missing actual native tile membership'); }
     if (selected == unit.id) { role = roles[guard_index]; }
     }
    }
    if (selected != null && role == 'none') { throw Error('Unknown actual focus'); }
    const root = menu.menus.left_menu; let child = null;
    for (id in menu.menus) { const current = menu.menus[id];
     if (id != 'left_menu' && current.is_open) {
      if (!root.is_open || child != null || id != 'left_menu_action') { throw Error('Unexpected child'); } child = current;
     }
    }
    #print('FMENU_BROWSE_BEGIN|' + #to_string(serial)); serial++;
    #print('RECYCLING_STATE|0|' + #to_string(game.get_year() - initial_year) + '|' + role + '|' + #to_string(owned) + '|' + #to_string(base.get_production().minerals - mineral_baseline));
    for (let output_index = 0; output_index < 3; output_index++) { if (um.has_unit(ids[output_index])) {
     const unit = um.get_unit(ids[output_index]); const order = unit.get_order();
     let code = (0 - 1); if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
     if (code < 0) { throw Error('Unsupported actual unit order'); }
     #print('RECYCLING_UNIT|' + roles[output_index] + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
    } }
    #print('RECYCLING_MENU|' + #to_string(root.is_open) + '|' + (child == null ? 'none' : '4'));
    const dialog = preview.disband.dialog;
    if (dialog == null) { #print('RECYCLING_NO_DIALOG'); }
    else {
     if (retirement_target == null) { retirement_target = selected; }
     #print('RECYCLING_CAPTION|' + dialog.caption.text); #print('RECYCLING_BODY|' + dialog.body.text);
     let highlighted = null; let row_index = 0;
     for (row of dialog.rows) {
      #print('RECYCLING_CHOICE|' + row.text);
      for (name of #split(row.class, ' ')) { if (name == 'popup-choice-active') { if (highlighted != null) { throw Error('Duplicate actual choice highlight'); } highlighted = row_index; } }
      row_index++;
     }
     if (highlighted == null || highlighted != dialog.selected) { throw Error('Actual choice highlight disagrees with draft'); }
     #print('RECYCLING_SELECTED|' + #to_string(highlighted)); #print('RECYCLING_BUTTON|' + dialog.ok.text);
     const node = dialog.ok; watch('button-ok',node,(glsmac.ui.get_width() - RECYCLING_WIDTH) / 2 + node.left + node.width / 2,(glsmac.ui.get_height() - RECYCLING_HEIGHT) / 2 + node.top + node.height / 2);
    }
    #print('RECYCLING_STATE_DONE');
    const button = bar.contract_menu_button;
    watch('menu',button,button.left + button.width / 2,glsmac.ui.get_height() - bar.height + button.top + button.height / 2);
    if (root.is_open) {
     const header = root.items[4].el;
     watch('header-4',header,root.el.left + header.width / 2,glsmac.ui.get_height() - root.el.bottom - root.el.height + header.top + header.height / 2);
     if (child != null) { for (control of child.items) {
      if (#is_defined(control.entry.source_index) && control.entry.source_index == 9) {
       const node = control.el; const left = #is_defined(node.left) ? node.left : 0;
       watch('row-9',node,child.el.left + left + node.width / 2,child.el.top + node.top + node.height / 2);
      }
     } }
    }
    #print('FMENU_BROWSE_DONE');
   };
   #async(500, () => {
    if (!started && base.name == 'Gaia\'s Landing' && preview.selected_unit_id == selected && menu.selected_unit_id == selected) {
     for (let index = 0; index < 3; index++) { if (selected == ids[index]) { #print('FMENU_PREPARED|' + roles[index]); } }
    }
    if (started) { try { report(); } catch { : (error) => { #print('FMENU_PROBE_ERROR|' + #to_string(error)); } } } return true; });
   #async(0, () => {
    glsmac.ui.root.on('keydown', (e) => {
     if (e.code != 'K' || e.modifiers != {}) { return false; }
     if (started) { started = false; glsmac.exit(); }
     else {
      if (base.name != 'Gaia\'s Landing' || preview.selected_unit_id != ids[0]) { throw Error('Fixture preparation not complete'); }
      initial_year = game.get_year(); started = true;
     }
     return true;
    });
    #print('FMENU_READY'); return false;
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

for (const {input, group} of cases) test(`real unit recycling controls match recorded state (${input.id})`, {
  skip: !assets && 'Requires installed SMAC assets', timeout: 240000,
}, async t => {
  mkdirSync(artifacts, {recursive: true}); const evidence = loadEvidence(group); const expected = evidence.outputs[input.id]?.trace;
  assert.ok(expected); assert.equal(expected.length, input.input.actions.length + 1);
  t.diagnostic(`Accepted original evidence: ${evidence.repeat} independent agreeing runs`);
  const scripts = Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`, {recursive: true}).filter(name => name.endsWith('.gls.js')).sort()
    .map(name => [`GLSMAC_data/default/${name}`, readFileSync(`${scriptsRoot}/GLSMAC_data/default/${name}`, 'utf8')]));
  const geometry = scripts['GLSMAC_data/default/ui/parts/game/bottom_bar/unit_disband.gls.js'].match(/root\.window\(\{[^}]*\bwidth:\s*(\d+),\s*height:\s*(\d+)/);
  assert.ok(geometry, 'Actual production recycling geometry is required');
  const pricing = python('import sys; sys.path.insert(0,"tools/behavior-tests"); from ui.unit_recycling_inputs import PRICING_CONTEXT; from ui.headless import gse_literal; print(gse_literal(PRICING_CONTEXT))').trim();
  const positions = input.input.profile === 'scout-free' ? [['ScoutPatrol',1,1],['Formers',1,1],['ColonyPod',-1,1]] : input.input.profile === 'stacked' ? [['ScoutPatrol',0,0],['Formers',0,0],['ColonyPod',0,0]] : [['ScoutPatrol',0,0],['Formers',1,1],['ColonyPod',-1,1]];
  const prefix = `const RECYCLING_POSITIONS = ${JSON.stringify(positions).replaceAll('"', "'").replaceAll('-1', '(0 - 1)')};\nconst RECYCLING_PRICING = ${pricing};\n`;
  const world = prefix + worldTemplate;
  const main = prefix + `const RECYCLING_WIDTH = ${geometry[1]}; const RECYCLING_HEIGHT = ${geometry[2]};\n` + mainTemplate;
  t.diagnostic(`Production scripts SHA-256: ${hash(JSON.stringify(scripts))}`); instrument(scripts);
  t.diagnostic(`Executed scripts SHA-256: ${hash(JSON.stringify(scripts))}; observer/world: ${hash(JSON.stringify({main, world}))}; WASM: ${hash(readFileSync(`${build}/GLSMAC.wasm`))}`);
  t.diagnostic('Real pointer targets require native hover and one click; native city/companion identity, counters and positions are guarded. Actual dialog text, selected row and native surviving unit/city membership and real hit delivery are checked; independent pixel equivalence remains outside this observer.');
  const declarations = JSON.parse(python('import json,sys; sys.path.insert(0,"tools/behavior-tests"); from ui.unit_recycling_inputs import declarations; print(json.dumps(declarations(sys.argv[1])))', [input.input.text_profile]));
  const sources = {};
  for (const [name, declaration] of Object.entries(declarations)) {
    const names = readdirSync(assets).filter(value => value.toLowerCase() === name); assert.equal(names.length,1);
    const bytes = readFileSync(`${assets}/${names[0]}`);
    sources[name] = name === 'menu.txt' ? Buffer.from(declaration,'ascii') : name === 'alphax.txt'
      ? patchTerrainSource(bytes,declaration) : patchDialogs(bytes,declaration);
  }
  const address = await serve(t); const errors = [];
  const browser = await chromium.launch({headless: true, executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.stack || String(error))); page.on('crash', () => errors.push('Chromium page crashed'));
  page.on('console', message => { if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(message.text())) errors.push(message.text()); });
  t.after(async () => { try {
    writeFileSync(new URL(`unit-recycling-${input.id}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000}));
    if (await page.locator('#canvas').isVisible()) await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`unit-recycling-${input.id}-last.png`, artifacts)), timeout: 5000});
  } finally { await browser.close(); } });
  const {sourceReads} = await overrideTextAssets(page, sources);
  const fatal = /FMENU_REJECT|FMENU_GAME_ERROR|FMENU_PROBE_ERROR|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|sent an error!|\[Error\]/i;
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) { const path = `/unit-recycling-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source); }
    Module.FS.writeFile('/unit-recycling-snapshot/GLSMAC_data/default/browser_unit_recycling_main.gls.js', main);
    Module.FS.writeFile('/unit-recycling-snapshot/GLSMAC_data/default/game/world/browser_unit_recycling.gls.js', world);
    // Install the conflicting expansion block before the game starts. Its exact
    // presence is required; opening it is not required when common Script wins.
    const useRemote = Module.assetStore.useRemote.bind(Module.assetStore);
    Module.assetStore.useRemote = async (...args) => {
      const record = await useRemote(...args);
      const paths = [...Module.assetStore.entries.keys()].filter(path => path.toLowerCase() === 'xscript.txt');
      if (paths.length !== 1) throw new Error('One installed expansion Script is required');
      const path = `/smac/${paths[0]}`;
      await Module.assetStore.ensureFile(path);
      const bytes = Module.FS.readFile(path);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      window.disbandExpansionProof = {path, size: bytes.length,
        sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')};
      return record;
    };
    const callMain = Module.callMain; Module.callMain = args => callMain([...args, '--datapath', '/unit-recycling-snapshot/GLSMAC_data', '--mainscript', 'browser_unit_recycling_main', '--worldscript', 'browser_unit_recycling', '--quickstart', '--quickstart-mapsize', '16x16', '--quickstart-map-ocean', '0', '--quickstart-map-erosive', '100', '--quickstart-map-lifeforms', '0', '--quickstart-map-clouds', '0', '--quickstart-seed', '1:2:3:4', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main, world});
  await page.locator('#start').click(); await page.waitForFunction(pattern => {
    const text = document.querySelector('#log').textContent;
    return text.includes('FMENU_READY') || document.body.dataset.state === 'failed' || new RegExp(pattern, 'i').test(text);
  }, fatal.source);
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  // All units remain ready; Tab selection is a declared user action.
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('FMENU_PREPARED|scout'));
  await page.keyboard.press('k');
  let targets = {};
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('FMENU_BROWSE_DONE').length;
    await page.waitForFunction(({count, pattern}) => { const text = document.querySelector('#log').textContent;
      return text.split('FMENU_BROWSE_DONE').length > count || new RegExp(pattern, 'i').test(text);
    }, {count, pattern: fatal.source}, {timeout: 15000});
    const text = await page.locator('#log').textContent(); assert.doesNotMatch(text, fatal);
    const chunks = [...text.matchAll(/FMENU_BROWSE_BEGIN\|\d+([\s\S]*?)FMENU_BROWSE_DONE/g)]; assert.ok(chunks.length);
    const body = chunks.at(-1)[1];
    targets = Object.fromEntries([...body.matchAll(/FMENU_TARGET\|(menu|header-4|row-9|button-ok)\|(-?[\d.]+)\|(-?[\d.]+)/g)].map(row => [row[1], [+row[2], +row[3]]]));
    const markers = body.split('\n').map(line => line.replace(/^.*?\] /,'').trim()).filter(line => line.startsWith('RECYCLING_'));
    return JSON.parse(python('import json,sys; sys.path.insert(0,"tools/behavior-tests"); from ui.unit_recycling_headless import parse_candidate; print(json.dumps(parse_candidate(sys.stdin.read(),[{"id":"browser","input":{"actions":[]}}])[0]["output"]["trace"][0]))',[],
      ['RECYCLING_CASE|browser',...markers,'RECYCLING_CASE_DONE','All tests passed.'].join('\n')));

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
        return [...text.matchAll(/FMENU_MOVE_ACK\|(-?[\d.]+)\|(-?[\d.]+)/g)].some(row => Math.abs(+row[1] - native[0]) <= 1 && Math.abs(+row[2] - native[1]) <= 1)
          || [...text.matchAll(/FMENU_HOVER\|[^|]+\|(-?[\d.]+)\|(-?[\d.]+)/g)].some(row => Math.abs(+row[1] - native[0]) <= 1 && Math.abs(+row[2] - native[1]) <= 1)
          || new RegExp(pattern, 'i').test(text);
      }, {before, native, pattern: fatal.source}, {timeout: 15000});
      const text = (await page.locator('#log').textContent()).slice(before); assert.doesNotMatch(text, fatal);
      const hit = [...text.matchAll(/FMENU_HOVER\|([^|]+)\|(-?[\d.]+)\|(-?[\d.]+)/g)].find(row => row[1] === name && Math.abs(+row[2] - native[0]) <= 1 && Math.abs(+row[3] - native[1]) <= 1);
      if (!hit) continue;
      assert.deepEqual(await page.locator('#canvas').boundingBox(), box, 'Canvas geometry must stay fixed after proven native hover');
      const clickedAt = (await page.locator('#log').textContent()).length; await page.mouse.click(...pointer, {delay: 100});
      if (name === 'row-9') {
        await page.waitForFunction(before => document.querySelector('#log').textContent.slice(before).includes('FMENU_NATIVE_CLICK|'), clickedAt, {timeout: 15000});
        const clicks = [...(await page.locator('#log').textContent()).slice(clickedAt).matchAll(/FMENU_NATIVE_CLICK\|([^\r\n]+)/g)];
        assert.deepEqual(clicks.map(row => row[1]), ['9'], 'One real click must reach the declared native Action source row');
      }
      await page.waitForTimeout(200); await page.mouse.move(page.viewportSize().width - 1, 1); return;
    }
    assert.fail(`Pointer never reached actual ${name} node`);
  };
  await compare(0);
  for (const [index, action] of input.input.actions.entries()) {
    if (action === 'menu') await click('menu');
    else if (action === 'tab') await page.keyboard.press('Tab');
    else if (action === 'cancel') await page.keyboard.press('Escape');
    else if (action === 'confirm') await page.keyboard.press('Enter');
    else if (action === 'up') await page.keyboard.press('ArrowUp');
    else if (action === 'down') await page.keyboard.press('ArrowDown');
    else if (action === 'button-ok') await click('button-ok');
    else if (Number.isInteger(action.header)) await click(`header-${action.header}`);
    else if (Number.isInteger(action.row_source)) await click(`row-${action.row_source}`);
    else assert.fail('Unknown declared unit recycling control');
    await compare(index + 1);
  }
  for (const name of ['menu.txt', 'alphax.txt', 'script.txt']) assert.ok(sourceReads.get(name) > 0, `Selected source loaded: ${name}`);
  const expansion = await page.evaluate(async () => {
    const proof = window.disbandExpansionProof;
    if (!proof) throw new Error('Expansion Script was not mounted before game startup');
    const bytes = Module.FS.readFile(proof.path);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {before: proof, size: bytes.length,
      sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')};
  });
  assert.equal(expansion.before.size, sources['xscript.txt'].length);
  assert.equal(expansion.before.sha256, hash(sources['xscript.txt']), 'Exact conflicting expansion declaration mounted before startup');
  assert.equal(expansion.size, expansion.before.size);
  assert.equal(expansion.sha256, expansion.before.sha256, 'Mounted expansion declaration remains unchanged');
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`unit-recycling-${input.id}.png`, artifacts))});
  await page.keyboard.press('k'); await page.waitForFunction(() => document.body.dataset.state === 'exited');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal); assert.deepEqual(errors, []);
});
