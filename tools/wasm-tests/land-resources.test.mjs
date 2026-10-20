import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {overrideRulesAsset, syntheticNutrientRules} from './rules-asset-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = new URL('build/artifacts/', import.meta.url);

// Synthetic terrain only. Two actual workers use a farm and forest; a third,
// unworked rocky road/mine square exercises native tile resource routing.
function terrain() {
  const width = 16, height = 16, count = width * height / 2, offset = 15 + 0xaa4;
  const aw = Math.floor((width + 4) / 5), ah = Math.floor((height + 4) / 5), ac = Math.floor((aw + 1) / 2) * ah;
  const bytes = Buffer.alloc(offset + count * 44 + ac);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary'); bytes.writeUInt32LE(5, 11);
  for (const [at, value] of [[0, width], [4, height], [20, count], [0xa24, aw], [0xa28, ah], [0xa2c, ac]]) bytes.writeUInt32LE(value, 15 + at);
  for (let i = 0; i < count; ++i) { bytes[offset + i * 44] = 3 * 32 + 2 * 8; bytes[offset + i * 44 + 1] = 64; }
  for (const [x, y, flags, rock] of [[8, 6, 0x8000, 0], [9, 9, 0x200000, 0], [9, 7, 0x14, 2]]) {
    const at = offset + (y * width / 2 + Math.floor(x / 2)) * 44;
    bytes.writeUInt32LE(flags, at + 8); bytes[at + 5] = rock << 6;
  }
  return bytes;
}

const world = String.raw`
return (game) => {
  const owner = game.get_player(); const tm = game.get_tm();
  game.get_bm().on('base_spawn', (e) => {
    if (e.base.get_size() == 0) {
      for (position of [[8, 6], [9, 9]]) {
        const tile = tm.get_tile(position[0], position[1]);
        const data = {type: 'WORKER'}; data.worked_tile = tile;
        const pop = e.base.create_pop(data); game.get('f_base_pop_work_tile')(e.base, pop, tile);
      }
    }
  });
  game.event('add_production_choice', {player: owner, id: 'FORMERS', data: {type: 'unit', id: 'Formers', cost: 20, cost_rows: 2, population_cost: 0}});
  game.event('spawn_base', {owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS'], production_choice: 'FORMERS'});
  game.event('spawn_unit', {owner: owner, tile: tm.get_tile(8, 8), type: 'ScoutPatrol', morale: 1, health: 1.0});
};
`;

// Read-only observations plus declared terrain fixture edits. These exercise
// native editing/render delivery, without simulating Former work or its timing.
const main = String.raw`
#main((glsmac) => {
  #include('game/game')(glsmac); #include('ui/ui')(glsmac);
  const screen = #include('ui/parts/game/popup/base_screen');
  const popups = #include('ui/parts/game/popup/popup');
  const resource_panel = #include('ui/parts/game/popup/base_screen/resources');
  const set_resources = resource_panel.set;
  resource_panel.set = (data) => {
    const result = set_resources(data);
    for (name of ['nutrients', 'minerals', 'energy']) {
      const labels = resource_panel.labels[name]; #print('LR_LABEL|' + name + '|' + labels.left.text + '|' + labels.right.text);
    }
    return result;
  };
  const on_show = screen.on_show;
  screen.on_show = () => {
    const result = on_show();
    popups.popups.base_screen.el.timer(10, () => {
      if (popups.sliding_timer == null && popups.is_shown()) { #print('LR_OPEN'); return false; } return true;
    }); return result;
  };
  const on_hide = screen.on_hide;
  screen.on_hide = () => {
    const result = on_hide();
    popups.popups.base_screen.el.timer(10, () => {
      if (popups.sliding_timer == null && !popups.is_shown()) { #print('LR_CLOSED'); return false; } return true;
    }); return result;
  };
  glsmac.on('configure_game', (e) => {
    const game = e.game; let status = 'none';
    let exiting = false;
    let editing = false;
    let edit_phase = 0;
    game.register_event('fixture_terrain_edit', {
      validate: (e) => { if (e.caller != e.game.get_player().id) { return 'Fixture requires its owner'; } },
      apply: (e) => {
        const tm = e.game.get_tm(); const old = tm.get_terraforming(8, 6);
        const receipt = {road: old.road, farm: old.farm, mine: old.mine, forest: old.forest};
        tm.set_terraforming(8, 6, {road: e.data.phase == 3, farm: e.data.phase == 4, mine: e.data.phase == 3, forest: e.data.phase == 2});
        return receipt;
      },
      rollback: (e) => { e.game.get_tm().set_terraforming(8, 6, e.applied); },
    });
    game.on('turn_status', (e) => { status = e.status; });
    game.on('event_result', (e) => { if (!e.success) { #print('LR_REJECT|' + e.name); } });
    game.on('error', (e) => { #print('LR_ERROR'); });
    game.on('start_ui', (e) => {
      glsmac.ui.on('loader_show', (e) => { if (editing && !exiting) { #print('LR_UNEXPECTED_LOADER'); } });
      game.get_map().on('tile_preview', (e) => {
        if (e.tile.x == 8 && e.tile.y == 6) { #print('LR_TARGET_PREVIEW'); }
      });
      const rules = game.get('terraforming_rules');
      #print('LR_TERRAFORM|' + #to_string(rules.farm.turns) + '|' + #to_string(rules.road.turns) + '|' + rules.farm.order + '|' + rules.farm.prerequisite);
      #async(0, () => {
        glsmac.ui.root.on('keydown', (e) => {
          if (e.code == 'K' && e.modifiers == {}) {
            if (edit_phase == 4) { exiting = true; #print('LR_EXITING'); glsmac.exit(); }
            else { game.select_tile(game.get_tm().get_tile(8, 6)); }
            return true;
          }
          if (e.code == 'J' && e.modifiers == {}) {
            editing = true;
            edit_phase = edit_phase % 4 + 1;
            game.event('fixture_terrain_edit', {phase: edit_phase}); return true;
          }
          if (e.code != 'P' || e.modifiers != {}) { return false; }
          #print('LR_BEGIN'); #print('LR_TURN|' + #to_string(game.get_turn()) + '|' + status);
          for (position of [[8, 6], [9, 9], [9, 7]]) {
            const tile = game.get_tm().get_tile(position[0], position[1]); const yields = tile.get_resources(game.get_player());
            #print('LR_TILE|' + #to_string(tile.x) + '|' + #to_string(tile.y) + '|' + #to_string(yields.NUTRIENTS) + '|' + #to_string(yields.MINERALS) + '|' + #to_string(yields.ENERGY));
          }
          for (base of game.get_bm().get_bases()) {
            const intake = base.get_intake(); const project = base.get_production();
            #print('LR_BASE|' + #to_string(base.id) + '|' + #to_string(base.get_size()) + '|' + #to_string(intake.NUTRIENTS) + '|' + #to_string(intake.MINERALS) + '|' + #to_string(intake.ENERGY) + '|' + #to_string(project.minerals) + '|' + #to_string(project.last_processed_turn) + '|' + #to_string(base.get('accumulated_nutrients')));
            for (tile of base.get_worked_tiles()) { #print('LR_WORK|' + #to_string(tile.x) + '|' + #to_string(tile.y)); }
          }
          #print('LR_DONE'); return true;
        });
        #print('LR_READY'); return false;
      });
    });
  }); glsmac.run();
});
`;

function expected(profile, improvement, rockiness) {
  const cases = JSON.parse(readFileSync(`${root}tools/behavior-tests/economy/cases/land-worker-resources.json`)).cases;
  const rows = JSON.parse(readFileSync(`${root}tools/behavior-tests/economy/observations/smacx-gog-2.0-land-worker-resources.json`)).observations;
  const entry = cases.find(({input: i}) => i.profile === profile && i.faction_id === 1 && i.rainfall === 2
    && i.rockiness === rockiness && i.improvement === improvement && i.cap_tech_owned === (profile === 'altered'));
  assert.ok(entry); const result = rows.find((row) => row.id === entry.id); assert.ok(result);
  return ['NUTRIENTS', 'MINERALS', 'ENERGY'].map((name) => result.output[name]);
}

async function serve(t) {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], {cwd: root});
  t.after(() => server.kill());
  return new Promise((resolve, reject) => {
    let log = ''; server.stderr.on('data', (data) => { log += data; });
    const timer = setTimeout(() => reject(new Error(`Asset server timeout: ${log}`)), 60000);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Asset server exited ${code}: ${log}`)); });
    server.stdout.on('data', (data) => { const address = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (address) { clearTimeout(timer); resolve(address[0]); } });
  });
}

for (const profile of ['default', 'altered']) test(`native improved land reaches base income and next-turn production (${profile})`, {
  skip: !assets && 'Set SMAC_ASSETS_DIR to the installed original assets', timeout: 120000,
}, async (t) => {
  mkdirSync(artifacts, {recursive: true});
  const scripts = Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`, {recursive: true})
    .filter((name) => name.endsWith('.gls.js')).sort().map((name) => [`GLSMAC_data/default/${name}`, readFileSync(`${root}GLSMAC_data/default/${name}`, 'utf8')]));
  t.diagnostic(`Production scripts SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  t.diagnostic(`Runtime WASM SHA-256: ${createHash('sha256').update(readFileSync(`${build}/GLSMAC.wasm`)).digest('hex')}`);
  const address = await serve(t);
  const browser = await chromium.launch({headless: true, executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1100, height: 1000}}); page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(message.text())) errors.push(message.text()); });
  t.after(async () => {
    try { writeFileSync(new URL(`land-resources-${profile}.log`, artifacts), await page.locator('#log').textContent({timeout: 1000})); }
    finally { await browser.close(); }
  });
  let source = syntheticNutrientRules(10);
  if (profile === 'altered') {
    source = source.replace('Forest Square,1,2,1,0', 'Forest Square,2,3,2,0').replace('Improved Land,1,*,*,0', 'Improved Land,2,*,*,0')
      .replace('\n0\n1\n-1\n', '\n0\n0\n0\n').replace('\nGene\nEcoEng\nEnvEcon\n', '\nNone\nNone\nNone\n');
    source = source.replace('Farm,None,Kelp Farm,None,4,Cultivate $STR0', 'Synthetic crop,None,Kelp Farm,None,2,Sow $STR0')
      .replace('Road,None,Road,Disable,1,Build $STR0', 'Road,None,Road,Disable,3,Build $STR0');
  }
  const override = await overrideRulesAsset(page, source);
  const fatal = /LR_REJECT|LR_ERROR|LR_UNEXPECTED_LOADER|Unhandled exception|Assertion failed|Aborted\(|RuntimeError:|worker sent an error!|\[Error\]/i;
  const wait = async (marker, count = 1) => {
    try {
      await page.waitForFunction(({marker, count, fatal}) => new RegExp(fatal).test(document.querySelector('#log').textContent)
        || document.body.dataset.state === 'failed' || document.querySelector('#log').textContent.split(marker).length - 1 >= count,
      {marker, count, fatal: fatal.source});
    } catch (error) { throw new Error((await page.locator('#log').textContent()).slice(-10000), {cause: error}); }
    const log = await page.locator('#log').textContent(); assert.doesNotMatch(log, fatal); assert.deepEqual(errors, []);
    assert.ok(log.split(marker).length - 1 >= count);
  };
  const probe = async () => {
    const count = (await page.locator('#log').textContent()).split('LR_DONE').length - 1;
    await page.keyboard.press('p'); await wait('LR_DONE', count + 1);
    const log = (await page.locator('#log').textContent()).split('LR_BEGIN').at(-1);
    const turn = log.match(/LR_TURN\|(\d+)\|([^\n\r]+)/); const base = log.match(/LR_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/);
    assert.ok(turn && base);
    return {turn: +turn[1], status: turn[2], base: base.slice(1).map(Number),
      tiles: [...log.matchAll(/LR_TILE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/g)].map((m) => m.slice(1).map(Number)),
      worked: [...log.matchAll(/LR_WORK\|(\d+)\|(\d+)/g)].map((m) => m.slice(1).map(Number)).sort()};
  };
  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({name: 'improved-land.MP', mimeType: 'application/octet-stream', buffer: terrain()});
  await page.locator('#import-maps').click(); await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('improved-land.MP'));
  await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  await page.evaluate(({scripts, main, world}) => {
    for (const [name, source] of Object.entries(scripts)) {
      const path = `/land-resource-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source);
    }
    Module.FS.writeFile('/land-resource-snapshot/GLSMAC_data/default/browser_land_main.gls.js', main);
    Module.FS.writeFile('/land-resource-snapshot/GLSMAC_data/default/game/world/browser_land.gls.js', world);
    const callMain = Module.callMain;
    Module.callMain = (args) => callMain([...args, '--datapath', '/land-resource-snapshot/GLSMAC_data', '--mainscript', 'browser_land_main',
      '--worldscript', 'browser_land', '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/improved-land.MP', '--quickstart-faction', 'GAIANS']);
  }, {scripts, main, world});
  await page.locator('#start').click(); await wait('LR_READY'); assert.ok(override.reads() > 0);
  assert.ok((await page.locator('#log').textContent()).includes(profile === 'altered'
    ? 'LR_TERRAFORM|2|3|Sow Synthetic crop|None' : 'LR_TERRAFORM|4|1|Cultivate Farm|None'),
  'Normal game configuration imports installed action rates names and order templates');
  const before = await probe();
  const farm = expected(profile, 'farm', 0), forest = expected(profile, 'forest', 0), mine = expected(profile, 'mine-road', 2);
  assert.deepEqual(before.tiles, [[8, 6, ...farm], [9, 9, ...forest], [9, 7, ...mine]], 'Actual imported native tiles route through source-driven yields');
  assert.deepEqual(before.worked, [[8, 6], [9, 9]]); assert.equal(before.base[1], 2);
  const intake = farm.map((value, i) => value + forest[i] + [2, 1, 2][i]);
  assert.deepEqual(before.base.slice(2, 5), intake, 'Actual base intake includes both genuinely assigned workers and its HQ square');
  assert.equal(before.base[5], 0);
  const click = async (x, y) => { const b = await page.locator('#canvas').boundingBox(); await page.mouse.click(b.x + b.width * x / 1024, b.y + b.height * y / 768); };
  await page.keyboard.press('Enter'); await wait('LR_OPEN');
  const rendered = await page.locator('#log').textContent();
  for (const [i, name] of ['nutrients', 'minerals', 'energy'].entries()) {
    const labels = [...rendered.matchAll(new RegExp(`LR_LABEL\\|${name}\\|([^|\\r\\n]+)\\|([^\\r\\n]+)`, 'g'))].at(-1);
    const loss = [4, 0, 0][i], pad = (value) => String(value).padStart(3, '0');
    assert.ok(labels); assert.equal(labels[1], `${pad(intake[i])} - ${pad(loss)}`);
    assert.equal(labels[2], `+${pad(intake[i] - loss)}`, 'Actual base-screen labels show improved resource income');
  }
  await page.waitForTimeout(600);
  await page.locator('#canvas').screenshot({path: fileURLToPath(new URL(`land-resources-${profile}-base.png`, artifacts))});
  await page.keyboard.press('Escape'); await wait('LR_CLOSED');
  await page.keyboard.press('Tab'); await probe(); await page.keyboard.press('Space');
  let state = await probe();
  const readyDeadline = Date.now() + 60000;
  while (state.status !== 'turn_complete' && Date.now() < readyDeadline) { await page.waitForTimeout(100); state = await probe(); }
  assert.equal(state.status, 'turn_complete');
  await click(899, 585);
  const deadline = Date.now() + 60000;
  do { state = await probe(); if (state.turn === before.turn + 1 && state.status === 'active' && state.base[6] === state.turn) break;
    await page.waitForTimeout(100); } while (Date.now() < deadline);
  assert.equal(state.turn, before.turn + 1); assert.equal(state.base[6], state.turn);
  assert.equal(state.base[5], intake[1], 'The next native production event credits actual improved mineral income once');
  assert.equal(state.base[7] - before.base[7], intake[0] - 4, 'Actual food storage uses the improved intake minus two workers consumption');
  assert.deepEqual(state.tiles, before.tiles); assert.deepEqual(state.worked, before.worked); assert.deepEqual(errors, []);
  const selected = (await page.locator('#log').textContent()).split('LR_TARGET_PREVIEW').length - 1;
  await page.keyboard.press('k'); await wait('LR_TARGET_PREVIEW', selected + 1);
  const saved = state.base.slice(5);
  const images = [];
  for (const improvement of ['bare', 'forest', 'mine-road', 'farm']) {
    const previews = (await page.locator('#log').textContent()).split('LR_TARGET_PREVIEW').length - 1;
    await page.keyboard.press('j'); await wait('LR_TARGET_PREVIEW', previews + 1);
    const changed = await probe();
    const edited = expected(profile, improvement, 0);
    assert.deepEqual(changed.tiles[0], [8, 6, ...edited], 'A real native terrain edit changes subsequent resource queries');
    assert.deepEqual(changed.base.slice(2, 5), edited.map((value, i) => value + forest[i] + [2, 1, 2][i]));
    assert.deepEqual(changed.base.slice(5), saved, 'Terrain queries do not advance production food storage or turns');
    assert.deepEqual(changed.worked, before.worked);
    await page.waitForTimeout(100);
    const screenshot = await page.locator('#canvas').screenshot();
    writeFileSync(new URL(`terrain-edit-${profile}-${improvement}.png`, artifacts), screenshot);
    const rendered = PNG.sync.read(screenshot);
    assert.equal(rendered.width, 1024); assert.ok(rendered.height >= 768 && rendered.height <= 769);
    const crop = (left, top, width, height) => {
      const pixels = Buffer.alloc(width * height * 4);
      for (let row = 0; row < height; ++row) rendered.data.copy(pixels, row * width * 4,
        ((top + row) * rendered.width + left) * 4, ((top + row) * rendered.width + left + width) * 4);
      return pixels;
    };
    images.push({preview: crop(140, 576, 100, 60), world: crop(440, 180, 110, 60)});
  }
  for (let i = 1; i < images.length; ++i) {
    assert.ok(!images[i].preview.equals(images[i - 1].preview), 'The real tile preview redraws its image beyond changing labels');
    assert.ok(!images[i].world.equals(images[i - 1].world), 'The edited square redraws in the actual world');
  }
  await page.keyboard.press('k');
  await wait('LR_EXITING');
  await page.waitForFunction(() => document.body.dataset.state === 'exited');
  assert.deepEqual(errors, []);
});
