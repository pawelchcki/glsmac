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
  };

  glsmac.on('configure_game', (e) => {
    const game = e.game;
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
      }
    });
    game.on('start_ui', (e) => {
      #async(0, () => {
        glsmac.ui.root.on('keydown', (e) => {
          if (e.code == 'P' && e.modifiers == {}) {
            const unit = game.get_um().get_unit(1);
            #print('SMOKE_MOVEMENT|' + #to_string(unit.movement));
            #print('SMOKE_POSITION|' + #to_string(unit.tile.x) + '|' + #to_string(unit.tile.y));
            return true;
          }
          return false;
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

test('owned base navigation, skipping, next turn and movement use the real browser game', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
  timeout: 180000,
}, async (t) => {
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
    errors.push(String(error));
    console.error(`Browser ${kind} error: ${error}`);
    // Wake pending telemetry waits when a worker stops. The original error is
    // still asserted below; a graphics failure never becomes a timeout/retry.
    page.evaluate(() => { globalThis.__gameplayError = true; }).catch(() => {});
  };
  page.on('pageerror', (error) => recordError('runtime', error));
  page.on('console', (message) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)/i.test(message.text())) {
      recordError('graphics', message.text());
    }
  });
  t.after(async () => {
    try {
      const log = await page.locator('#log').textContent({ timeout: 1000 });
      writeFileSync(new URL('gameplay-log.txt', artifacts), log || '');
      await page.locator('#canvas').screenshot({
        path: fileURLToPath(new URL('gameplay-final.png', artifacts)), timeout: 3000,
      }).catch(() => {});
      if (log) t.diagnostic(log.slice(-12000));
      if (errors.length) t.diagnostic(errors.join('\n'));
    } finally {
      await browser.close();
    }
  });
  const screenshot = async (name) => {
    assert.deepEqual(errors, [], 'No browser runtime or graphics errors');
    return page.locator('#canvas').screenshot({ path: fileURLToPath(new URL(`gameplay-${name}.png`, artifacts)) });
  };
  const waitForLog = async (text, minimum = 1) => {
    try {
      await page.waitForFunction(({ text, minimum }) => (
        globalThis.__gameplayError || document.body.dataset.state === 'failed'
        || document.querySelector('#log').textContent.split(text).length - 1 >= minimum
      ), { text, minimum });
    } catch (error) {
      const log = await page.locator('#log').textContent({ timeout: 1000 }).catch(() => 'No engine log available');
      throw new Error(`Waiting for ${text} (${minimum} occurrences) failed.\n${log.slice(-12000)}`, { cause: error });
    }
    assert.deepEqual(errors, [], 'No browser runtime or graphics errors');
    assert.ok((await page.locator('#log').textContent()).split(text).length - 1 >= minimum,
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
  const probeUnit = async () => {
    const previous = ((await page.locator('#log').textContent()).match(/SMOKE_POSITION\|/g) || []).length;
    await page.keyboard.press('p');
    await waitForLog('SMOKE_POSITION|', previous + 1);
    const log = await page.locator('#log').textContent();
    const movements = [...log.matchAll(/SMOKE_MOVEMENT\|([0-9.]+)/g)];
    const positions = [...log.matchAll(/SMOKE_POSITION\|(\d+)\|(\d+)/g)];
    return {
      movement: Number(movements.at(-1)[1]),
      position: positions.at(-1).slice(1).map(Number),
    };
  };

  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#custom-maps').setInputFiles({
    name: 'browser-smoke.MP', mimeType: 'application/octet-stream', buffer: smokeMap(),
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
  }, { mainScript, worldScript, scripts });
  await page.locator('#start').click();
  await waitForLog('SMOKE_UI_READY');
  await waitForLog('SMOKE_UNIT|1|0');
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
  await clickCanvas(page, 74, 741); // Visible Skip Turn command, not its keyboard shortcut.
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
  const finalLog = await page.locator('#log').textContent();
  assert.doesNotMatch(finalLog, /GSEParseError|GSETypeError|FATAL ERROR|Aborted\(/);
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running', finalLog.slice(-3000));
  t.diagnostic(`Imported synthetic 16x16 map; real base selection ${selectedBases.join(' -> ')}; turn ${initialTurn} -> ${initialTurn + 1}; unit movement ${initialMovement} -> 0 -> ${replenishedUnit.movement} -> ${movedUnit.movement}; unit moved (8,8) -> (10,8) and opened its destination base.`);
});
