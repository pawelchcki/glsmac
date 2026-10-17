import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Use actual Emscripten MEMFS in a browser. All game files in this suite are
// synthetic: the tests never need, fetch, or distribute original SMAC assets.
const fixtures = new Map();
const requests = new Map();
let server;
let browser;
let origin;
let databaseCounter = 0;
const databases = new WeakMap();

const digest = (data) => createHash('sha256').update(data).digest('hex');

function fixture(path, body, contentType = 'application/octet-stream') {
  const value = { body: Buffer.from(body), contentType, status: 200, receivedCookies: [] };
  fixtures.set(path, value);
  return value;
}

function requestCount(path) {
  return requests.get(path) || 0;
}

before(async () => {
  const [assetStore, platformJS, platformWasm] = await Promise.all([
    readFile(new URL('../../web/asset-store.js', import.meta.url)),
    readFile(new URL('build/platform.cjs', import.meta.url)),
    readFile(new URL('build/platform.wasm', import.meta.url)),
  ]);
  server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    requests.set(path, requestCount(path) + 1);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><script src="/platform.cjs"></script><script src="/asset-store.js"></script>');
      return;
    }
    const source = {
      '/asset-store.js': [assetStore, 'text/javascript'],
      '/platform.cjs': [platformJS, 'text/javascript'],
      '/platform.wasm': [platformWasm, 'application/wasm'],
    }[path];
    if (source) {
      response.setHeader('Content-Type', source[1]);
      response.end(source[0]);
      return;
    }
    const asset = fixtures.get(path);
    if (asset) asset.receivedCookies.push(request.headers.cookie || null);
    if (asset?.requiredCookie && !request.headers.cookie?.split(/;\s*/).includes(asset.requiredCookie)) {
      response.statusCode = 401;
      response.end('Synthetic login required');
      return;
    }
    response.statusCode = asset?.status || 404;
    response.setHeader('Cache-Control', asset?.cacheControl || 'no-store');
    response.setHeader('Content-Type', asset?.contentType || 'text/plain');
    response.end(asset?.body || 'No such fixture');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function fixturePage(t) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  t.after(() => assert.deepEqual(errors, [], 'No browser runtime errors'));
  await page.goto(origin);
  databases.set(page, `glsmac-asset-test-${++databaseCounter}`);
  await boot(page);
  return page;
}

async function boot(page) {
  await page.evaluate(async (databaseName) => {
    window.wasm = await Module();
    window.store = new GLSMACAssets.AssetStore({ fs: wasm.FS, databaseName });
    await store.open();
  }, databases.get(page));
}

function remote(directory, files) {
  const entries = Object.entries(files).map(([path, body]) => {
    const data = Buffer.from(body);
    fixture(`/${directory}/${path}`, data);
    return { path, size: data.length, sha256: digest(data) };
  });
  const manifest = { version: 1, id: digest(JSON.stringify(entries)), files: entries };
  fixture(`/${directory}/manifest.json`, JSON.stringify(manifest), 'application/json');
  return { url: `${origin}/${directory}/manifest.json`, manifest };
}

async function readAsset(page, path) {
  return page.evaluate((path) => Array.from(wasm.FS.readFile(`/smac/${path}`)), path);
}

test('asset authentication stays on the app origin while cross-origin hosts receive no cookies', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const cookie = { name: 'glsmac_test_auth', value: 'synthetic-auth-cookie' };
  await page.context().addCookies([{ ...cookie, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const authenticated = remote('same-origin-auth', { 'protected.bin': 'authenticated asset' });
  const protectedPaths = ['/same-origin-auth/manifest.json', '/same-origin-auth/protected.bin'];
  for (const path of protectedPaths) fixtures.get(path).requiredCookie = `${cookie.name}=${cookie.value}`;
  await page.evaluate(async (url) => {
    await store.useRemote(url);
    await store.ensureFile('/smac/protected.bin');
  }, authenticated.url);
  assert.deepEqual(await readAsset(page, 'protected.bin'), [...Buffer.from('authenticated asset')]);
  for (const path of protectedPaths) {
    assert.deepEqual(fixtures.get(path).receivedCookies, [`${cookie.name}=${cookie.value}`],
      `The existing login authenticates ${path}`);
  }

  const crossRequests = [];
  const crossServer = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    crossRequests.push({ path, cookie: request.headers.cookie || null });
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cache-Control', 'no-store');
    const asset = fixtures.get(path);
    response.statusCode = asset ? 200 : 404;
    response.setHeader('Content-Type', asset?.contentType || 'text/plain');
    response.end(asset?.body || 'No such fixture');
  });
  t.after(() => new Promise((resolve) => crossServer.close(resolve)));
  await new Promise((resolve, reject) => {
    crossServer.once('error', reject);
    crossServer.listen(0, '127.0.0.1', resolve);
  });
  const crossOrigin = `http://127.0.0.1:${crossServer.address().port}`;
  assert.notEqual(crossOrigin, origin);
  // Cookies are scoped by hostname, so this other port has the same cookie
  // available. Their absence below proves fetch excludes cross-origin cookies.
  assert.ok((await page.context().cookies([crossOrigin])).some((item) => item.name === cookie.name));
  const external = remote('cross-origin-auth', { 'public.bin': 'cross-origin asset' });
  await page.evaluate(async (url) => {
    await store.useRemote(url);
    await store.ensureFile('/smac/public.bin');
  }, external.url.replace(origin, crossOrigin));
  assert.deepEqual(await readAsset(page, 'public.bin'), [...Buffer.from('cross-origin asset')]);
  assert.deepEqual(crossRequests, [
    { path: '/cross-origin-auth/manifest.json', cookie: null },
    { path: '/cross-origin-auth/public.bin', cookie: null },
  ]);
});

test('local game folders persist and restore into real MEMFS without another selection', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const imported = await page.evaluate(async () => {
    const text = new File(['local fixture'], 'alpha.txt');
    const binary = new File([new Uint8Array([0, 1, 127, 255])], 'sample.bin');
    Object.defineProperty(text, 'webkitRelativePath', { value: 'Game/alpha.txt' });
    Object.defineProperty(binary, 'webkitRelativePath', { value: 'Game/fx/sample.bin' });
    await store.importFiles([text, binary], { label: 'Selected game folder' });
    await store.ensureFile('/smac/alpha.txt');
    await store.ensureFile('/smac/fx/sample.bin');
    return { id: store.current.id, kind: store.current.kind, saved: await store.list() };
  });
  assert.equal(imported.kind, 'local');
  assert.ok(imported.saved.some((record) => record.id === imported.id));
  assert.deepEqual(await readAsset(page, 'alpha.txt'), [...Buffer.from('local fixture')]);
  assert.deepEqual(await readAsset(page, 'fx/sample.bin'), [0, 1, 127, 255]);

  await page.reload();
  await boot(page);
  const restored = await page.evaluate(async () => {
    const result = await store.restore();
    await store.ensureFile('/smac/alpha.txt');
    await store.ensureFile('/smac/fx/sample.bin');
    return { result, id: store.current.id, kind: store.current.kind };
  });
  assert.ok(restored.result);
  assert.equal(restored.id, imported.id);
  assert.equal(restored.kind, 'local');
  assert.deepEqual(await readAsset(page, 'fx/sample.bin'), [0, 1, 127, 255]);
});

test('failed local imports roll back files and preserve the saved installation', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const result = await page.evaluate(async () => {
    const makeFile = (text, name) => new File([text], name, { lastModified: 1000 });
    await store.importFiles([makeFile('first', 'alpha.txt'), makeFile('other', 'beta.txt')]);
    const savedID = store.current.id;
    const attempts = [];
    // Cover both orphan blobs under a new id and overwrites under the existing
    // id, where matching filenames, sizes and timestamps identify the source.
    for (const files of [
      [makeFile('new one', 'new-a.txt'), makeFile('new two', 'new-b.txt')],
      [makeFile('FIRST', 'alpha.txt'), makeFile('OTHER', 'beta.txt')],
    ]) {
      const originalPut = IDBObjectStore.prototype.put;
      let assetWrites = 0;
      let failure;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'assets' && ++assetWrites === 2) {
          throw new DOMException('Injected local import failure', 'QuotaExceededError');
        }
        return originalPut.apply(this, args);
      };
      try {
        await store.importFiles(files);
      } catch (error) {
        failure = error.name;
      } finally {
        IDBObjectStore.prototype.put = originalPut;
      }
      const assets = await store.operation('assets', 'readonly', (objectStore) => objectStore.getAll());
      attempts.push({
        failure,
        currentID: store.current.id,
        selectedID: await store.operation('settings', 'readonly', (objectStore) => objectStore.get('selected')),
        datasetIDs: (await store.list()).map((record) => record.id),
        assets: await Promise.all(assets.map(async (asset) => ({
          dataset: asset.dataset, text: await asset.blob.text(),
        }))),
      });
    }
    return { savedID, attempts };
  });
  for (const attempt of result.attempts) {
    assert.equal(attempt.failure, 'QuotaExceededError');
    assert.equal(attempt.currentID, result.savedID);
    assert.equal(attempt.selectedID, result.savedID);
    assert.deepEqual(attempt.datasetIDs, [result.savedID]);
    assert.deepEqual(attempt.assets.map((asset) => asset.text).sort(), ['first', 'other']);
    assert.ok(attempt.assets.every((asset) => asset.dataset === result.savedID));
  }
  await page.reload();
  await boot(page);
  await page.evaluate(async () => {
    await store.restore();
    await store.ensureFile('/smac/alpha.txt');
    await store.ensureFile('/smac/beta.txt');
  });
  assert.deepEqual(await readAsset(page, 'alpha.txt'), [...Buffer.from('first')]);
  assert.deepEqual(await readAsset(page, 'beta.txt'), [...Buffer.from('other')]);
});

test('failed source selections preserve the active files and persisted selection', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const target = remote('selection-rollback', { 'shared.bin': 'hosted value' });
  const result = await page.evaluate(async ({ url, id }) => {
    await store.importFiles([new File(['saved value'], 'shared.bin')]);
    await store.ensureFile('/smac/shared.bin');
    const previousID = store.current.id;
    const rejectSelection = async (select) => {
      const originalPut = IDBObjectStore.prototype.put;
      let failure;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'settings') throw new DOMException('Injected selection failure', 'QuotaExceededError');
        return originalPut.apply(this, args);
      };
      try {
        await select();
      } catch (error) {
        failure = error.name;
      } finally {
        IDBObjectStore.prototype.put = originalPut;
      }
      return {
        failure,
        currentID: store.current.id,
        selectedID: await store.operation('settings', 'readonly', (objectStore) => objectStore.get('selected')),
        datasetIDs: (await store.list()).map((record) => record.id),
        bytes: [...wasm.FS.readFile('/smac/shared.bin')],
      };
    };
    const failedRemote = await rejectSelection(() => store.useRemote(url));
    const targetAfterFailure = await store.operation('datasets', 'readonly', (objectStore) => objectStore.get(id));

    // A failed restore must also leave the previous selection and mount intact.
    await store.useRemote(url);
    await store.restore(previousID);
    await store.ensureFile('/smac/shared.bin');
    const remoteBefore = await store.operation('datasets', 'readonly', (objectStore) => objectStore.get(id));
    const failedRestore = await rejectSelection(() => store.restore(id));
    const remoteAfter = await store.operation('datasets', 'readonly', (objectStore) => objectStore.get(id));
    return { previousID, failedRemote, targetAfterFailure, failedRestore, remoteBefore, remoteAfter };
  }, { url: target.url, id: target.manifest.id });
  for (const attempt of [result.failedRemote, result.failedRestore]) {
    assert.equal(attempt.failure, 'QuotaExceededError');
    assert.equal(attempt.currentID, result.previousID);
    assert.equal(attempt.selectedID, result.previousID);
    assert.deepEqual(attempt.bytes, [...Buffer.from('saved value')]);
  }
  assert.deepEqual(result.failedRemote.datasetIDs, [result.previousID]);
  assert.equal(result.targetAfterFailure, undefined, 'A failed selection does not publish a partial dataset');
  assert.deepEqual(new Set(result.failedRestore.datasetIDs), new Set([result.previousID, target.manifest.id]));
  assert.deepEqual(result.remoteAfter, result.remoteBefore, 'A failed restore does not update the saved dataset');
});

test('remote manifests download demanded files only and coalesce simultaneous reads', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const source = remote('demand-only', {
    'alpha.txt': 'demanded asset',
    'fx/unused.bin': 'unused asset',
    'fx/tone #1.bin': 'URL-escaped asset',
    'empty.bin': '',
  });
  await page.evaluate((url) => store.useRemote(url), source.url);
  assert.equal(requestCount('/demand-only/manifest.json'), 1);
  assert.equal(requestCount('/demand-only/alpha.txt'), 0);
  assert.equal(requestCount('/demand-only/fx/unused.bin'), 0);

  await page.evaluate(() => Promise.all([
    store.ensureFile('/smac/alpha.txt'),
    store.ensureFile('/smac/alpha.txt'),
    store.ensureFile('/smac/alpha.txt'),
  ]));
  assert.equal(requestCount('/demand-only/alpha.txt'), 1);
  assert.equal(requestCount('/demand-only/fx/unused.bin'), 0);
  assert.deepEqual(await readAsset(page, 'alpha.txt'), [...Buffer.from('demanded asset')]);
  await page.evaluate(() => store.ensureFile('/smac/empty.bin'));
  assert.deepEqual(await readAsset(page, 'empty.bin'), []);
  await page.evaluate(() => store.ensureFile('/smac/fx/tone #1.bin'));
  assert.deepEqual(await readAsset(page, 'fx/tone #1.bin'), [...Buffer.from('URL-escaped asset')]);
  await page.evaluate(() => store.ensureFile('/smac/alpha.txt'));
  assert.equal(requestCount('/demand-only/alpha.txt'), 1);
});

test('downloaded remote files and manifests survive reload and remain available offline', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const source = remote('offline-cache', { 'cached.bin': 'cached bytes', 'later.bin': 'later bytes' });
  await page.evaluate(async (url) => {
    await store.useRemote(url);
    await store.ensureFile('/smac/cached.bin');
  }, source.url);
  await page.reload();
  await boot(page);
  await page.context().setOffline(true);
  try {
    const restored = await page.evaluate(async () => {
      const result = await store.restore();
      await store.ensureFile('/smac/cached.bin');
      return { result, id: store.current.id, kind: store.current.kind };
    });
    assert.ok(restored.result);
    assert.equal(restored.id, source.manifest.id);
    assert.equal(restored.kind, 'remote');
    assert.deepEqual(await readAsset(page, 'cached.bin'), [...Buffer.from('cached bytes')]);
    assert.equal(requestCount('/offline-cache/manifest.json'), 1);
    assert.equal(requestCount('/offline-cache/cached.bin'), 1);
    const missing = await page.evaluate(async () => {
      try {
        await store.ensureFile('/smac/later.bin');
        return null;
      } catch (error) {
        return String(error);
      }
    });
    assert.ok(missing, 'An uncached file fails clearly while offline');
  } finally {
    await page.context().setOffline(false);
  }
  await page.evaluate(() => store.ensureFile('/smac/later.bin'));
  assert.deepEqual(await readAsset(page, 'later.bin'), [...Buffer.from('later bytes')]);
});

test('corrupt responses never populate file bodies or persistent cache and can be retried', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const source = remote('integrity', { 'checked.bin': 'correct content' });
  fixtures.get('/integrity/checked.bin').body = Buffer.from('corrupt content');
  await page.evaluate((url) => store.useRemote(url), source.url);
  const failure = await page.evaluate(async () => {
    try {
      await store.ensureFile('/smac/checked.bin');
      return null;
    } catch (error) {
      return {
        error: String(error),
        storedBytes: wasm.FS.lookupPath('/smac/checked.bin').node.contents?.byteLength || 0,
      };
    }
  });
  assert.ok(failure);
  assert.match(failure.error, /hash|sha|integrity|checksum/i);
  // The manifest exposes empty discovery placeholders before downloads. Failed
  // responses must leave them empty rather than making corrupt bytes readable.
  assert.equal(failure.storedBytes, 0);

  await page.reload();
  await boot(page);
  await page.evaluate(() => store.restore());
  fixtures.get('/integrity/checked.bin').body = Buffer.from('correct content');
  await page.evaluate(() => store.ensureFile('/smac/checked.bin'));
  assert.equal(requestCount('/integrity/checked.bin'), 2, 'The corrupt response was not cached');
  assert.deepEqual(await readAsset(page, 'checked.bin'), [...Buffer.from('correct content')]);
});

test('failed HTTP responses and size mismatches remain retryable', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const source = remote('failed-response', { 'retry.bin': 'healthy' });
  const file = fixtures.get('/failed-response/retry.bin');
  file.status = 503;
  await page.evaluate((url) => store.useRemote(url), source.url);
  const ensure = () => page.evaluate(async () => {
    try {
      await store.ensureFile('/smac/retry.bin');
      return null;
    } catch (error) {
      return {
        error: String(error),
        storedBytes: wasm.FS.lookupPath('/smac/retry.bin').node.contents?.byteLength || 0,
      };
    }
  });
  const unavailable = await ensure();
  assert.ok(unavailable);
  assert.match(unavailable.error, /503/);
  assert.equal(unavailable.storedBytes, 0);
  file.status = 200;
  file.body = Buffer.from('short');
  const truncated = await ensure();
  assert.ok(truncated);
  assert.match(truncated.error, /size|length|bytes/i);
  assert.equal(truncated.storedBytes, 0);
  file.body = Buffer.from('healthy');
  assert.equal(await ensure(), null);
  assert.equal(requestCount('/failed-response/retry.bin'), 3);
  assert.deepEqual(await readAsset(page, 'retry.bin'), [...Buffer.from('healthy')]);
});

test('dataset revisions isolate same-path files and restore the selected revision', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const first = remote('revision-one', { 'shared.bin': 'first revision' });
  const second = remote('revision-two', { 'shared.bin': 'second revision' });
  await page.evaluate(async (url) => {
    await store.useRemote(url);
    await store.ensureFile('/smac/shared.bin');
  }, first.url);
  assert.deepEqual(await readAsset(page, 'shared.bin'), [...Buffer.from('first revision')]);
  await page.evaluate(async (url) => {
    await store.useRemote(url);
    await store.ensureFile('/smac/shared.bin');
  }, second.url);
  assert.deepEqual(await readAsset(page, 'shared.bin'), [...Buffer.from('second revision')]);
  assert.equal(requestCount('/revision-one/shared.bin'), 1);
  assert.equal(requestCount('/revision-two/shared.bin'), 1);
  assert.equal((await page.evaluate(() => store.list())).length, 2);

  await page.reload();
  await boot(page);
  await page.evaluate(async (id) => {
    await store.restore(id);
    await store.ensureFile('/smac/shared.bin');
  }, first.manifest.id);
  assert.deepEqual(await readAsset(page, 'shared.bin'), [...Buffer.from('first revision')]);
  assert.equal(requestCount('/revision-one/shared.bin'), 1);
});

test('updated hosted files revalidate stale HTTP cache entries for new revisions', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const directory = 'http-cached-revision';
  const path = `/${directory}/shared.bin`;
  const first = remote(directory, { 'shared.bin': 'first revision' });
  fixtures.get(path).cacheControl = 'public, max-age=3600';
  await page.evaluate(async (url) => {
    await store.useRemote(url);
    await store.ensureFile('/smac/shared.bin');
  }, first.url);
  assert.equal(requestCount(path), 1);

  const second = remote(directory, { 'shared.bin': 'second revision' });
  fixtures.get(path).cacheControl = 'public, max-age=3600';
  await page.evaluate(async (url) => {
    await store.useRemote(url);
    await store.ensureFile('/smac/shared.bin');
  }, second.url);
  assert.equal(requestCount(path), 2, 'A new manifest revision does not reuse stale HTTP bytes');
  assert.deepEqual(await readAsset(page, 'shared.bin'), [...Buffer.from('second revision')]);
});

test('local and remote traversal paths cannot write outside the game directory', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  const local = await page.evaluate(async () => {
    const file = new File(['escape'], 'escape.bin');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Game/../escape.bin' });
    try {
      await store.importFiles([file]);
      return null;
    } catch (error) {
      return String(error);
    }
  });
  assert.ok(local, 'Local traversal is rejected');

  for (const [index, path] of ['../escape.bin', '/escape.bin', 'fx/../../escape.bin', 'fx\\..\\escape.bin'].entries()) {
    const manifest = {
      version: 1,
      id: digest(`invalid-manifest-${index}`),
      files: [{ path, size: 6, sha256: digest('escape') }],
    };
    const manifestPath = `/traversal-${index}/manifest.json`;
    fixture(manifestPath, JSON.stringify(manifest), 'application/json');
    const failure = await page.evaluate(async (url) => {
      try {
        await store.useRemote(url);
        return null;
      } catch (error) {
        return String(error);
      }
    }, `${origin}${manifestPath}`);
    assert.ok(failure, `Reject unsafe manifest path ${JSON.stringify(path)}`);
  }
  assert.equal(await page.evaluate(() => wasm.FS.analyzePath('/escape.bin').exists), false);
});

test('direct file imports work and clearing stored assets survives reload', { timeout: 30000 }, async (t) => {
  const page = await fixturePage(t);
  await page.evaluate(async () => {
    await store.importFiles([new File(['direct file'], 'direct.bin')]);
    await store.ensureFile('/smac/direct.bin');
  });
  assert.deepEqual(await readAsset(page, 'direct.bin'), [...Buffer.from('direct file')]);
  await page.evaluate(() => store.clear());
  assert.deepEqual(await page.evaluate(() => store.list()), []);
  await page.reload();
  await boot(page);
  assert.equal(await page.evaluate(() => store.restore()), false);
  assert.deepEqual(await page.evaluate(() => store.list()), []);
  assert.equal(await page.evaluate(() => wasm.FS.analyzePath('/smac/direct.bin').exists), false);
});
