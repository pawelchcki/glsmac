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
const publicCasesPath = fileURLToPath(new URL('../behavior-tests/ui/cases/unit-menu-context.json', import.meta.url));
const casesPath = process.env.UNIT_MENU_CONTEXT_CASES || publicCasesPath;
const observationsPath = process.env.UNIT_MENU_CONTEXT_OBSERVATIONS || fileURLToPath(new URL('../behavior-tests/ui/observations/smacx-gog-2.0-unit-menu-context.json', import.meta.url));
const cases = JSON.parse(readFileSync(casesPath)).cases
  .filter(row => !process.env.UNIT_MENU_CONTEXT_CASE || row.id === process.env.UNIT_MENU_CONTEXT_CASE);
assert.ok(cases.length, 'The case selector must match declared public unit-menu inputs');
assert.ok(cases.every(row => row.algorithm === 'ui.unit_menu_context.v1'), 'Only the bounded unit-menu contract is supported');
const hash = value => createHash('sha256').update(value).digest('hex');

// Explicit pilot paths narrow the declared suite, never the evidence checks.
// The default still requires complete independently repeated full-suite gold.
function loadEvidence() {
  return JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'tools/behavior-tests')
from compare import read_json, validate_observations
from protocol import fingerprint, probe_request
from ui.unit_menu_context_contract import validate_input, validate_output
suite, record, public = [read_json(path) for path in sys.argv[1:]]
declared = {case['id']: case for case in probe_request(public)['cases']}
request = probe_request(suite)
for case in request['cases']:
    if case['id'] not in declared or fingerprint(case) != fingerprint(declared[case['id']]):
        raise ValueError('Selected browser case differs from declared public input: ' + case['id'])
    validate_input(case['input'])
outputs = validate_observations(record, suite)
for case in request['cases']:
    validate_output(outputs[case['id']], case['input']['actions'])
print(json.dumps(dict(outputs=outputs, cases=len(request['cases']), repeat=record['repeat'])))
`, casesPath, observationsPath, publicCasesPath], {cwd: root, encoding: 'utf8', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}}));
}

// Replace only the declared TERRAIN block in an opaque full startup document.
// The fixture consumes no installed text as an expected menu observation.
export function patchTerrainSource(bytes, declaration) {
  const text = bytes.toString('latin1');
  const starts = [...text.matchAll(/^#TERRAIN\s*\r?$/gm)];
  assert.equal(starts.length, 1, 'One installed TERRAIN input block is required');
  assert.match(declaration, /^#TERRAIN\n[\s\S]*\n#END\n$/);
  const start = starts[0].index;
  const bodyStart = start + starts[0][0].length;
  const next = /^#[A-Z][A-Za-z0-9_]*\s*\r?$/m.exec(text.slice(bodyStart));
  const end = next ? bodyStart + next.index : text.length;
  const ending = text.includes('\r\n') ? '\r\n' : '\n';
  const block = declaration.replace(/#END\n$/, '').replaceAll('\n', ending);
  return Buffer.from(text.slice(0, start) + block + text.slice(end), 'latin1');
}

function replaceOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, `One observational instrumentation marker: ${marker}`);
  return source.replace(marker, replacement);
}

// Retain actual native nodes solely for observation. Constructors, properties,
// callbacks and input remain production code; no menu data enters this patch.
// Factory success makes native children visible (Container::Factory). Native
// Object has no visibility getter/events, so observe completed row Show/Hide
// calls in plain records, without replacing native methods or properties.
export function instrumentMenuNodes(scripts) {
  const path = 'GLSMAC_data/default/ui/parts/game/menu/menu.gls.js';
  let source = scripts[path];
  assert.equal(typeof source, 'string', 'Production menu controller is required');
  source = replaceOnce(source, 'menu.hide();', `menu.hide();
                const contract_nodes = [];
                const observe_menu_node = (kind, props) => {
                    const node = kind == 'button' ? menu.button(props) : menu.surface(props);
                    const record = {kind: kind}; record.el = node;
                    record.declared_class = #is_defined(props.class) ? props.class : '';
                    record.removed = false;
                    record.visible = true;
                    record.is_removed = () => { return record.removed; };
                    node.on('remove', () => { record.removed = true; });
                    contract_nodes :+ record; return node;
                };`);
  // Avoid changing the observational helper's own actual constructor calls.
  source = source.replaceAll('menu.surface({', "observe_menu_node('surface', {")
    .replaceAll('menu.button({', "observe_menu_node('button', {");
  source = replaceOnce(source, "item.on('click', (e) => {", "item.on('click', (e) => {\n                        #print('UMENU_NATIVE_CLICK|' + (#is_defined(entry.source_index) ? #to_string(entry.source_index) : 'header') + '|' + entry.label);");
  source = replaceOnce(source, 'result.el = menu;', `result.contract_observe_visibility = (node, visible) => {
                    if (#typeof(visible) != 'Bool') { throw Error('Invalid observed native row visibility'); }
                    let found = null;
                    for (record of contract_nodes) {
                        if (record.el == node) {
                            if (found != null || record.is_removed()) { throw Error('Ambiguous or stale native row visibility identity'); }
                            found = record;
                        }
                    }
                    if (found == null) { throw Error('Unknown native row visibility identity'); }
                    found.visible = visible;
                };
                result.el = menu; result.contract_nodes = contract_nodes;`);
  source = replaceOnce(source, 'row.el.hide();', 'row.el.hide(); child.contract_observe_visibility(row.el, false);');
  source = replaceOnce(source, 'row.el.show();', 'row.el.show(); child.contract_observe_visibility(row.el, true);');
  scripts[path] = source;
  const orders = 'GLSMAC_data/default/ui/parts/game/menu/unit_orders.gls.js';
  scripts[orders] = replaceOnce(scripts[orders], 'if (!preview.submit_unit_order(command))', "#print('UMENU_NATIVE_COMMAND|' + command);\n                                if (!preview.submit_unit_order(command))");
  const bottom = 'GLSMAC_data/default/ui/parts/game/bottom_bar/bottom_bar.gls.js';
  scripts[bottom] = replaceOnce(scripts[bottom], "btn_left_menu.on('click',", "this.contract_menu_button = btn_left_menu;\n\t\tbtn_left_menu.on('click',");
  const preview = 'GLSMAC_data/default/ui/parts/game/bottom_bar/object_preview.gls.js';
  scripts[preview] = replaceOnce(scripts[preview], "f_line(def.name, 13, 'center');", "this.contract_name_label = f_line(def.name, 13, 'center');");
  return scripts;
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
  if (e.base.get_size() == 0) {
   e.base.create_pop({type: 'DOCTOR'}); e.base.set('accumulated_nutrients', 0);
   e.base.restore_production({choice_id: '', minerals: 9, last_processed_turn: 0}, '');
  }
 });
 game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS']});
 for (type of ['ScoutPatrol', 'Formers', 'ColonyPod']) { game.event('spawn_unit', {type: type, owner: owner, tile: tm.get_tile(8, 8), morale: 2, health: 1.0}); }
};`;

const main = String.raw`
#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const menu = #include('ui/parts/game/menu/menu');
 const bar = #include('ui/parts/game/bottom_bar/bottom_bar');
 const popup = #include('ui/parts/game/popup/popup');
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const role = (unit) => {
  if (unit.def == 'ScoutPatrol') { return 'scout'; }
  if (unit.def == 'Formers') { return 'former'; }
  if (unit.def == 'ColonyPod') { return 'colony'; }
  throw Error('Unexpected native in-game menu unit');
 };
 glsmac.on('configure_game', (e) => {
  const game = e.game; let selected = null; let started = false; let serial = 0; let initial_focus_rendered = false;
  game.on('unit_select', (e) => { selected = role(e.unit); #print('IMENU_FOCUS|' + selected); });
  game.on('tile_select', () => { selected = null; });
  game.on('event_result', (e) => { #print('UMENU_NATIVE_RESULT|' + e.name + '|' + #to_string(e.success)); if (!e.success) { #print('IMENU_REJECT|' + e.name); } });
  game.on('error', () => { #print('IMENU_GAME_ERROR'); });
  game.on('start_ui', () => {
   const bases = game.get_bm().get_bases(); if (#sizeof(bases) != 1) { throw Error('Expected one declared menu city'); }
   const base = bases[0]; const base_id = base.id + 0; const owner = base.get_owner().id;
   const origin = base.get_tile(); const initial = game.get_year(); const um = game.get_um(); const ids = {};
   const pops = base.get_pops(); if (#sizeof(pops) != 1) { throw Error('Expected initial menu Doctor'); }
   const doctor = pops[0]; const doctor_id = doctor.id + 0;
   for (unit of origin.get_units()) { const name = role(unit); if (#is_defined(ids[name])) { throw Error('Duplicate menu role'); } ids[name] = unit.id + 0; }
   const watched = {};
   const watch = (name, node, x, y) => {
    if (!#is_defined(watched[name]) || watched[name] != node) {
     watched[name] = node;
     node.on('mousemove', (e) => {
      #print('IMENU_HOVER|' + name + '|' + #to_string(e.ax - e.x) + '|' + #to_string(e.ay - e.y) + '|' + #to_string(node.width) + '|' + #to_string(node.height)); return false;
     });
    }
    #print('IMENU_TARGET|' + name + '|' + #to_string(x) + '|' + #to_string(y));
   };
   const report = () => {
    if (popup.is_shown()) { throw Error('Unexpected actual modal in menu-only trace'); }
    const root_menu = menu.menus.left_menu;
    if (!#is_defined(root_menu) || !#is_defined(root_menu.contract_nodes)) { throw Error('Missing actual production parent menu nodes'); }
    const selected_id = selected == null ? null : ids[selected];
    if (preview.selected_unit_id != selected_id || menu.selected_unit_id != selected_id) {
     #print('UMENU_SELECTION_PENDING|' + #to_string(selected_id) + '|' + #to_string(preview.selected_unit_id) + '|' + #to_string(menu.selected_unit_id)); return;
    }
    // The initial focus must render through production. Later map hover can
    // preview a different object independently of the selected unit.
    if (!initial_focus_rendered && selected != null) {
     if (!#is_defined(preview.contract_name_label) || preview.rendered_unit_id != selected_id
         || preview.contract_name_label.text != um.get_unit(selected_id).get_def().name) { #print('IMENU_WAITING_INITIAL_PREVIEW'); return; }
     initial_focus_rendered = true;
    }
    #print('IMENU_BROWSE_BEGIN|' + #to_string(serial)); serial++;
    #print('IMENU_STATE|0|' + (root_menu.is_open ? 'menu' : 'map') + '|' + #to_string(game.get_year() - initial) + '|' + (selected == null ? 'none' : selected));
    if (#sizeof(game.get_bm().get_bases()) != 1 || base.id != base_id || base.get_owner().id != owner || base.get_tile() != origin || origin.get_base() != base) { throw Error('Menu altered native city identity/ownership/position/membership'); }
    const current = base.get_pops();
    if (#sizeof(current) != 1 || current[0] != doctor || doctor.id != doctor_id || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile')) { throw Error('Menu altered native citizen identity/job'); }
    if (base.get('accumulated_nutrients') != 0 || base.get_production().minerals != 9) { throw Error('Menu altered stored resources'); }
    let workers = 0; let doctors = 0;
    for (pop of current) { if (pop.get_type() == 'WORKER') { workers++; } else if (pop.get_type() == 'DOCTOR') { doctors++; } else { throw Error('Unknown actual citizen job'); } }
    #print('IMENU_NAME|' + base.name);
    #print('IMENU_BASE|' + #to_string(base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(base.get_worked_tiles())) + '|' + #to_string(#sizeof(game.get_bm().get_bases())));
    if (#sizeof(origin.get_units()) != 3) { throw Error('Menu altered stack membership'); }
    for (name of ['scout', 'former', 'colony']) {
     const unit = um.get_unit(ids[name]);
     if (role(unit) != name || unit.owner != owner || unit.health != 1.0 || unit.get_tile() != origin) { throw Error('Menu altered companion identity/owner/health/position'); }
     const order = unit.get_order(); let code = (0 - 1);
     if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
     if (code < 0) { throw Error('Unexpected menu companion order'); }
     #print('IMENU_UNIT|' + name + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
    }
    const menu_button = bar.contract_menu_button;
    if (!#is_defined(menu_button) || menu_button.text != 'MENU') { throw Error('Missing actual MENU control'); }
    watch('menu', menu_button, menu_button.left + menu_button.width / 2, glsmac.ui.get_height() - bar.height + menu_button.top + menu_button.height / 2);
    let child = null;
    for (id in menu.menus) { const item = menu.menus[id]; if (id != 'left_menu' && item.is_open) {
     if (id == 'right_menu' || child != null || !root_menu.is_open) { throw Error('Unexpected actual child menu'); } child = item;
    } }
    if (root_menu.is_open) {
     let index = 0; let active = (0 - 1);
     for (record of root_menu.contract_nodes) {
      if (record.is_removed()) { throw Error('Stale removed browser header node'); }
      if (record.kind != 'button') { continue; }
      const node = record.el;
      #print('IMENU_HEADER|' + #to_string(index) + '|' + #to_string(node.active) + '|' + node.text);
      if (node.active) { if (active >= 0) { throw Error('Ambiguous actual active header'); } active = index; }
      // Unset native left means the default left edge. This is only a
      // pointer estimate; actual hover supplies mandatory final bounds.
      const left = #is_defined(node.left) ? node.left : 0;
      watch('header-' + #to_string(index), node, root_menu.el.left + left + node.width / 2,
        glsmac.ui.get_height() - root_menu.el.bottom - root_menu.el.height + node.top + node.height / 2);
      index++;
     }
     if (index != 9) { throw Error('Missing nine actual native browser headers; found ' + #to_string(index)); }
     if (child != null) {
      if (active < 0 || !#is_defined(child.contract_nodes)) { throw Error('Actual child menu has no active header/nodes'); }
      #print('IMENU_CHILD|' + #to_string(active));
      let row_count = 0;
      for (record of child.contract_nodes) {
       if (record.is_removed()) { throw Error('Stale removed browser child node'); }
       if (#typeof(record.visible) != 'Bool') { throw Error('Unknown actual browser child visibility'); }
       if (record.kind != 'button' && (record.kind != 'surface' || (record.declared_class != 'game-menu-separator' && record.declared_class != 'game-menu-top-border' && record.declared_class != 'game-menu-bottom-border'))) { throw Error('Unknown actual browser child node'); }
       if (!record.visible) { continue; }
       const node = record.el;
       if (record.kind == 'button') {
        row_count++;
        const style = glsmac.ui.class(record.declared_class);
        let color = style.color;
        if (node.active && #is_defined(style._active) && #is_defined(style._active.color)) { color = style._active.color; }
        if (#is_defined(node.color)) { color = node.color; }
        #print('IMENU_ROW|' + color + '|' + node.text);
       }
       else if (record.declared_class == 'game-menu-separator') { #print('IMENU_SEPARATOR'); }
       else if (record.declared_class != 'game-menu-top-border' && record.declared_class != 'game-menu-bottom-border') { throw Error('Unknown actual browser child node'); }
      }
      if (row_count == 0) { throw Error('Actual child has no row control'); }
      if (active == 4) {
       if (!#is_defined(child.items)) { throw Error('Actual Action child has no source identity bindings'); }
       const seen_slots = {};
       for (control of child.items) {
        if (!#is_defined(control.entry.source_index) || #typeof(control.entry.source_index) != 'Int') { throw Error('Actual Action row lacks source-slot identity'); }
        const slot = control.entry.source_index; const key = #to_string(slot);
        if (#is_defined(seen_slots[key])) { throw Error('Ambiguous actual Action source-slot identity'); }
        seen_slots[key] = true;
        let attached = false;
        let visible = false;
        for (record of child.contract_nodes) {
         if (record.kind == 'button' && record.el == control.el) {
          if (record.is_removed() || attached) { throw Error('Removed or ambiguous actual Action source-slot control'); }
          attached = true; visible = record.visible;
         }
        }
        if (!attached) { throw Error('Action source identity is detached from actual mounted row'); }
        // Source-slot identity selects a real mounted node, never a command
        // or result. Center estimates still require its native hover event.
        const node = control.el;
        if (visible) {
         watch('row-source-' + key, node, child.el.left + child.el.width / 2,
           child.el.top + node.top + node.height / 2);
        }
       }
      }
     }
    }
    #print('IMENU_STATE_DONE'); #print('IMENU_BROWSE_DONE');
   };
   #async(150, () => { if (started) { try { report(); } catch { : (error) => { #print('IMENU_PROBE_ERROR|' + #to_string(error)); } } } return true; });
   #async(0, () => {
    glsmac.ui.root.on('keydown', (e) => {
     if (e.code != 'K' || e.modifiers != {}) { return false; }
     if (started) { started = false; glsmac.exit(); } else { game.select_unit(um.get_unit(ids.scout)); started = true; }
     return true;
    });
    #print('IMENU_READY'); return false;
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
    server.stdout.on('data', data => { const hit = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (hit) { clearTimeout(timer); resolve(hit[0]); } });
  });
}

for (const input of cases) test(`real Action-menu context commands match recorded native state (${input.id})`, {
  skip: !assets && 'Requires installed SMAC assets', timeout: 240000,
}, async t => {
  mkdirSync(artifacts, {recursive: true});
  const evidence = loadEvidence();
  const expected = evidence.outputs[input.id]?.trace;
  assert.ok(expected, 'Independent immutable observations bound to the selected declared inputs are required');
  assert.equal(expected.length, input.input.actions.length + 1, 'Complete original checkpoints are required');
  t.diagnostic(`Validated evidence: ${evidence.cases} declared cases, ${evidence.repeat} identical original runs; replaying ${cases.length} selected cases. Cases: ${casesPath}; observations: ${observationsPath}`);
  const scripts = Object.fromEntries(readdirSync(`${scriptsRoot}/GLSMAC_data/default`, {recursive: true}).filter(name => name.endsWith('.gls.js')).sort()
    .map(name => [`GLSMAC_data/default/${name}`, readFileSync(`${scriptsRoot}/GLSMAC_data/default/${name}`, 'utf8')]));
  t.diagnostic(`Uninstrumented production scripts SHA-256: ${hash(JSON.stringify(scripts))}`);
  instrumentMenuNodes(scripts);
  t.diagnostic(`Executed production scripts SHA-256: ${hash(JSON.stringify(scripts))}`);
  t.diagnostic(`Observer/world SHA-256: ${hash(JSON.stringify({main, world}))}`);
  t.diagnostic(`WASM SHA-256: ${hash(readFileSync(`${build}/GLSMAC.wasm`))}`);
  t.diagnostic('Browser native guards cover all three declared unit IDs and origin-stack membership; the frontend unit API exposes no global unit enumeration. Full global membership is guarded separately by headless native inspect().');
  t.diagnostic('Action row targets come from actual child.items source_index bindings; each real pointer click requires a native hover event. Tab uses actual SDL delivery.');
  t.diagnostic('Row visibility records successful production native Show/Hide calls by node identity. Hidden rows emit neither presentation rows nor pointer targets. This observes native visibility commands and real pointer delivery; it does not measure pixels, occlusion, clipping or independently read native visibility state.');
  t.diagnostic('Initial Scout focus must render its actual production name. Every checkpoint guards both production selected-unit IDs against native focus; later hover previews are independent of selection and outside this menu contract.');
  const declarations = JSON.parse(execFileSync('python3', ['-c', 'import json,sys; sys.path.insert(0,"tools/behavior-tests"); from ui.unit_menu_context_inputs import declarations; print(json.dumps(declarations(sys.argv[1])))', input.input.text_profile], {cwd: root, encoding: 'utf8', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}}));
  const names = readdirSync(assets).filter(name => name.toLowerCase() === 'alphax.txt');
  assert.equal(names.length, 1, 'One opaque installed alphax startup input is required');
  const sources = {'menu.txt': Buffer.from(declarations['menu.txt'], 'ascii'),
    'alphax.txt': patchTerrainSource(readFileSync(`${assets}/${names[0]}`), declarations['alphax.txt'])};
  t.diagnostic(`Public source declarations SHA-256: ${hash(JSON.stringify(declarations))}`);
  t.diagnostic(`Actual source byte SHA-256: ${JSON.stringify(Object.fromEntries(Object.entries(sources).map(([name, bytes]) => [name, hash(bytes)])))}`);
  const address = await serve(t); const errors = [];
  const browser = await chromium.launch({headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.stack || String(error))); page.on('crash', () => errors.push('Chromium page crashed'));
  t.after(async () => { try {
    writeFileSync(new URL(`unit-menu-context-${input.id}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000}));
    if (await page.locator('#canvas').isVisible()) await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`unit-menu-context-${input.id}-final.png`, artifacts)), timeout: 5000});
  } finally { await browser.close(); } });
  const {sourceReads} = await overrideTextAssets(page, sources);
  const fatal = /IMENU_REJECT|IMENU_GAME_ERROR|IMENU_PROBE_ERROR|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({name: 'unit-menu-context-arid.MP', mimeType: 'application/octet-stream', buffer: terrain()});
  await page.locator('#import-maps').click(); await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('unit-menu-context-arid.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) { const path = `/unit-menu-context-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source); }
    Module.FS.writeFile('/unit-menu-context-snapshot/GLSMAC_data/default/browser_unit_menu_context_main.gls.js', main);
    Module.FS.writeFile('/unit-menu-context-snapshot/GLSMAC_data/default/game/world/browser_unit_menu_context.gls.js', world);
    const callMain = Module.callMain; Module.callMain = args => callMain([...args, '--datapath', '/unit-menu-context-snapshot/GLSMAC_data', '--mainscript', 'browser_unit_menu_context_main', '--worldscript', 'browser_unit_menu_context', '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/unit-menu-context-arid.MP', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main, world});
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#log').textContent.includes('IMENU_READY') || document.body.dataset.state === 'failed');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  t.diagnostic(`Canvas before pointer scrolling: ${JSON.stringify(await page.locator('#canvas').boundingBox())}; viewport: ${JSON.stringify(page.viewportSize())}`);
  await page.keyboard.press('k');
  let targets = {};
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('IMENU_BROWSE_DONE').length;
    await page.waitForFunction(({count, pattern}) => {
      const text = document.querySelector('#log').textContent;
      return text.split('IMENU_BROWSE_DONE').length > count || new RegExp(pattern, 'i').test(text);
    }, {count, pattern: fatal.source}, {timeout: 15000});
    const text = await page.locator('#log').textContent(); assert.doesNotMatch(text, fatal);
    const chunks = [...text.matchAll(/IMENU_BROWSE_BEGIN\|\d+([\s\S]*?)IMENU_BROWSE_DONE/g)];
    assert.ok(chunks.length, 'A complete actual native browser observation is required');
    const body = chunks.at(-1)[1];
    targets = Object.fromEntries([...body.matchAll(/IMENU_TARGET\|(menu|header-\d+|row-source-\d+)\|(-?[\d.]+)\|(-?[\d.]+)/g)].map(row => [row[1], [+row[2], +row[3]]]));
    const markers = body.split('\n').map(line => line.replace(/^.*?\] /, '').trim()).filter(line => /^IMENU_(STATE\||NAME\||BASE\||UNIT\||HEADER\||CHILD\||ROW\||SEPARATOR$|STATE_DONE$)/.test(line));
    const encoded = ['IMENU_CASE|browser-observation', ...markers, 'IMENU_CASE_DONE', 'All tests passed.'].join('\n');
    const parsed = JSON.parse(execFileSync('python3', ['-c', 'import json,sys; sys.path.insert(0,"tools/behavior-tests"); from ui.ingame_menu_headless import parse_candidate; print(json.dumps(parse_candidate(sys.stdin.read(),[{"id":"browser-observation","input":{"actions":[]}}])[0]))'], {cwd: root, encoding: 'utf8', input: encoded, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}}));
    assert.equal(parsed.status, 'ok'); const {after_action, ...observation} = parsed.output.trace[0]; assert.equal(after_action, -1);
    return observation;
  };
  const compare = async index => {
    const {after_action, ...wanted} = expected[index]; assert.equal(after_action, index - 1);
    const deadline = Date.now() + 15000; let observed; let previous = null;
    do { observed = await probe(); if (isDeepStrictEqual(observed, previous) && isDeepStrictEqual(observed, wanted)) {
        if (observed.menu?.child) {
          await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`unit-menu-context-${input.id}-child-${index}.png`, artifacts))});
        }
        return;
      }
      previous = observed;
    } while (Date.now() < deadline);
    assert.deepEqual(observed, wanted, `${input.id} checkpoint ${index}`);
    assert.fail('Actual browser observation did not stabilize twice');
  };
  const clickControl = async name => {
    await probe(); assert.ok(targets[name], `Actual mounted ${name} geometry is required`);
    const [x, y] = targets[name];
    const beforeScroll = await page.locator('#canvas').boundingBox();
    await page.locator('#canvas').scrollIntoViewIfNeeded();
    const outside = await page.locator('#canvas').boundingBox();
    t.diagnostic(`Actual ${name} pointer canvas before/after scroll: ${JSON.stringify(beforeScroll)} / ${JSON.stringify(outside)}; native target: ${JSON.stringify([x, y])}`);
    assert.ok(outside.x >= 0 && outside.x + outside.width <= page.viewportSize().width &&
      outside.y >= 0 && outside.y + outside.height <= page.viewportSize().height,
      `The full canvas must be in the pointer viewport: ${JSON.stringify(outside)}`);
    // Park in the page margin: map hover changes the object preview and is
    // outside the declared menu-only actions.
    await page.mouse.move(page.viewportSize().width - 1, 1);
    for (const offset of [0, -8, 8, -16, 16, -24, 24, -32, 32]) {
      const before = (await page.locator('#log').textContent()).length;
      const box = await page.locator('#canvas').boundingBox();
      const pointer = [box.x + box.width * x / 1024, box.y + box.height * (y + offset) / 768];
      await page.mouse.move(...pointer);
      try {
        await page.waitForFunction(({before, name, pattern}) => {
          const text = document.querySelector('#log').textContent.slice(before);
          return text.includes(`IMENU_HOVER|${name}|`) || new RegExp(pattern, 'i').test(text);
        }, {before, name, pattern: fatal.source}, {timeout: 500});
      } catch (error) { if (error.name !== 'TimeoutError') throw error; }
      const current = (await page.locator('#log').textContent()).slice(before); assert.doesNotMatch(current, fatal);
      const hit = [...current.matchAll(/IMENU_HOVER\|(menu|header-\d+|row-source-\d+)\|(-?[\d.]+)\|(-?[\d.]+)\|([\d.]+)\|([\d.]+)/g)].find(row => row[1] === name);
      if (hit) {
        // Exactly one click at the point proven to reach this actual node.
        const beforeClick = (await page.locator('#log').textContent()).length;
        await page.mouse.click(...pointer, {delay: 100});
        if (name.startsWith('row-source-')) {
          await page.waitForFunction(before => document.querySelector('#log').textContent.slice(before).includes('UMENU_NATIVE_CLICK|'), beforeClick, {timeout: 1000});
          const clicks = [...(await page.locator('#log').textContent()).slice(beforeClick).matchAll(/UMENU_NATIVE_CLICK\|([^|]+)\|([^\n]+)/g)];
          assert.deepEqual(clicks.map(row => row[1]), [name.slice('row-source-'.length)], 'The one real click must reach the declared actual source row');
        }
        // Fixed release-at-target timing, independent of command outcome.
        await page.waitForTimeout(200);
        await page.mouse.move(page.viewportSize().width - 1, 1);
        return;
      }
    }
    assert.fail(`Real pointer did not reach actual ${name} control`);
  };
  await compare(0);
  for (const [index, action] of input.input.actions.entries()) {
    if (action === 'menu') await clickControl('menu');
    else if (action === 'tab') await page.keyboard.press('Tab');
    else if (typeof action === 'object' && Number.isInteger(action.header)) await clickControl(`header-${action.header}`);
    else if (typeof action === 'object' && Number.isInteger(action.row_source)) await clickControl(`row-source-${action.row_source}`);
    else assert.fail('Unknown public unit-menu action');
    await compare(index + 1);
  }
  assert.ok(sourceReads.get('menu.txt') > 0, 'Production consumed declared installed menu source');
  assert.ok(sourceReads.get('alphax.txt') > 0, 'Production consumed declared TERRAIN source through startup');
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`unit-menu-context-${input.id}.png`, artifacts))});
  await page.keyboard.press('k'); await page.waitForFunction(() => document.body.dataset.state === 'exited');
  assert.doesNotMatch(await page.locator('#log').textContent(), fatal); assert.deepEqual(errors, []);
});
