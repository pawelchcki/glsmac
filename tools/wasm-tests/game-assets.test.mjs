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
  // The scripted menu slides onto the background. Wait for that production
  // animation to finish so the artifact shows the actual menu controls.
  for (let attempt = 0; attempt < 40 && (colors.size < 64 || stableFrames < 2); ++attempt) {
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL(filename, artifacts)),
    }));
    stableFrames = previous?.equals(png.data) ? stableFrames + 1 : 0;
    previous = png.data;
    colors = new Set();
    for (let offset = 0; offset < png.data.length; offset += 4) colors.add(png.data.readUInt32LE(offset));
    if (colors.size < 64 || stableFrames < 2) await page.waitForTimeout(100);
  }
  assert.ok(colors.size >= 64, `Expected the original main-menu image, found ${colors.size} colors`);
  assert.ok(stableFrames >= 2, 'The main-menu animation finished rendering');
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
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)/i.test(message.text())) {
      graphicsErrors.push(message.text());
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
  const box = await canvas.boundingBox();
  // These are canvas coordinates of the real scripted Quick Start button;
  // account for the launcher's CSS scaling when the viewport is narrower.
  await page.mouse.click(box.x + box.width * 820 / 1024, box.y + box.height * 382 / 768);
  await page.waitForFunction(() => document.body.dataset.state === 'failed' || (
    [...Module.assetStore.loaded].some((path) => /(?:^|\/)units\.pcx$/i.test(path))
    && Module.assetStore.pending.size === 0
  ), null, { timeout: 120000 });

  let terrainPixels = 0;
  let requiredPixels = 0;
  let changedPixels = 0;
  let requiredChanges = 0;
  for (let attempt = 0; attempt < 40; ++attempt) {
    const png = PNG.sync.read(await canvas.screenshot({
      path: fileURLToPath(new URL('game-quickstart-map.png', artifacts)),
    }));
    // The upper playfield excludes the bottom HUD. The broken oversized atlas
    // showed isolated sprites on black; those cannot satisfy this area check.
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
  logs.push(await page.locator('#log').textContent());
  assert.deepEqual(errors, [], 'Quick Start produced no browser runtime errors');
  assert.deepEqual(graphicsErrors, [], 'Terrain upload and drawing produced no WebGL or shader errors');
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running');
  assert.ok(terrainPixels > requiredPixels,
    `Terrain must fill the playfield rather than leaving only sprites on black (${terrainPixels} visible pixels)`);
  assert.ok(changedPixels > requiredChanges, 'The game frame replaced the main menu');
  assert.deepEqual(assetRequests, [], 'The game reads its original resources from the saved local installation');
  assert.doesNotMatch(logs.join('\n'), /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);
  const maximum = await page.evaluate(() => {
    const gl = document.querySelector('#canvas').getContext('webgl2');
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);
  });
  t.diagnostic(`Quick Start rendered ${terrainPixels} nonblack playfield pixels, replacing ${changedPixels} menu pixels, with MAX_TEXTURE_SIZE=${maximum}.`);
});
