import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('real C++ asset reads await main-thread browser fetches from pthreads', { timeout: 30000 }, async (t) => {
  const [javascript, wasm] = await Promise.all([
    readFile(new URL('build/asset-bridge.js', import.meta.url)),
    readFile(new URL('build/asset-bridge.wasm', import.meta.url)),
  ]);
  const requests = new Map();
  const fixtures = new Map([
    ['/assets/alpha.txt', Buffer.from('streamed text fixture')],
    ['/assets/fx/sample.bin', Buffer.from([0, 1, 127, 255])],
    ['/assets/empty.bin', Buffer.alloc(0)],
    ['/assets/concurrent.txt', Buffer.from('parallel fixture')],
  ]);
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cache-Control', 'no-store');
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><script src="/asset-bridge.js"></script>');
    } else if (path === '/asset-bridge.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(javascript);
    } else if (path === '/asset-bridge.wasm') {
      response.setHeader('Content-Type', 'application/wasm');
      response.end(wasm);
    } else if (path.startsWith('/assets/')) {
      requests.set(path, (requests.get(path) || 0) + 1);
      // Keep the actual HTTP request pending so a blocked browser main thread
      // would deadlock, even though the game worker uses a synchronous API.
      setTimeout(() => {
        response.statusCode = fixtures.has(path) ? 200 : 503;
        response.end(fixtures.get(path) || 'Temporarily unavailable');
      }, 30);
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const output = [];
    let resolveExit;
    const exited = new Promise((resolve) => { resolveExit = resolve; });
    const module = await createAssetBridge({
      noInitialRun: true,
      print: (message) => output.push(message),
      printErr: (message) => output.push(message),
      onExit: (code) => resolveExit(code),
    });
    module.FS.mkdirTree('/smac/fx');
    for (const path of ['alpha.txt', 'fx/sample.bin', 'empty.bin', 'concurrent.txt', 'missing.txt']) {
      module.FS.writeFile(`/smac/${path}`, new Uint8Array());
    }
    module.FS.writeFile('/smac/local.txt', 'already present');
    const loaded = new Set();
    const pending = new Map();
    module.assetStore = {
      ensureFile(path) {
        if (loaded.has(path)) return Promise.resolve(true);
        if (pending.has(path)) return pending.get(path);
        const request = (async () => {
          const response = await fetch(`/assets/${path.slice('/smac/'.length)}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
          module.FS.writeFile(path, new Uint8Array(await response.arrayBuffer()));
          loaded.add(path);
          return true;
        })();
        pending.set(path, request);
        return request.finally(() => pending.delete(path));
      },
    };
    let ticks = 0;
    const timer = setInterval(() => ++ticks, 5);
    module.callMain([]);
    const code = await exited;
    clearInterval(timer);
    return { code, output, ticks, loaded: [...loaded] };
  });
  assert.equal(result.code, 0, result.output.join('\n'));
  assert.match(result.output.join('\n'), /Real asset bridge.*reads passed/);
  assert.ok(result.ticks > 3, 'The browser event loop stayed responsive during worker reads');
  assert.equal(result.loaded.length, 4);
  assert.equal(requests.get('/assets/concurrent.txt'), 1, 'Concurrent workers share one pending download');
  assert.equal(requests.get('/assets/local.txt'), undefined, 'An absent store preserves ordinary filesystem reads');
  assert.deepEqual(errors, [], 'No browser runtime errors');
});
