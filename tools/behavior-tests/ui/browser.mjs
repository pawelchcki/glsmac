// JSON-lines transport for real browser input and canvas captures. No UI mocks.
import { chromium } from '../../wasm-tests/node_modules/playwright/index.mjs';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let context, page;
let errors = [];
try {
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line);
    try {
      if (request.op === 'reset') {
        await context?.close();
        errors = [];
        context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
        page = await context.newPage();
        page.setDefaultTimeout(30000);
        page.on('pageerror', error => errors.push(String(error)));
        page.on('console', message => {
          if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)/i.test(message.text())) {
            errors.push(message.text());
          }
        });
        await page.goto(request.origin);
        await page.waitForFunction(() => document.body.dataset.state === 'ready');
        await page.locator('#asset-source').selectOption('remote');
        await page.locator('#asset-url').fill(`${request.origin}/assets/manifest.json`);
        await page.evaluate(scripts => {
          const root = '/ui-snapshot';
          for (const [name, source] of Object.entries(scripts)) {
            if (!/^GLSMAC_data\/default\/[a-zA-Z0-9_./-]+\.gls\.js$/.test(name) || name.includes('..')) {
              throw new Error('Invalid production script snapshot path');
            }
            const destination = `${root}/${name}`;
            Module.FS.mkdirTree(destination.slice(0, destination.lastIndexOf('/')));
            Module.FS.writeFile(destination, source);
          }
          const callMain = Module.callMain;
          Module.callMain = args => callMain([...args, '--skipintro', '--datapath', `${root}/GLSMAC_data`]);
        }, request.scripts);
        await page.locator('#start').click();
        await page.mouse.move(10, 10);
      } else if (request.op === 'click') {
        const box = await page.locator('#canvas').boundingBox();
        await page.mouse.click(box.x + request.x * box.width / 1024, box.y + request.y * box.height / 768);
        await page.mouse.move(10, 10);
      } else if (request.op === 'key') {
        await page.keyboard.press(request.key);
      } else if (request.op === 'snapshot') {
        await page.locator('#canvas').screenshot({ path: request.path });
        await writeFile(`${request.path}.log`, await page.locator('#log').textContent());
        if (await page.locator('body').getAttribute('data-state') === 'failed') {
          throw new Error(`Application failed; inspect ${request.path}.log`);
        }
      } else {
        throw new Error(`Unknown browser operation: ${request.op}`);
      }
      if (errors.length) throw new Error(errors.join('\n'));
      process.stdout.write(JSON.stringify({ ok: true }) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: String(error) }) + '\n');
    }
  }
} finally {
  await browser.close();
}
