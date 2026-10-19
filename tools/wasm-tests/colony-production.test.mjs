import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = new URL('build/artifacts/', import.meta.url);
const fatal = /worker sent an error!|RuntimeError:|Aborted\(|GSE\w*Error|GSEInvalidCall|FATAL ERROR|Event result listener failed|CP_EVENT_REJECTED|CP_GAME_ERROR/;

// Synthetic imported terrain supplies real resource yields. Rainy jungle and
// rolling mineral-bonus squares bound construction time; the eastward founding
// destination is flat and is not an initial worked square. No original map or
// claim about original terrain/economy rules is included in this fixture.
function productionMap() {
  const width = 16, height = 16, count = width * height / 2;
  const abstractWidth = Math.floor((width + 4) / 5), abstractHeight = Math.floor((height + 4) / 5);
  const abstractCount = Math.floor((abstractWidth + 1) / 2) * abstractHeight;
  const tileOffset = 15 + 0xaa4;
  const bytes = Buffer.alloc(tileOffset + count * 44 + abstractCount);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary');
  bytes.writeUInt32LE(5, 11);
  for (const [offset, value] of [[0, width], [4, height], [20, count],
    [0xa24, abstractWidth], [0xa28, abstractHeight], [0xa2c, abstractCount]]) bytes.writeUInt32LE(value, 15 + offset);
  for (let index = 0; index < count; ++index) {
    const at = tileOffset + index * 44;
    bytes[at] = 3 * 32 + 2 * 8;
    bytes[at + 1] = 64;
    bytes[at + 5] = 1 << 6;
    bytes.writeUInt32LE(0x400 | 0x20000000 | 0x20000, at + 8); // explicit mineral bonus
    bytes.writeUInt32LE(0x4, at + 12); // jungle
  }
  bytes[tileOffset + (8 * (width / 2) + 10 / 2) * 44 + 5] = 0;
  return bytes;
}

// GSE initialization only: three genuine workers are a controlled precondition,
// assigned while native spawn_base owns the write guard. Helpers and native
// population/tile links are production implementations. No stored minerals,
// production progress, movement or subsequent population are seeded or changed.
const worldScript = String.raw`
return (game) => {
  const owner = game.get_player();
  const tm = game.get_tm();
  game.get_bm().on('base_spawn', (e) => {
    const tile = e.base.get_tile();
    if (tile.x == 8 && tile.y == 8 && e.base.get_size() == 0) {
      for (position of [[8, 6], [9, 7], [9, 9]]) {
        const worked = tm.get_tile(position[0], position[1]);
        const data = { type: 'WORKER' }; data.worked_tile = worked;
        const pop = e.base.create_pop(data);
        game.get('f_base_pop_work_tile')(e.base, pop, worked);
      }
    }
  });
  game.event('add_production_choice', { player: owner, id: 'COLONY_POD',
    data: { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 } });
  game.event('spawn_base', { owner: owner, tile: tm.get_tile(8, 8), facilities: ['HEADQUARTERS'] });
  game.event('spawn_unit', { owner: owner, tile: tm.get_tile(8, 8), type: 'MindWorms', health: 1.0, morale: 1 });
};
`;

// GSE observations only. Scalar IDs are re-resolved whenever sampled. Production
// UI callbacks are chained with their original result; no command is emitted by
// a probe, callback, timer or key handler in this entry.
const mainScript = String.raw`
#main((glsmac) => {
  #include('game/game')(glsmac);
  #include('ui/ui')(glsmac);
  const base_screen = #include('ui/parts/game/popup/base_screen');
  const popups = #include('ui/parts/game/popup/popup');
  const objects = #include('ui/parts/game/bottom_bar/objects_list');
  const commands = #include('ui/parts/game/bottom_bar/object_preview');
  let report_base = null;
  const production_panel = #include('ui/parts/game/popup/base_screen/bottom_bar/production');
  const set_production = production_panel.set;
  production_panel.set = (data) => {
    const result = set_production(data);
    if (report_base != null) { report_base(data.base); }
    #print('CP_RENDER|' + #to_string(data.base.id) + '|' + production_panel.production_title.text + '|' + production_panel.production_amount.text + '|' + production_panel.production_label.text);
    #print('CP_PANEL|' + #to_string(base_screen.base_id));
    return result;
  };
  const show_picker = base_screen.show_production_selection;
  base_screen.show_production_selection = () => {
    const result = show_picker();
    if (base_screen.production_selection != null) {
      #print('CP_PICKER_OPEN|' + #to_string(base_screen.base_id));
      let index = 0;
      for (choice of base_screen.get_production_choices()) {
        #print('CP_PICKER_ROW|' + #to_string(index) + '|' + choice.id + '|' + choice.name + '|' + #to_string(choice.cost));
        index++;
      }
    }
    return result;
  };
  const hide_picker = base_screen.hide_production_selection;
  base_screen.hide_production_selection = () => {
    const was_open = base_screen.production_selection != null;
    const result = hide_picker();
    if (was_open) { #print('CP_PICKER_CLOSED'); }
    return result;
  };
  const show_base = base_screen.on_show;
  base_screen.on_show = () => {
    const result = show_base(); const id = base_screen.base_id;
    popups.popups.base_screen.el.timer(10, () => {
      if (popups.sliding_timer == null && popups.is_shown()) { #print('CP_OPEN|' + #to_string(id)); return false; }
      return true;
    });
    return result;
  };
  const hide_base = base_screen.on_hide;
  base_screen.on_hide = () => {
    const result = hide_base(); const id = base_screen.base_id;
    popups.popups.base_screen.el.timer(10, () => {
      if (popups.sliding_timer == null && !popups.is_shown()) { #print('CP_CLOSED|' + #to_string(id)); return false; }
      return true;
    });
    return result;
  };
  glsmac.on('configure_game', (e) => {
    const game = e.game;
    let unit_ids = [];
    let status = 'none';
    report_base = (base) => {
      const tile = base.get_tile(); const p = base.get_production();
      const pending = game.get('f_base_get_pending_production')(base);
      #print('CP_BASE|' + #to_string(base.id) + '|' + #to_string(base.get_owner().id) + '|' + #to_string(tile.x) + '|' + #to_string(tile.y) + '|' + #to_string(base.get_size()) + '|' + p.choice_id + '|' + #to_string(p.minerals) + '|' + #to_string(p.last_processed_turn) + '|' + #to_string(pending));
    };
    game.on('configure', (e) => {
      game.get_um().on('unit_spawn', (e) => {
        const unit = e.unit; unit_ids :+unit.id;
        const base = unit.get_tile().get_base();
        const size = base == null ? 0 : base.get_size();
        #print('CP_SPAWN|' + #to_string(unit.id) + '|' + unit.def + '|' + #to_string(unit.owner) + '|' + #to_string(unit.tile.x) + '|' + #to_string(unit.tile.y) + '|' + #to_string(size) + '|' + #to_string(game.get_turn()));
      });
    });
    game.on('error', (e) => { #print('CP_GAME_ERROR'); });
    game.on('turn_status', (e) => { status = e.status; });
    game.on('event_result', (e) => {
      if (!e.success) { #print('CP_EVENT_REJECTED|' + e.name); }
      if (e.name == 'found_base') { #print('CP_FOUND|' + #to_string(e.data.unit_id) + '|' + #to_string(e.success)); }
    });
    game.on('update_base', (e) => { report_base(e.base); });
    game.on('start_ui', (e) => {
      #async(0, () => {
        glsmac.ui.root.on('keydown', (e) => {
          if (e.code != 'P' || e.modifiers != {}) { return false; }
          #print('CP_PROBE_BEGIN');
          #print('CP_TURN|' + #to_string(game.get_turn()) + '|' + status + '|' + #to_string(game.get_player().id));
          #print('CP_SELECTION|' + #to_string(objects.selected_type) + '|' + #to_string(objects.selected_id));
          for (base of game.get_bm().get_bases()) { report_base(base); }
          for (id of unit_ids) {
            if (game.get_um().has_unit(id)) {
              const unit = game.get_um().get_unit(id);
              #print('CP_UNIT|' + #to_string(id) + '|' + unit.def + '|' + #to_string(unit.owner) + '|' + #to_string(unit.movement) + '|' + #to_string(unit.tile.x) + '|' + #to_string(unit.tile.y));
            } else { #print('CP_GONE|' + #to_string(id)); }
          }
          for (choice of game.get_player().get_production_choices()) {
            if (choice.id == 'COLONY_POD') {
              #print('CP_CHOICE|' + choice.id + '|' + choice.type + '|' + choice.unit_id + '|' + #to_string(choice.cost) + '|' + #to_string(choice.population_cost));
            }
          }
          #print('CP_FOUND_CONTROL|' + commands.found_button.class);
          #print('CP_PROBE_DONE');
          return true;
        });
        game.get_map().on('base_preview', (e) => { #print('CP_BASE_PREVIEW|' + #to_string(e.base.id)); });
        #print('CP_READY');
        return false;
      });
    });
  });
  glsmac.run();
});
`;

async function clickCanvas(page, x, y) {
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width * x / 1024, box.y + box.height * y / 768);
}

async function serveAssets(t) {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], { cwd: root });
  t.after(() => server.kill());
  let log = '';
  server.stderr.on('data', (data) => { log += data; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Asset server did not start: ${log}`)), 60000);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Asset server exited (${code}): ${log}`)); });
    server.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
}

test('real Colony Pod production can found a base and be selected again for renewable expansion', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation', timeout: 180000,
}, async (t) => {
  mkdirSync(artifacts, { recursive: true });
  const scripts = Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`, { recursive: true })
    .filter((name) => name.endsWith('.gls.js')).sort()
    .map((name) => [`GLSMAC_data/default/${name}`, readFileSync(`${root}GLSMAC_data/default/${name}`, 'utf8')]));
  t.diagnostic(`Production script snapshot SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  const address = process.env.WASM_SITE_URL || await serveAssets(t);
  const browser = await chromium.launch({ executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  const recordError = (e) => {
    errors.push(e?.stack || String(e));
    page.evaluate(() => { globalThis.__colonyProductionError = true; }).catch(() => {});
  };
  page.on('pageerror', recordError);
  page.on('console', (m) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(m.text())) recordError(m.text());
  });
  t.after(async () => {
    try {
      const log = await page.locator('#log').textContent({ timeout: 1000 }).catch(() => 'Engine log unavailable');
      writeFileSync(new URL('colony-production-log.txt', artifacts), log);
      await page.locator('#canvas').screenshot({ path: fileURLToPath(new URL('colony-production-final.png', artifacts)), timeout: 3000 }).catch(() => {});
      t.diagnostic(log.slice(-18000));
      if (errors.length) t.diagnostic(errors.join('\n'));
    } finally { await browser.close(); }
  });
  const healthy = async () => {
    assert.deepEqual(errors, [], 'No browser runtime or graphics errors');
    assert.equal(await page.locator('body').getAttribute('data-state'), 'running');
    assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
  };
  const waitLog = async (text, count = 1, timeout = 60000) => {
    try {
      await page.waitForFunction(({ text, count, fatalSource }) => globalThis.__colonyProductionError
        || document.body.dataset.state === 'failed' || new RegExp(fatalSource).test(document.querySelector('#log').textContent)
        || document.querySelector('#log').textContent.split(text).length - 1 >= count,
      { text, count, fatalSource: fatal.source }, { timeout });
    } catch (error) {
      throw new Error(`Waiting for ${text} failed.\n${(await page.locator('#log').textContent()).slice(-18000)}`, { cause: error });
    }
    await healthy();
    assert.ok((await page.locator('#log').textContent()).split(text).length - 1 >= count, `Actual engine emitted ${text}`);
  };
  const countLog = async (text) => (await page.locator('#log').textContent()).split(text).length - 1;
  const screenshot = async (name) => {
    await healthy(); await page.waitForTimeout(250);
    await page.locator('#canvas').screenshot({ path: fileURLToPath(new URL(`colony-production-${name}.png`, artifacts)) });
  };
  const parseBases = (log) => [...log.matchAll(/CP_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|([^|\n]*)\|(\d+)\|(\d+)\|(\d+)/g)]
    .map((m) => ({ id: +m[1], owner: +m[2], x: +m[3], y: +m[4], size: +m[5], choice: m[6], minerals: +m[7], processed: +m[8], pending: +m[9] }));
  const latestBase = async (id) => {
    const states = parseBases(await page.locator('#log').textContent()).filter((b) => b.id === id);
    assert.ok(states.length, `Actual base ${id} state was emitted`); return states.at(-1);
  };
  const probe = async (timeout = 60000) => {
    const count = await countLog('CP_PROBE_DONE'); await page.keyboard.press('p');
    await waitLog('CP_PROBE_DONE', count + 1, timeout);
    const log = (await page.locator('#log').textContent()).split('CP_PROBE_BEGIN').at(-1);
    const turn = log.match(/CP_TURN\|(\d+)\|([^|\n]+)\|(\d+)/);
    const selection = log.match(/CP_SELECTION\|([^|\n]+)\|([^|\n]+)/);
    assert.ok(turn && selection, 'Actual turn and selection are readable');
    return { turn: +turn[1], status: turn[2], owner: +turn[3], selected: selection[1] === 'Unit' ? +selection[2] : null,
      bases: parseBases(log), units: [...log.matchAll(/CP_UNIT\|(\d+)\|([^|\n]+)\|(\d+)\|([0-9.]+)\|(\d+)\|(\d+)/g)]
        .map((m) => ({ id: +m[1], def: m[2], owner: +m[3], movement: +m[4], x: +m[5], y: +m[6] })),
      foundEnabled: /CP_FOUND_CONTROL\|unit-found-button-enabled(?:\r?\n|$)/.test(log) };
  };
  const waitState = async (predicate, description) => {
    const deadline = Date.now() + 60000; let state;
    do {
      state = await probe(Math.max(1, deadline - Date.now())); if (predicate(state)) return state;
      await page.waitForTimeout(100);
    } while (Date.now() < deadline);
    assert.fail(`${description}: ${JSON.stringify(state)}`);
  };
  const closeBase = async (id) => {
    const count = await countLog(`CP_CLOSED|${id}`); await page.keyboard.press('Escape'); await waitLog(`CP_CLOSED|${id}`, count + 1);
  };
  const openSelectedBase = async (id) => {
    const count = await countLog(`CP_OPEN|${id}`); await page.keyboard.press('Enter'); await waitLog(`CP_OPEN|${id}`, count + 1);
  };
  const selectUnit = async (id) => {
    let state = await probe();
    for (let step = 0; state.selected !== id && step <= state.units.length; ++step) {
      const previous = state.selected;
      await page.keyboard.press('Tab');
      state = await waitState((s) => s.selected === id || s.selected !== previous, 'Real Tab selection reaches the observer');
    }
    assert.equal(state.selected, id, `Real Tab selects unit ${id}`); return state;
  };
  const advance = async () => {
    let state = await probe(); const turn = state.turn;
    const processing = state.bases.find((b) => b.id === 1).choice === 'COLONY_POD';
    const activeCount = state.units.filter((u) => u.movement > 0).length;
    for (let index = 0; index < activeCount; ++index) {
      await page.keyboard.press('Tab');
      state = await waitState((s) => s.units.some((u) => u.id === s.selected && u.movement > 0), 'Select actual active unit before ending turn');
      const id = state.selected; await page.keyboard.press('Space');
      state = await waitState((s) => s.units.some((u) => u.id === id && u.movement === 0), 'Real skip exhausts actual movement');
    }
    await waitState((s) => s.status === 'turn_complete', 'Actual turn is complete');
    await clickCanvas(page, 899, 585);
    return waitState((s) => s.turn === turn + 1 && s.status === 'active'
      && (!processing || s.bases.find((b) => b.id === 1).processed === s.turn), 'Actual next turn and production commit');
  };
  const choosePod = async () => {
    const renders = await countLog('CP_RENDER|1|Colony Pod|');
    const opened = await countLog('CP_PICKER_OPEN|1'); await clickCanvas(page, 188, 726); await waitLog('CP_PICKER_OPEN|1', opened + 1);
    const log = await page.locator('#log').textContent();
    const rows = [...log.matchAll(/CP_PICKER_ROW\|(\d+)\|COLONY_POD\|Colony Pod\|(\d+)/g)];
    assert.ok(rows.length, 'The real picker offers the renewable Colony Pod project');
    assert.equal(+rows.at(-1)[2], 30, 'Unknown synthetic map uses actual fallback cost 30');
    await clickCanvas(page, 500, 150 + 29 * +rows.at(-1)[1]);
    const closed = await countLog('CP_PICKER_CLOSED'); await clickCanvas(page, 565, 505); await waitLog('CP_PICKER_CLOSED', closed + 1);
    await waitLog('CP_BASE|1|0|8|8|');
    await waitLog('CP_RENDER|1|Colony Pod|', renders + 1);
    const selected = await latestBase(1); assert.equal(selected.choice, 'COLONY_POD'); return selected;
  };
  const finishProject = async (excluded) => {
    let state = await probe(); let completion = null; let turns = 0;
    while (turns < 10) {
      const previous = state.bases.find((b) => b.id === 1);
      assert.equal(previous.choice, 'COLONY_POD'); assert.ok(previous.pending > 0);
      state = await advance(); ++turns;
      const current = state.bases.find((b) => b.id === 1);
      assert.equal(current.processed, state.turn, 'The actual project processes the new turn');
      const credited = previous.minerals + previous.pending;
      const spawned = state.units.filter((u) => u.def === 'ColonyPod' && !excluded.has(u.id));
      assert.equal(current.minerals, credited >= 30 && previous.size >= 2 ? credited - 30 : credited,
        'Real production credits the prior actual surplus and retains overflow');
      assert.equal(spawned.length, credited >= 30 && previous.size >= 2 ? 1 : 0,
        'A real pod appears exactly when minerals and population permit completion');
      if (spawned.length) {
        const unit = spawned[0]; assert.equal(current.choice, '', 'Completion clears the manually repeated project');
        assert.equal(unit.owner, state.owner); assert.deepEqual([unit.x, unit.y], [8, 8]);
        const events = [...(await page.locator('#log').textContent()).matchAll(/CP_SPAWN\|(\d+)\|ColonyPod\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/g)];
        const event = events.find((m) => +m[1] === unit.id);
        assert.ok(event, 'The actual native unit manager emitted the pod spawn');
        assert.equal(+event[5], previous.size - 1, 'Native completion consumes exactly one citizen before later growth');
        assert.equal(+event[6], state.turn); completion = { state, unit, turns, overflow: current.minerals }; break;
      }
      assert.equal(current.choice, 'COLONY_POD');
    }
    assert.ok(completion, 'The real project completes within the productive fixture turn bound'); return completion;
  };

  await page.goto(address); await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({ name: 'colony-production.MP', mimeType: 'application/octet-stream', buffer: productionMap() });
  await page.locator('#import-maps').click();
  await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('colony-production.MP'));
  if (process.env.WASM_SITE_URL) {
    await page.locator('#asset-source').selectOption('local'); await page.locator('#assets').setInputFiles(assets);
  } else {
    await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  }
  await page.evaluate(({ scripts, mainScript, worldScript }) => {
    for (const [name, source] of Object.entries(scripts)) {
      if (!/^GLSMAC_data\/default\/[a-zA-Z0-9_./-]+\.gls\.js$/.test(name) || name.includes('..')) throw new Error('Invalid production snapshot path');
      const path = `/colony-production-snapshot/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source);
    }
    Module.FS.writeFile('/colony-production-snapshot/GLSMAC_data/default/browser_colony_production_main.gls.js', mainScript);
    Module.FS.writeFile('/colony-production-snapshot/GLSMAC_data/default/game/world/browser_colony_production.gls.js', worldScript);
    const callMain = Module.callMain;
    Module.callMain = (args) => callMain([...args, '--datapath', '/colony-production-snapshot/GLSMAC_data', '--mainscript', 'browser_colony_production_main',
      '--worldscript', 'browser_colony_production', '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/colony-production.MP', '--quickstart-faction', 'GAIANS']);
  }, { scripts, mainScript, worldScript });
  await page.locator('#start').click(); await waitLog('CP_READY');
  const initial = await probe();
  assert.equal(initial.bases.length, 1); assert.equal(initial.bases[0].size, 3, 'Fixture starts with three genuine assigned citizens');
  assert.equal(initial.bases[0].minerals, 0, 'No construction minerals are seeded');
  assert.equal(initial.units.length, 1); assert.equal(initial.units[0].def, 'MindWorms', 'No Colony Pod is seeded');
  assert.ok(initial.bases[0].pending >= 9, 'Actual productive terrain bounds the real turn workload');
  await waitLog('CP_CHOICE|COLONY_POD|unit|ColonyPod|30|1');
  await openSelectedBase(1);
  const idle = await latestBase(1);
  const opened = await countLog('CP_PICKER_OPEN|1'); await clickCanvas(page, 188, 726); await waitLog('CP_PICKER_OPEN|1', opened + 1);
  await screenshot('picker-cancel');
  const closed = await countLog('CP_PICKER_CLOSED'); await page.keyboard.press('Escape'); await waitLog('CP_PICKER_CLOSED', closed + 1);
  await closeBase(1);
  assert.deepEqual((await probe()).bases.find((b) => b.id === 1), idle, 'Cancel leaves actual project, minerals and population unchanged');
  await openSelectedBase(1);
  await choosePod(); await screenshot('first-project'); await closeBase(1);
  const first = await finishProject(new Set(initial.units.map((u) => u.id)));
  await selectUnit(first.unit.id); await screenshot('first-produced-pod');
  await page.keyboard.press('ArrowRight');
  await waitState((s) => s.units.some((u) => u.id === first.unit.id && u.x === 10 && u.y === 8 && u.movement === 0), 'Actual produced pod moves off Headquarters');
  await advance(); await selectUnit(first.unit.id);
  await waitState((s) => s.selected === first.unit.id && s.foundEnabled, 'Produced pod has a real enabled founding control');
  await page.keyboard.press('b'); await waitLog(`CP_FOUND|${first.unit.id}|true`);
  const founded = await waitState((s) => !s.units.some((u) => u.id === first.unit.id) && s.bases.length === 2, 'Founding consumes the actual produced pod');
  const newBase = founded.bases.find((b) => b.id !== 1);
  assert.deepEqual([newBase.owner, newBase.x, newBase.y, newBase.size], [initial.owner, 10, 8, 1]);
  // Consuming the pod selects the remaining active scout at Headquarters.
  // Open that actual base, then navigate to the new one through the real UI.
  await selectUnit(initial.units[0].id); await openSelectedBase(1);
  const newRenders = await countLog(`CP_RENDER|${newBase.id}|`);
  const newPanels = await countLog(`CP_PANEL|${newBase.id}`);
  await clickCanvas(page, 744, 602);
  await waitLog(`CP_RENDER|${newBase.id}|`, newRenders + 1);
  await waitLog(`CP_PANEL|${newBase.id}`, newPanels + 1);
  assert.deepEqual(await latestBase(newBase.id), newBase, 'The actual new owned base is displayed without changing its native state');
  await screenshot('founded-base'); await closeBase(newBase.id);
  await selectUnit(initial.units[0].id); await openSelectedBase(1);
  const renewed = await choosePod(); assert.equal(renewed.minerals, first.overflow, 'Manual renewal preserves the first completion overflow');
  await screenshot('renewed-project'); await closeBase(1);
  const second = await finishProject(new Set([...initial.units.map((u) => u.id), first.unit.id]));
  assert.notEqual(second.unit.id, first.unit.id, 'Renewal creates a distinct second actual Colony Pod');
  assert.equal(second.state.bases.length, 2, 'The founded base survives renewed production');
  await selectUnit(second.unit.id); await screenshot('second-produced-pod');
  await healthy();
  t.diagnostic(`Controlled three-worker startup; actual picker cancellation/selection, 30-mineral one-citizen projects completed in ${first.turns}+${second.turns} real turns with ${first.overflow}/${second.overflow} retained minerals. Produced pod ${first.unit.id} moved and founded owned base ${newBase.id}; manual renewal produced distinct pod ${second.unit.id}. No gameplay credits or native behavior were substituted; GLSMAC expansion regression, no original-game parity claim.`);
});
