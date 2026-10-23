// Real production menus and native SDL input; telemetry only observes controls.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../wasm-tests/node_modules/playwright/index.mjs';
import {PNG} from '../../wasm-tests/node_modules/pngjs/lib/png.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const build = process.env.WASM_APP_DIR || `${root}build/wasm-release/bin`;
const sourceRoot = process.env.WASM_SCRIPTS_ROOT || root;
const assets = process.env.SMAC_ASSETS_DIR;
assert.ok(assets, 'SMAC_ASSETS_DIR must identify an installed game');
const artifacts = process.env.OPENING_ART_ARTIFACTS || `${root}tools/wasm-tests/build/artifacts/opening-art`;
mkdirSync(artifacts, {recursive: true});
const request = JSON.parse(await new Promise((resolve, reject) => {
  let data = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => data += chunk);
  process.stdin.on('end', () => resolve(data)); process.stdin.on('error', reject);
}));
const hash = value => createHash('sha256').update(value).digest('hex');
const production = Object.fromEntries(readdirSync(`${sourceRoot}/GLSMAC_data/default`, {recursive: true})
  .filter(name => name.endsWith('.gls.js')).sort()
  .map(name => [`GLSMAC_data/default/${name}`, readFileSync(`${sourceRoot}/GLSMAC_data/default/${name}`, 'utf8')]));
const scripts = {...production};
const sliding = 'GLSMAC_data/default/ui/parts/mainmenu/sliding.gls.js';
function replaceOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, `One read-only menu observation marker: ${marker}`);
  return source.replace(marker, replacement);
}
scripts[sliding] = replaceOnce(scripts[sliding], "this.manager.push('sliding', data);",
  "this.manager.push('sliding', data); #print('OART_BEGIN');");
scripts[sliding] = replaceOnce(scripts[sliding], 'const itembody = create_item(entry[0], bottom);',
  "const itembody = create_item(entry[0], bottom); #print('OART_ROW|' + entry[0] + '|' + #to_string(bottom));");
scripts[sliding] = replaceOnce(scripts[sliding], "(entry.obj).addclass('menublock-item-active');",
  "(entry.obj).addclass('menublock-item-active'); #print('OART_SELECT|' + #to_string(active_entry_index));");
scripts[sliding] = replaceOnce(scripts[sliding], 'current_menublock.right = 0;',
  "current_menublock.right = 0; #print('OART_REST');");
scripts[sliding] = replaceOnce(scripts[sliding], 'return {};',
  "#print('OART_END'); return {};");
// This candidate style is used only to reject absent rendered controls; it
// never contributes to the sampled backdrop RGB or reference expectations.
const color = production[sliding].match(/ui\.class\('menublock-item-active'\)\.set\(\{[\s\S]*?color:\s*'rgb\((\d+),\s*(\d+),\s*(\d+)\)'/);
assert.ok(color, 'The production selected-control foreground is declared');
const selectedColor = color.slice(1).map(Number);
const implementation = {
  name: 'GLSMAC production opening artwork through Chromium/SDL', kind: 'candidate',
  scripts_sha256: hash(JSON.stringify(production)), observed_scripts_sha256: hash(JSON.stringify(scripts)),
  runtime_js_sha256: hash(readFileSync(`${build}/GLSMAC.js`)),
  runtime_wasm_sha256: hash(readFileSync(`${build}/GLSMAC.wasm`)),
};
const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], {cwd: root});
let serverLog = ''; server.stderr.on('data', data => serverLog += data);
let browser;
const results = [];
try {
  const origin = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error(serverLog)), 60000);
    server.once('error', reject); server.once('exit', code => reject(new Error(`Asset server exited ${code}: ${serverLog}`)));
    server.stdout.on('data', data => {
      output += data; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  browser = await chromium.launch({executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  for (const item of request.cases) {
    const directory = `${artifacts}/${item.id}`; mkdirSync(directory, {recursive: true});
    const context = await browser.newContext({viewport: {width: 1100, height: 1100}, deviceScaleFactor: 1});
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    const errors = [], checkpoints = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
      if (/(?:WebGL|GL_).*(?:INVALID|error)|shader.*(?:failed|error)|RuntimeError:|worker sent an error!/i.test(message.text())) errors.push(message.text());
    });
    const healthy = async () => {
      assert.deepEqual(errors, [], 'No browser runtime or graphics errors');
      assert.equal(await page.locator('body').getAttribute('data-state'), 'running');
      assert.doesNotMatch(await page.locator('#log').textContent(), /FATAL ERROR|Aborted\(|Unhandled exception|GSE_ERROR/i);
    };
    const menu = async () => {
      const log = await page.locator('#log').textContent();
      const start = log.lastIndexOf('OART_BEGIN');
      assert.ok(start >= 0 && log.indexOf('OART_END', start) >= 0, 'Production menu constructed its actual controls');
      const text = log.slice(start);
      const rows = [...text.matchAll(/OART_ROW\|([^\r\n|]+)\|(\d+)/g)].map(match => ({label: match[1].toUpperCase(), bottom: Number(match[2])}));
      const selections = [...text.matchAll(/OART_SELECT\|(\d+)/g)];
      assert.ok(rows.length && selections.length, 'Actual native menu rows and selection are observable');
      const selected = selections.at(-1);
      return {rows, selected: Number(selected[1]), selectedColor, start};
    };
    const snapshot = async (index, previous) => {
      let prior, stable = 0, png, state;
      for (let attempt = 0; attempt < 80; ++attempt) {
        await healthy();
        const log = await page.locator('#log').textContent();
        if (!log.slice(log.lastIndexOf('OART_BEGIN')).includes('OART_REST') || (previous != null && log.lastIndexOf('OART_BEGIN') <= previous)) {
          await page.waitForTimeout(100); continue;
        }
        state = await menu();
        const buffer = await page.locator('#canvas').screenshot(); png = PNG.sync.read(buffer);
        assert.deepEqual([png.width, png.height], item.input.viewport, 'Actual PNG uses the declared viewport at scale one');
        assert.deepEqual(await page.locator('#canvas').evaluate(canvas => [canvas.width, canvas.height]), item.input.viewport,
          'The native backing store matches the screenshot without rescaling');
        const box = await page.locator('#canvas').boundingBox();
        assert.deepEqual([box.width, box.height], item.input.viewport, 'The HTML host does not scale the game');
        stable = prior?.equals(png.data) ? stable + 1 : 0; prior = png.data;
        // A blank transition frame cannot satisfy settling: the actual selected
        // control's native foreground must also have rendered on the canvas.
        let ink = 0;
        for (let y = 0; y < png.height; ++y) for (let x = 650; x < png.width; ++x) {
          const at = (y * png.width + x) * 4;
          if (state.selectedColor.every((channel, k) => png.data[at + k] === channel)) ++ink;
        }
        if (stable >= 2 && ink >= 30) {
          const filename = `${String(index).padStart(2, '0')}.png`; writeFileSync(`${directory}/${filename}`, buffer);
          checkpoints.push({index, path: filename, utc: new Date().toISOString(), controls: state.rows, selected: state.selected,
            canvas: await page.locator('#canvas').boundingBox(), ink});
          return {state, frame: {viewport: [png.width, png.height], pixels: item.input.probes.map(([x, y]) => {
            const at = (y * png.width + x) * 4; return [...png.data.subarray(at, at + 3)];
          })}};
        }
        await page.waitForTimeout(100);
      }
      throw new Error('Actual visible menu did not settle with rendered controls');
    };
    try {
      await page.goto(origin); await page.waitForFunction(() => document.body.dataset.state === 'ready');
      await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${origin}/assets/manifest.json`);
      await page.evaluate(snapshot => {
        const prefix = '/opening-production';
        for (const [name, source] of Object.entries(snapshot)) {
          if (!/^GLSMAC_data\/default\/[a-zA-Z0-9_./-]+\.gls\.js$/.test(name) || name.includes('..')) throw new Error('Invalid production script path');
          const path = `${prefix}/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, source);
        }
        const launch = Module.callMain;
        Module.callMain = args => launch([...args, '--datapath', `${prefix}/GLSMAC_data`]);
      }, scripts);
      await page.locator('#start').click();
      await page.waitForFunction(() => ['running', 'failed'].includes(document.body.dataset.state));
      // Align only the HTML host element to integer device pixels. Its native
      // 1024x768 backing store and all game layout/art remain untouched. A
      // fractional launcher offset otherwise adds an outward-rounded PNG row.
      await page.addStyleTag({content: '#canvas { position: fixed; left: 0; top: 0; margin: 0; max-width: none; z-index: 10; }'});
      let current = await snapshot(0); const frames = [current.frame];
      for (const [index, action] of item.input.actions.entries()) {
        const wanted = action.choose.toUpperCase(); const target = current.state.rows.findIndex(row => row.label === wanted);
        assert.ok(target >= 0, `Actual production menu contains requested visible control ${wanted}`);
        // Use real SDL arrow/Enter delivery; Home is not supported by this UI.
        for (let n = 0; n < current.state.selected; ++n) await page.keyboard.press('ArrowUp');
        for (let n = 0; n < target; ++n) await page.keyboard.press('ArrowDown');
        await page.waitForFunction(target => {
          const log = document.querySelector('#log').textContent;
          const selected = [...log.slice(log.lastIndexOf('OART_BEGIN')).matchAll(/OART_SELECT\|(\d+)/g)].at(-1);
          return selected && Number(selected[1]) === target;
        }, target);
        assert.equal((await menu()).rows[target].label, wanted, 'Native selection identifies the requested actual control');
        await page.keyboard.press('Enter');
        current = await snapshot(index + 1, current.state.start); frames.push(current.frame);
      }
      results.push({id: item.id, status: 'ok', output: {frames}});
    } catch (error) {
      await page.locator('#canvas').screenshot({path: `${directory}/failure.png`, timeout: 3000}).catch(() => {});
      results.push({id: item.id, status: 'error', reason: String(error)});
    } finally {
      writeFileSync(`${directory}/application.log`, await page.locator('#log').textContent().catch(() => 'Log unavailable'));
      writeFileSync(`${directory}/checkpoints.json`, JSON.stringify({implementation, checkpoints, errors}, null, 2));
      await context.close();
    }
  }
} finally {
  await browser?.close(); server.kill(); writeFileSync(`${artifacts}/server.log`, serverLog);
}
assert.equal(hash(readFileSync(`${build}/GLSMAC.js`)), implementation.runtime_js_sha256, 'Runtime JS remained immutable during replay');
assert.equal(hash(readFileSync(`${build}/GLSMAC.wasm`)), implementation.runtime_wasm_sha256, 'Runtime WASM remained immutable during replay');
const response = {version: 1, implementation, results};
writeFileSync(`${artifacts}/candidate.json`, JSON.stringify(response, null, 2));
process.stdout.write(JSON.stringify(response) + '\n');
