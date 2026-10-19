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
const fatal = /worker sent an error!|RuntimeError:|Aborted\(|GSE\w*Error|GSEInvalidCall|FATAL ERROR|Event result listener failed/;

// Test-only GSE entry. Production menus, settings, random terrain generation,
// world/default, units and commands are unchanged. Every addition observes;
// no game event, selection, setting or random value is supplied by this script.
const normalMain = String.raw`
#main((glsmac) => {
  #include('game/game')(glsmac);
  #include('ui/ui')(glsmac);
  const middle = #include('ui/parts/game/popup/base_screen/bottom_bar/middle_area');
  const set_middle = middle.set;
  middle.set = (data) => {
    const result = set_middle(data);
    #print('NORMAL_BASE_RENDER|' + #to_string(data.base.id));
    return result;
  };
  const popups = #include('ui/parts/game/popup/popup');
  const base_screen = #include('ui/parts/game/popup/base_screen');
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
    game.on('error', (e) => { #print('NORMAL_GAME_ERROR'); });
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
              for (unit of tile.get_units()) {
                if (unit.owner == owner.id) {
                  #print('NORMAL_UNIT|' + #to_string(unit.id) + '|' + unit.def + '|' + #to_string(unit.owner) + '|' + #to_string(unit.movement) + '|' + #to_string(unit.tile.x) + '|' + #to_string(unit.tile.y));
                }
              }
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

test('normal menus generate a Tiny planet with a playable owned start and next turn', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
  timeout: 180000,
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
  const probe = async (timeout = 60000) => {
    const before = await page.locator('#log').textContent();
    const count = before.split('NORMAL_PROBE_DONE').length - 1;
    await page.keyboard.press('p');
    await waitLog('NORMAL_PROBE_DONE', count + 1, timeout);
    const log = (await page.locator('#log').textContent()).split('NORMAL_PROBE_BEGIN').at(-1);
    const world = log.match(/NORMAL_WORLD\|(\d+)\|(\d+)\|(\d+)\|([^|\n]+)\|(\d+)/);
    assert.ok(world, 'Actual generated world state is readable');
    const selection = log.match(/NORMAL_SELECTION\|([^|\n]+)\|([^|\n]+)/);
    return { width: +world[1], height: +world[2], owner: +world[3], faction: world[4], turn: +world[5],
      status: log.match(/NORMAL_STATUS\|([^\n\r]+)/)[1],
      selected: selection[1] === 'Unit' ? +selection[2] : null,
      bases: [...log.matchAll(/NORMAL_BASE\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(true|false)\|(true|false)/g)]
        .map((m) => ({ id: +m[1], owner: +m[2], x: +m[3], y: +m[4], size: +m[5], hq: m[6] === 'true', land: m[7] === 'true' })),
      units: [...log.matchAll(/NORMAL_UNIT\|(\d+)\|([^|\n]+)\|(\d+)\|([0-9.]+)\|(\d+)\|(\d+)/g)]
        .map((m) => ({ id: +m[1], def: m[2], owner: +m[3], movement: +m[4], x: +m[5], y: +m[6] })),
      baseOpen: /NORMAL_POPUP\|base_screen\|true\|true/.test(log),
      popupClosed: /NORMAL_POPUP\|[^|\n]+\|false\|true/.test(log) };
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
  const initial = await waitState((s) => s.selected !== null && s.status === 'active', 'Initial owned unit becomes selectable');
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
    && s.units.length === initial.units.length && s.units.every((u) => u.movement > 0), 'Next turn advances and replenishes actual units');
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
  await healthy();
  t.diagnostic(`Production menus chose Tiny Planet and Gaians; production generation created ${initial.width}x${initial.height} terrain, Headquarters ${headquarters.id} at (${headquarters.x},${headquarters.y}) and ${initial.units.length} owned units. Real Enter/Escape/Tab/Space and Turn Complete advanced ${initial.turn} to ${next.turn}, replenished both units and reopened the same base. GLSMAC playability regression; no original-game parity claim.`);
});
