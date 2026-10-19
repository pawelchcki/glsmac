import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const site = process.env.WASM_SITE_URL;
const artifacts = new URL('build/artifacts/', import.meta.url);

function recordedBaseSquareResources(installed) {
  const cases = JSON.parse(readFileSync(`${root}tools/behavior-tests/economy/cases/base-square-resources.json`, 'utf8')).cases;
  const observations = JSON.parse(readFileSync(`${root}tools/behavior-tests/economy/observations/smacx-gog-2.0-base-square-resources.json`, 'utf8')).observations;
  // The recorded land/no-river/HQ matrix has the same output across its
  // sampled faction, base-record and coordinate inputs. The browser's rainy
  // 16x16 map, base 2 at (10,8), and growing population differ from that 4x4
  // arid one-population matrix. This is a construction regression using those
  // resource values; it adds no original-input parity case or parity count.
  const matching = cases.filter(({ input }) => input.land && !input.river
    && input.headquarters && input.recycling_tanks === installed);
  assert.ok(matching.length > 0, 'The recorded contract includes this base-square facility state');
  const outputs = matching.map(({ id }) => {
    const observation = observations.find((entry) => entry.id === id);
    assert.ok(observation, `Recorded resource observation exists for ${id}`);
    return observation.output;
  });
  for (const output of outputs) assert.deepEqual(output, outputs[0], 'The sampled base-square contract is invariant for this terrain and facility state');
  return outputs[0];
}

// Synthetic original-format terrain. Graphics still come from the user's
// installation; no proprietary map data is embedded in this test.
function smokeMap() {
  const width = 16;
  const height = 16;
  const count = width * height / 2;
  const abstractWidth = Math.floor((width + 4) / 5);
  const abstractHeight = Math.floor((height + 4) / 5);
  const abstractCount = Math.floor((abstractWidth + 1) / 2) * abstractHeight;
  const tileOffset = 15 + 0xaa4;
  const bytes = Buffer.alloc(tileOffset + count * 44 + abstractCount);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary');
  bytes.writeUInt32LE(5, 11);
  for (const [offset, value] of [
    [0, width], [4, height], [20, count],
    [0xa24, abstractWidth], [0xa28, abstractHeight], [0xa2c, abstractCount],
  ]) bytes.writeUInt32LE(value, 15 + offset);
  for (let index = 0; index < count; ++index) {
    bytes[tileOffset + index * 44] = 3 * 32 + 2 * 8; // land, rainy
    bytes[tileOffset + index * 44 + 1] = 64; // above sea level
  }
  const selected = tileOffset + (8 * (width / 2) + 8 / 2) * 44;
  bytes.writeUInt32LE(0x10000000 | 0x4 | 0x8000, selected + 8); // pod, road, farm
  bytes.writeUInt32LE(0x2, selected + 12); // volcano
  return bytes;
}

// These are GSE scripts, not JavaScript. They are installed only in the test's
// MEMFS before callMain. All UI, events, terrain and units remain production.
const mainScript = String.raw`
#main((glsmac) => {
  #include('game/game')(glsmac);
  #include('ui/ui')(glsmac);

  const preview = #include('ui/parts/game/bottom_bar/tile_preview');
  const draw_line = preview.line;
  preview.line = (text) => {
    draw_line(text);
    #print('SMOKE_LABEL|' + text);
  };
  const base_panel = #include('ui/parts/game/popup/base_screen/bottom_bar/middle_area');
  const update_base_panel = base_panel.set;
  base_panel.set = (data) => {
    update_base_panel(data);
    #print('SMOKE_BASE_RENDER|' + #to_string(data.base.id));
  };
  const base_screen = #include('ui/parts/game/popup/base_screen');
  const popups = #include('ui/parts/game/popup/popup');
  const command_panel = #include('ui/parts/game/bottom_bar/object_preview');
  const show_popup = popups.show;
  popups.show = (id, cb) => {
    show_popup(id, cb);
    #print('SMOKE_POPUP_SHOW|' + id);
  };
  const clear_popup = popups.clear;
  popups.clear = () => {
    const id = popups.popup == null ? '' : popups.popup.id;
    clear_popup();
    if (id != '') { #print('SMOKE_POPUP_HIDDEN|' + id); }
  };
  const production_panel = #include('ui/parts/game/popup/base_screen/bottom_bar/production');
  const set_production_panel = production_panel.set;
  production_panel.set = (data) => {
    set_production_panel(data);
    #print('SMOKE_PRODUCTION_RENDER|' + #to_string(data.base.id) + '|' + production_panel.production_title.text + '|' + production_panel.production_amount.text + '|' + production_panel.production_pending.text + '|' + production_panel.production_label.text);
  };
  const facility_panel = #include('ui/parts/game/popup/base_screen/facilities');
  const set_facility_panel = facility_panel.set;
  facility_panel.set = (names) => {
    set_facility_panel(names);
    for (name of names) { #print('SMOKE_FACILITY_RENDER|' + name); }
  };
  const show_production_picker = base_screen.show_production_selection;
  base_screen.show_production_selection = () => {
    show_production_picker();
    if (base_screen.production_selection != null) { #print('SMOKE_PICKER_OPEN|' + #to_string(base_screen.base_id)); }
  };
  const hide_production_picker = base_screen.hide_production_selection;
  base_screen.hide_production_selection = () => {
    const was_open = base_screen.production_selection != null;
    hide_production_picker();
    if (was_open) { #print('SMOKE_PICKER_CLOSED'); }
  };
  const show_base_screen = base_screen.on_show;
  base_screen.on_show = () => {
    show_base_screen();
    #async(10, () => {
      if (popups.sliding_timer == null && popups.is_shown()) {
        #print('SMOKE_BASE_OPEN');
        return false;
      }
      return true;
    });
  };
  const hide_base_screen = base_screen.on_hide;
  base_screen.on_hide = () => {
    hide_base_screen();
    #print('SMOKE_BASE_CLOSED');
    #async(10, () => {
      if (popups.sliding_timer == null && !popups.is_shown()) {
        #print('SMOKE_BASE_HIDDEN');
        return false;
      }
      return true;
    });
  };

  glsmac.on('configure_game', (e) => {
    const game = e.game;
    const report_base = (base) => {
      const tile = base.get_tile();
      #print('SMOKE_BASE_STATE|' + #to_string(base.id) + '|' + #to_string(base.get_owner().id) + '|' + #to_string(tile.x) + '|' + #to_string(tile.y) + '|' + #to_string(base.get_size()));
    };
    game.on('event_result', (e) => {
      if (e.name == 'found_base') {
        #print('SMOKE_FOUND_RESULT|' + #to_string(e.data.unit_id) + '|' + #to_string(e.success));
        for (base of game.get_bm().get_bases()) { report_base(base); }
        #print('SMOKE_FOUND_UNIT_EXISTS|' + #to_string(game.get_um().has_unit(e.data.unit_id)));
      }
    });
    const report_production = (base) => {
      const state = base.get_production();
      const pending = game.get('f_base_get_pending_production');
      let surplus = 0;
      if (#typeof(pending) == 'Callable') { surplus = pending(base); }
      let cost = 0;
      for (choice of base.get_owner().get_production_choices()) {
        if (choice.id == state.choice_id) { cost = choice.cost; }
      }
      #print('SMOKE_PRODUCTION|' + #to_string(base.id) + '|' + state.choice_id + '|' + #to_string(state.minerals) + '|' + #to_string(state.last_processed_turn) + '|' + #to_string(base.has_facility('RECYCLING_TANKS')) + '|' + #to_string(surplus) + '|' + #to_string(cost));
      const tile = base.get_tile();
      const resources = tile.get_resources(base.get_owner());
      #print('SMOKE_BASE_RESOURCES|' + #to_string(base.id) + '|' + #to_string(resources.NUTRIENTS) + '|' + #to_string(resources.MINERALS) + '|' + #to_string(resources.ENERGY));
    };
    game.on('update_base', (e) => { report_production(e.base); });
    game.on('base_select', (e) => {
      #print('SMOKE_BASE|' + #to_string(e.base.id) + '|' + #to_string(e.base.get_owner().id));
    });
    game.on('unit_select', (e) => {
      #print('SMOKE_UNIT|' + #to_string(e.unit.id) + '|' + #to_string(e.unit.owner));
    });
    game.on('turn', (e) => {
      #print('SMOKE_TURN|' + #to_string(game.get_turn()) + '|' + #to_string(e.year));
    });
    game.on('turn_status', (e) => {
      const um = game.get_um();
      if (um.has_unit(1)) {
        #print('SMOKE_STATUS|' + e.status + '|' + #to_string(um.get_unit(1).movement));
      } else {
        #print('SMOKE_STATUS|' + e.status + '|missing');
      }
    });
    game.on('start_ui', (e) => {
      #async(0, () => {
        glsmac.ui.root.on('keydown', (e) => {
          if (e.code == 'P' && e.modifiers == {}) {
            if (game.get_um().has_unit(1)) {
              const unit = game.get_um().get_unit(1);
              #print('SMOKE_MOVEMENT|' + #to_string(unit.movement));
              #print('SMOKE_POSITION|' + #to_string(unit.tile.x) + '|' + #to_string(unit.tile.y));
            } else {
              #print('SMOKE_UNIT_MISSING|1');
            }
            for (base of game.get_bm().get_bases()) { report_production(base); report_base(base); }
            #print('SMOKE_FOUND_CONTROL|' + command_panel.found_button.class);
            #print('SMOKE_PROBE_DONE');
            return true;
          }
          return false;
        });
        game.get_map().on('base_preview', (e) => {
          #print('SMOKE_BASE_PREVIEW|' + #to_string(e.base.id));
        });
        #print('SMOKE_UI_READY');
        return false;
      });
    });
  });
  glsmac.run();
});

`;

const worldScript = String.raw`
return (game) => {
  const owner = game.get_player();
  const tm = game.get_tm();
  game.event('add_production_choice', {
    player: owner,
    id: 'RECYCLING_TANKS',
    data: { type: 'facility', id: 'RECYCLING_TANKS' },
  });
  for (position of [[8, 8], [10, 8]]) {
    game.event('spawn_base', {
      owner: owner,
      tile: tm.get_tile(position[0], position[1]),
      facilities: ['HEADQUARTERS'],
    });
  }
  game.event('spawn_unit', {
    owner: owner,
    tile: tm.get_tile(8, 8),
    type: 'MindWorms',
    health: 1.0,
    morale: 1,
  });
};
`;

const colonyWorldScript = String.raw`
return (game) => {
  const owner = game.get_player();
  const tile = game.get_tm().get_tile(8, 8);
  game.event('spawn_base', { owner: owner, tile: tile, facilities: ['HEADQUARTERS'] });
  game.event('spawn_unit', { owner: owner, tile: tile, type: 'ColonyPod', health: 1.0, morale: 1 });
};
`;

// A separate declared fixture leaves population initialization to the normal
// base lifecycle. Only imported terrain differs: the northern nutrient square
// is initially best; the eastern mineral square provides a distinct real yield.
function workerMap() {
  const bytes = smokeMap();
  const offset = (x, y) => 15 + 0xaa4 + (y * 8 + x / 2) * 44;
  bytes.writeUInt32LE(0x400 | 0x20000000, offset(8, 6) + 8); // nutrient bonus
  bytes.writeUInt32LE(0x4, offset(8, 6) + 12); // jungle
  bytes[offset(10, 8) + 5] = 1 << 6; // rolling
  bytes.writeUInt32LE(0x400 | 0x20000000 | 0x20000, offset(10, 8) + 8); // minerals
  return bytes;
}

const workerWorldScript = String.raw`
return (game) => {
  const owner = game.get_player();
  const tile = game.get_tm().get_tile(8, 8);
  game.event('add_production_choice', { player: owner, id: 'RECYCLING_TANKS',
    data: { type: 'facility', id: 'RECYCLING_TANKS' } });
  game.event('spawn_base', { owner: owner, tile: tile, facilities: ['HEADQUARTERS'] });
  game.event('spawn_unit', { owner: owner, tile: tile, type: 'MindWorms', health: 1.0, morale: 1 });
};
`;

// Read-only observers chain actual event/UI callbacks and preserve their return
// values. No probe or observer sends an assignment, changes a pop, or sets food.
const workerMainScript = mainScript.replace("  #include('game/game')(glsmac);", String.raw`
  const worker_growth = #include('game/event/process_base_growth');
  const apply_worker_growth = worker_growth.apply;
  worker_growth.apply = (e) => {
    const result = apply_worker_growth(e);
    #print('WORK_GROWTH_DONE|' + #to_string(e.data.base.id) + '|' + #to_string(e.data.turn_id));
    return result;
  };
  #include('game/game')(glsmac);
`).replace('  glsmac.run();', String.raw`
  let worker_game = null;
  let worker_sequence = 0;
  const worker_resources = #include('ui/parts/game/popup/base_screen/resources');
  const report_workers = (base) => {
    worker_sequence += 1;
    const seq = #to_string(worker_sequence);
    const intake = base.get_intake(); const consumption = base.get_consumption();
    const project = base.get_production();
    let cost = 0;
    for (choice of base.get_owner().get_production_choices()) {
      if (choice.id == project.choice_id) { cost = choice.cost; }
    }
    const nutrient_factor = worker_game.get('f_base_get_nutrient_factor')(base);
    let facility_count = 0;
    for (id in base.get_facilities()) { facility_count += 1; }
    let food = base.get('accumulated_nutrients'); if (!#is_defined(food)) { food = 0; }
    #print('WORK_BEGIN|' + seq);
    #print('WORK_BASE|' + seq + '|' + #to_string(base.id) + '|' + #to_string(base.get_owner().id) + '|' + #to_string(worker_game.get_turn()) + '|' + #to_string(base.get_size()) + '|' + #to_string(food) + '|' + project.choice_id + '|' + #to_string(project.minerals) + '|' + #to_string(project.last_processed_turn) + '|' + #to_string(intake.NUTRIENTS) + '|' + #to_string(intake.MINERALS) + '|' + #to_string(intake.ENERGY) + '|' + #to_string(consumption.NUTRIENTS) + '|' + #to_string(consumption.MINERALS) + '|' + #to_string(consumption.ENERGY) + '|' + #to_string(facility_count) + '|' + #to_string(nutrient_factor) + '|' + #to_string(cost));
    for (pop of base.get_pops()) {
      let x = (0 - 1); let y = (0 - 1);
      const tile = pop.get('worked_tile');
      if (#is_defined(tile)) { x = tile.x; y = tile.y; }
      #print('WORK_POP|' + seq + '|' + #to_string(pop.id) + '|' + pop.get_type() + '|' + #to_string(pop.get_base().id) + '|' + #to_string(x) + '|' + #to_string(y));
    }
    for (tile of base.get_worked_tiles()) {
      #print('WORK_WORKED|' + seq + '|' + #to_string(tile.x) + '|' + #to_string(tile.y));
    }
    const tiles = base.get_workable_tiles(); const center = base.get_tile(); tiles :+ center;
    for (tile of tiles) {
      let pop_id = (0 - 1); let pop_base = (0 - 1);
      const pop = tile.get('working_pop');
      if (#is_defined(pop)) { pop_id = pop.id; pop_base = pop.get_base().id; }
      const yield = tile.get_resources(base.get_owner());
      #print('WORK_TILE|' + seq + '|' + #to_string(tile.x) + '|' + #to_string(tile.y) + '|' + #to_string(base.is_tile_worked(tile)) + '|' + #to_string(pop_id) + '|' + #to_string(pop_base) + '|' + #to_string(yield.NUTRIENTS) + '|' + #to_string(yield.MINERALS) + '|' + #to_string(yield.ENERGY));
    }
    const labels = worker_resources.labels;
    #print('WORK_RENDER|' + seq + '|' + labels.nutrients.left.text + '|' + labels.nutrients.right.text + '|' + labels.minerals.left.text + '|' + labels.minerals.right.text + '|' + labels.energy.left.text + '|' + labels.energy.right.text);
    #print('WORK_DONE|' + seq);
  };
  const set_worker_screen = base_screen.set;
  base_screen.set = (data) => {
    const result = set_worker_screen(data);
    if (worker_game != null) { report_workers(data.base); }
    return result;
  };
  const show_worker_picker = base_screen.show_production_selection;
  base_screen.show_production_selection = () => {
    const result = show_worker_picker();
    if (base_screen.production_selection != null) {
      let index = 0;
      for (choice of base_screen.get_production_choices()) {
        #print('WORK_PICKER_ROW|' + #to_string(index) + '|' + choice.id);
        index += 1;
      }
    }
    return result;
  };
  glsmac.on('configure_game', (e) => {
    worker_game = e.game;
    e.game.on('error', (e) => { #print('WORK_GAME_ERROR'); });
    e.game.on('event_result', (e) => {
      #print('WORK_EVENT|' + e.name + '|' + #to_string(e.success));
      if (!e.success) { #print('WORK_EVENT_REJECTED|' + e.name); }
    });
  });
  glsmac.run();
`);

async function serveAssets(t) {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], { cwd: root });
  t.after(() => server.kill());
  let log = '';
  server.stderr.on('data', (data) => { log += data; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Asset server did not start: ${log}`)), 60000);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Asset server exited (${code}): ${log}`));
    });
    server.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
}

async function clickCanvas(page, x, y) {
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width * x / 1024, box.y + box.height * y / 768);
}

async function startGame(t, fixtureWorld = worldScript, artifactPrefix = 'gameplay', options = {}) {
  const fatal = options.fatal || /worker sent an error!|RuntimeError:|Aborted\(/;
  mkdirSync(artifacts, { recursive: true });
  const scripts = Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`, { recursive: true })
    .filter((name) => name.endsWith('.gls.js')).sort()
    .map((name) => [`GLSMAC_data/default/${name}`, readFileSync(`${root}GLSMAC_data/default/${name}`, 'utf8')]));
  t.diagnostic(`Production script snapshot SHA-256: ${createHash('sha256').update(JSON.stringify(scripts)).digest('hex')}`);
  const address = site || await serveAssets(t);
  const browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  const selectedBases = [];
  const recordError = (kind, error) => {
    const detail = error?.stack || String(error);
    errors.push(detail);
    console.error(`Browser ${kind} error: ${detail}`);
    // Wake pending telemetry waits when a worker stops. The original error is
    // still asserted below; a graphics failure never becomes a timeout/retry.
    page.evaluate(() => { globalThis.__gameplayError = true; }).catch(() => {});
  };
  page.on('pageerror', (error) => recordError('runtime', error));
  page.on('console', (message) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(message.text())) {
      recordError('graphics', message.text());
    }
  });
  t.after(async () => {
    try {
      const log = await page.locator('#log').textContent({ timeout: 1000 });
      writeFileSync(new URL(`${artifactPrefix}-log.txt`, artifacts), log || '');
      await page.locator('#canvas').screenshot({
        path: fileURLToPath(new URL(`${artifactPrefix}-final.png`, artifacts)), timeout: 3000,
      }).catch(() => {});
      if (log) t.diagnostic(log.slice(-12000));
      if (errors.length) t.diagnostic(errors.join('\n'));
    } finally {
      await browser.close();
    }
  });
  const screenshot = async (name) => {
    assert.deepEqual(errors, [], 'No browser runtime or graphics errors');
    // UI event telemetry precedes the engine worker's next canvas draw. Allow
    // that draw to reach the artifact; gameplay assertions use state/events.
    await page.waitForTimeout(250);
    return page.locator('#canvas').screenshot({ path: fileURLToPath(new URL(`${artifactPrefix}-${name}.png`, artifacts)) });
  };
  const waitForLog = async (text, minimum = 1, timeout = 60000) => {
    try {
      await page.waitForFunction(({ text, minimum, fatalSource }) => (
        globalThis.__gameplayError || document.body.dataset.state === 'failed'
        || new RegExp(fatalSource).test(document.querySelector('#log').textContent)
        || document.querySelector('#log').textContent.split(text).length - 1 >= minimum
      ), { text, minimum, fatalSource: fatal.source }, { timeout });
    } catch (error) {
      const log = await page.locator('#log').textContent({ timeout: 1000 }).catch(() => 'No engine log available');
      throw new Error(`Waiting for ${text} (${minimum} occurrences) failed.\n${log.slice(-12000)}`, { cause: error });
    }
    assert.deepEqual(errors, [], 'No browser runtime or graphics errors');
    const log = await page.locator('#log').textContent();
    assert.doesNotMatch(log, fatal, 'No fatal worker error in the engine log');
    assert.ok(log.split(text).length - 1 >= minimum,
      `The running engine emitted ${text}`);
  };
  const currentBases = async () => {
    const log = await page.locator('#log').textContent();
    return [...log.matchAll(/SMOKE_BASE\|(\d+)\|(\d+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
  };
  const waitForBase = async (id) => {
    const count = selectedBases.filter((previous) => previous === id).length + 1;
    await waitForLog(`SMOKE_BASE|${id}|0`, count);
    await waitForLog(`SMOKE_BASE_RENDER|${id}`, count);
    selectedBases.push(id);
  };
  const probeUnit = async (timeout = 60000) => {
    const before = await page.locator('#log').textContent();
    const previous = (before.match(/SMOKE_PROBE_DONE/g) || []).length;
    const missing = (before.match(/SMOKE_UNIT_MISSING\|1/g) || []).length;
    await page.keyboard.press('p');
    await waitForLog('SMOKE_PROBE_DONE', previous + 1, timeout);
    const log = await page.locator('#log').textContent();
    if ((log.match(/SMOKE_UNIT_MISSING\|1/g) || []).length > missing) return null;
    const movements = [...log.matchAll(/SMOKE_MOVEMENT\|([0-9.]+)/g)];
    const positions = [...log.matchAll(/SMOKE_POSITION\|(\d+)\|(\d+)/g)];
    return {
      movement: Number(movements.at(-1)[1]),
      position: positions.at(-1).slice(1).map(Number),
    };
  };
  const productionState = async (id) => {
    const log = await page.locator('#log').textContent();
    const states = [...log.matchAll(/SMOKE_PRODUCTION\|(\d+)\|([^|\n]*)\|(\d+)\|(\d+)\|(true|false)\|(\d+)\|(\d+)/g)]
      .filter((match) => Number(match[1]) === id);
    assert.ok(states.length > 0, `Read actual production state for base ${id}`);
    const latest = states.at(-1);
    return { choice: latest[2], minerals: Number(latest[3]), turn: Number(latest[4]),
      installed: latest[5] === 'true', pending: Number(latest[6]), cost: Number(latest[7]) };
  };
  const baseSquareResources = async (id) => {
    const log = await page.locator('#log').textContent();
    const states = [...log.matchAll(/SMOKE_BASE_RESOURCES\|(\d+)\|(-?\d+)\|(-?\d+)\|(-?\d+)/g)]
      .filter((match) => Number(match[1]) === id);
    assert.ok(states.length > 0, `Read actual base-square resources for base ${id}`);
    const latest = states.at(-1);
    return { NUTRIENTS: Number(latest[2]), MINERALS: Number(latest[3]), ENERGY: Number(latest[4]) };
  };
  const closeBase = async () => {
    const previous = ((await page.locator('#log').textContent()).match(/SMOKE_BASE_HIDDEN/g) || []).length;
    await page.keyboard.press('Escape');
    await waitForLog('SMOKE_BASE_HIDDEN', previous + 1);
  };

  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({
    name: 'browser-smoke.MP', mimeType: 'application/octet-stream', buffer: options.map || smokeMap(),
  });
  await page.locator('#import-maps').click();
  await page.waitForFunction(() => document.querySelector('#custom-map-list').textContent.includes('browser-smoke.MP'));
  if (site) {
    await page.locator('#asset-source').selectOption('local');
    await page.locator('#assets').setInputFiles(assets);
  } else {
    await page.locator('#asset-source').selectOption('remote');
    await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  }
  await page.evaluate(({ mainScript, worldScript, scripts }) => {
    const snapshotRoot = '/gameplay-snapshot';
    for (const [name, source] of Object.entries(scripts)) {
      if (!/^GLSMAC_data\/default\/[a-zA-Z0-9_./-]+\.gls\.js$/.test(name) || name.includes('..')) {
        throw new Error('Invalid production script snapshot path');
      }
      const destination = `${snapshotRoot}/${name}`;
      Module.FS.mkdirTree(destination.slice(0, destination.lastIndexOf('/')));
      Module.FS.writeFile(destination, source);
    }
    Module.FS.mkdirTree(`${snapshotRoot}/GLSMAC_data/default/game/world`);
    Module.FS.writeFile(`${snapshotRoot}/GLSMAC_data/default/browser_smoke_main.gls.js`, mainScript);
    Module.FS.writeFile(`${snapshotRoot}/GLSMAC_data/default/game/world/browser_smoke.gls.js`, worldScript);
    const callMain = Module.callMain;
    Module.callMain = (args) => callMain([...args,
      '--datapath', `${snapshotRoot}/GLSMAC_data`,
      '--mainscript', 'browser_smoke_main', '--worldscript', 'browser_smoke',
      '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/browser-smoke.MP',
      '--quickstart-faction', 'GAIANS',
    ]);
  }, { mainScript: options.mainScript || mainScript, worldScript: fixtureWorld, scripts });
  await page.locator('#start').click();
  await waitForLog('SMOKE_UI_READY');
  await waitForLog('SMOKE_UNIT|1|0');
  return { page, waitForLog, screenshot, probeUnit, waitForBase, closeBase, productionState, baseSquareResources, currentBases, selectedBases };
}

test('owned bases, turns, movement and facility production use the real browser game', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
  timeout: 180000,
}, async (t) => {
  const { page, waitForLog, screenshot, probeUnit, waitForBase, closeBase, productionState, baseSquareResources, currentBases } = await startGame(t);
  const recordedBeforeTanks = recordedBaseSquareResources(false);
  const recordedAfterTanks = recordedBaseSquareResources(true);
  for (const label of ['Supply Pod', 'Volcano', 'Road', 'Farm']) await waitForLog(`SMOKE_LABEL|${label}`);
  const initialUnit = await probeUnit();
  const initialMovement = initialUnit.movement;
  assert.ok(initialMovement > 0, 'The selected owned unit begins with movement');
  assert.deepEqual(initialUnit.position, [8, 8], 'The unit begins on the first base');
  const terrain = PNG.sync.read(await screenshot('terrain-labels'));
  let terrainPixels = 0;
  for (let offset = 0; offset < terrain.width * Math.min(500, terrain.height) * 4; offset += 4) {
    if (terrain.data[offset] + terrain.data[offset + 1] + terrain.data[offset + 2] > 12) ++terrainPixels;
  }
  assert.ok(terrainPixels > terrain.width * Math.min(500, terrain.height) / 5, 'Actual terrain fills the playfield');

  await page.keyboard.press('Enter'); // Open the base under the selected unit.
  await waitForBase(1);
  await waitForLog('SMOKE_BASE_OPEN');
  await screenshot('first-base');
  await clickCanvas(page, 744, 602); // Next owned base.
  await waitForBase(2);
  await screenshot('next-base');
  await clickCanvas(page, 744, 602); // Wrap to the first owned base.
  await waitForBase(1);
  await clickCanvas(page, 280, 602); // Wrap to the previous owned base.
  await waitForBase(2);
  await clickCanvas(page, 280, 602);
  await waitForBase(1);
  assert.deepEqual(await currentBases(), [[1, 0], [2, 0], [1, 0], [2, 0], [1, 0]],
    'Both arrow directions cycle through the actual owned bases and wrap');
  await page.keyboard.press('Escape');
  await waitForLog('SMOKE_BASE_CLOSED');
  await page.keyboard.press('Tab'); // Re-select the owned unit after closing the popup.
  await waitForLog('SMOKE_UNIT|1|0', 2);
  await screenshot('skip-available');
  await clickCanvas(page, 100, 741); // Visible Skip Turn command beside FOUND BASE.
  await waitForLog('SMOKE_STATUS|turn_complete|0');
  assert.equal((await probeUnit()).movement, 0, 'Clicking Skip Turn exhausted actual backend movement');
  await screenshot('skipped');

  const beforeTurnLog = await page.locator('#log').textContent();
  const previousTurns = [...beforeTurnLog.matchAll(/SMOKE_TURN\|(\d+)\|(\d+)/g)];
  assert.ok(previousTurns.length > 0, 'The engine reported its initial turn and year');
  const initialTurn = Number(previousTurns.at(-1)[1]);
  const initialYear = Number(previousTurns.at(-1)[2]);
  await clickCanvas(page, 899, 585); // Visible TURN COMPLETE button above the minimap.
  await waitForLog(`SMOKE_TURN|${initialTurn + 1}|${initialYear + 1}`);
  await waitForLog(`SMOKE_STATUS|active|${initialMovement}`);
  const replenishedUnit = await probeUnit();
  assert.equal(replenishedUnit.movement, initialMovement, 'The next turn replenished actual backend movement');
  assert.deepEqual(replenishedUnit.position, [8, 8], 'Turn advancement preserves the unit position');
  await screenshot('next-turn');

  // Real keyboard routing must still control the replenished unit.
  await page.keyboard.press('Tab');
  await waitForLog('SMOKE_UNIT|1|0', 3);
  await page.keyboard.press('ArrowRight');
  // Movement is asynchronous; probe until the production event has committed.
  let movedUnit;
  for (let attempt = 0; attempt < 30; ++attempt) {
    movedUnit = await probeUnit();
    if (movedUnit.position[0] === 10 && movedUnit.position[1] === 8
      && movedUnit.movement < initialMovement) break;
    await page.waitForTimeout(100);
  }
  assert.deepEqual(movedUnit.position, [10, 8], 'The arrow key moved the actual unit to the neighboring base');
  assert.ok(movedUnit.movement < initialMovement, 'The successful move consumed movement');
  await screenshot('moved');
  await clickCanvas(page, 280, 733); // Destination base preview in the actual objects list.
  await waitForBase(2);
  await waitForLog('SMOKE_BASE_OPEN', 2);
  await screenshot('base-after-next-turn');

  // The same production picker must support cancellation and an explicit
  // owner choice. These are canvas clicks and real popup keyboard routing.
  await clickCanvas(page, 188, 726); // CHANGE in the base production panel.
  await waitForLog('SMOKE_PICKER_OPEN|2');
  await screenshot('production-picker');
  await page.keyboard.press('Escape');
  await waitForLog('SMOKE_PICKER_CLOSED');
  assert.equal((await productionState(2)).choice, '', 'Canceling the picker leaves the backend idle');
  await clickCanvas(page, 74, 630); // The production area opens the same picker.
  await waitForLog('SMOKE_PICKER_OPEN|2', 2);
  await clickCanvas(page, 500, 150); // Select the declared Recycling Tanks row.
  await clickCanvas(page, 565, 505); // Picker OK, not the outer base-screen OK.
  await waitForLog('SMOKE_PRODUCTION|2|RECYCLING_TANKS|0|');
  await waitForLog('SMOKE_PRODUCTION_RENDER|2|Recycling Tanks|0 / 32 minerals|');
  let production = await productionState(2);
  assert.equal(production.cost, 32, 'The selected facility uses its existing declared cost');
  assert.ok(production.pending > 0, 'The real fixture base has a positive mineral surplus');
  const beforeTanks = await baseSquareResources(2);
  assert.deepEqual(beforeTanks, recordedBeforeTanks,
    'The actual Headquarters base square agrees with recorded resource values in this reproduction fixture before construction');
  await screenshot('production-selected');
  await closeBase();

  let productionTurns = 0;
  let expectedMinerals = production.minerals;
  const requiredMinerals = production.cost;
  while (!production.installed && productionTurns < requiredMinerals) {
    const previous = production;
    const unit = await probeUnit();
    if (unit.movement > 0) {
      await page.keyboard.press('Tab');
      const statuses = ((await page.locator('#log').textContent()).match(/SMOKE_STATUS\|turn_complete\|0/g) || []).length;
      await page.keyboard.press('Space');
      await waitForLog('SMOKE_STATUS|turn_complete|0', statuses + 1);
    }
    const turns = [...(await page.locator('#log').textContent()).matchAll(/SMOKE_TURN\|(\d+)\|(\d+)/g)];
    const nextTurn = Number(turns.at(-1)[1]) + 1;
    const nextYear = Number(turns.at(-1)[2]) + 1;
    await clickCanvas(page, 899, 585);
    await waitForLog(`SMOKE_TURN|${nextTurn}|${nextYear}`);
    await probeUnit();
    production = await productionState(2);
    assert.equal(production.turn, nextTurn, 'The current production turn committed before reading progress');
    expectedMinerals += previous.pending;
    const completed = expectedMinerals >= requiredMinerals;
    assert.equal(production.minerals, completed ? expectedMinerals - requiredMinerals : expectedMinerals,
      'Actual production credits the previous visible surplus and preserves declared overflow');
    assert.equal(production.installed, completed, 'The facility installs exactly at its declared threshold');
    assert.equal(production.choice, completed ? '' : 'RECYCLING_TANKS', 'Completion clears the unique facility project');
    const resources = await baseSquareResources(2);
    assert.deepEqual(resources, completed ? recordedAfterTanks : recordedBeforeTanks,
      'Actual base-square yields agree with recorded resource values in this reproduction fixture before and after completion');
    if (completed) {
      for (const resource of ['NUTRIENTS', 'MINERALS', 'ENERGY']) {
        assert.equal(resources[resource], beforeTanks[resource] + 1,
          `Completed Recycling Tanks adds one actual base-square ${resource}`);
      }
      assert.equal(production.pending, previous.pending + 1,
        'Completed Recycling Tanks increases actual pending mineral production by one');
    }
    ++productionTurns;
    const render = completed
      ? `SMOKE_PRODUCTION_RENDER|2|IDLE|Stored: ${production.minerals} minerals|`
      : `SMOKE_PRODUCTION_RENDER|2|Recycling Tanks|${production.minerals} / 32 minerals|`;
    const beforeOpenLog = await page.locator('#log').textContent();
    const previousRenders = beforeOpenLog.split(render).length - 1;
    const previousOpens = (beforeOpenLog.match(/SMOKE_BASE_OPEN/g) || []).length;
    await clickCanvas(page, 280, 733);
    await waitForBase(2);
    await waitForLog('SMOKE_BASE_OPEN', previousOpens + 1);
    await waitForLog(render, previousRenders + 1);
    if (completed) {
      await waitForLog('SMOKE_FACILITY_RENDER|Recycling Tanks');
      await screenshot('production-complete');
    } else {
      if (productionTurns === 1) await screenshot('production-progress');
      await closeBase();
    }
  }
  assert.ok(production.installed, 'Real browser turns finish the chosen facility');
  const afterTanks = await baseSquareResources(2);
  const finalLog = await page.locator('#log').textContent();
  assert.doesNotMatch(finalLog, /GSEParseError|GSETypeError|FATAL ERROR|Aborted\(|Event result listener failed/);
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running', finalLog.slice(-3000));
  t.diagnostic(`Imported synthetic 16x16 map; base navigation, skip, turn advance and move (8,8) -> (10,8) passed; canceled facility picker, selected declared 32-mineral Recycling Tanks, and completed it through ${productionTurns} real turns with ${production.minerals} overflow minerals. Actual base-square N/M/E changed from ${beforeTanks.NUTRIENTS}/${beforeTanks.MINERALS}/${beforeTanks.ENERGY} to ${afterTanks.NUTRIENTS}/${afterTanks.MINERALS}/${afterTanks.ENERGY}, agreeing with recorded resource values in this reproduction fixture; pending mineral production increased by one. This construction regression is outside the bounded original-input parity counts.`);
});

for (const action of ['keyboard', 'button']) {
  test(`Colony Pod moves off Headquarters and founds an owned base through ${action}`, {
    skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
    timeout: 180000,
  }, async (t) => {
    const { page, waitForLog, screenshot, probeUnit, waitForBase, closeBase } =
      await startGame(t, colonyWorldScript, `founding-${action}`);
    const initialUnit = await probeUnit();
    assert.deepEqual(initialUnit.position, [8, 8]);
    assert.ok(initialUnit.movement > 0);

    await page.keyboard.press('b'); // Headquarters already occupies this tile.
    await clickCanvas(page, 40, 741);
    await probeUnit();
    assert.doesNotMatch(await page.locator('#log').textContent(), /SMOKE_FOUND_RESULT\|/,
      'Founding at Headquarters does not even submit a command');

    await page.keyboard.press('ArrowRight');
    let moved;
    for (let attempt = 0; attempt < 30; ++attempt) {
      moved = await probeUnit();
      if (moved.position[0] === 10 && moved.position[1] === 8 && moved.movement < initialUnit.movement) break;
      await page.waitForTimeout(100);
    }
    assert.deepEqual(moved.position, [10, 8], 'Real keyboard movement leaves Headquarters');
    assert.equal(moved.movement, 0, 'The pod spent its current movement');
    await screenshot('moved');

    await clickCanvas(page, 899, 585); // The exhausted pod completes this turn.
    await waitForLog('SMOKE_TURN|2|2102');
    // Frontend selection follows backend turn telemetry asynchronously. Probe
    // the actual current control until the selection/availability update lands.
    let replenished;
    const readyDeadline = Date.now() + 60000;
    while (Date.now() < readyDeadline) {
      const before = await page.locator('#log').textContent();
      replenished = await probeUnit(Math.max(1, readyDeadline - Date.now()));
      const latest = (await page.locator('#log').textContent()).slice(before.length);
      if (latest.includes('SMOKE_FOUND_CONTROL|unit-found-button-enabled')) break;
      await page.waitForTimeout(100);
    }
    assert.equal(replenished.movement, initialUnit.movement);
    assert.match((await page.locator('#log').textContent()), /SMOKE_FOUND_CONTROL\|unit-found-button-enabled/,
      'The real selected pod has an enabled founding control');
    await screenshot('ready');

    // A real modal window must consume B before the unit panel can act.
    await page.keyboard.press('Escape');
    await waitForLog('SMOKE_POPUP_SHOW|please_dont_go');
    await page.keyboard.press('b');
    await page.keyboard.press('Escape');
    await waitForLog('SMOKE_POPUP_HIDDEN|please_dont_go');
    await probeUnit();
    assert.doesNotMatch(await page.locator('#log').textContent(), /SMOKE_FOUND_RESULT\|/,
      'B inside the quit popup cannot found a base');

    if (action === 'keyboard') await page.keyboard.press('b');
    else await clickCanvas(page, 40, 741); // Visible FOUND BASE command.
    await waitForLog('SMOKE_FOUND_RESULT|1|true');
    await waitForLog('SMOKE_FOUND_UNIT_EXISTS|false');
    await waitForLog('SMOKE_BASE_STATE|2|0|10|8|1');
    assert.equal(await probeUnit(), null, 'The authoritative transaction consumed the pod');
    const foundedLog = await page.locator('#log').textContent();
    const founded = [...foundedLog.matchAll(/SMOKE_BASE_STATE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/g)];
    const latest = new Map(founded.map((match) => [Number(match[1]), match.slice(2).map(Number)]));
    assert.equal(latest.size, 2, 'One additional base exists');
    assert.deepEqual(latest.get(2), [0, 10, 8, 1], 'The new base has the owner, pod tile and one citizen');

    await waitForLog('SMOKE_BASE_PREVIEW|2');
    await clickCanvas(page, 280, 733); // Open the new base's actual preview.
    await waitForBase(2);
    await waitForLog('SMOKE_BASE_OPEN');
    await screenshot('new-base');
    await closeBase();

    await page.keyboard.press('b');
    await clickCanvas(page, 899, 585);
    await waitForLog('SMOKE_TURN|3|2103');
    assert.equal(await probeUnit(), null);
    const finalLog = await page.locator('#log').textContent();
    assert.equal((finalLog.match(/SMOKE_FOUND_RESULT\|1\|true/g) || []).length, 1,
      'Repeated B after consumption cannot create a duplicate base');
    assert.doesNotMatch(finalLog, /GSEParseError|GSETypeError|FATAL ERROR|Aborted\(|Event result listener failed/);
    assert.equal(await page.locator('body').getAttribute('data-state'), 'running', finalLog.slice(-3000));
    await screenshot('next-turn');
    t.diagnostic(`Actual ${action} founding consumed ColonyPod1 at (10,8), created owned base2 with one citizen, opened its screen and continued to turn3.`);
  });
}

test('resource-map clicks reassign a real worker through Doctor and preserve the new yield next turn', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
  timeout: 180000,
}, async (t) => {
  const { page, waitForLog, screenshot, waitForBase, closeBase } = await startGame(t,
    workerWorldScript, 'worker-assignment', {
      mainScript: workerMainScript, map: workerMap(),
      fatal: /worker sent an error!|RuntimeError:|Aborted\(|GSE\w*Error|GSEInvalidCall|FATAL ERROR|Event result listener failed|WORK_GAME_ERROR|WORK_EVENT_REJECTED/,
    });
  const logText = () => page.locator('#log').textContent();
  const occurrences = async (marker) => (await logText()).split(marker).length - 1;
  const snapshot = async () => {
    const log = await logText();
    const done = [...log.matchAll(/WORK_DONE\|(\d+)/g)].at(-1);
    assert.ok(done, 'A complete read-only worker snapshot was emitted after real base rendering');
    const sequence = done[1];
    const rows = (kind) => [...log.matchAll(new RegExp(`WORK_${kind}\\|([^\\r\\n]*)`, 'g'))]
      .map((m) => m[1].split('|')).filter((r) => r[0] === sequence).map((r) => r.slice(1));
    const [b] = rows('BASE');
    assert.ok(b, 'The rendered snapshot includes actual native base state');
    return {
      id: +b[0], owner: +b[1], turn: +b[2], size: +b[3], food: +b[4],
      project: { choice: b[5], minerals: +b[6], processed: +b[7] },
      intake: b.slice(8, 11).map(Number), consumption: b.slice(11, 14).map(Number), facilities: +b[14],
      nutrientFactor: +b[15], cost: +b[16],
      pops: rows('POP').map((p) => ({ id: +p[0], type: p[1], base: +p[2], tile: p.slice(3, 5).map(Number) })),
      worked: rows('WORKED').map((p) => p.map(Number)),
      tiles: rows('TILE').map((p) => ({ xy: p.slice(0, 2).map(Number), worked: p[2] === 'true',
        pop: +p[3], base: +p[4], yield: p.slice(5, 8).map(Number) })),
      labels: rows('RENDER')[0],
    };
  };
  const tileAt = (state, xy) => {
    const tile = state.tiles.find((entry) => entry.xy[0] === xy[0] && entry.xy[1] === xy[1]);
    assert.ok(tile, `The actual radius contains tile ${xy}`);
    return tile;
  };
  const assertRenderedIntake = (state) => {
    assert.equal(state.labels.length, 6, 'The real resource section rendered all three intake/consumption/surplus labels');
    const pad = (n) => String(n).padStart(3, '0');
    for (let i = 0; i < 3; ++i) {
      const surplus = state.intake[i] - state.consumption[i];
      assert.equal(state.labels[i * 2], `${pad(state.intake[i])} - ${pad(state.consumption[i])}`);
      assert.equal(state.labels[i * 2 + 1], `${surplus > 0 ? '+' : surplus < 0 ? '-' : ''}${pad(Math.abs(surplus))}`);
    }
  };
  const assertLinks = (state, citizen, target) => {
    assert.equal(state.pops.length, 1); assert.equal(state.size, 1);
    assert.deepEqual(state.pops[0], { id: citizen, type: target ? 'WORKER' : 'DOCTOR', base: state.id,
      tile: target || [-1, -1] }, 'The same native citizen has the requested type, base and worked-tile backlink');
    assert.deepEqual(state.worked, target ? [target] : [], 'The base worked-tile set agrees with the citizen');
    for (const tile of state.tiles) {
      const selected = target !== null && tile.xy[0] === target[0] && tile.xy[1] === target[1];
      assert.equal(tile.worked, selected, `Base membership for tile ${tile.xy}`);
      assert.equal(tile.pop, selected ? citizen : -1, `Tile-to-citizen backlink for tile ${tile.xy}`);
      assert.equal(tile.base, selected ? state.id : -1, `Tile's citizen belongs to this base at ${tile.xy}`);
    }
    const center = tileAt(state, [8, 8]).yield;
    const worked = target ? tileAt(state, target).yield : [0, 0, 0];
    assert.deepEqual(state.intake, center.map((value, i) => value + worked[i]),
      'Actual intake is the center plus the actual assigned tile yield');
    assertRenderedIntake(state);
  };
  const assertNoAssignmentSideEffects = (before, after) => {
    for (const field of ['id', 'owner', 'turn', 'size', 'food', 'facilities', 'nutrientFactor', 'cost']) assert.equal(after[field], before[field], field);
    assert.deepEqual(after.project, before.project, 'Assignment preserves project, stored minerals and processing marker');
    assert.deepEqual(after.consumption, before.consumption, 'Assignment preserves population consumption');
  };
  const selectScout = async () => {
    const previous = await occurrences('SMOKE_UNIT|1|0');
    await page.keyboard.press('Tab');
    await waitForLog('SMOKE_UNIT|1|0', previous + 1);
  };
  const openBase = async () => {
    const previous = await occurrences('SMOKE_BASE_OPEN');
    await page.keyboard.press('Enter');
    await waitForBase(1);
    await waitForLog('SMOKE_BASE_OPEN', previous + 1);
    return snapshot();
  };
  let initial = await openBase();
  const citizen = initial.pops[0].id;
  assertLinks(initial, citizen, [8, 6]);
  assert.notDeepEqual(tileAt(initial, [8, 6]).yield, tileAt(initial, [10, 8]).yield,
    'The declared northern and eastern terrain produce distinct actual yields');

  // Start a real project so reassignment must preserve more than an idle state.
  await clickCanvas(page, 188, 726);
  await waitForLog('SMOKE_PICKER_OPEN|1');
  await waitForLog('WORK_PICKER_ROW|');
  const tanks = [...(await logText()).matchAll(/WORK_PICKER_ROW\|(\d+)\|RECYCLING_TANKS/g)].at(-1);
  assert.ok(tanks, 'The actual picker exposes the declared facility by stable id');
  const projectRender = await occurrences('WORK_DONE|');
  await clickCanvas(page, 500, 150 + Number(tanks[1]) * 29);
  await clickCanvas(page, 565, 505);
  await waitForLog('SMOKE_PRODUCTION|1|RECYCLING_TANKS|0|');
  await waitForLog('WORK_DONE|', projectRender + 1);
  initial = await snapshot();
  assert.equal(initial.project.choice, 'RECYCLING_TANKS');
  assertLinks(initial, citizen, [8, 6]);
  await screenshot('initial-worker');

  let renders = await occurrences('WORK_DONE|');
  await clickCanvas(page, 512, 130); // North diamond in the actual 100x50 resource map.
  await waitForLog('WORK_EVENT|unwork_base_tile|true');
  await waitForLog('WORK_DONE|', renders + 1);
  const doctor = await snapshot();
  assertLinks(doctor, citizen, null);
  assertNoAssignmentSideEffects(initial, doctor);
  assert.notDeepEqual(doctor.intake, initial.intake, 'Removing the worker changes actual intake and its rendered labels');
  await screenshot('doctor');

  renders = await occurrences('WORK_DONE|');
  await clickCanvas(page, 612, 180); // East diamond, not the base center.
  await waitForLog('WORK_EVENT|work_base_tile|true');
  await waitForLog('WORK_DONE|', renders + 1);
  const assigned = await snapshot();
  assertLinks(assigned, citizen, [10, 8]);
  assertNoAssignmentSideEffects(initial, assigned);
  assert.notDeepEqual(assigned.intake, initial.intake, 'Reassignment uses the distinct eastern yield');
  await screenshot('reassigned-worker');
  await closeBase();
  await selectScout();
  const reopened = await openBase();
  assert.deepEqual(reopened, assigned, 'Closing and reopening preserves native links, project, storage and rendered intake');
  await screenshot('reopened');
  await closeBase();
  await selectScout();

  const pendingMinerals = Math.max(0, assigned.intake[1] - assigned.consumption[1]);
  const pendingFood = assigned.intake[0] - assigned.consumption[0];
  assert.ok(pendingMinerals > initial.intake[1] - initial.consumption[1], 'The eastern worker raises actual mineral surplus');
  assert.ok(assigned.nutrientFactor > 0);
  assert.ok(assigned.food + pendingFood < assigned.nutrientFactor * (assigned.size + 1),
    'This one-turn fixture remains below its actual application growth threshold');
  assert.ok(assigned.cost > 0);
  assert.ok(assigned.project.minerals + pendingMinerals < assigned.cost, 'This one-turn fixture cannot finish the facility');
  await clickCanvas(page, 100, 741);
  await waitForLog('SMOKE_STATUS|turn_complete|0');
  await clickCanvas(page, 899, 585);
  await waitForLog(`SMOKE_TURN|${assigned.turn + 1}|`);
  await waitForLog(`WORK_GROWTH_DONE|1|${assigned.turn + 1}`);
  await waitForLog('SMOKE_STATUS|active|1.0');
  await selectScout();
  const next = await openBase();
  assertLinks(next, citizen, [10, 8]);
  assert.equal(next.turn, assigned.turn + 1);
  assert.equal(next.food, assigned.food + pendingFood, 'The real next-turn growth stage uses reassigned nutrient intake');
  assert.deepEqual(next.project, { choice: assigned.project.choice,
    minerals: assigned.project.minerals + pendingMinerals, processed: next.turn },
  'The real next turn credits exactly the reassigned mineral surplus');
  assert.equal(next.facilities, assigned.facilities);
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running');
  await screenshot('next-turn');
  t.diagnostic(`Actual resource-map mouse input changed citizen ${citizen} from northern Worker to Doctor to eastern Worker, refreshed real intake labels, preserved all three native links across reopening, and credited ${pendingMinerals} minerals/${pendingFood} food on turn ${next.turn}. No assignment commands or resource/population writes were injected; this is GLSMAC application coverage.`);
});
