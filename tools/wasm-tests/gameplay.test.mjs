import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
            #print('SMOKE_MOVEMENT|' + #to_string(game.get_um().get_unit(1).movement));
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
  for (position of [[8, 8], [2, 2]]) {
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

test('owned base arrows, visible Skip Turn and terrain labels use the real browser game', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
  timeout: 180000,
}, async (t) => {
  mkdirSync(artifacts, { recursive: true });
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
    await page.waitForFunction(({ text, minimum }) => (
      globalThis.__gameplayError || document.body.dataset.state === 'failed'
      || document.querySelector('#log').textContent.split(text).length - 1 >= minimum
    ), { text, minimum });
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
  await page.evaluate(({ mainScript, worldScript }) => {
    Module.FS.mkdirTree('/GLSMAC_data/default/game/world');
    Module.FS.writeFile('/GLSMAC_data/default/browser_smoke_main.gls.js', mainScript);
    Module.FS.writeFile('/GLSMAC_data/default/game/world/browser_smoke.gls.js', worldScript);
    const callMain = Module.callMain;
    Module.callMain = (args) => callMain([...args,
      '--mainscript', 'browser_smoke_main', '--worldscript', 'browser_smoke',
      '--quickstart', '--quickstart-mapfile', '/persist/glsmac/maps/browser-smoke.MP',
      '--quickstart-faction', 'GAIANS',
    ]);
  }, { mainScript, worldScript });
  await page.locator('#start').click();
  await waitForLog('SMOKE_UI_READY');
  await waitForLog('SMOKE_UNIT|1|0');
  for (const label of ['Supply Pod', 'Volcano', 'Road', 'Farm']) await waitForLog(`SMOKE_LABEL|${label}`);
  await page.keyboard.press('p');
  await waitForLog('SMOKE_MOVEMENT|');
  const initialMovement = Number((await page.locator('#log').textContent()).match(/SMOKE_MOVEMENT\|([0-9.]+)/)?.[1]);
  assert.ok(initialMovement > 0, 'The selected owned unit begins with movement');
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
  const probes = ((await page.locator('#log').textContent()).match(/SMOKE_MOVEMENT\|/g) || []).length;
  await page.keyboard.press('p');
  await waitForLog('SMOKE_MOVEMENT|', probes + 1);
  const finalLog = await page.locator('#log').textContent();
  const movements = [...finalLog.matchAll(/SMOKE_MOVEMENT\|([0-9.]+)/g)].map((match) => Number(match[1]));
  assert.equal(movements.at(-1), 0, 'Clicking Skip Turn exhausted actual backend movement');
  assert.doesNotMatch(finalLog, /GSEParseError|GSETypeError|FATAL ERROR|Aborted\(/);
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running', finalLog.slice(-3000));
  await screenshot('skipped');
  t.diagnostic(`Imported synthetic16x16 map; real base selection ${selectedBases.join(' -> ')}; unit movement ${initialMovement} -> 0; Supply Pod/Volcano/Road/Farm labels drew without errors.`);
});
