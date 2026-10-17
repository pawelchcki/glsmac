import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const installer = process.env.SMAC_INSTALLER_PATH;
const baseline = process.env.SMAC_ASSETS_DIR;
const artifacts = new URL('build/artifacts/', import.meta.url);
const optionalInstallerTest = {
  skip: !installer && 'Set SMAC_INSTALLER_PATH to a legally obtained GOG installer EXE',
  timeout: 600000,
};

async function serve(t) {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0'], { cwd: root });
  t.after(() => server.kill());
  let serverLog = '';
  server.stderr.on('data', (data) => { serverLog += data; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${serverLog}`)), 10000);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${serverLog}`));
    });
    server.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
}

async function launcher(t, name) {
  mkdirSync(artifacts, { recursive: true });
  const address = process.env.WASM_SITE_URL || await serve(t);
  const allowedOrigin = new URL(address).origin;
  const browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  const blocked = [];
  const workers = [];
  const logs = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)/i.test(message.text())) errors.push(message.text());
  });
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // The installer and game files stay on this device. Only the application's
    // static files, including its JS/WASM unpacker, may cross the network.
    if (url.protocol.startsWith('http') && (url.origin !== allowedOrigin
        || !['GET', 'HEAD'].includes(request.method()) || /(?:^|\/)assets\//.test(url.pathname)
        || /\.(exe|bin)$/i.test(url.pathname))) {
      blocked.push({ method: request.method(), url: request.url() });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  t.after(async () => {
    try {
      logs.push(await page.locator('#log').textContent({ timeout: 1000 }));
      writeFileSync(new URL(`${name}-log.txt`, artifacts), logs.join('\n--- reload ---\n'));
      if (errors.length) t.diagnostic(errors.join('\n'));
      if (blocked.length) t.diagnostic(JSON.stringify(blocked));
    } finally {
      await browser.close();
    }
  });
  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  return { page, errors, blocked, workers, logs };
}

async function startGame(page, measureImport = false) {
  await page.evaluate((measureImport) => {
    const callMain = Module.callMain;
    const timing = { ticks: 0, maxGap: 0, start: performance.now(), last: performance.now() };
    const timer = measureImport ? setInterval(() => {
      const now = performance.now();
      timing.maxGap = Math.max(timing.maxGap, now - timing.last);
      timing.last = now;
      ++timing.ticks;
    }, 50) : null;
    Module.callMain = (args) => {
      if (measureImport) {
        clearInterval(timer);
        timing.maxGap = Math.max(timing.maxGap, performance.now() - timing.last);
        timing.elapsed = performance.now() - timing.start;
        window.installerTiming = timing;
      }
      return callMain([...args, '--skipintro']);
    };
  }, measureImport);
  await page.locator('#start').click();
}

async function mainMenu(page, name, timeout = 60000) {
  await page.waitForFunction(() => document.body.dataset.state === 'failed'
    || (document.body.dataset.state === 'ready' && !document.querySelector('#start').disabled) || (
    Module.assetStore.loaded.has('openinga.pcx')
    && Module.assetStore.loaded.has('fx/opening menu.wav') && Module.assetStore.pending.size === 0
  ), null, { timeout });
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running',
    await page.locator('#log').textContent());
  let previous;
  let stable = 0;
  let colors = new Set();
  for (let attempt = 0; attempt < 40 && (stable < 2 || colors.size < 64); ++attempt) {
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL(`${name}.png`, artifacts)),
    }));
    stable = previous?.equals(png.data) ? stable + 1 : 0;
    previous = png.data;
    colors = new Set();
    for (let offset = 0; offset < png.data.length; offset += 4) colors.add(png.data.readUInt32LE(offset));
    if (stable < 2 || colors.size < 64) await page.waitForTimeout(100);
  }
  assert.ok(colors.size >= 64 && stable >= 2, 'The original main menu finished rendering');
  return page.evaluate(() => [...Module.assetStore.loaded].sort());
}

async function savedDataset(page) {
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
      files: record.files.map(({ path, size }) => ({ path, size }))
        .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
      blobCount: files.length,
      blobBytes: files.reduce((total, file) => total + file.blob.size, 0),
      allBlobs: files.every((file) => file.blob instanceof Blob),
    };
  });
}

async function baselineFiles(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
    // The browser keeps the game data and omits GOG redistributables, support
    // patchers and installer metadata from these top-level directories.
    if (!relative && /^(?:__redist|__support|app)$/i.test(entry.name)) continue;
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await baselineFiles(directory, path));
    else if (entry.isFile() && path !== 'manifest.json') files.push({ path, size: (await stat(join(directory, path))).size });
  }
  return files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function compareCoreHashes(page) {
  const paths = ['terran.exe', 'alpha.txt', 'openinga.pcx', 'arialnb.ttf', 'fx/opening menu.wav'];
  const expected = await Promise.all(paths.map(async (path) => ({
    path,
    hash: createHash('sha256').update(await readFile(join(baseline, path))).digest('hex'),
  })));
  const actual = await page.evaluate(async (paths) => {
    const store = Module.assetStore;
    const hashes = [];
    for (const path of paths) {
      const entry = await new Promise((resolve, reject) => {
        const request = store.database.transaction('assets', 'readonly').objectStore('assets').get(`${store.current.id}\0${path}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!entry) throw new Error(`Unpacked asset is missing: ${path}`);
      const hash = await crypto.subtle.digest('SHA-256', await entry.blob.arrayBuffer());
      hashes.push({ path, hash: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('') });
    }
    return hashes;
  }, paths);
  assert.deepEqual(actual, expected, 'Unpacked executable, configuration, image, font and sound match the native installation');
}

test('a local GOG installer unpacks responsively, persists the game and restarts from browser storage', optionalInstallerTest, async (t) => {
  const { page, errors, blocked, workers, logs } = await launcher(t, 'installer');
  await page.locator('#asset-source').selectOption('installer');
  await page.locator('#installer').setInputFiles(installer);
  assert.equal(await page.locator('#asset-source').inputValue(), 'installer');
  const workersBeforeImport = workers.length;
  await startGame(page, true);
  const loaded = await mainMenu(page, 'installer-menu', 480000);
  const timing = await page.evaluate(() => window.installerTiming);
  assert.ok(timing.ticks >= 10, `The browser timer kept running during unpacking (${timing.ticks} ticks)`);
  assert.ok(timing.maxGap < 5000, `The browser remained responsive (longest timer pause ${timing.maxGap.toFixed(0)} ms)`);
  assert.ok(workers.length > workersBeforeImport, 'The installer was unpacked in a browser worker');
  const saved = await savedDataset(page);
  assert.ok(saved.files.length > 100, 'The original installation was unpacked');
  assert.ok(saved.files.every(({ path }) => !/^(?:__redist|__support|app)\//i.test(path)),
    'GOG support programs and installer metadata are excluded');
  assert.equal(saved.blobCount, saved.files.length, 'Every published file has a persistent Blob');
  assert.equal(saved.blobBytes, saved.files.reduce((total, file) => total + file.size, 0));
  assert.ok(saved.allBlobs);
  if (baseline) {
    assert.deepEqual(saved.files, await baselineFiles(baseline), 'The installer produced the complete native-extracted file set');
    await compareCoreHashes(page);
  }
  assert.deepEqual(blocked, [], 'Neither installer nor game assets were uploaded or fetched');
  assert.deepEqual(errors, [], 'No browser or WebGL errors while unpacking and starting the game');
  logs.push(await page.locator('#log').textContent());

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  assert.equal(await page.locator('#installer').evaluate((input) => input.files.length), 0);
  assert.equal(await page.locator('#asset-source').inputValue(), 'cached');
  await startGame(page);
  assert.deepEqual(await mainMenu(page, 'installer-cached-menu'), loaded);
  assert.deepEqual(await savedDataset(page), saved, 'The complete unpacked installation survived reload');
  assert.deepEqual(blocked, [], 'Cached startup needs no installer or hosted game assets');
  assert.deepEqual(errors, [], 'No browser or WebGL errors after the cached restart');
  logs.push(await page.locator('#log').textContent());
  assert.doesNotMatch(logs.join('\n'), /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);
  t.diagnostic(`Locally unpacked ${saved.files.length} files (${(saved.blobBytes / 1024 / 1024).toFixed(1)} MiB) in ${(timing.elapsed / 1000).toFixed(1)} s; browser timer ran ${timing.ticks} times; cached restart required no installer.`);
});

test('an invalid installer fails without publishing or caching an installation', { timeout: 90000 }, async (t) => {
  const { page, errors, blocked } = await launcher(t, 'installer-invalid');
  await page.locator('#asset-source').selectOption('installer');
  await page.locator('#installer').setInputFiles({
    name: 'invalid-gog-installer.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('This synthetic fixture is not an Inno Setup installer.'),
  });
  await page.locator('#start').click();
  await page.waitForFunction(() => document.body.dataset.state === 'failed'
    || (document.body.dataset.state === 'ready' && !document.querySelector('#start').disabled));
  assert.equal(await page.locator('body').getAttribute('data-state'), 'ready');
  assert.match(await page.locator('#status').textContent(), /could not|failed|invalid|unsupported|error/i);
  assert.deepEqual(await page.evaluate(() => Module.assetStore.list()), []);
  const cached = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = Module.assetStore.database.transaction('assets', 'readonly').objectStore('assets').count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
  assert.equal(cached, 0, 'A rejected installer leaves no partial files');
  assert.deepEqual(blocked, []);
  assert.deepEqual(errors, [], 'Invalid installer errors are handled without browser runtime errors');
});
