import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Exercise the built application's actual MEMFS/IDBFS and launcher without
// starting the engine. Fixtures contain synthetic terrain, never game assets.
const root = fileURLToPath(new URL('../../', import.meta.url));
const build = resolve(process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`);
const mapDirectory = '/persist/glsmac/maps';
let server;
let browser;
let origin;
const requested = [];

before(async () => {
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    requested.push(path);
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cache-Control', 'no-store');
    const file = resolve(build, decodeURIComponent(path.slice(1)) || 'index.html');
    if (!file.startsWith(`${build}${sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
      response.setHeader('Content-Type', types[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  origin = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
  browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function setup(t) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  t.after(() => assert.deepEqual(errors, [], 'No launcher or runtime errors'));
  await page.goto(origin);
  await ready(page);
  return page;
}

async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  assert.equal(await page.evaluate(() => Module.FS.lookupPath('/persist').node.mount.type === Module.IDBFS), true,
    'The real persistent Emscripten filesystem is mounted');
}

function mpFixture() {
  const width = 4;
  const height = 4;
  const count = width * height / 2;
  const bytes = Buffer.alloc(15 + 0xaa4 + count * 44 + 1);
  bytes.write('TERRANMAP\0\x1a', 0, 'binary');
  bytes.writeUInt32LE(5, 11);
  for (const [offset, value] of [[0, width], [4, height], [20, count], [0xa24, 1], [0xa28, 1], [0xa2c, 1]]) {
    bytes.writeUInt32LE(value, 15 + offset);
  }
  for (let index = 0; index < count; ++index) {
    bytes[15 + 0xaa4 + index * 44] = 3 * 32;
    bytes[15 + 0xaa4 + index * 44 + 1] = 60;
  }
  return bytes;
}

function record(type, body) {
  const result = Buffer.alloc(body.length + 6);
  result[0] = type;
  result.writeUInt32LE(body.length, 1);
  body.copy(result, 5);
  result[result.length - 1] = body.reduce((checksum, value) => checksum ^ value, 0);
  return result;
}

function integer(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(BigInt(value));
  return record(2, bytes);
}

function gsmFixture() {
  const tiles = [];
  for (let y = 0; y < 2; ++y) {
    const values = [y, y, 100, 100, 100, 100, 100, 1, 1, 0, 0, 0];
    tiles.push(record(4, Buffer.concat(values.map(integer))));
  }
  return Buffer.concat([integer(2), integer(2), ...tiles, record(1, Buffer.from([0]))]);
}

async function importMaps(page, files) {
  await page.locator('#custom-maps').setInputFiles(files.map(([name, buffer]) => ({ name, buffer, mimeType: 'application/octet-stream' })));
  await page.locator('#import-maps').click();
  await page.waitForFunction(() => !document.getElementById('import-maps').disabled);
  return page.locator('#custom-map-status').textContent();
}

async function savedMaps(page) {
  return page.evaluate((directory) => Object.fromEntries(Module.customMaps.list()
    .map((name) => [name, Array.from(Module.FS.readFile(`${directory}/${name}`))])), mapDirectory);
}

test('custom maps persist after refresh and remain available offline without replacing game assets', { timeout: 90000 }, async (t) => {
  const page = await setup(t);
  const mp = mpFixture();
  const gsm = gsmFixture();
  const status = await importMaps(page, [['Friends.MP', mp], ['Terrain.gSm', gsm]]);
  assert.match(status, /Saved 2 maps/);
  assert.equal(await page.locator('#asset-source').inputValue(), 'installer', 'Map import does not change the selected asset source');
  assert.deepEqual(await savedMaps(page), { 'Friends.MP': [...mp], 'Terrain.gSm': [...gsm] });

  const installation = await page.evaluate(async () => {
    const file = new File(['synthetic installation'], 'alpha.txt', { lastModified: 1000 });
    await Module.assetStore.importFiles([file]);
    await Module.assetStore.ensureFile('/smac/alpha.txt');
    return { id: Module.assetStore.current.id, bytes: Array.from(Module.FS.readFile('/smac/alpha.txt')) };
  });
  assert.deepEqual(await savedMaps(page), { 'Friends.MP': [...mp], 'Terrain.gSm': [...gsm] },
    'Activating an installation does not delete custom maps');
  await page.reload();
  await ready(page);
  assert.deepEqual(await page.locator('#custom-map-list li').allTextContents(), ['Friends.MP', 'Terrain.gSm']);
  await page.context().setOffline(true);
  const requestsBefore = requested.length;
  await page.evaluate(async (id) => {
    await Module.assetStore.restore(id);
    await Module.assetStore.ensureFile('/smac/alpha.txt');
  }, installation.id);
  assert.deepEqual(await savedMaps(page), { 'Friends.MP': [...mp], 'Terrain.gSm': [...gsm] });
  assert.deepEqual(await page.evaluate(() => Array.from(Module.FS.readFile('/smac/alpha.txt'))), installation.bytes);
  await page.evaluate((id) => Module.assetStore.clear(id), installation.id);
  assert.deepEqual(await savedMaps(page), { 'Friends.MP': [...mp], 'Terrain.gSm': [...gsm] },
    'Clearing saved installation assets leaves custom terrain maps intact');
  assert.equal(requested.length, requestsBefore, 'Reading persisted maps and installation files needs no network');
});

test('map import rejects malformed files and case-insensitive duplicate batches without overwriting saved maps', { timeout: 90000 }, async (t) => {
  const page = await setup(t);
  const original = mpFixture();
  assert.match(await importMaps(page, [['Original.MP', original]]), /Saved 1 map/);
  const broken = mpFixture();
  broken.writeUInt32LE(3, 15);
  const cases = [
    [['Good.GSM', gsmFixture()], ['Broken.mp', broken]],
    [['Bad.mp', Buffer.from('not a map')]],
    [['Bad.gsm', Buffer.alloc(400)]],
    [['Program.exe', original]],
    [['Twin.MP', original], ['twin.mp', original]],
    [['original.mp', original]],
  ];
  for (const files of cases) {
    assert.match(await importMaps(page, files), /Could not import maps:/);
    assert.deepEqual(await savedMaps(page), { 'Original.MP': [...original] },
      'An invalid batch leaves the previously saved map unchanged');
  }
  const unsafe = await page.evaluate(async (bytes) => {
    const file = new File([new Uint8Array(bytes)], 'safe.mp');
    Object.defineProperty(file, 'name', { value: '../unsafe.mp' });
    try { await Module.customMaps.importFiles([file]); } catch (error) { return error.message; }
  }, [...original]);
  assert.match(unsafe, /plain filenames/);
  await page.reload();
  await ready(page);
  assert.deepEqual(await savedMaps(page), { 'Original.MP': [...original] });
});

test('a browser persistence failure is reported and failed map files are rolled back before retry', { timeout: 90000 }, async (t) => {
  const page = await setup(t);
  const original = gsmFixture();
  assert.match(await importMaps(page, [['Existing.gsm', original]]), /Saved 1 map/);
  await page.evaluate(() => {
    const syncfs = Module.FS.syncfs;
    let fail = true;
    Module.FS.syncfs = (populate, callback) => {
      if (!populate && fail) {
        fail = false;
        callback(new Error('Synthetic storage failure'));
      } else {
        syncfs(populate, callback);
      }
    };
  });
  assert.match(await importMaps(page, [['Retry.mp', mpFixture()]]), /Could not import maps: Synthetic storage failure/);
  assert.deepEqual(await savedMaps(page), { 'Existing.gsm': [...original] });
  await page.reload();
  await ready(page);
  assert.deepEqual(await savedMaps(page), { 'Existing.gsm': [...original] }, 'Failed files did not survive in IDBFS');
  assert.match(await importMaps(page, [['Retry.mp', mpFixture()]]), /Saved 1 map/);
});
