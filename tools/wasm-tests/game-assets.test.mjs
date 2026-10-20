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
const optionalGameTest = {
  skip: !assets && 'Set SMAC_ASSETS_DIR to a legally obtained Alpha Centauri installation',
  timeout: 180000,
};

async function serveAssets(t) {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], { cwd: root });
  t.after(() => server.kill());
  let serverLog = '';
  server.stderr.on('data', (data) => { serverLog += data; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Asset server did not start: ${serverLog}`)), 60000);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Asset server exited (${code}): ${serverLog}`));
    });
    server.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
}

async function startGame(page) {
  // Skip only the timed intro. Startup, original resources, UI scripting,
  // graphics, sound and worker-to-browser asset reads all remain production.
  await page.evaluate(() => {
    const callMain = Module.callMain;
    Module.callMain = (args) => callMain([...args, '--skipintro']);
  });
  await page.locator('#start').click();
}

async function menuScreenshot(page, filename) {
  await page.waitForFunction(() => {
    const store = Module.assetStore;
    return document.body.dataset.state === 'failed' || (
      store.loaded.has('openinga.pcx') && store.loaded.has('fx/opening menu.wav')
      && store.pending.size === 0
    );
  });
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running',
    await page.locator('#log').textContent());
  let colors = new Set();
  let previous;
  let stableFrames = 0;
  let controlsVisible = false;
  // The scripted menu slides onto the background. Wait for that production
  // animation to finish so the artifact shows the actual menu controls.
  for (let attempt = 0; attempt < 60 && (colors.size < 64 || stableFrames < 2 || !controlsVisible); ++attempt) {
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL(filename, artifacts)),
    }));
    stableFrames = previous?.equals(png.data) ? stableFrames + 1 : 0;
    previous = png.data;
    colors = new Set();
    for (let offset = 0; offset < png.data.length; offset += 4) colors.add(png.data.readUInt32LE(offset));
    // Every sliding menu anchors its final button at the same bottom edge.
    // Require its dark green body so a stationary transition background cannot
    // be mistaken for an interactive menu while the SDL worker is busy.
    let buttonPixels = 0;
    let samples = 0;
    for (let y = 719; y < 742; ++y) for (let x = 700; x < 940; ++x) {
      const offset = (Math.floor(y * png.height / 768) * png.width + Math.floor(x * png.width / 1024)) * 4;
      const [red, green, blue] = png.data.subarray(offset, offset + 3);
      if (green > red + 4 && red < 70 && green < 100 && blue < 70) ++buttonPixels;
      ++samples;
    }
    controlsVisible = buttonPixels > samples * 0.6;
    if (colors.size < 64 || stableFrames < 2 || !controlsVisible) await page.waitForTimeout(100);
  }
  assert.ok(colors.size >= 64, `Expected the original main-menu image, found ${colors.size} colors`);
  assert.ok(stableFrames >= 2, 'The main-menu animation finished rendering');
  assert.ok(controlsVisible, 'The menu controls are visible after the transition');
  const loaded = await page.evaluate(() => [...Module.assetStore.loaded]);
  assert.ok(loaded.some((path) => /\.ttf$/i.test(path)), 'A real original game font was read');
  assert.ok(loaded.includes('console_x.pcx'), 'The main-menu controls loaded original graphics');
  return loaded;
}

async function gamePage(t, artifactPrefix) {
  mkdirSync(artifacts, { recursive: true });
  const address = site || await serveAssets(t);
  const browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const graphicsErrors = [];
  const assetRequests = [];
  const logs = [];
  page.on('pageerror', async (error) => {
    errors.push(String(error));
    console.error(`Browser runtime error: ${error}`);
    const pointer = String(error).match(/^\s*(\d+)\s*$/m);
    if (pointer) {
      try {
        const detail = await page.evaluate((value) => Module.getExceptionMessage(value), Number(pointer[1]));
        logs.push(`C++ exception: ${JSON.stringify(detail)}`);
        console.error(logs.at(-1));
      } catch { /* The runtime may already have stopped. */ }
    }
  });
  page.on('console', (message) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)/i.test(message.text())) {
      graphicsErrors.push(message.text());
      console.error(`Browser graphics error: ${message.text()}`);
    }
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/assets/')) assetRequests.push(request.url());
  });
  t.after(async () => {
    try {
      const log = await page.locator('#log').textContent({ timeout: 1000 });
      logs.push(log);
      writeFileSync(new URL(`${artifactPrefix}-log.txt`, artifacts), logs.join('\n--- reload ---\n'));
      if (log) t.diagnostic(log.slice(-12000));
      if (errors.length) t.diagnostic(errors.join('\n'));
      if (graphicsErrors.length) t.diagnostic(graphicsErrors.join('\n'));
    } finally {
      await browser.close();
    }
  });
  return { page, address, errors, graphicsErrors, assetRequests, logs };
}

async function clickMenuEntry(page, count, index) {
  const y = 732 - 70 * (count - 1 - index);
  await clickCanvas(page, 820, y);
}

async function clickCanvas(page, x, y) {
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width * x / 1024, box.y + box.height * y / 768);
}

function changedPixels(before, after) {
  let changed = 0;
  for (let offset = 0; offset < after.length; offset += 4) {
    if (before.readUInt32LE(offset) !== after.readUInt32LE(offset)) ++changed;
  }
  return changed;
}

async function changeMenu(page, count, index, filename) {
  const before = PNG.sync.read(await page.locator('#canvas').screenshot()).data;
  await clickMenuEntry(page, count, index);
  let changed = 0;
  // SDL consumes input on its worker. The old menu may remain stationary for
  // several browser frames before that worker starts the outgoing animation.
  // A hover highlight affects fewer than 30,000 pixels and cannot satisfy this.
  for (let attempt = 0; attempt < 60 && changed < 30000; ++attempt) {
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL(filename, artifacts)),
    }));
    changed = changedPixels(before, png.data);
    if (changed < 30000) await page.waitForTimeout(100);
  }
  assert.ok(changed >= 30000, 'The menu changed after the selected entry was clicked');
  await menuScreenshot(page, filename);
}

async function popupScreenshot(page, filename, width, height, errors, graphicsErrors) {
  let previous;
  let stableFrames = 0;
  let bordersVisible = false;
  // Popups use an opaque two-pixel green border. Check its top and bottom
  // edges, so an unchanged sliding menu cannot satisfy the stability check.
  for (let attempt = 0; attempt < 60 && (stableFrames < 2 || !bordersVisible); ++attempt) {
    assert.deepEqual(errors, [], 'No browser runtime errors while opening the popup');
    assert.deepEqual(graphicsErrors, [], 'No WebGL or shader errors while opening the popup');
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL(filename, artifacts)),
    }));
    const stationary = Buffer.from(png.data);
    // The leader editor's native caret is animated while its popup is still.
    if (width === 660 && height === 130) for (let y = Math.floor(353 * png.height / 768); y < Math.ceil(380 * png.height / 768); ++y) {
      stationary.fill(0, (y * png.width + Math.floor(335 * png.width / 1024)) * 4,
        (y * png.width + Math.ceil(829 * png.width / 1024)) * 4);
    }
    stableFrames = previous?.equals(stationary) ? stableFrames + 1 : 0;
    previous = stationary;
    const left = (1024 - width) / 2;
    const top = (768 - height) / 2;
    const hasBorder = (edge) => {
      for (let dy = -3; dy <= 3; ++dy) {
        let matching = 0;
        let samples = 0;
        for (let x = left + 8; x < left + width - 8; x += 2) {
          const offset = (Math.floor((edge + dy) * png.height / 768) * png.width
            + Math.floor(x * png.width / 1024)) * 4;
          const [red, green, blue] = png.data.subarray(offset, offset + 3);
          if (Math.abs(red - 73) < 5 && Math.abs(green - 108) < 5 && Math.abs(blue - 61) < 5) ++matching;
          ++samples;
        }
        if (matching > samples * 0.8) return true;
      }
      return false;
    };
    bordersVisible = hasBorder(top) && hasBorder(top + height - 1);
    if (stableFrames < 2 || !bordersVisible) await page.waitForTimeout(100);
  }
  assert.ok(bordersVisible, `The ${width}x${height} popup is visible`);
  assert.ok(stableFrames >= 2, 'The popup finished rendering');
}

async function chooseFaction(page, prefix, index, errors, graphicsErrors) {
  await popupScreenshot(page, `${prefix}-faction.png`, 800, 340, errors, graphicsErrors);
  if (index === 0) {
    await clickCanvas(page, 230, 348); // Play Random Faction
    await clickCanvas(page, 620, 538);
  } else {
    const base = index <= 7;
    await clickCanvas(page, base ? 300 : 700, 263);
    await clickCanvas(page, 500, 303 + (base ? index - 1 : index - 8) * 27);
    await clickCanvas(page, 620, 538);
    await popupScreenshot(page, `${prefix}-leader-name.png`, 660, 130, errors, graphicsErrors);
    await page.keyboard.press('Enter');
  }
}

async function chooseGameAssets(page, address) {
  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  if (site) {
    await page.locator('#asset-source').selectOption('local');
    await page.locator('#assets').setInputFiles(assets);
  } else {
    await page.locator('#asset-source').selectOption('remote');
    await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  }
  await startGame(page);
}

async function terrainScreenshot(page, filename, menuPixels, errors, graphicsErrors) {
  await page.waitForFunction(() => document.body.dataset.state === 'failed' || (
    [...Module.assetStore.loaded].some((path) => /(?:^|\/)units\.pcx$/i.test(path))
    && Module.assetStore.pending.size === 0
  ), null, { timeout: 120000 });
  let terrainPixels = 0;
  let requiredPixels = 0;
  let changedPixels = 0;
  let requiredChanges = 0;
  for (let attempt = 0; attempt < 40; ++attempt) {
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL(filename, artifacts)),
    }));
    // Exclude the bottom HUD. Sprites drawn over a failed black terrain atlas
    // cannot fill this area; comparing the menu also rejects a premature frame.
    const rows = Math.min(500, png.height);
    terrainPixels = 0;
    changedPixels = 0;
    requiredPixels = png.width * rows / 5;
    requiredChanges = png.width * png.height / 4;
    for (let offset = 0; offset < png.data.length; offset += 4) {
      if (png.data.readUInt32LE(offset) !== menuPixels.readUInt32LE(offset)) ++changedPixels;
    }
    for (let y = 0; y < rows; ++y) for (let x = 0; x < png.width; ++x) {
      const offset = (y * png.width + x) * 4;
      if (png.data[offset] + png.data[offset + 1] + png.data[offset + 2] > 12) ++terrainPixels;
    }
    if ((terrainPixels > requiredPixels && changedPixels > requiredChanges) || errors.length || graphicsErrors.length) break;
    await page.waitForTimeout(250);
  }
  assert.deepEqual(errors, [], 'The game produced no browser runtime errors');
  assert.deepEqual(graphicsErrors, [], 'Terrain upload and drawing produced no WebGL or shader errors');
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running',
    await page.locator('#log').textContent());
  assert.ok(terrainPixels > requiredPixels,
    `Terrain must fill the playfield rather than leaving only sprites on black (${terrainPixels} visible pixels)`);
  assert.ok(changedPixels > requiredChanges, 'The game frame replaced the main menu');
  return { terrainPixels, changedPixels };
}

test('original game assets stream into the main menu and restart from browser storage', {
  ...optionalGameTest,
  skip: optionalGameTest.skip || (site && 'The hosted streaming fixture requires the local asset server'),
}, async (t) => {
  const { page, address, errors, graphicsErrors, assetRequests, logs } = await gamePage(t, 'game-assets');
  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await page.locator('#asset-source').selectOption('remote');
  await page.locator('#asset-url').fill(`${address}/assets/manifest.json`);
  const manifestResponse = page.waitForResponse((response) => response.url() === `${address}/assets/manifest.json`);
  await startGame(page);
  const manifest = await (await manifestResponse).json();
  const streamed = await menuScreenshot(page, 'game-assets-menu.png');
  const loadedText = new Set(streamed.map((path) => path.toLowerCase()));
  for (const filename of ['alphax.txt', 'xscript.txt', 'menu.txt']) {
    assert.ok(loadedText.has(filename), `The production menu loaded installed ${filename}`);
  }
  logs.push(await page.locator('#log').textContent());
  assert.ok(manifest.files.length > 100, 'The server indexed the original installation');
  const downloaded = assetRequests.filter((url) => !url.endsWith('/manifest.json'));
  assert.ok(downloaded.length > 0, 'Game startup fetched asset file bodies');
  assert.ok(downloaded.length < manifest.files.length,
    `Downloaded ${downloaded.length} of ${manifest.files.length} files`);
  assert.ok(!downloaded.some((url) => /\/terranx?\.exe$/i.test(new URL(url).pathname)),
    'Executable presence is detected from metadata without downloading executables');
  assert.ok(!streamed.includes('terran.exe'));
  assert.deepEqual(errors, [], 'No browser runtime errors while streaming original assets');
  assert.deepEqual(graphicsErrors, [], 'No WebGL or shader errors');

  const blocked = [];
  await page.route('**/assets/**', (route) => {
    blocked.push(route.request().url());
    return route.abort('internetdisconnected');
  });
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  assert.equal(await page.locator('#asset-source').inputValue(), 'cached',
    'The launcher automatically selects saved assets after reload');
  await startGame(page);
  const restored = await menuScreenshot(page, 'game-assets-cached-menu.png');
  assert.deepEqual(blocked, [], 'Cached startup needs neither the manifest nor any asset network requests');
  assert.deepEqual(restored.sort(), streamed.sort(), 'The same original assets were restored from browser storage');
  assert.deepEqual(errors, [], 'No browser runtime errors after the cached restart');
  assert.deepEqual(graphicsErrors, [], 'No WebGL or shader errors after the cached restart');
  assert.doesNotMatch(logs.join('\n'), /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);
  t.diagnostic(`Streamed ${downloaded.length} of ${manifest.files.length} original files; cached restart made no asset requests.`);
});

async function savedLocalFiles(page) {
  return page.evaluate(async () => {
    const record = Module.assetStore.current;
    const index = Module.assetStore.database.transaction('assets', 'readonly').objectStore('assets').index('dataset');
    const files = await new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(record.id));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return {
      id: record.id,
      kind: record.kind,
      count: files.length,
      bytes: files.reduce((total, file) => total + file.blob.size, 0),
      allBlobs: files.every((file) => file.blob instanceof Blob),
      manifestCount: record.files.length,
      manifestBytes: record.files.reduce((total, file) => total + file.size, 0),
    };
  });
}

test('a real local game folder persists completely and restarts without another selection', optionalGameTest, async (t) => {
  const { page, address, errors, graphicsErrors, assetRequests, logs } = await gamePage(t, 'game-assets-local');
  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#asset-source').selectOption('local');
  await page.locator('#assets').setInputFiles(assets);
  const selected = await page.locator('#assets').evaluate((input) => ({
    count: input.files.length,
    bytes: [...input.files].reduce((total, file) => total + file.size, 0),
  }));
  assert.ok(selected.count > 100, 'Chromium selected the real installation directory');
  await startGame(page);
  const imported = await menuScreenshot(page, 'game-assets-local-menu.png');
  logs.push(await page.locator('#log').textContent());
  const saved = await savedLocalFiles(page);
  assert.equal(saved.kind, 'local');
  assert.ok(saved.allBlobs, 'Every selected file is stored as a persistent Blob');
  assert.equal(saved.count, selected.count, 'The atomic import committed every selected file');
  assert.equal(saved.manifestCount, selected.count);
  assert.equal(saved.bytes, selected.bytes, 'Stored Blob sizes match the complete game folder');
  assert.equal(saved.manifestBytes, selected.bytes);
  assert.ok(!imported.includes('terran.exe'), 'Unused executables remain outside game memory');
  assert.deepEqual(assetRequests, [], 'Local game startup needs no hosted assets');
  assert.deepEqual(errors, [], 'No browser runtime errors while importing the local game folder');
  assert.deepEqual(graphicsErrors, [], 'No WebGL or shader errors with local game assets');

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  assert.equal(await page.locator('#assets').evaluate((input) => input.files.length), 0,
    'Reload cleared the browser file selection');
  assert.equal(await page.locator('#asset-source').inputValue(), 'cached');
  await startGame(page);
  const restored = await menuScreenshot(page, 'game-assets-local-cached-menu.png');
  assert.deepEqual(restored.sort(), imported.sort(), 'Cached startup restored the original menu assets');
  assert.deepEqual(await savedLocalFiles(page), saved, 'The complete local installation survived reload');
  assert.deepEqual(assetRequests, [], 'Cached local startup still needs no hosted assets');
  assert.deepEqual(errors, [], 'No browser runtime errors after restoring the local installation');
  assert.deepEqual(graphicsErrors, [], 'No WebGL or shader errors after restoring the local installation');
  logs.push(await page.locator('#log').textContent());
  assert.doesNotMatch(logs.join('\n'), /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);
  t.diagnostic(`Persisted ${saved.count} original files (${(saved.bytes / 1024 / 1024).toFixed(1)} MiB); restarted without file selection or hosted assets.`);
});

test('Quick Start renders terrain within the browser GPU limit', optionalGameTest, async (t) => {
  const { page, address, errors, graphicsErrors, assetRequests, logs } = await gamePage(t, 'game-quickstart');
  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  await page.locator('#asset-source').selectOption('local');
  await page.locator('#assets').setInputFiles(assets);
  await startGame(page);
  await menuScreenshot(page, 'game-quickstart-menu.png');
  const canvas = page.locator('#canvas');
  const menuPixels = PNG.sync.read(await canvas.screenshot()).data;
  // These are canvas coordinates of the real scripted Quick Start button;
  // account for the launcher's CSS scaling when the viewport is narrower.
  await clickMenuEntry(page, 7, 1);
  const { terrainPixels, changedPixels } = await terrainScreenshot(page,
    'game-quickstart-map.png', menuPixels, errors, graphicsErrors);
  logs.push(await page.locator('#log').textContent());
  assert.deepEqual(assetRequests, [], 'The game reads its original resources from the saved local installation');
  assert.doesNotMatch(logs.join('\n'), /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);
  const maximum = await page.evaluate(() => {
    const gl = document.querySelector('#canvas').getContext('webgl2');
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);
  });
  t.diagnostic(`Quick Start rendered ${terrainPixels} nonblack playfield pixels, replacing ${changedPixels} menu pixels, with MAX_TEXTURE_SIZE=${maximum}.`);
});

for (const { label, index, dimension, preferred, fallback, prefix, factionIndex, faction } of [
  { label: 'The Map of Planet', index: 2, dimension: 80,
    preferred: 'maps/xplanet.mp', fallback: 'maps/planet.mp', prefix: 'game-planet', factionIndex: 1, faction: 'GAIANS' },
  { label: 'Huge Map of Planet', index: 3, dimension: 128,
    preferred: 'maps/xplanetx.mp', fallback: 'maps/planetx.mp', prefix: 'game-huge-planet', factionIndex: 0, faction: 'RANDOM' },
]) {
  test(`${label} loads the original map through difficulty, standard rules and faction selection`, {
    ...optionalGameTest, timeout: 300000,
  }, async (t) => {
    const { page, address, errors, graphicsErrors, assetRequests, logs } = await gamePage(t, prefix);
    await chooseGameAssets(page, address);
    await menuScreenshot(page, `${prefix}-menu.png`);
    const menuPixels = PNG.sync.read(await page.locator('#canvas').screenshot()).data;
    assert.deepEqual(await page.evaluate(() => [...Module.assetStore.loaded].filter((path) => /\.mp$/i.test(path))), []);

    await changeMenu(page, 7, 0, `${prefix}-selection.png`); // Start Game
    await changeMenu(page, 5, index, `${prefix}-difficulty.png`);
    await changeMenu(page, 6, 0, `${prefix}-rules.png`); // Citizen
    await clickMenuEntry(page, 3, 0); // Play with Standard Rules
    await chooseFaction(page, prefix, factionIndex, errors, graphicsErrors);
    const pixels = await terrainScreenshot(page, `${prefix}-map.png`, menuPixels, errors, graphicsErrors);

    const loadedMap = await page.evaluate(({ preferred, fallback }) => {
      const files = Module.assetStore.current.files;
      const selected = files.find((file) => file.path.toLowerCase() === preferred)
        || files.find((file) => file.path.toLowerCase() === fallback);
      const loaded = [...Module.assetStore.loaded].filter((path) => /\.mp$/i.test(path));
      if (!selected || loaded.length !== 1 || loaded[0] !== selected.path) return { loaded, selected };
      const bytes = Module.FS.readFile(`/smac/${selected.path}`);
      const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { loaded, selected, width: header.getUint32(15, true), height: header.getUint32(19, true) };
    }, { preferred, fallback });
    assert.deepEqual(loadedMap.loaded, [loadedMap.selected?.path], 'Only the selected original map entered game memory');
    assert.equal(loadedMap.width, dimension);
    assert.equal(loadedMap.height, dimension);
    logs.push(await page.locator('#log').textContent());
    assert.doesNotMatch(logs.join('\n'), /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);
    if (logs.join('\n').includes('Loading map from')) {
      assert.match(logs.join('\n'), new RegExp(`Loading ${dimension * dimension / 2} tiles`),
        'The debug backend initialized the original map dimensions');
      assert.doesNotMatch(logs.join('\n'), /Generating map of size/, 'Built-in maps bypass random generation');
      assert.match(logs.join('\n'), new RegExp(`Single-player setup: faction=${faction}, difficulty=Citizen`),
        'The backend received the selected faction and difficulty');
    }
    if (site) assert.deepEqual(assetRequests, [], 'The public game never uploads or requests hosted original resources');
    else assert.equal(assetRequests.filter((url) => /\.mp$/i.test(new URL(url).pathname)).length, 1,
      'Streaming fetched only the selected map');
    t.diagnostic(`${label}: ${loadedMap.loaded[0]}, original ${dimension}x${dimension}, ${pixels.terrainPixels} terrain pixels and ${pixels.changedPixels} changed menu pixels.`);
  });
}

test('Credits and installed-map selection return to usable menus and start the selected map', {
  ...optionalGameTest, timeout: 360000,
}, async (t) => {
  const prefix = 'game-setup';
  const { page, address, errors, graphicsErrors, assetRequests, logs } = await gamePage(t, prefix);
  await chooseGameAssets(page, address);
  await menuScreenshot(page, `${prefix}-menu.png`);
  const menuPixels = PNG.sync.read(await page.locator('#canvas').screenshot()).data;

  await clickMenuEntry(page, 7, 5); // View Credits
  await popupScreenshot(page, `${prefix}-credits.png`, 620, 350, errors, graphicsErrors);
  await page.keyboard.press('Escape');
  await menuScreenshot(page, `${prefix}-after-credits.png`);
  await changeMenu(page, 7, 0, `${prefix}-new-game.png`);

  await clickMenuEntry(page, 5, 4); // Load Map File
  await popupScreenshot(page, `${prefix}-map-list.png`, 620, 400, errors, graphicsErrors);
  const maps = await page.evaluate(() => Module.assetStore.current.files
    .filter((file) => /^maps\/[^/]+\.(?:mp|gsm)$/i.test(file.path))
    .map((file) => file.path)
    .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  const targetIndex = maps.findIndex((path) => path.toLowerCase() === 'maps/planet.mp');
  assert.ok(targetIndex >= 0, 'The original installation includes the base Planet map');
  assert.deepEqual(await page.evaluate(() => [...Module.assetStore.loaded].filter((path) => /\.(?:mp|gsm)$/i.test(path))), [],
    'Listing installed maps uses metadata without reading map contents');
  assert.equal(assetRequests.filter((url) => /\.(?:mp|gsm)$/i.test(new URL(url).pathname)).length, 0);

  await page.keyboard.press('Escape');
  await menuScreenshot(page, `${prefix}-after-map-cancel.png`);
  await clickMenuEntry(page, 5, 4);
  await popupScreenshot(page, `${prefix}-map-list-reopened.png`, 620, 400, errors, graphicsErrors);
  // The catalog is case-insensitively sorted and starts on its first entry.
  for (let index = 0; index < targetIndex; ++index) await page.keyboard.press('ArrowDown');
  await clickCanvas(page, 320, 568); // Load Map
  await menuScreenshot(page, `${prefix}-difficulty.png`);
  await changeMenu(page, 6, 0, `${prefix}-rules.png`); // Citizen
  await clickMenuEntry(page, 3, 1); // Play with Current Rules
  await popupScreenshot(page, `${prefix}-faction-cancel.png`, 800, 340, errors, graphicsErrors);
  await page.keyboard.press('Escape');
  await menuScreenshot(page, `${prefix}-after-faction-cancel.png`);
  assert.deepEqual(await page.evaluate(() => [...Module.assetStore.loaded]
    .filter((path) => /\.(?:mp|gsm)$/i.test(path) || /(?:^|\/)units\.pcx$/i.test(path))), [],
  'Canceling faction selection did not read the map or prematurely start a game');
  await changeMenu(page, 6, 0, `${prefix}-rules-reopened.png`); // Faction cancellation returns to difficulty
  await clickMenuEntry(page, 3, 1); // Current Rules, again
  await chooseFaction(page, prefix, 3, errors, graphicsErrors); // UNIVERSITY
  const pixels = await terrainScreenshot(page, `${prefix}-map.png`, menuPixels, errors, graphicsErrors);

  const selected = await page.evaluate((path) => {
    const bytes = Module.FS.readFile(`/smac/${path}`);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      loaded: [...Module.assetStore.loaded].filter((entry) => /\.(?:mp|gsm)$/i.test(entry)),
      width: header.getUint32(15, true), height: header.getUint32(19, true),
    };
  }, maps[targetIndex]);
  assert.deepEqual(selected.loaded, [maps[targetIndex]], 'Only the map chosen in the catalog was loaded');
  assert.equal(selected.width, 80);
  assert.equal(selected.height, 80);
  logs.push(await page.locator('#log').textContent());
  assert.doesNotMatch(logs.join('\n'), /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);
  if (logs.join('\n').includes('Loading map from')) {
    assert.match(logs.join('\n'), /Loading 3200 tiles/);
    assert.match(logs.join('\n'), /Single-player setup: faction=UNIVERSITY, difficulty=Citizen/);
    assert.doesNotMatch(logs.join('\n'), /Generating map of size/);
  }
  if (site) assert.deepEqual(assetRequests, [], 'The public game reads only the local installation');
  else assert.equal(assetRequests.filter((url) => /\.(?:mp|gsm)$/i.test(new URL(url).pathname)).length, 1,
    'Listing and canceling downloaded no maps; starting downloaded just the selected map');
  t.diagnostic(`Credits dismissed; map/faction cancel returned to setup; selected ${maps[targetIndex]} rendered ${pixels.terrainPixels} terrain pixels as UNIVERSITY.`);
});
