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
const artifacts = new URL('build/artifacts/', import.meta.url);
const fatal = /worker sent an error!|RuntimeError:|Aborted\(|GSE\w*Error|GSEInvalidCall|FATAL ERROR|Event result listener failed|NORMAL_EVENT_REJECTED/;

function recordedNormalFactors() {
  const witness = (name, predicate) => {
    const cases = JSON.parse(readFileSync(`${root}tools/behavior-tests/cases/${name}.json`, 'utf8')).cases;
    const observations = JSON.parse(readFileSync(`${root}tools/behavior-tests/observations/smacx-gog-2.0-${name}.json`, 'utf8')).observations;
    const item = cases.find(predicate);
    assert.ok(item, `Public ${name} evidence contains the relevant witness`);
    const output = observations.find(({ id }) => id === item.id)?.output;
    assert.ok(output, `Public ${name} witness has a recorded output`);
    return output;
  };
  const rows = witness('starting-unit-components', ({ id }) => id === 'colony-pod-fission-infantry').rows;
  const mineral = witness('human-mineral-factor', ({ input: i }) => i.faction_id === 1 && i.map_size_level === 0
    && i.mineral_rule_factor === 10 && i.industry === 0).factor;
  const nutrient = witness('human-nutrient-factor', ({ input: i }) => i.faction_id === 1 && i.map_size_level === 0
    && i.nutrient_rule_factor === 10 && i.growth === 0).factor;
  assert.deepEqual([rows, mineral, nutrient], [3, 8, 8]);
  // The generated-world lifecycle below is application coverage, outside the
  // bounded component/factor observations and original-input parity counts.
  return { rows, mineral, nutrient, cost: rows * mineral };
}

// Test-only GSE entry. Production menus, settings, random terrain generation,
// world/default, units and commands are unchanged. Every addition observes;
// no game event, selection, setting or random value is supplied by this script.
const normalMain = String.raw`
#main((glsmac) => {
  // Observe the real event boundaries before game/game registers these exact
  // handlers. Return the original rollback data without cloning or replacing it.
  const production_event = #include('game/event/process_base_production');
  const apply_production = production_event.apply;
  production_event.apply = (e) => {
    const base = e.data.base; const before = base.get_production(); const size = base.get_size();
    const result = apply_production(e);
    const after = base.get_production();
    #print('NORMAL_PRODUCTION_BOUNDARY|' + #to_string(base.id) + '|' + #to_string(e.data.turn_id) + '|' + #to_string(size) + '|' + #to_string(base.get_size()) + '|' + #to_string(before.minerals) + '|' + #to_string(e.data.minerals) + '|' + #to_string(after.minerals) + '|' + after.choice_id);
    return result;
  };
  const growth_event = #include('game/event/add_base_pop');
  const apply_growth = growth_event.apply;
  growth_event.apply = (e) => {
    const base = e.data.base; const size = base.get_size();
    let before = base.get('accumulated_nutrients'); if (!#is_defined(before)) { before = 0; }
    const result = apply_growth(e);
    #print('NORMAL_GROWTH_BOUNDARY|' + #to_string(base.id) + '|' + #to_string(e.game.get_turn()) + '|' + #to_string(size) + '|' + #to_string(base.get_size()) + '|' + #to_string(before) + '|' + #to_string(base.get('accumulated_nutrients')) + '|' + #to_string(base.get_nutrient_factor()));
    return result;
  };
  const starvation_event = #include('game/event/remove_base_pop');
  const apply_starvation = starvation_event.apply;
  starvation_event.apply = (e) => {
    const base = e.data.base; const size = base.get_size();
    let before = base.get('accumulated_nutrients'); if (!#is_defined(before)) { before = 0; }
    const result = apply_starvation(e);
    #print('NORMAL_STARVATION_BOUNDARY|' + #to_string(base.id) + '|' + #to_string(e.game.get_turn()) + '|' + #to_string(size) + '|' + #to_string(base.get_size()) + '|' + #to_string(before) + '|' + #to_string(base.get('accumulated_nutrients')) + '|' + #to_string(base.get_nutrient_factor()));
    return result;
  };
  const growth_stage = #include('game/event/process_base_growth');
  const apply_growth_stage = growth_stage.apply;
  growth_stage.apply = (e) => {
    const base = e.data.base; const size = base.get_size();
    let before = base.get('accumulated_nutrients'); if (!#is_defined(before)) { before = 0; }
    const pending = e.game.get('f_base_get_pending_growth')(base);
    const factor = base.get_nutrient_factor();
    const result = apply_growth_stage(e);
    let after = base.get('accumulated_nutrients'); if (!#is_defined(after)) { after = 0; }
    #print('NORMAL_GROWTH_STAGE|' + #to_string(base.id) + '|' + #to_string(e.data.turn_id) + '|' + #to_string(size) + '|' + #to_string(base.get_size()) + '|' + #to_string(before) + '|' + #to_string(pending) + '|' + #to_string(factor) + '|' + #to_string(after));
    return result;
  };
  #include('game/game')(glsmac);
  #include('ui/ui')(glsmac);
  let report_base = null;
  const middle = #include('ui/parts/game/popup/base_screen/bottom_bar/middle_area');
  const set_middle = middle.set;
  middle.set = (data) => {
    const result = set_middle(data);
    if (report_base != null) { report_base(data.base); }
    #print('NORMAL_BASE_RENDER|' + #to_string(data.base.id));
    return result;
  };
  const popups = #include('ui/parts/game/popup/popup');
  const base_screen = #include('ui/parts/game/popup/base_screen');
  const production_panel = #include('ui/parts/game/popup/base_screen/bottom_bar/production');
  const set_production = production_panel.set;
  production_panel.set = (data) => {
    const result = set_production(data);
    if (report_base != null) { report_base(data.base); }
    #print('NORMAL_PROJECT_RENDER|' + #to_string(data.base.id) + '|' + production_panel.production_title.text + '|' + production_panel.production_amount.text + '|' + production_panel.production_label.text);
    return result;
  };
  const show_picker = base_screen.show_production_selection;
  base_screen.show_production_selection = () => {
    const result = show_picker();
    if (base_screen.production_selection != null) {
      #print('NORMAL_PICKER_OPEN|' + #to_string(base_screen.base_id));
      let index = 0;
      for (choice of base_screen.get_production_choices()) {
        #print('NORMAL_PICKER_ROW|' + #to_string(index) + '|' + choice.id + '|' + #to_string(choice.cost));
        index++;
      }
    }
    return result;
  };
  const hide_picker = base_screen.hide_production_selection;
  base_screen.hide_production_selection = () => {
    const open = base_screen.production_selection != null; const result = hide_picker();
    if (open) { #print('NORMAL_PICKER_CLOSED'); }
    return result;
  };
  const show_base = base_screen.on_show;
  base_screen.on_show = () => {
    const result = show_base();
    const base_id = base_screen.base_id;
    popups.popups.base_screen.el.timer(10, () => {
      if (popups.sliding_timer == null && popups.is_shown()) {
        #print('NORMAL_BASE_OPEN|' + #to_string(base_id));
        return false;
      }
      return true;
    });
    return result;
  };
  const hide_base = base_screen.on_hide;
  base_screen.on_hide = () => {
    const result = hide_base();
    const base_id = base_screen.base_id;
    popups.popups.base_screen.el.timer(10, () => {
      // finish_hide clears the popup after its real animation and releases
      // modal input ownership. An on_hide invocation alone is not completion.
      if (popups.sliding_timer == null && !popups.is_shown()) {
        #print('NORMAL_BASE_HIDDEN|' + #to_string(base_id));
        return false;
      }
      return true;
    });
    return result;
  };
  const objects = #include('ui/parts/game/bottom_bar/objects_list');
  glsmac.on('configure_game', (e) => {
    const game = e.game;
    let status = 'none';
    report_base = (base) => {
      const production = base.get_production();
      let food = base.get('accumulated_nutrients'); if (!#is_defined(food)) { food = 0; }
      #print('NORMAL_ECONOMY|' + #to_string(base.id) + '|' + #to_string(base.get_size()) + '|' + #to_string(food) + '|' + #to_string(game.get('f_base_get_pending_growth')(base)) + '|' + #to_string(base.get_nutrient_factor()) + '|' + #to_string(game.get('f_base_get_pending_production')(base)) + '|' + production.choice_id + '|' + #to_string(production.minerals) + '|' + #to_string(production.last_processed_turn));
    };
    game.on('configure', (e) => {
      game.get_um().on('unit_spawn', (e) => {
        const unit = e.unit;
        #print('NORMAL_SPAWN|' + #to_string(unit.id) + '|' + unit.def + '|' + #to_string(unit.owner) + '|' + #to_string(unit.tile.x) + '|' + #to_string(unit.tile.y) + '|' + #to_string(game.get_turn()));
      });
    });
    game.on('error', (e) => { #print('NORMAL_GAME_ERROR'); });
    game.on('event_result', (e) => { if (!e.success) { #print('NORMAL_EVENT_REJECTED|' + e.name); } });
    game.on('turn_status', (e) => { status = e.status; });
    game.on('unit_select', (e) => {
      #print('NORMAL_UNIT_SELECTED|' + #to_string(e.unit.id) + '|' + #to_string(e.unit.owner));
    });
    game.on('base_select', (e) => {
      #print('NORMAL_BASE_SELECTED|' + #to_string(e.base.id) + '|' + #to_string(e.base.get_owner().id));
    });
    game.on('turn', (e) => {
      #print('NORMAL_TURN|' + #to_string(game.get_turn()) + '|' + #to_string(e.year));
    });
    game.on('start_ui', (e) => {
      #async(0, () => {
        glsmac.ui.root.on('keydown', (e) => {
          if (e.code != 'P' || e.modifiers != {}) { return false; }
          const owner = game.get_player();
          const tm = game.get_tm();
          #print('NORMAL_PROBE_BEGIN');
          #print('NORMAL_WORLD|' + #to_string(tm.get_map_width()) + '|' + #to_string(tm.get_map_height()) + '|' + #to_string(owner.id) + '|' + owner.get_faction().id + '|' + #to_string(game.get_turn()));
          #print('NORMAL_STATUS|' + status);
          #print('NORMAL_SELECTION|' + #to_string(objects.selected_type) + '|' + #to_string(objects.selected_id));
          for (base of game.get_bm().get_bases()) {
            if (base.get_owner().id == owner.id) {
              const tile = base.get_tile();
              #print('NORMAL_BASE|' + #to_string(base.id) + '|' + #to_string(base.get_owner().id) + '|' + #to_string(tile.x) + '|' + #to_string(tile.y) + '|' + #to_string(base.get_size()) + '|' + #to_string(base.has_facility('HEADQUARTERS')) + '|' + #to_string(tile.is_land));
              report_base(base);
              for (unit of tile.get_units()) {
                if (unit.owner == owner.id) {
                  #print('NORMAL_UNIT|' + #to_string(unit.id) + '|' + unit.def + '|' + #to_string(unit.owner) + '|' + #to_string(unit.movement) + '|' + #to_string(unit.tile.x) + '|' + #to_string(unit.tile.y));
                }
              }
            }
          }
          for (choice of owner.get_production_choices()) {
            if (choice.id == 'COLONY_POD') {
              #print('NORMAL_RECIPE|' + choice.id + '|' + choice.unit_id + '|' + #to_string(choice.cost) + '|' + #to_string(choice.population_cost));
            }
          }
          const popup_id = popups.popup == null ? 'none' : popups.popup.id;
          #print('NORMAL_POPUP|' + popup_id + '|' + #to_string(popups.is_shown()) + '|' + #to_string(popups.sliding_timer == null));
          #print('NORMAL_PROBE_DONE');
          return true;
        });
        #print('NORMAL_UI_READY');
        return false;
      });
    });
  });
  glsmac.run();
});
`;

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

async function clickCanvas(page, x, y) {
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width * x / 1024, box.y + box.height * y / 768);
}

test('normal Tiny gameplay grows naturally and produces a new Colony Pod through real turns', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
  timeout: 180000,
}, async (t) => {
  const factors = recordedNormalFactors();
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
  const recordError = (error) => {
    errors.push(error?.stack || String(error));
    page.evaluate(() => { globalThis.__normalGameError = true; }).catch(() => {});
  };
  page.on('pageerror', recordError);
  page.on('console', (message) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(message.text())) recordError(message.text());
  });
  t.after(async () => {
    try {
      const log = await page.locator('#log').textContent({ timeout: 1000 }).catch(() => 'Engine log unavailable');
      writeFileSync(new URL('normal-game-log.txt', artifacts), log);
      await page.locator('#canvas').screenshot({ path: fileURLToPath(new URL('normal-game-final.png', artifacts)), timeout: 3000 }).catch(() => {});
      t.diagnostic(log.slice(-16000));
      if (errors.length) t.diagnostic(errors.join('\n'));
    } finally { await browser.close(); }
  });
  const healthy = async () => {
    assert.deepEqual(errors, [], 'No browser runtime or graphics errors');
    assert.equal(await page.locator('body').getAttribute('data-state'), 'running');
    assert.doesNotMatch(await page.locator('#log').textContent(), fatal);
    assert.doesNotMatch(await page.locator('#log').textContent(), /NORMAL_GAME_ERROR/);
  };
  const waitLog = async (text, count = 1, timeout = 60000) => {
    try {
      await page.waitForFunction(({ text, count, fatalSource }) => globalThis.__normalGameError
        || document.body.dataset.state === 'failed'
        || new RegExp(fatalSource).test(document.querySelector('#log').textContent)
        || document.querySelector('#log').textContent.includes('NORMAL_GAME_ERROR')
        || document.querySelector('#log').textContent.split(text).length - 1 >= count,
      { text, count, fatalSource: fatal.source }, { timeout });
    } catch (error) {
      throw new Error(`Waiting for ${text} failed.\n${(await page.locator('#log').textContent()).slice(-16000)}`, { cause: error });
    }
    await healthy();
    assert.ok((await page.locator('#log').textContent()).split(text).length - 1 >= count, `Actual engine emitted ${text}`);
  };
  const screenshot = async (name) => {
    await healthy();
    await page.waitForTimeout(250);
    return page.locator('#canvas').screenshot({ path: fileURLToPath(new URL(`normal-game-${name}.png`, artifacts)) });
  };
  // Production sliding menus have the same bottom button anchor. Require an
  // actual transition, stationary frames and visible controls before input.
  const menuReady = async (name) => {
    let previous;
    let stable = 0;
    let visible = false;
    for (let frame = 0; frame < 60 && (stable < 2 || !visible); ++frame) {
      await healthy();
      const png = PNG.sync.read(await page.locator('#canvas').screenshot());
      stable = previous?.equals(png.data) ? stable + 1 : 0;
      previous = png.data;
      let green = 0;
      for (let y = 719; y < 742; ++y) for (let x = 700; x < 940; ++x) {
        const at = (Math.floor(y * png.height / 768) * png.width + Math.floor(x * png.width / 1024)) * 4;
        const [r, g, b] = png.data.subarray(at, at + 3);
        if (g > r + 4 && r < 70 && g < 100 && b < 70) ++green;
      }
      visible = green > 23 * 240 * 0.6;
      if (stable < 2 || !visible) await page.waitForTimeout(100);
    }
    assert.ok(stable >= 2 && visible, `Production ${name} menu finished its animation`);
    await screenshot(name);
  };
  const chooseMenu = async (count, index, next) => {
    const before = PNG.sync.read(await page.locator('#canvas').screenshot()).data;
    await clickCanvas(page, 820, 732 - 70 * (count - 1 - index));
    let changed = 0;
    for (let frame = 0; frame < 60 && changed < 30000; ++frame) {
      await healthy();
      const after = PNG.sync.read(await page.locator('#canvas').screenshot()).data;
      changed = 0;
      for (let at = 0; at < after.length; at += 4) if (before.readUInt32LE(at) !== after.readUInt32LE(at)) ++changed;
      if (changed < 30000) await page.waitForTimeout(100);
    }
    assert.ok(changed >= 30000, `Real canvas click transitioned to ${next}`);
    if (next !== 'faction') await menuReady(next);
  };
  const factionReady = async () => {
    let previous;
    let stable = 0;
    let visible = false;
    for (let frame = 0; frame < 60 && (stable < 2 || !visible); ++frame) {
      await healthy();
      const png = PNG.sync.read(await page.locator('#canvas').screenshot());
      stable = previous?.equals(png.data) ? stable + 1 : 0;
      previous = png.data;
      const border = (edge) => {
        for (let dy = -3; dy <= 3; ++dy) {
          let green = 0;
          let count = 0;
          for (let x = 280; x < 744; x += 2) {
            const at = (Math.floor((edge + dy) * png.height / 768) * png.width + Math.floor(x * png.width / 1024)) * 4;
            const [r, g, b] = png.data.subarray(at, at + 3);
            if (Math.abs(r - 73) < 5 && Math.abs(g - 108) < 5 && Math.abs(b - 61) < 5) ++green;
            ++count;
          }
          if (green > count * 0.8) return true;
        }
        return false;
      };
      visible = border(214) && border(553);
      if (stable < 2 || !visible) await page.waitForTimeout(100);
    }
    assert.ok(stable >= 2 && visible, 'The production faction picker is visible and stationary');
    await screenshot('faction');
  };
  const economies = (log) => [...log.matchAll(/NORMAL_ECONOMY\|(\d+)\|(\d+)\|(-?\d+)\|(-?\d+)\|(\d+)\|(\d+)\|([^|\n]*)\|(\d+)\|(\d+)/g)]
    .map((m) => ({ id: +m[1], size: +m[2], food: +m[3], pendingFood: +m[4], factor: +m[5], pendingMinerals: +m[6], choice: m[7], minerals: +m[8], processed: +m[9] }));
  const growthSettlement = (log, state, baseId) => {
    const stages = [...log.matchAll(/NORMAL_GROWTH_STAGE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(-?\d+)\|(-?\d+)\|(\d+)\|(-?\d+)/g)]
      .filter((m) => +m[1] === baseId && +m[2] === state.turn);
    if (!stages.length) return { baseId, settled: false };
    assert.equal(stages.length, 1, 'Each actual base has one growth stage per turn');
    const m = stages[0];
    const stage = { baseId, turn: +m[2], size: +m[3], sizeAfter: +m[4], foodBefore: +m[5], pendingFood: +m[6], factor: +m[7], foodAfter: +m[8] };
    const accumulated = stage.foodBefore + stage.pendingFood;
    const threshold = stage.factor * (stage.size + 1);
    const action = accumulated < 0 ? 'STARVATION' : (stage.size === 0 || accumulated >= threshold ? 'GROWTH' : null);
    assert.equal(stage.sizeAfter, stage.size, 'The actual stage queues population changes without applying its child inline');
    assert.equal(stage.foodAfter, accumulated < 0 ? stage.foodBefore : accumulated, 'Actual stage food follows its post-production population and surplus');
    let expectedSize = stage.size, expectedFood = stage.foodAfter;
    if (action !== null) {
      const children = [...log.matchAll(/NORMAL_(GROWTH|STARVATION)_BOUNDARY\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(-?\d+)\|(-?\d+)\|(\d+)/g)]
        .filter((entry) => entry[1] === action && +entry[2] === baseId && +entry[3] === state.turn);
      if (!children.length) return { ...stage, action, settled: false };
      assert.equal(children.length, 1, 'A growth decision commits exactly one matching actual population child');
      const child = children[0];
      expectedSize += action === 'GROWTH' ? 1 : -1;
      expectedFood = Math.max(0, stage.foodAfter - threshold);
      assert.equal(+child[4], stage.size, 'The population child begins with the stage population');
      assert.equal(+child[5], expectedSize, 'The actual child applies the growth or starvation decision');
      assert.equal(+child[6], stage.foodAfter, 'The child starts from actual stage food');
      assert.equal(+child[7], expectedFood, 'The actual child retains the application food overflow');
      assert.equal(+child[8], stage.factor);
    }
    const current = state.economies.find((e) => e.id === baseId);
    return { ...stage, action, expectedSize, expectedFood,
      settled: current?.size === expectedSize && current?.food === expectedFood };
  };
  const probe = async (timeout = 60000) => {
    const before = await page.locator('#log').textContent();
    const count = before.split('NORMAL_PROBE_DONE').length - 1;
    await page.keyboard.press('p');
    await waitLog('NORMAL_PROBE_DONE', count + 1, timeout);
    const fullLog = await page.locator('#log').textContent();
    const log = fullLog.split('NORMAL_PROBE_BEGIN').at(-1);
    const world = log.match(/NORMAL_WORLD\|(\d+)\|(\d+)\|(\d+)\|([^|\n]+)\|(\d+)/);
    assert.ok(world, 'Actual generated world state is readable');
    const selection = log.match(/NORMAL_SELECTION\|([^|\n]+)\|([^|\n]+)/);
    const state = { width: +world[1], height: +world[2], owner: +world[3], faction: world[4], turn: +world[5],
      status: log.match(/NORMAL_STATUS\|([^\n\r]+)/)[1],
      selected: selection[1] === 'Unit' ? +selection[2] : null,
      bases: [...log.matchAll(/NORMAL_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(true|false)\|(true|false)/g)]
        .map((m) => ({ id: +m[1], owner: +m[2], x: +m[3], y: +m[4], size: +m[5], hq: m[6] === 'true', land: m[7] === 'true' })),
      economies: economies(log),
      units: [...log.matchAll(/NORMAL_UNIT\|(\d+)\|([^|\n]+)\|(\d+)\|([0-9.]+)\|(\d+)\|(\d+)/g)]
        .map((m) => ({ id: +m[1], def: m[2], owner: +m[3], movement: +m[4], x: +m[5], y: +m[6] })),
      baseOpen: /NORMAL_POPUP\|base_screen\|true\|true/.test(log),
      popupClosed: /NORMAL_POPUP\|[^|\n]+\|false\|true/.test(log) };
    state.growth = state.bases.map((base) => growthSettlement(fullLog, state, base.id));
    return state;
  };
  const waitState = async (predicate, description) => {
    const deadline = Date.now() + 60000;
    let state;
    do {
      state = await probe(Math.max(1, deadline - Date.now()));
      if (predicate(state)) return state;
      await page.waitForTimeout(100);
    } while (Date.now() < deadline);
    assert.fail(`${description}: ${JSON.stringify(state)}`);
  };
  const countLog = async (text) => (await page.locator('#log').textContent()).split(text).length - 1;
  const closeBase = async (id) => {
    const previous = await countLog(`NORMAL_BASE_HIDDEN|${id}`);
    await page.keyboard.press('Escape'); await waitLog(`NORMAL_BASE_HIDDEN|${id}`, previous + 1);
  };
  const openBase = async (id) => {
    const previous = await countLog(`NORMAL_BASE_OPEN|${id}`);
    await page.keyboard.press('Tab');
    await waitState((s) => s.units.some((u) => u.id === s.selected && u.movement > 0), 'A real active unit can open its base');
    await page.keyboard.press('Enter'); await waitLog(`NORMAL_BASE_OPEN|${id}`, previous + 1);
  };
  const advanceProductionTurn = async (baseId) => {
    let state = await probe(); const previousTurn = state.turn;
    const activeCount = state.units.filter((u) => u.movement > 0).length;
    for (let index = 0; index < activeCount; ++index) {
      await page.keyboard.press('Tab');
      state = await waitState((s) => s.units.some((u) => u.id === s.selected && u.movement > 0), 'A live active unit is selected for a real skip');
      const id = state.selected;
      await page.keyboard.press('Space');
      state = await waitState((s) => s.units.some((u) => u.id === id && u.movement === 0), 'Real Space exhausts the selected unit');
    }
    await waitState((s) => s.status === 'turn_complete' && s.units.every((u) => u.movement === 0), 'All actual units finish this production turn');
    await clickCanvas(page, 899, 585);
    return waitState((s) => s.turn === previousTurn + 1 && s.status === 'active'
      && s.economies.some((e) => e.id === baseId && e.processed === s.turn)
      && s.growth.some((g) => g.baseId === baseId && g.settled), 'Actual production, growth stage and any population child have committed');
  };

  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  if (process.env.WASM_SITE_URL) {
    await page.locator('#asset-source').selectOption('local');
    await page.locator('#assets').setInputFiles(assets);
  } else {
    await page.locator('#asset-source').selectOption('remote');
    await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  }
  await page.evaluate(({ scripts, normalMain }) => {
    for (const [name, source] of Object.entries(scripts)) {
      if (!/^GLSMAC_data\/default\/[a-zA-Z0-9_./-]+\.gls\.js$/.test(name) || name.includes('..')) throw new Error('Invalid production snapshot path');
      const destination = `/normal-snapshot/${name}`;
      Module.FS.mkdirTree(destination.slice(0, destination.lastIndexOf('/')));
      Module.FS.writeFile(destination, source);
    }
    Module.FS.writeFile('/normal-snapshot/GLSMAC_data/default/browser_normal_main.gls.js', normalMain);
    const callMain = Module.callMain;
    Module.callMain = (args) => callMain([...args, '--skipintro', '--datapath', '/normal-snapshot/GLSMAC_data', '--mainscript', 'browser_normal_main']);
  }, { scripts, normalMain });
  await page.locator('#start').click();
  await page.waitForFunction(() => document.body.dataset.state === 'running' || document.body.dataset.state === 'failed');
  await menuReady('main');
  await chooseMenu(7, 0, 'map-type'); // Start Game
  await chooseMenu(5, 0, 'map-size'); // Make Random Map
  await chooseMenu(6, 0, 'difficulty'); // Named Tiny Planet preset
  await chooseMenu(6, 0, 'rules'); // Citizen
  await chooseMenu(3, 0, 'faction'); // Play with Standard Rules
  // The real faction choice list starts at Random.
  // Wait for its opaque green border, which cannot be the previous menu.
  await factionReady();
  await clickCanvas(page, 512, 310); // Gaians, the row following Random
  await clickCanvas(page, 390, 538); // Start
  await waitLog('NORMAL_UI_READY');
  const initial = await waitState((s) => s.selected !== null && s.status === 'active'
    && s.bases.length > 0 && s.growth.every((g) => g.settled), 'Initial owned unit becomes selectable after starting population settles');
  assert.deepEqual([initial.width, initial.height], [68, 34], 'The named Tiny preset generated its actual dimensions');
  assert.equal(initial.faction, 'GAIANS', 'The actual faction picker selected Gaians');
  assert.equal(initial.bases.length, 1, 'Normal world startup creates one local Headquarters');
  const headquarters = initial.bases[0];
  assert.ok(headquarters.hq && headquarters.land && headquarters.size === 1 && headquarters.owner === initial.owner);
  assert.deepEqual(initial.units.map((u) => u.def).sort(), ['ColonyPod', 'MindWorms'], 'Normal world startup supplies the functional land pod and scout');
  for (const unit of initial.units) {
    assert.ok(unit.movement > 0 && unit.owner === initial.owner);
    assert.deepEqual([unit.x, unit.y], [headquarters.x, headquarters.y]);
  }
  assert.ok(initial.units.some((u) => u.id === initial.selected), 'The actual first selection is a live owned starting unit');
  await waitLog(`NORMAL_UNIT_SELECTED|${initial.selected}|${initial.owner}`);
  const terrain = PNG.sync.read(await screenshot('generated-terrain'));
  let visible = 0;
  for (let at = 0; at < terrain.width * Math.min(500, terrain.height) * 4; at += 4) if (terrain.data[at] + terrain.data[at + 1] + terrain.data[at + 2] > 12) ++visible;
  assert.ok(visible > terrain.width * Math.min(500, terrain.height) / 5, 'Generated terrain fills the actual playfield');
  assert.deepEqual(await page.evaluate(() => [...Module.assetStore.loaded].filter((name) => /\.mp$/i.test(name))), [], 'Normal startup generated terrain without loading a map file');
  await page.keyboard.press('Enter');
  await waitLog(`NORMAL_BASE_SELECTED|${headquarters.id}|${initial.owner}`);
  await waitLog(`NORMAL_BASE_RENDER|${headquarters.id}`);
  // Modal windows consume P before it reaches the root observer. Observe the
  // actual popup completion; P probes remain outside the modal input boundary.
  await waitLog(`NORMAL_BASE_OPEN|${headquarters.id}`);
  await screenshot('headquarters');
  await page.keyboard.press('Escape');
  await waitLog(`NORMAL_BASE_HIDDEN|${headquarters.id}`);
  await waitState((s) => s.popupClosed, 'Headquarters screen closes');
  const skipped = new Set();
  for (let index = 0; index < initial.units.length; ++index) {
    await page.keyboard.press('Tab');
    const selected = await waitState((s) => s.units.some((u) => u.id === s.selected && u.movement > 0), 'Tab selects an active owned unit');
    assert.ok(!skipped.has(selected.selected), 'Each real skip acts on a different active starting unit');
    skipped.add(selected.selected);
    await page.keyboard.press('Space');
    await waitState((s) => s.units.some((u) => u.id === selected.selected && u.movement === 0), 'Space exhausts the selected actual unit');
  }
  await waitState((s) => s.status === 'turn_complete' && s.units.every((u) => u.movement === 0), 'All actual owned starting units finish their turn');
  await clickCanvas(page, 899, 585); // Real TURN COMPLETE control
  const next = await waitState((s) => s.turn === initial.turn + 1 && s.status === 'active'
    && s.units.length === initial.units.length && s.units.every((u) => u.movement > 0)
    && s.growth.every((g) => g.settled), 'Next turn advances, replenishes actual units and settles growth');
  for (const before of initial.units) {
    const after = next.units.find((u) => u.id === before.id);
    assert.deepEqual(after, before, 'The next turn replenishes movement and preserves each actual starting unit');
  }
  await screenshot('next-turn');
  await page.keyboard.press('Tab');
  await waitState((s) => s.units.some((u) => u.id === s.selected && u.movement > 0), 'A replenished unit remains selectable');
  const previousRenders = (await page.locator('#log').textContent()).split(`NORMAL_BASE_RENDER|${headquarters.id}`).length - 1;
  const previousOpens = (await page.locator('#log').textContent()).split(`NORMAL_BASE_OPEN|${headquarters.id}`).length - 1;
  assert.ok(next.bases.some((b) => b.id === headquarters.id && b.owner === initial.owner), 'The next turn preserves the actual owned Headquarters');
  await page.keyboard.press('Enter');
  await waitLog(`NORMAL_BASE_RENDER|${headquarters.id}`, previousRenders + 1);
  await waitLog(`NORMAL_BASE_OPEN|${headquarters.id}`, previousOpens + 1);
  await screenshot('base-after-next-turn');

  // This remains the normal generated world. Select the real land-unit recipe
  // at size one, then let actual food/worker output and native credits run.
  await waitLog(`NORMAL_RECIPE|COLONY_POD|ColonyPod|${factors.cost}|1`);
  const pickerOpens = await countLog(`NORMAL_PICKER_OPEN|${headquarters.id}`);
  await clickCanvas(page, 188, 726);
  await waitLog(`NORMAL_PICKER_OPEN|${headquarters.id}`, pickerOpens + 1);
  const pickerLog = (await page.locator('#log').textContent()).split(`NORMAL_PICKER_OPEN|${headquarters.id}`).at(-1);
  const rows = [...pickerLog.matchAll(/NORMAL_PICKER_ROW\|(\d+)\|([^|\n]+)\|(\d+)/g)];
  const podRow = rows.find((m) => m[2] === 'COLONY_POD');
  assert.ok(podRow, 'The actual normal-game picker offers Colony Pod');
  assert.equal(+podRow[3], factors.cost, 'Actual Tiny pod cost is the public three-row component times the public eight-mineral factor');
  await clickCanvas(page, 500, 150 + 29 * +podRow[1]);
  const pickerClosed = await countLog('NORMAL_PICKER_CLOSED');
  const projectRenders = await countLog(`NORMAL_PROJECT_RENDER|${headquarters.id}|Colony Pod|`);
  await clickCanvas(page, 565, 505);
  await waitLog('NORMAL_PICKER_CLOSED', pickerClosed + 1);
  await waitLog(`NORMAL_PROJECT_RENDER|${headquarters.id}|Colony Pod|`, projectRenders + 1);
  await screenshot('natural-project-selected');
  await closeBase(headquarters.id);
  let natural = await probe();
  const selectedProject = natural.economies.find((e) => e.id === headquarters.id);
  assert.equal(selectedProject.size, 1, 'The actual normal game selects the project before population growth');
  assert.equal(selectedProject.choice, 'COLONY_POD');
  assert.equal(selectedProject.minerals, 0, 'Normal construction starts without seeded minerals');
  assert.equal(selectedProject.factor, factors.nutrient, 'Actual Tiny nutrient factor agrees with the public no-base factor value');
  assert.ok(selectedProject.pendingMinerals > 0, 'The unmodified start has actual mineral production');
  assert.ok(selectedProject.pendingFood > 0, 'The unmodified start can grow naturally');
  const initialCreditEstimate = Math.ceil(factors.cost / selectedProject.pendingMinerals);
  const initialGrowthEstimate = Math.max(0, Math.ceil((selectedProject.factor * (selectedProject.size + 1) - selectedProject.food) / selectedProject.pendingFood));
  // A valid one-mineral start can take 24 credit turns; growth/worker changes
  // and completion-before-growth need additional room. This fixed first-run
  // ceiling retains the original 180s case deadline and every 60s wait bound.
  const naturalTurnLimit = 32;
  t.diagnostic(`Natural starting food ${selectedProject.food}, surplus ${selectedProject.pendingFood}, factor ${selectedProject.factor}, mineral surplus ${selectedProject.pendingMinerals}; initial growth/credit estimates ${initialGrowthEstimate}/${initialCreditEstimate} turns, fixed ceiling ${naturalTurnLimit}.`);
  const starterIds = new Set(initial.units.map((u) => u.id));
  let completedPod = null;
  let productionTurns = 0;
  let growthSeen = false;
  while (!completedPod && productionTurns < naturalTurnLimit) {
    const before = natural.economies.find((e) => e.id === headquarters.id);
    natural = await advanceProductionTurn(headquarters.id); ++productionTurns;
    const log = await page.locator('#log').textContent();
    const boundaries = [...log.matchAll(/NORMAL_PRODUCTION_BOUNDARY\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|([^|\r\n]*)/g)];
    const boundary = boundaries.find((m) => +m[1] === headquarters.id && +m[2] === natural.turn);
    assert.ok(boundary, 'The actual production handler emitted its before/after snapshot for this turn');
    const beforePopulation = +boundary[3], afterPopulation = +boundary[4];
    const mineralsBefore = +boundary[5], credit = +boundary[6], mineralsAfter = +boundary[7], choiceAfter = boundary[8];
    assert.equal(mineralsBefore, before.minerals, 'The production boundary starts with previously observed actual minerals');
    assert.equal(credit, before.pendingMinerals, 'Native production credits the actual pre-growth mineral surplus');
    const completes = beforePopulation >= 2 && mineralsBefore + credit >= factors.cost;
    assert.equal(mineralsAfter, mineralsBefore + credit - (completes ? factors.cost : 0), 'Each actual credit preserves exact overflow and spends the cost only at completion');
    assert.equal(afterPopulation, beforePopulation - (completes ? 1 : 0), 'The production boundary consumes exactly one citizen on completion');
    assert.equal(choiceAfter, completes ? '' : 'COLONY_POD', 'A waiting project remains active and completion clears it');
    const settledGrowth = natural.growth.find((g) => g.baseId === headquarters.id);
    assert.ok(settledGrowth.settled, 'The observed growth stage and any actual child are complete');
    assert.equal(settledGrowth.size, afterPopulation, 'Growth observes actual post-production population');
    assert.equal(settledGrowth.foodBefore, before.food, 'Growth starts from previously observed actual food');
    const current = natural.economies.find((e) => e.id === headquarters.id);
    assert.equal(current.minerals, mineralsAfter); assert.equal(current.choice, choiceAfter);
    const newPods = natural.units.filter((u) => u.def === 'ColonyPod' && !starterIds.has(u.id));
    assert.equal(newPods.length, completes ? 1 : 0, 'Only actual project completion creates a distinct additional Colony Pod');
    const growth = [...log.matchAll(/NORMAL_GROWTH_BOUNDARY\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(-?\d+)\|(-?\d+)\|(\d+)/g)]
      .filter((m) => +m[1] === headquarters.id && +m[3] >= 1);
    for (const event of growth) {
      assert.equal(+event[4], +event[3] + 1, 'Natural growth adds a real citizen at its actual handler boundary');
      assert.equal(+event[7], factors.nutrient);
      const threshold = +event[7] * (+event[3] + 1);
      assert.ok(+event[5] >= threshold, 'Natural food reached the application growth threshold');
      assert.equal(+event[6], +event[5] - threshold, 'Actual growth retains its exact food overflow');
    }
    if (completes) {
      completedPod = newPods[0];
      assert.equal(completedPod.owner, initial.owner);
      assert.deepEqual([completedPod.x, completedPod.y], [headquarters.x, headquarters.y]);
      const spawn = [...log.matchAll(/NORMAL_SPAWN\|(\d+)\|ColonyPod\|(\d+)\|(\d+)\|(\d+)\|(\d+)/g)]
        .find((m) => +m[1] === completedPod.id);
      assert.ok(spawn, 'The actual native unit manager emitted the new pod spawn');
      assert.equal(+spawn[5], natural.turn);
      assert.ok(growth.length > 0, 'A real natural citizen growth preceded the construction from a size-one start');
    } else if (growth.length > 0 && !growthSeen) {
      await openBase(headquarters.id); await screenshot('natural-growth'); await closeBase(headquarters.id);
      natural = await probe();
    }
    growthSeen = growthSeen || growth.length > 0;
  }
  assert.ok(completedPod, `The unmodified normal start completes a new Colony Pod within ${naturalTurnLimit} real production turns`);
  assert.equal(natural.units.length, initial.units.length + 1);
  for (const starter of initial.units) {
    const current = natural.units.find((u) => u.id === starter.id);
    assert.ok(current, 'Both original starting units survive natural construction');
    assert.deepEqual([current.owner, current.x, current.y], [starter.owner, starter.x, starter.y]);
  }
  await openBase(headquarters.id);
  await screenshot('natural-project-complete');
  await healthy();
  t.diagnostic(`Production menus chose Tiny Planet and Gaians; generation created ${initial.width}x${initial.height} terrain, Headquarters ${headquarters.id} at (${headquarters.x},${headquarters.y}) and ${initial.units.length} starting units. Existing turn ${initial.turn}→${next.turn} selection/replenishment/base checks passed. Then real picker and ${productionTurns} natural production turns grew a citizen and produced distinct owned pod ${completedPod.id} at cost ${factors.cost}, cleared the project and retained ${natural.economies.find((e) => e.id === headquarters.id).minerals} minerals. No RNG, world, population or mineral overrides; GLSMAC application coverage outside original-input parity counts.`);
});
