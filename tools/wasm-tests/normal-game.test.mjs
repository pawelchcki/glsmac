import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { alternateWorldRows, overrideRulesAsset, syntheticNutrientRules, replaceStartingTechnology } from './rules-asset-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = new URL('build/artifacts/', import.meta.url);
const fatal = /worker sent an error!|RuntimeError:|Aborted\(|GSE\w*Error|GSEInvalidCall|FATAL ERROR|Event result listener failed|NORMAL_EVENT_REJECTED/;

function recordedNormalFactors(level = 0, nutrientRule = 10, mineralRule = 10, growth = 0, industry = 0) {
  const witness = (name, predicate) => {
    const cases = JSON.parse(readFileSync(`${root}tools/behavior-tests/cases/${name}.json`, 'utf8')).cases;
    const observations = JSON.parse(readFileSync(`${root}tools/behavior-tests/observations/smacx-gog-2.0-${name}.json`, 'utf8')).observations;
    let item = cases.find(predicate);
    let evidence = observations;
    if (!item) {
      const calibrated = 'human-calibrated-zero-witnesses-v2';
      const extra = JSON.parse(readFileSync(`${root}tools/behavior-tests/cases/${calibrated}.json`, 'utf8')).cases;
      item = extra.find(predicate);
      evidence = JSON.parse(readFileSync(`${root}tools/behavior-tests/observations/smacx-gog-2.0-${calibrated}.json`, 'utf8')).observations;
    }
    assert.ok(item, `Public ${name} evidence contains the relevant witness`);
    const output = evidence.find(({ id }) => id === item.id)?.output;
    assert.ok(output, `Public ${name} witness has a recorded output`);
    return output;
  };
  const rows = witness('starting-unit-components', ({ id }) => id === 'colony-pod-fission-infantry').rows;
  const mineral = level === 99 ? witness('custom-map-human-factors-v2', ({ algorithm, input: i }) => algorithm === 'economy.custom_map_mineral_factor.v2'
    && i.faction_id === 1 && i.mineral_rule_factor === mineralRule && i.industry === industry).factor
    : witness('human-industry-mineral-factor-v2', ({ input: i }) => i.faction_id === 1 && i.map_size_level === level
    && i.mineral_rule_factor === mineralRule && i.industry === industry).factor;
  const nutrient = level === 99 ? witness('custom-map-human-factors-v2', ({ algorithm, input: i }) => algorithm === 'economy.custom_map_nutrient_factor.v2'
    && i.faction_id === 1 && i.nutrient_rule_factor === nutrientRule && i.growth === growth).factor
    : witness('human-growth-nutrient-factor-v2', ({ input: i }) => i.faction_id === 1 && i.map_size_level === level
    && i.nutrient_rule_factor === nutrientRule && i.growth === growth).factor;
  assert.equal(rows, 3);
  if (level === 0 && nutrientRule === 10 && mineralRule === 10 && growth === 0 && industry === 0) assert.deepEqual([rows, mineral, nutrient], [3, 8, 8]);
  // The generated-world lifecycle below is application coverage, outside the
  // bounded component/factor observations and original-input parity counts.
  return { rows, mineral, nutrient, cost: rows * mineral };
}

// Test-only GSE entry. Production menus, settings, random terrain generation,
// world/default, units and commands remain production. Mechanical setup below
// acknowledges each real opening phase and explicitly pauses automatic turns.
// The separate opening-sequence comparison uses only actual UI confirmations.
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
    #print('NORMAL_GROWTH_BOUNDARY|' + #to_string(base.id) + '|' + #to_string(e.game.get_turn()) + '|' + #to_string(size) + '|' + #to_string(base.get_size()) + '|' + #to_string(before) + '|' + #to_string(base.get('accumulated_nutrients')) + '|' + #to_string(e.game.get('f_base_get_nutrient_factor')(base)));
    return result;
  };
  const starvation_event = #include('game/event/remove_base_pop');
  const apply_starvation = starvation_event.apply;
  starvation_event.apply = (e) => {
    const base = e.data.base; const size = base.get_size();
    let before = base.get('accumulated_nutrients'); if (!#is_defined(before)) { before = 0; }
    const result = apply_starvation(e);
    #print('NORMAL_STARVATION_BOUNDARY|' + #to_string(base.id) + '|' + #to_string(e.game.get_turn()) + '|' + #to_string(size) + '|' + #to_string(base.get_size()) + '|' + #to_string(before) + '|' + #to_string(base.get('accumulated_nutrients')) + '|' + #to_string(e.game.get('f_base_get_nutrient_factor')(base)));
    return result;
  };
  const growth_stage = #include('game/event/process_base_growth');
  const apply_growth_stage = growth_stage.apply;
  growth_stage.apply = (e) => {
    const base = e.data.base; const size = base.get_size();
    let before = base.get('accumulated_nutrients'); if (!#is_defined(before)) { before = 0; }
    const pending = e.game.get('f_base_get_pending_growth')(base);
    // Read the same effective policy as growth; custom maps use its fallback.
    const factor = e.game.get('f_base_get_nutrient_factor')(base);
    const result = apply_growth_stage(e);
    let after = base.get('accumulated_nutrients'); if (!#is_defined(after)) { after = 0; }
    #print('NORMAL_GROWTH_STAGE|' + #to_string(base.id) + '|' + #to_string(e.data.turn_id) + '|' + #to_string(size) + '|' + #to_string(base.get_size()) + '|' + #to_string(before) + '|' + #to_string(pending) + '|' + #to_string(factor) + '|' + #to_string(after));
    return result;
  };
  #include('game/game')(glsmac);
  #include('ui/ui')(glsmac);
  glsmac.on('mainmenu_show', (e) => {
    const settings = e.settings.global;
    #print('NORMAL_SETUP_DEFAULT|' + #to_string(settings.map.size_x) + '|' + #to_string(settings.map.size_y) + '|' + #to_string(settings.map.preset_level));
    for (size of settings.rules.get_world_sizes()) {
      #print('NORMAL_WORLD_SIZE|' + #to_string(size.level) + '|' + size.name + '|' + size.description + '|' + #to_string(size.size_x) + '|' + #to_string(size.size_y));
    }
  });
  let report_base = null;
  const nutrients = #include('ui/parts/game/popup/base_screen/nutrients');
  const middle = #include('ui/parts/game/popup/base_screen/bottom_bar/middle_area');
  const set_middle = middle.set;
  middle.set = (data) => {
    const result = set_middle(data);
    if (report_base != null) { report_base(data.base); }
    #print('NORMAL_NUTRIENT_LABEL|' + #to_string(data.base.id) + '|' + nutrients.growth_label.text);
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
      #print('NORMAL_ECONOMY|' + #to_string(base.id) + '|' + #to_string(base.get_size()) + '|' + #to_string(food) + '|' + #to_string(game.get('f_base_get_pending_growth')(base)) + '|' + #to_string(game.get('f_base_get_nutrient_factor')(base)) + '|' + #to_string(game.get('f_base_get_pending_production')(base)) + '|' + production.choice_id + '|' + #to_string(production.minerals) + '|' + #to_string(production.last_processed_turn));
      #print('NORMAL_NATIVE_NUTRIENT_FACTOR|' + #to_string(base.id) + '|' + #to_string(base.get_nutrient_factor()));
      #print('NORMAL_TANKS|' + #to_string(base.id) + '|' + #to_string(base.has_facility('RECYCLING_TANKS')));
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
      let acknowledged = null;
      glsmac.ui.root.timer(50, () => {
        const opening = game.get_opening_state();
        game.set_auto_end_turn(false);
        if (opening.phase != 'map' && opening.phase != 'none') {
          if (opening.phase != acknowledged) {
            const data = {session: opening.session, action: '', base_id: 0, previous_name: '', name: ''};
            if (opening.phase == 'planetfall') { data.action = 'planetfall'; }
            else if (opening.phase == 'first-base-name') {
              for (base of game.get_bm().get_bases()) {
                if (base.id == opening.base_id) { data.action = 'name'; data.base_id = base.id; data.previous_name = base.name + ''; data.name = base.name + ''; }
              }
            } else if (opening.phase == 'tour') { data.action = 'dismiss'; }
            if (data.action != '') { game.event('opening_command', data); acknowledged = opening.phase; }
          }
          return true;
        }
        glsmac.ui.root.on('keydown', (e) => {
          if (e.code != 'P' || e.modifiers != {}) { return false; }
          const owner = game.get_player();
          const tm = game.get_tm();
          #print('NORMAL_PROBE_BEGIN');
          #print('NORMAL_WORLD|' + #to_string(tm.get_map_width()) + '|' + #to_string(tm.get_map_height()) + '|' + #to_string(owner.id) + '|' + owner.get_faction().id + '|' + #to_string(game.get_turn()));
          #print('NORMAL_PLAYER|' + owner.name);
          for (field of owner.get_faction().identity) { #print('NORMAL_IDENTITY|' + field); }
          const ratings = owner.get_faction().social_ratings;
          #print('NORMAL_RATINGS|' + #to_string(ratings.growth) + '|' + #to_string(ratings.industry));
          for (token of owner.get_faction().starting_technologies) { #print('NORMAL_START_TECH|' + token); }
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
                  const definition = unit.get_def(); const model = definition.combat;
                  #print('NORMAL_COMBAT|' + #to_string(unit.id) + '|' + model.kind + '|' + #to_string(model.offense) + '|' + #to_string(model.defense) + '|' + #to_string(model.reactor) + '|' + definition.morale);
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

// Observe actual control factories while delegating every node and callback to
// production. Browser input below changes the real native Input values.
const dimensionObserver = String.raw`
const production = #include('./dimension_production');
return (i) => {
  const show = i.popup.show;
  i.popup.show = (data) => {
    #print('NORMAL_DIMENSION_CAPTION|' + data.title);
    const generate = data.generator;
    data.generator = (body) => {
      let index = 0;
      generate({
        text: (props) => { const label = body.text(props); #print('NORMAL_DIMENSION_TEXT|' + label.text); return label; },
        input: (props) => {
          const field = body.input(props); const ordinal = index; index++;
          #print('NORMAL_DIMENSION_FIELD|' + #to_string(ordinal) + '|' + field.value);
          field.on('change', (e) => { #print('NORMAL_DIMENSION_CHANGE|' + #to_string(ordinal) + '|' + field.value); return false; });
          return field;
        },
      });
    };
    return show(data);
  };
  try { production(i); }
  catch { : (e) => { i.popup.show = show; throw e; } }
  i.popup.show = show;
};
`;

const warningObserver = String.raw`
const production = #include('./warning_production');
return (i, definition, next) => {
  const show = i.popup.show;
  i.popup.show = (data) => {
    const rows = [];
    const report = () => {
      let selected = (0 - 1); let index = 0;
      for (record of rows) {
        for (name of #split(record.node.class, ' ')) { if (name == 'popup-choice-active') { selected = index; } }
        #print('NORMAL_WARNING_ROW|' + #to_string(index) + '|' + #to_string(record.top) + '|' + #to_string(data.height) + '|' + record.node.text);
        index++;
      }
      #print('NORMAL_WARNING_STATE|' + #to_string(selected));
    };
    const generate = data.generator;
    data.generator = (body) => {
      let text_index = 0;
      generate({
        text: (props) => {
          const text = body.text(props);
          #print('NORMAL_WARNING_TEXT|' + #to_string(text_index) + '|' + text.text); text_index++;
          return text;
        },
        button: (props) => {
          const node = body.button(props); const record = {}; record.node = node; record.top = props.top; rows :+ record;
          return node;
        },
      });
      #print('NORMAL_WARNING_CAPTION|' + data.title);
      report();
    };
    const keydown = data.on_keydown;
    data.on_keydown = (e) => {
      if (e.code == 'P') { report(); }
      const result = keydown(e);
      if (e.code == 'DOWN' || e.code == 'UP' || e.code == 'HOME' || e.code == 'END') { report(); }
      return result;
    };
    return show(data);
  };
  try { production(i, definition, next); }
  catch { : (e) => { i.popup.show = show; throw e; } }
  i.popup.show = show;
};
`;

function installedWarningBody() {
  const source = readdirSync(assets).find((name) => name.toLowerCase() === 'script.txt');
  assert.ok(source, 'Installed common script exists');
  const lines = readFileSync(`${assets}/${source}`, 'latin1').split(/\r?\n/);
  const start = lines.indexOf('#VERYLARGEMAP');
  assert.ok(start >= 0);
  let end = lines.findIndex((line, index) => index > start && /^#[A-Z][A-Z0-9_]*$/.test(line));
  if (end < 0) end = lines.length;
  const records = lines.slice(start + 1, end).filter((line) => line.trim() && !/^[#;]/.test(line));
  assert.ok(records.length >= 3);
  return records.slice(0, -2).filter((line) => line !== '^');
}

async function overrideDimensionAssets(page, rulesSource) {
  const sources = new Map();
  for (const name of ['script.txt', 'xscript.txt', 'labels.txt']) {
    const names = readdirSync(assets).filter((item) => item.toLowerCase() === name);
    assert.equal(names.length, 1, 'The installed text source is unambiguous');
    let text = readFileSync(`${assets}/${names[0]}`, 'latin1');
    if (name === 'labels.txt') {
      const lines = text.split(/\r?\n/); const start = lines.indexOf('#LABELS');
      assert.equal(lines[start + 1].trim(), '1131');
      lines[start + 2 + 1090] = 'Meridian'; lines[start + 2 + 1091] = 'Parallel';
      text = lines.join('\r\n');
    } else {
      let changes = 0;
      text = text.replace(/(#CUSTOMMAP\r?\n(?:(?!#[A-Z])[^\n]*\n)*?#caption )[^\r\n]*/g,
        (_, prefix) => { changes++; return prefix + (name === 'script.txt' ? 'Core Dimensions' : 'Expansion Dimensions'); });
      assert.equal(changes, 1, 'Only the declared CUSTOMMAP caption is overridden');
    }
    const bytes = Buffer.from(text, 'latin1');
    sources.set(name, { bytes, reads: 0, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const rulesBytes = Buffer.from(rulesSource, 'utf8');
  sources.set('alphax.txt', { bytes: rulesBytes, reads: 0, sha256: createHash('sha256').update(rulesBytes).digest('hex') });
  await page.route('**/assets/manifest.json', async (route) => {
    const response = await route.fetch(); assert.equal(response.status(), 200);
    const manifest = await response.json();
    for (const [name, source] of sources) {
      const entries = manifest.files.filter((entry) => entry.path.toLowerCase() === name);
      assert.equal(entries.length, 1); entries[0].size = source.bytes.length; entries[0].sha256 = source.sha256;
    }
    await route.fulfill({ json: manifest });
  });
  await page.route(/\/assets\/(?:x?script|labels|alphax)\.txt$/i, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1).toLowerCase();
    const source = sources.get(name); source.reads++;
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: source.bytes });
  });
  return sources;
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

async function clickCanvas(page, x, y) {
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width * x / 1024, box.y + box.height * y / 768);
}

for (const profile of [
  ...['random', 'custom'].map((route) => ({
    name: `custom dimensions load installed text and generate a playable ${route} world`,
    dimension: route, alternateText: route === 'custom', level: 0, size: [60, 48], rule: route === 'custom' ? 13 : 10, mineralRule: 13, lifecycle: false,
  })),
  { name: 'custom dimensions load installed text and generate a playable large odd-height world after warning rejection and confirmation',
    dimension: 'random', warning: true, fields: ['129', '49'], level: 0, size: [258, 49], rule: 13, mineralRule: 13, lifecycle: false },
  { name: 'normal Tiny gameplay grows naturally and produces a new Colony Pod through real turns', level: 0, size: [48, 48], rule: 10, lifecycle: true },
  { name: 'ordinary startup preserves a confirmed empty leader name', level: 0, size: [68, 34], rule: 10, lifecycle: false, leaderName: '' },
  { name: 'ordinary startup consumes original Consciousness growth penalty', level: 0, size: [68, 34], rule: 10, lifecycle: false, threshold: 18,
    faction: { id: 'CONSCIOUSNESS', slot: 0, leader: 'Aki Zeta-5', growth: -1, industry: 0,
      identity: ['The Cybernetic Consciousness', 'Consciousness', 'Cybernetic', 'Prime Function', 'analytical'] } },
  { name: 'ordinary startup consumes original Drone industry bonus', level: 0, size: [68, 34], rule: 10, lifecycle: false,
    faction: { id: 'DRONES', slot: 2, leader: 'Domai', growth: 0, industry: 2,
      identity: ['The Free Drones', 'Drones', 'Free Drone', 'Foreman', 'stalwart'] } },
  { name: 'ordinary startup changes the Gaian project when its installed starting technology changes', level: 0, size: [68, 34], rule: 10, mineralRule: 10, lifecycle: false,
    technology: {file: 'gaians.txt', block: 'GAIANS', previous: 'Ecology', replacement: 'Physic', project: 'COLONY_POD'} },
  { name: 'ordinary startup changes the Consciousness project when its installed starting technology changes', level: 0, size: [68, 34], rule: 10, mineralRule: 10, lifecycle: false, threshold: 18,
    constructInitial: true,
    technology: {file: 'cyborg.txt', block: 'CYBORG', previous: 'Physic', replacement: 'Ecology', project: 'FORMERS'},
    faction: {id: 'CONSCIOUSNESS', slot: 0, leader: 'Aki Zeta-5', growth: -1, industry: 0,
      identity: ['The Cybernetic Consciousness', 'Consciousness', 'Cybernetic', 'Prime Function', 'analytical']} },
  { name: 'ordinary startup consumes installed nutrient rules in real Standard gameplay', level: 2, size: [112, 56], rule: 11, lifecycle: false },
  { name: 'ordinary startup consumes installed mineral rules in real Standard gameplay', level: 2, size: [112, 56], rule: 11, mineralRule: 13, lifecycle: false },
  { name: 'ordinary startup consumes installed mineral rules for zero-price Tiny projects', level: 0, size: [68, 34], rule: 10, mineralRule: 1, lifecycle: false },
  ...[[52, 44], [68, 58], [88, 74], [108, 92], [132, 114]].map((size, level) => ({
    name: `ordinary startup consumes installed world sizes at preset ${level}`, level, size,
    rule: 11, mineralRule: 13, worldRules: true, threshold: [16, 18, 22, 22, 22][level], lifecycle: false,
  })),
]) {
test(profile.name, {
  skip: (!assets || (!profile.lifecycle && process.env.WASM_SITE_URL)) && 'Requires SMAC_ASSETS_DIR; synthetic rules require the local asset server',
  timeout: 180000,
}, async (t) => {
  const factors = recordedNormalFactors(profile.dimension ? 99 : profile.level, profile.rule, profile.mineralRule ?? 10, profile.faction?.growth ?? 0, profile.faction?.industry ?? 0);
  if (profile.dimension) {
    const [horizontal, vertical] = profile.fields ?? ['30', '48'];
    const cases = JSON.parse(readFileSync(`${root}tools/behavior-tests/ui/cases/custom-grid-dimensions.json`, 'utf8')).cases;
    const observations = JSON.parse(readFileSync(`${root}tools/behavior-tests/ui/observations/smacx-gog-2.0-custom-grid-dimensions.json`, 'utf8')).observations;
    const item = cases.find(({ input: i }) => i.horizontal === horizontal && i.vertical === vertical);
    assert.ok(item, 'Original generated-world evidence contains these typed dimensions');
    const original = observations.find(({ id }) => id === item.id)?.output;
    assert.ok(original, 'Original generated-world witness has a recorded output');
    assert.deepEqual(profile.size, [original.width, original.height]);
    assert.equal(original.size_kind, 99);
  }
  const artifactPrefix = profile.technology ? `starting-tech-${profile.technology.block}` : profile.faction ? `faction-ratings-${profile.faction.id}` : profile.leaderName === '' ? 'empty-leader-name' : profile.warning ? 'large-map-warning' : profile.dimension ? `dimension-${profile.dimension}` : profile.worldRules ? `world-size-ordinary-${profile.level}` : profile.lifecycle ? 'normal-game' : profile.mineralRule === 1 ? 'mineral-rule-zero' : profile.mineralRule ? 'mineral-rule-ordinary' : 'nutrient-rule-ordinary';
  mkdirSync(artifacts, { recursive: true });
  const scripts = Object.fromEntries(readdirSync(`${root}GLSMAC_data/default`, { recursive: true })
    .filter((name) => name.endsWith('.gls.js')).sort()
    .map((name) => [`GLSMAC_data/default/${name}`, readFileSync(`${root}GLSMAC_data/default/${name}`, 'utf8')]));
  // Read-only observations of the actual native name field after production
  // normalization; input delivery and callbacks are unchanged.
  const factionScript = 'GLSMAC_data/default/ui/parts/mainmenu/steps/select_faction.gls.js';
  assert.equal(scripts[factionScript].split('name = field.value; return true;').length, 2);
  scripts[factionScript] = scripts[factionScript]
    .replace('name = field.value; return true;', "name = field.value; #print('NORMAL_FACTION_NAME|' + field.value); return true;")
    .replace("field.on('input', submit);", "field.on('input', submit); #print('NORMAL_FACTION_NAME|' + field.value);")
    .replace('fields[index] = field;', "fields[index] = field; #print('NORMAL_CUSTOM_FIELD|' + #to_string(index) + '|' + field.value);")
    .replace('values[ordinal] = field.value; return true;', "values[ordinal] = field.value; #print('NORMAL_CUSTOM_FIELD|' + #to_string(ordinal) + '|' + field.value); return true;")
    .replace("roles[index].text = is_random ? '' : definitions[id].role;",
      "roles[index].text = is_random ? '' : definitions[id].role; #print('NORMAL_FACTION_ROW|' + #to_string(index) + '|' + row_buttons[index].text);");
  scripts[factionScript.replace('select_faction', 'faction_production')] = scripts[factionScript];
  scripts[factionScript] = `const production = #include('./faction_production');
return (i) => { try { return production(i); }
catch { : (error) => { #print('NORMAL_FACTION_ERROR|' + error.type + '|' + error.reason); throw error; } } };`;
  if (profile.dimension) {
    const prefix = 'GLSMAC_data/default/ui/parts/mainmenu/steps/';
    scripts[`${prefix}dimension_production.gls.js`] = scripts[`${prefix}customize_mapsize.gls.js`];
    scripts[`${prefix}customize_mapsize.gls.js`] = dimensionObserver;
    if (profile.warning) {
      scripts[`${prefix}warning_production.gls.js`] = scripts[`${prefix}large_map_warning.gls.js`];
      scripts[`${prefix}large_map_warning.gls.js`] = warningObserver;
    }
    for (const name of ['customize_ocean_coverage', 'customize_erosive_forces', 'customize_native_lifeforms', 'customize_cloud_cover', 'select_difficulty_level']) {
      const source = scripts[`${prefix}${name}.gls.js`];
      assert.ok(source.startsWith('return (i) => {'));
      scripts[`${prefix}${name}.gls.js`] = source.replace('return (i) => {', `return (i) => { #print('NORMAL_MENU_STEP|${name}');`);
    }
    const difficulty = scripts[`${prefix}select_difficulty_level.gls.js`];
    assert.ok(difficulty.startsWith('return (i) => {'));
    scripts[`${prefix}select_difficulty_level.gls.js`] = difficulty.replace('return (i) => {',
      `return (i) => { const map = i.settings.global.map; #print('NORMAL_DIMENSION_CONFIRMED|' + #to_string(map.size_x) + '|' + #to_string(map.size_y) + '|' + #to_string(map.preset_level));`);
  }
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
      writeFileSync(new URL(`${artifactPrefix}-log.txt`, artifacts), log);
      await page.locator('#canvas').screenshot({ path: fileURLToPath(new URL(`${artifactPrefix}-final.png`, artifacts)), timeout: 3000 }).catch(() => {});
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
    return page.locator('#canvas').screenshot({ path: fileURLToPath(new URL(`${artifactPrefix}-${name}.png`, artifacts)) });
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
    const step = profile.dimension && { ocean: 'customize_ocean_coverage', erosion: 'customize_erosive_forces',
      life: 'customize_native_lifeforms', cloud: 'customize_cloud_cover', difficulty: 'select_difficulty_level' }[next];
    if (step) {
      // Adjacent three-choice menus can differ by fewer than 30,000 pixels.
      // Observe real step entry, then require its rendered controls to settle.
      const marker = `NORMAL_MENU_STEP|${step}`;
      const previous = (await page.locator('#log').textContent()).split(marker).length - 1;
      await clickCanvas(page, 820, 732 - 70 * (count - 1 - index));
      await waitLog(marker, previous + 1); await menuReady(next); return;
    }
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
  const factionReady = async (width = 800, height = 340, name = 'faction') => {
    let previous;
    let stable = 0;
    let visible = false;
    for (let frame = 0; frame < 60 && (stable < 2 || !visible); ++frame) {
      await healthy();
      const png = PNG.sync.read(await page.locator('#canvas').screenshot());
      const stationary = Buffer.from(png.data);
      // The expected native caret repaints every 250 ms. Field telemetry
      // verifies its content; stability here covers the surrounding popup.
      if (height === 130) for (let y = Math.floor(353 * png.height / 768); y < Math.ceil(380 * png.height / 768); ++y) {
        stationary.fill(0, (y * png.width + Math.floor(335 * png.width / 1024)) * 4,
          (y * png.width + Math.ceil(829 * png.width / 1024)) * 4);
      }
      if (height === 290) for (let y = Math.floor(411 * png.height / 768); y < Math.ceil(435 * png.height / 768); ++y) {
        stationary.fill(0, (y * png.width + Math.floor(335 * png.width / 1024)) * 4,
          (y * png.width + Math.ceil(829 * png.width / 1024)) * 4);
      }
      stable = previous?.equals(stationary) ? stable + 1 : 0;
      previous = stationary;
      const border = (edge) => {
        for (let dy = -3; dy <= 3; ++dy) {
          let green = 0;
          let count = 0;
          for (let x = (1024 - width) / 2 + 8; x < (1024 + width) / 2 - 8; x += 2) {
            const at = (Math.floor((edge + dy) * png.height / 768) * png.width + Math.floor(x * png.width / 1024)) * 4;
            const [r, g, b] = png.data.subarray(at, at + 3);
            if (Math.abs(r - 73) < 5 && Math.abs(g - 108) < 5 && Math.abs(b - 61) < 5) ++green;
            ++count;
          }
          if (green > count * 0.8) return true;
        }
        return false;
      };
      visible = border((768 - height) / 2) && border((768 + height) / 2 - 1);
      if (stable < 2 || !visible) await page.waitForTimeout(100);
    }
    assert.ok(stable >= 2 && visible, `The production ${name} popup is visible and stationary`);
    await screenshot(name);
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
    const playerName = log.match(/NORMAL_PLAYER\|([^\r\n]*)/);
    assert.ok(playerName, 'Actual native player identity is readable');
    const identity = [...log.matchAll(/NORMAL_IDENTITY\|([^\r\n]*)/g)].map((match) => match[1]);
    assert.equal(identity.length, 6, 'Every identity field is read from the real native faction');
    const ratings = log.match(/NORMAL_RATINGS\|(-?\d+)\|(-?\d+)/);
    assert.ok(ratings, 'Actual native faction ratings are readable');
    const state = { playerName: playerName[1], identity, ratings: {growth: +ratings[1], industry: +ratings[2]}, width: +world[1], height: +world[2], owner: +world[3], faction: world[4], turn: +world[5],
      status: log.match(/NORMAL_STATUS\|([^\n\r]+)/)[1],
      selected: selection[1] === 'Unit' ? +selection[2] : null,
      bases: [...log.matchAll(/NORMAL_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(true|false)\|(true|false)/g)]
        .map((m) => ({ id: +m[1], owner: +m[2], x: +m[3], y: +m[4], size: +m[5], hq: m[6] === 'true', land: m[7] === 'true' })),
      economies: economies(log),
      startingTechnologies: [...log.matchAll(/NORMAL_START_TECH\|([^\r\n]+)/g)].map((m) => m[1]),
      models: [...log.matchAll(/NORMAL_COMBAT\|(\d+)\|([^|\n]+)\|(\d+)\|(\d+)\|(\d+)\|([^|\r\n]+)/g)]
        .map((m) => ({id: +m[1], kind: m[2], offense: +m[3], defense: +m[4], reactor: +m[5], morale: m[6]})),
      units: [...log.matchAll(/NORMAL_UNIT\|(\d+)\|([^|\n]+)\|(\d+)\|([0-9.]+)\|(\d+)\|(\d+)/g)]
        .map((m) => ({ id: +m[1], def: m[2], owner: +m[3], movement: +m[4], x: +m[5], y: +m[6] })),
      baseOpen: /NORMAL_POPUP\|base_screen\|true\|true/.test(log),
      popupClosed: /NORMAL_POPUP\|[^|\n]+\|false\|true/.test(log) };
    for (const economy of state.economies) {
      const tanks = [...log.matchAll(/NORMAL_TANKS\|(\d+)\|(true|false)/g)].find((row) => +row[1] === economy.id);
      assert.ok(tanks, 'Actual native facility state is readable');
      economy.tanks = tanks[2] === 'true';
    }
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
    const previousProduction = state.economies.find((entry) => entry.id === baseId);
    assert.ok(previousProduction, 'Actual base production state is available before the turn');
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
      && s.economies.some((e) => e.id === baseId && (previousProduction.choice !== ''
        ? e.processed === s.turn
        : e.processed === previousProduction.processed && e.minerals === previousProduction.minerals && e.choice === ''))
      && s.growth.some((g) => g.baseId === baseId && g.settled), 'Actual idle or selected production policy, growth stage and any population child have committed');
  };

  const rulesSource = syntheticNutrientRules(profile.rule, profile.mineralRule ?? 10, profile.worldRules ? alternateWorldRows : undefined);
  const extraSources = {};
  if (profile.technology) {
    const {file, block, previous, replacement} = profile.technology;
    const matches = readdirSync(assets).filter((name) => name.toLowerCase() === file);
    assert.equal(matches.length, 1);
    extraSources[file] = replaceStartingTechnology(readFileSync(`${assets}/${matches[0]}`), block, previous, replacement);
  }
  const dimensionAssets = profile.alternateText ? await overrideDimensionAssets(page, rulesSource) : null;
  const rulesAsset = profile.lifecycle || dimensionAssets ? null : await overrideRulesAsset(page, rulesSource, extraSources);
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
  await chooseMenu(5, profile.dimension === 'custom' ? 1 : 0, 'map-size');
  if (profile.worldRules) {
    const setupLog = await page.locator('#log').textContent();
    assert.equal(setupLog.match(/NORMAL_SETUP_DEFAULT\|([^\r\n]*)/)?.[1], '88|74|2');
    assert.deepEqual([...setupLog.matchAll(/NORMAL_WORLD_SIZE\|(\d+)\|([^|\r\n]*)\|([^|\r\n]*)\|(\d+)\|(\d+)/g)]
      .map((row) => [+row[1], row[2], row[3], +row[4], +row[5]]), [
        [0, 'Amber', 'Swift', 52, 44], [1, 'Birch', '', 68, 58], [2, 'Cedar', '', 88, 74],
        [3, 'Dune', '', 108, 92], [4, 'Elm', 'Patient', 132, 114],
      ]);
  }
  if (profile.dimension) {
    await clickCanvas(page, 820, 732); // Custom Size, the sixth actual menu row
    await waitLog('NORMAL_DIMENSION_FIELD|1|80');
    const log = await page.locator('#log').textContent();
    assert.match(log, /NORMAL_DIMENSION_FIELD\|0\|40/);
    assert.ok(log.includes(`NORMAL_DIMENSION_CAPTION|${profile.alternateText ? 'Core Dimensions' : 'Custom Map Size'}`));
    for (const label of profile.alternateText ? ['Meridian', 'Parallel'] : ['Horizontal', 'Vertical']) {
      assert.ok(log.includes(`NORMAL_DIMENSION_TEXT|${label}`));
    }
    const loaded = await page.evaluate(() => [...Module.assetStore.loaded].map((name) => name.toLowerCase()));
    for (const name of ['script.txt', 'labels.txt']) assert.ok(loaded.includes(name), `The actual resolver loads ${name}`);
    if (dimensionAssets) for (const [name, source] of dimensionAssets) assert.equal(source.reads, 1, `${name} is hash-verified and read once`);
    await screenshot('untouched-dimensions');
    // Window is centered at 512,384; production header/body and field offsets
    // put the two native inputs here. Change notifications verify real focus.
    const submitDimensions = async () => {
      for (const [index, value] of (profile.fields ?? ['30', '48']).entries()) {
        const marker = `NORMAL_DIMENSION_CHANGE|${index}|${value}`;
        const previous = await countLog(marker);
        await clickCanvas(page, 570, 344 + 27 * index);
        await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
        await page.keyboard.type(value);
        await waitLog(marker, previous + 1);
      }
      await page.keyboard.press('Enter'); // Submit the focused vertical field
    };
    await submitDimensions();
    if (profile.warning) {
      await waitLog('NORMAL_WARNING_STATE|0'); await healthy();
      const warningLog = await page.locator('#log').textContent();
      assert.ok(warningLog.includes('NORMAL_WARNING_CAPTION|Warning!'));
      const actualBody = [...warningLog.matchAll(/NORMAL_WARNING_TEXT\|\d+\|([^\r\n]*)/g)].map((row) => row[1]);
      const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
      assert.equal(hash(actualBody), hash(installedWarningBody()), 'Actual native text nodes display the installed common warning body');
      const rows = [...warningLog.matchAll(/NORMAL_WARNING_ROW\|(\d+)\|(\d+)\|(\d+)\|([^\r\n]*)/g)];
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((row) => row[4]), ['Continue anyway.', 'Never mind.']);
      await screenshot('large-warning');
      const second = rows.find((row) => +row[1] === 1);
      const selectedBefore = await countLog('NORMAL_WARNING_STATE|1');
      // Actual production row/window dimensions plus the existing native
      // window header and popup-body offsets locate the rendered hit target.
      await clickCanvas(page, 512, 384 - +second[3] / 2 + 23 + 3 + +second[2] + 10);
      await page.keyboard.press('p'); // Read-only observation of actual classes
      await waitLog('NORMAL_WARNING_STATE|1', selectedBefore + 1);
      assert.equal(await countLog('NORMAL_MENU_STEP|select_difficulty_level'), 0, 'A warning option click selects without advancing setup');
      await page.keyboard.press('Escape'); await menuReady('map-type');
      const reopenedBefore = await countLog('NORMAL_DIMENSION_FIELD|1|80');
      await chooseMenu(5, 0, 'map-size'); await clickCanvas(page, 820, 732);
      await waitLog('NORMAL_DIMENSION_FIELD|1|80', reopenedBefore + 1);
      const openedBefore = await countLog('NORMAL_WARNING_STATE|0');
      await submitDimensions(); await waitLog('NORMAL_WARNING_STATE|0', openedBefore + 1);
      const changedBefore = await countLog('NORMAL_WARNING_STATE|1');
      await page.keyboard.press('ArrowDown'); await waitLog('NORMAL_WARNING_STATE|1', changedBefore + 1);
      const restoredBefore = await countLog('NORMAL_WARNING_STATE|0');
      await page.keyboard.press('ArrowUp'); await waitLog('NORMAL_WARNING_STATE|0', restoredBefore + 1);
      await page.keyboard.press('Escape'); // Confirm the current first choice
    }
    if (profile.dimension === 'custom') {
      await menuReady('ocean');
      await chooseMenu(3, 1, 'erosion'); await chooseMenu(3, 1, 'life');
      await chooseMenu(3, 1, 'cloud'); await chooseMenu(3, 1, 'difficulty');
    } else { await menuReady('difficulty'); }
    await waitLog(`NORMAL_DIMENSION_CONFIRMED|${profile.size[0]}|${profile.size[1]}|99`);
    if (profile.warning) assert.equal(await countLog('NORMAL_MENU_STEP|select_difficulty_level'), 1, 'The real warning callback advances exactly once');
  } else { await chooseMenu(6, profile.level, 'difficulty'); }

  await chooseMenu(6, 0, 'rules'); // Citizen
  await chooseMenu(3, 0, 'faction'); // Play with Standard Rules
  const typeNative = async (text) => {
    for (const char of text) await page.keyboard.press(/[A-Z]/.test(char)
      ? `Shift+${char.toLowerCase()}` : char === ' ' ? 'Space' : char);
  };
  const clearNative = async () => { for (let index = 0; index < 32; ++index) await page.keyboard.press('Backspace'); };
  await factionReady();
  if (profile.lifecycle) {
    await clickCanvas(page, 887, 303); // Actual slot-zero dropdown
    await factionReady(480, 450, 'roster-options');
    await clickCanvas(page, 500, 207); // Gaians option
    await waitLog("NORMAL_FACTION_ROW|0|Gaia's Stepdaughters");
    await factionReady();
    await clickCanvas(page, 400, 538); // Change Name opens all seven editors
    await factionReady(660, 290, 'customize-faction');
    await waitLog('NORMAL_CUSTOM_FIELD|0|Deirdre');
    await clickCanvas(page, 600, 307); // Formal name
    await clearNative(); await typeNative('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL');
    const formal = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLM';
    await waitLog(`NORMAL_CUSTOM_FIELD|1|${formal}`, 1, 5000);
    const fields = [...(await page.locator('#log').textContent()).matchAll(/NORMAL_CUSTOM_FIELD\|1\|([^\r\n]*)/g)];
    assert.equal(fields.at(-1)[1], formal, 'Actual formal editor retains the original 39-character cap');
    await clickCanvas(page, 600, 284); await clearNative(); await typeNative('Orion Vale');
    await waitLog('NORMAL_CUSTOM_FIELD|0|Orion Vale', 1, 5000);
    for (const [index, value] of [[2, 'Orbiters'], [3, 'Orbital'], [4, 'Navigator'], [5, 'brisk']]) {
      await clickCanvas(page, 600, 284 + index * 23); await clearNative(); await typeNative(value);
      await waitLog(`NORMAL_CUSTOM_FIELD|${index}|${value}`, 1, 5000);
    }
    await clickCanvas(page, 600, 422); await clearNative(); await typeNative('Male');
    await waitLog('NORMAL_CUSTOM_FIELD|6|Male', 1, 5000);
    await clickCanvas(page, 512, 514); // Confirm customization
    await waitLog(`NORMAL_FACTION_ROW|0|${formal}`, 1, 5000);
    await factionReady();
  }
  await clickCanvas(page, profile.faction ? 700 : 300, 263);
  await clickCanvas(page, 500, 303 + (profile.faction?.slot ?? 0) * 27);
  await clickCanvas(page, 620, 538); // OK opens the leader-name prompt
  await waitLog('NORMAL_FACTION_NAME|' + (profile.lifecycle ? 'Orion Vale' : profile.faction?.leader ?? 'Deirdre'));
  await factionReady(660, 130, 'leader-name');
  await clickCanvas(page, 600, 366);
  await clearNative(); await typeNative('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  await waitLog('NORMAL_FACTION_NAME|ABCDEFGHIJKLMNOPQRSTUVW', 1, 5000);
  const names = [...(await page.locator('#log').textContent()).matchAll(/NORMAL_FACTION_NAME\|([^\r\n]*)/g)];
  assert.equal(names.at(-1)[1], 'ABCDEFGHIJKLMNOPQRSTUVW', 'Real SDL typing retains the original 23-character limit');
  const leaderName = profile.leaderName ?? 'Nova Pilot';
  await clearNative(); await typeNative(leaderName);
  await waitLog('NORMAL_FACTION_NAME|' + leaderName, 1, 5000);
  await page.keyboard.press('Enter');
  await waitLog('NORMAL_UI_READY');
  const initial = await waitState((s) => s.selected !== null && s.status === 'active'
    && s.bases.length > 0 && s.growth.every((g) => g.settled), 'Initial owned unit becomes selectable after starting population settles');
  assert.deepEqual([initial.width, initial.height], profile.size, 'The actual size controls generated their dimensions');
  assert.equal(initial.faction, profile.faction?.id ?? 'GAIANS', 'The actual roster selection reaches the native owner');
  assert.deepEqual(initial.ratings, {growth: profile.faction?.growth ?? 0, industry: profile.faction?.industry ?? 0}, 'Installed faction ratings reach real generated gameplay');
  assert.equal(initial.playerName, leaderName, 'The entered leader name reaches the real backend Player, including an explicitly confirmed empty name');
  assert.deepEqual(initial.identity, profile.lifecycle
    ? [leaderName, 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLM', 'Orbiters', 'Orbital', 'Navigator', 'brisk']
    : [leaderName, ...(profile.faction?.identity ?? ["Gaia's Stepdaughters", 'Gaians', 'Gaian', 'Lady', 'beautiful'])],
  'Confirmed source/custom faction identity survives native startup and world generation');
  assert.equal(initial.bases.length, 1, 'Normal world startup creates one local Headquarters');
  const headquarters = initial.bases[0];
  assert.ok(headquarters.hq && headquarters.land && headquarters.size === 1 && headquarters.owner === initial.owner);
  assert.deepEqual(initial.units.map((u) => u.def), ['ScoutPatrol'], 'Normal land startup has one real Scout and no free expansion Pod');
  assert.deepEqual(initial.models, [{id: initial.units[0].id, kind: 'conventional', offense: 1, defense: 1, reactor: 1, morale: 'STANDARD'}]);
  const initialProject = profile.technology?.project ?? (profile.faction ? 'COLONY_POD' : 'FORMERS');
  assert.equal(initial.economies[0].choice, initialProject, 'Native startup queues the source-available initial unit');
  const startupLog = await page.locator('#log').textContent();
  const initialProduction = [...startupLog.matchAll(/NORMAL_PRODUCTION_BOUNDARY\|(\d+)\|1\|\d+\|\d+\|(-?\d+)\|(-?\d+)\|(-?\d+)\|([^|\r\n]*)/g)]
    .find((entry) => +entry[1] === headquarters.id);
  assert.ok(initialProduction, 'The real first turn processes the installed Headquarters project');
  assert.equal(+initialProduction[2], 0, 'The initial project has no seeded mineral credit');
  assert.equal(+initialProduction[4], +initialProduction[2] + +initialProduction[3], 'Turn one credits actual pending production');
  assert.equal(initial.economies[0].minerals, +initialProduction[4], 'The visible store matches the committed first-turn boundary');
  assert.equal(initial.startingTechnologies.includes('Ecology'), initialProject === 'FORMERS');
  if (profile.technology) assert.equal(rulesAsset.sourceReads.get(profile.technology.file), 1, 'The modified faction input was hash-verified and loaded once');
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
  if (profile.dimension) {
    const customLog = await page.locator('#log').textContent();
    assert.ok(customLog.includes(`NORMAL_NATIVE_NUTRIENT_FACTOR|${headquarters.id}|${factors.nutrient}`), 'Custom worlds use the recorded native rule factor');
    assert.equal(initial.economies.find((entry) => entry.id === headquarters.id).factor, factors.nutrient, 'Production growth uses the loaded Custom factor');
    assert.ok(customLog.includes(`NORMAL_RECIPE|COLONY_POD|ColonyPod|${factors.cost}|1`), 'The real Custom world uses the loaded mineral rule for its unit descriptor');
    await closeBase(headquarters.id);
    const next = await advanceProductionTurn(headquarters.id);
    assert.equal(next.turn, initial.turn + 1);
    assert.deepEqual([next.width, next.height], profile.size);
    await openBase(headquarters.id);
    await screenshot('custom-world-after-turn'); await healthy();
    t.diagnostic('Actual installed text, native input, terrain generation, Headquarters and a complete turn passed. Edited coordinates and validation remain application coverage.');
    return;
  }
  if (!profile.lifecycle) {
    const economy = initial.economies.find((entry) => entry.id === headquarters.id);
    assert.equal(economy.factor, factors.nutrient, 'The installed multiplier reaches the actual native factor');
    const threshold = factors.nutrient * (economy.size + 1);
    assert.equal(threshold, profile.threshold ?? (profile.level === 0 ? 16 : 22), 'Population one uses the imported named-preset nutrient factor');
    const turns = economy.pendingFood > 0 ? Math.ceil((threshold - economy.food) / economy.pendingFood) : 0;
    const expectedLabel = economy.pendingFood > 0
      ? `Growth: ${turns} ${turns === 1 ? 'turn' : 'turns'}`
      : economy.pendingFood < 0 ? 'Hunger!' : 'Growth: -stagnant-';
    const log = await page.locator('#log').textContent();
    const labels = [...log.matchAll(/NORMAL_NUTRIENT_LABEL\|(\d+)\|([^\r\n]*)/g)]
      .filter((row) => +row[1] === headquarters.id);
    assert.equal(labels.at(-1)?.[2], expectedLabel, 'The actual displayed growth label uses the imported threshold');
    if (profile.constructInitial) {
      assert.equal(economy.choice, 'FORMERS');
      await closeBase(headquarters.id);
      const cost = 2 * factors.mineral;
      let current = await probe(); let former;
      const originalIds = new Set(current.units.map((unit) => unit.id));
      for (let turn = 0; !former && turn < 32; ++turn) {
        const before = current.economies.find((entry) => entry.id === headquarters.id);
        current = await advanceProductionTurn(headquarters.id);
        const after = current.economies.find((entry) => entry.id === headquarters.id);
        const fullLog = await page.locator('#log').textContent();
        const boundary = [...fullLog.matchAll(/NORMAL_PRODUCTION_BOUNDARY\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|([^|\r\n]*)/g)]
          .find((row) => +row[1] === headquarters.id && +row[2] === current.turn);
        assert.ok(boundary, 'Actual Former production emitted a native before/after boundary');
        assert.equal(+boundary[3], +boundary[4], 'Former construction charges no citizen, including its completion turn');
        const complete = before.minerals + before.pendingMinerals >= cost;
        assert.equal(+boundary[5], before.minerals);
        assert.equal(+boundary[6], before.pendingMinerals);
        assert.equal(after.minerals, before.minerals + before.pendingMinerals - (complete ? cost : 0));
        assert.equal(after.choice, complete ? '' : 'FORMERS');
        former = current.units.find((unit) => unit.def === 'Formers' && !originalIds.has(unit.id));
        assert.equal(Boolean(former), complete);
      }
      assert.ok(former, 'Naturally earned minerals construct an actual native Former');
      assert.equal(former.owner, initial.owner);
      assert.deepEqual([former.x, former.y], [headquarters.x, headquarters.y]);
      assert.deepEqual(current.models.find((model) => model.id === former.id),
        {id: former.id, kind: 'civilian', offense: 0, defense: 1, reactor: 1, morale: 'STANDARD'});
      assert.equal(current.units.length, initial.units.length + 1);
      assert.equal(rulesAsset.sourceReads.get(profile.technology.file), 1);
      await screenshot('source-former-completed'); await healthy();
      return;
    }
    if (profile.mineralRule !== undefined) {
      const recipe = [...log.matchAll(/NORMAL_RECIPE\|COLONY_POD\|ColonyPod\|(\d+)\|1/g)].at(-1);
      assert.ok(recipe, 'Actual generated gameplay exposes its native Colony Pod recipe');
      assert.equal(+recipe[1], factors.cost, 'The native unit descriptor uses the independently loaded mineral rule');
      const pickerOpens = await countLog(`NORMAL_PICKER_OPEN|${headquarters.id}`);
      await clickCanvas(page, 188, 726);
      await waitLog(`NORMAL_PICKER_OPEN|${headquarters.id}`, pickerOpens + 1);
      const pickerLog = (await page.locator('#log').textContent()).split(`NORMAL_PICKER_OPEN|${headquarters.id}`).at(-1);
      const rows = [...pickerLog.matchAll(/NORMAL_PICKER_ROW\|(\d+)\|([^|\n]+)\|(\d+)/g)];
      const pod = rows.find((row) => row[2] === 'COLONY_POD');
      const tanks = rows.find((row) => row[2] === 'RECYCLING_TANKS');
      assert.ok(pod && tanks, 'The actual picker offers both shipped row-priced projects');
      assert.equal(+pod[3], factors.cost);
      assert.equal(+tanks[3], 4 * factors.mineral);
      await clickCanvas(page, 500, 150 + 29 * +pod[1]);
      const closed = await countLog('NORMAL_PICKER_CLOSED');
      const rendered = await countLog(`NORMAL_PROJECT_RENDER|${headquarters.id}|Colony Pod|`);
      await clickCanvas(page, 565, 505);
      await waitLog('NORMAL_PICKER_CLOSED', closed + 1);
      if (economy.choice !== 'COLONY_POD') await waitLog(`NORMAL_PROJECT_RENDER|${headquarters.id}|Colony Pod|`, rendered + 1);
      else assert.equal(await countLog(`NORMAL_PROJECT_RENDER|${headquarters.id}|Colony Pod|`), rendered,
        'Confirming the already selected unit preserves the native project without a redundant refresh');
      const project = (await page.locator('#log').textContent()).split(`NORMAL_PROJECT_RENDER|${headquarters.id}|Colony Pod|`).at(-1).split('\n')[0];
      assert.ok(project.startsWith(`0 / ${factors.cost} minerals|`), 'The actual selected project displays the imported native price');
      if (factors.cost === 0) assert.equal(project.split('|')[1], 'NEEDS POPULATION', 'A free size-one pod still needs its real population charge');
      await screenshot('mineral-price-selected');
      await closeBase(headquarters.id);
      const before = await probe();
      const credit = before.economies.find((entry) => entry.id === headquarters.id);
      const after = await advanceProductionTurn(headquarters.id);
      const production = after.economies.find((entry) => entry.id === headquarters.id);
      assert.equal(production.choice, 'COLONY_POD');
      assert.equal(production.minerals, credit.minerals + credit.pendingMinerals, 'The first real turn credits minerals toward the imported project cost');
      if (factors.cost === 0) {
        assert.equal(production.size, 1, 'The free pod holds at size one after the actual processed turn');
        assert.deepEqual(after.units.map((unit) => unit.id), before.units.map((unit) => unit.id), 'Population holding creates no new unit');
        await openBase(headquarters.id);
        const nextPicker = await countLog(`NORMAL_PICKER_OPEN|${headquarters.id}`);
        await clickCanvas(page, 188, 726);
        await waitLog(`NORMAL_PICKER_OPEN|${headquarters.id}`, nextPicker + 1);
        const freeLog = (await page.locator('#log').textContent()).split(`NORMAL_PICKER_OPEN|${headquarters.id}`).at(-1);
        const freeTanks = [...freeLog.matchAll(/NORMAL_PICKER_ROW\|(\d+)\|RECYCLING_TANKS\|(\d+)/g)].at(-1);
        assert.ok(freeTanks && +freeTanks[2] === 0, 'Free Tanks remain offered after the held pod turn');
        await clickCanvas(page, 500, 150 + 29 * +freeTanks[1]);
        const hidden = await countLog('NORMAL_PICKER_CLOSED');
        const tankRenders = await countLog(`NORMAL_PROJECT_RENDER|${headquarters.id}|Recycling Tanks|`);
        await clickCanvas(page, 565, 505);
        await waitLog('NORMAL_PICKER_CLOSED', hidden + 1);
        await waitLog(`NORMAL_PROJECT_RENDER|${headquarters.id}|Recycling Tanks|`, tankRenders + 1);
        const renderedTanks = (await page.locator('#log').textContent()).split(`NORMAL_PROJECT_RENDER|${headquarters.id}|Recycling Tanks|`).at(-1).split('\n')[0];
        assert.ok(renderedTanks.endsWith('|1 TURN'), 'An available free facility displays next-turn completion');
        await closeBase(headquarters.id);
        const waiting = await probe();
        const tankBefore = waiting.economies.find((entry) => entry.id === headquarters.id);
        assert.equal(tankBefore.choice, 'RECYCLING_TANKS');
        assert.equal(tankBefore.tanks, false, 'Selection has not installed the facility inline');
        const finished = await advanceProductionTurn(headquarters.id);
        const completed = finished.economies.find((entry) => entry.id === headquarters.id);
        assert.equal(completed.tanks, true, 'The real next production turn installs free Tanks');
        assert.equal(completed.choice, '');
        assert.equal(completed.minerals, tankBefore.minerals + tankBefore.pendingMinerals, 'Free completion retains every earned mineral');
        await screenshot('free-tanks-completed');
      }

      assert.equal(rulesAsset.reads(), 1);
      t.diagnostic(`Loaded nutrient ${profile.rule} and mineral ${profile.mineralRule} through real ${profile.worldRules ? ('preset ' + profile.level) : profile.level === 0 ? 'Tiny' : 'Standard'} menus. Actual picker showed Tanks ${4 * factors.mineral}, Pod ${factors.cost}; selected project and first real credit agreed.${factors.cost === 0 ? ' The free Pod held at size one; free Tanks then completed through actual turn controls with every earned mineral retained.' : ''} Whole-item flow is application coverage, beyond recorded factor witnesses.`);
      await healthy();
      return;
    }
    assert.equal(rulesAsset.reads(), 1, 'Native initialization and menus share the verified rules asset');
    await healthy();
    t.diagnostic('Synthetic installed rule eleven flowed through real menus, Standard generation, native factor and actual food label. No world/RNG/population overrides; adds no original-input parity case.');
    return;
  }
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
  assert.equal(selectedProject.minerals, next.economies.find((e) => e.id === headquarters.id).minerals,
    'Switching between actual unit projects preserves the minerals earned by the initial project');
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
    assert.ok(current, 'The original starting Scout survives natural construction');
    assert.deepEqual([current.owner, current.x, current.y], [starter.owner, starter.x, starter.y]);
  }
  await openBase(headquarters.id);
  await screenshot('natural-project-complete');
  await healthy();
  t.diagnostic(`Production menus chose Tiny Planet and Gaians; generation created ${initial.width}x${initial.height} terrain, Headquarters ${headquarters.id} at (${headquarters.x},${headquarters.y}) and ${initial.units.length} starting units. Existing turn ${initial.turn}→${next.turn} selection/replenishment/base checks passed. Then real picker and ${productionTurns} natural production turns grew a citizen and produced distinct owned pod ${completedPod.id} at cost ${factors.cost}, cleared the project and retained ${natural.economies.find((e) => e.id === headquarters.id).minerals} minerals. No RNG, world, population or mineral overrides; GLSMAC application coverage outside original-input parity counts.`);
});
}
