import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = resolve(process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`);
const projectPath = '/glsmac/';
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.txt': 'text/plain',
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

test('headerless project hosting enables WASM threads through its scoped service worker', { timeout: 120000 }, async (t) => {
  const requested = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    requested.push(path);
    // Deliberately omit COOP, COEP and CORP, just like GitHub Pages.
    response.setHeader('Cache-Control', 'no-store');
    if (!path.startsWith(projectPath)) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    try {
      const relative = decodeURIComponent(path.slice(projectPath.length)) || 'index.html';
      const file = resolve(build, relative);
      if (!file.startsWith(`${build}${sep}`)) throw new Error('Invalid project path');
      const extension = file.slice(file.lastIndexOf('.'));
      response.setHeader('Content-Type', mime[extension] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });
  const origin = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const corsServer = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'text/plain');
    response.end('cross-origin fixture');
  });
  const corsOrigin = await listen(corsServer);
  t.after(() => new Promise((resolve) => corsServer.close(resolve)));
  const browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  let navigations = 0;
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) ++navigations; });
  const first = await page.goto(`${origin}${projectPath}`);
  assert.equal(first.headers()['cross-origin-opener-policy'], undefined, 'The static host supplies no isolation headers');
  await page.waitForFunction(() => crossOriginIsolated && document.body.dataset.state === 'ready');
  assert.equal(navigations, 2, 'The initial visit reloads exactly once to enable isolation');
  const isolation = await page.evaluate(async () => ({
    sharedMemory: typeof SharedArrayBuffer !== 'undefined',
    controller: navigator.serviceWorker.controller?.scriptURL,
    scopes: (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.scope),
    caches: await caches.keys(),
  }));
  assert.equal(isolation.sharedMemory, true);
  assert.equal(isolation.controller, `${origin}${projectPath}coi-serviceworker.js`);
  assert.deepEqual(isolation.scopes, [`${origin}${projectPath}`]);
  assert.deepEqual(isolation.caches, [], 'Isolation does not create an offline data cache');

  const refreshed = await page.reload();
  await page.waitForFunction(() => crossOriginIsolated && document.body.dataset.state === 'ready');
  assert.equal(refreshed.headers()['cross-origin-opener-policy'], 'same-origin');
  assert.equal(refreshed.headers()['cross-origin-embedder-policy'], 'require-corp');
  assert.equal(refreshed.headers()['cross-origin-resource-policy'], 'same-origin');
  assert.equal(navigations, 3, 'An isolated refresh starts without another automatic reload');
  const cors = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return {
      text: await response.text(),
      policy: response.headers.get('Cross-Origin-Resource-Policy'),
    };
  }, `${corsOrigin}/fixture`);
  assert.deepEqual(cors, { text: 'cross-origin fixture', policy: null });

  await page.locator('#asset-source').selectOption('none');
  await page.locator('#start').click();
  const artifacts = new URL('build/artifacts/', import.meta.url);
  mkdirSync(artifacts, { recursive: true });
  let colors = new Set();
  for (let attempt = 0; attempt < 40 && colors.size < 8; ++attempt) {
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL('pages-setup.png', artifacts)),
    }));
    colors = new Set();
    for (let offset = 0; offset < png.data.length; offset += 4) colors.add(png.data.readUInt32LE(offset));
    if (colors.size < 8) await page.waitForTimeout(250);
  }
  const log = await page.locator('#log').textContent();
  assert.ok(colors.size >= 8, `The actual WASM application renders its setup UI: ${log}`);
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running', log);
  assert.equal(navigations, 3, 'Starting the game never triggers a service worker reload');
  assert.ok(requested.includes(`${projectPath}GLSMAC.js`));
  assert.ok(requested.includes(`${projectPath}GLSMAC.wasm`));
  assert.equal(requested.includes('/GLSMAC.js'), false, 'Runtime paths retain the project prefix');
  assert.deepEqual(errors, [], 'No page or WASM worker runtime errors');
});
