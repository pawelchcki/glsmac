import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm/bin`;

test('full WASM game opens setup and draws the UI in Chromium', { timeout: 90000 }, async (t) => {
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0'], { cwd: root });
  t.after(() => server.kill());
  let serverLog = '';
  server.stderr.on('data', (data) => { serverLog += data; });
  const address = await new Promise((resolve, reject) => {
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
  const browser = await chromium.launch({
    executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  t.after(async () => {
    try {
      const log = await page.locator('#log').textContent({ timeout: 1000 });
      mkdirSync(new URL('build/artifacts/', import.meta.url), { recursive: true });
      writeFileSync(new URL('build/artifacts/app-log.txt', import.meta.url), log);
      t.diagnostic(log);
      if (errors.length) t.diagnostic(errors.join('\n'));
    } finally {
      await browser.close();
    }
  });
  page.setDefaultTimeout(60000);
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  await page.goto(address);
  await page.waitForFunction(() => document.body.dataset.state === 'ready');
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  // The mount and restore must finish before users can start the application.
  assert.equal(await page.evaluate(() => Module.FS.stat('/persist').mode > 0), true);
  await page.locator('#asset-source').selectOption('none');
  await page.locator('#start').click();

  const artifacts = new URL('build/artifacts/', import.meta.url);
  mkdirSync(artifacts, { recursive: true });
  let colors = new Set();
  // Capture only the game canvas, so launcher text cannot satisfy rendering.
  for (let attempt = 0; attempt < 40 && colors.size < 8; ++attempt) {
    const png = PNG.sync.read(await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL('app-setup.png', artifacts)),
    }));
    colors = new Set();
    for (let offset = 0; offset < png.data.length; offset += 4) {
      colors.add(png.data.readUInt32LE(offset));
    }
    if (colors.size < 8) await page.waitForTimeout(250);
  }
  const log = await page.locator('#log').textContent();
  assert.ok(colors.size >= 8, `Expected rendered UI, found ${colors.size} colors. ${errors.join('\n')}`);
  assert.equal(await page.locator('body').getAttribute('data-state'), 'running', log);
  assert.deepEqual(errors, [], 'No browser runtime errors');
  assert.doesNotMatch(log, /FATAL ERROR|Aborted\(|shader.*(?:failed|error)/i);

  // Exercise the actual SDL keyboard path: the console covers the setup UI.
  const beforeInput = await page.locator('#canvas').screenshot();
  await page.keyboard.press('Backquote');
  const beforePixels = PNG.sync.read(beforeInput).data;
  let changedPixels = 0;
  // Worker scheduling and the console animation can take longer on software
  // renderers. Wait for the visible result rather than a fixed frame delay.
  for (let attempt = 0; attempt < 40; ++attempt) {
    const withConsole = await page.locator('#canvas').screenshot({
      path: fileURLToPath(new URL('app-console.png', artifacts)),
    });
    const consolePixels = PNG.sync.read(withConsole).data;
    changedPixels = 0;
    for (let offset = 0; offset < beforePixels.length; offset += 4) {
      if (beforePixels.readUInt32LE(offset) !== consolePixels.readUInt32LE(offset)) ++changedPixels;
    }
    if (changedPixels > beforePixels.length / 16) break;
    await page.waitForTimeout(100);
  }
  assert.ok(changedPixels > beforePixels.length / 16,
    'SDL delivers keyboard input and redraws the console across the canvas');

  await page.waitForFunction(() => Module.SDL2?.audioContext?.state === 'running');
  const audioCallback = await page.evaluate(() => new Promise((resolve) => {
    const node = Module.SDL2.audio.scriptProcessorNode;
    const timer = setTimeout(() => resolve(false), 5000);
    node.addEventListener('audioprocess', () => {
      clearTimeout(timer);
      resolve(true);
    }, { once: true });
  }));
  assert.ok(audioCallback, 'SDL delivers real WebAudio callbacks');

  // Use the real browser WebGL validator on the production shader tests too.
  const shaderPage = await browser.newPage();
  shaderPage.on('pageerror', (error) => errors.push(String(error)));
  await shaderPage.route('**/shader-test', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<canvas id="canvas" width="64" height="48"></canvas>',
  }));
  await shaderPage.route('**/canvas.cjs', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: readFileSync(new URL('build/canvas.cjs', import.meta.url)),
  }));
  await shaderPage.route('**/canvas.wasm', (route) => route.fulfill({
    contentType: 'application/wasm',
    body: readFileSync(new URL('build/canvas.wasm', import.meta.url)),
  }));
  await shaderPage.goto(`${address}/shader-test`);
  await shaderPage.addScriptTag({ url: `${address}/canvas.cjs` });
  const shaderResults = await shaderPage.evaluate(async () => {
    const module = await Module({ canvas: document.querySelector('#canvas') });
    return [module._RenderGameShaders(0), module._RenderGameShaders(1), module._CheckGamePicking()];
  });
  assert.deepEqual(shaderResults, [0, 0, 0], 'Production shaders, depth framebuffers and uint picking pass in Chromium');
  assert.deepEqual(errors, [], 'No browser runtime errors after input and shader tests');
});
