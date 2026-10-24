import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = process.env.WASM_SCRIPTS_ROOT || root;
const build = process.env.WASM_APP_DIR || `${root}build/wasm/bin`;
const assets = process.env.SMAC_ASSETS_DIR;
const artifacts = process.env.RESEARCH_ARTIFACTS || `${root}tools/wasm-tests/build/artifacts/research`;
const hash = value => createHash('sha256').update(value).digest('hex');

// These additions observe existing state and declared control geometry. All
// game/setup actions below use actual browser keyboard or pointer delivery.
function observedScripts() {
  const production = Object.fromEntries(readdirSync(`${sourceRoot}/GLSMAC_data/default`, {recursive: true})
    .filter(name => name.endsWith('.gls.js')).sort().map(name => [name, readFileSync(`${sourceRoot}/GLSMAC_data/default/${name}`, 'utf8')]));
  const scripts = {...production};
  const observe = (name, marker, replacement) => {
    assert.equal(scripts[name].split(marker).length, 2, `Unique observation marker ${marker}`);
    scripts[name] = scripts[name].replace(marker, replacement);
  };
  observe('ui/parts/mainmenu/sliding.gls.js', "this.manager.push('sliding', data);",
    "this.manager.push('sliding', data); #print('BRS_MENU|' + #to_string(#sizeof(data.entries))); ");
  observe('ui/parts/mainmenu/sliding.gls.js', 'const itembody = create_item(entry[0], bottom);',
    "const itembody = create_item(entry[0], bottom); #print('BRS_ITEM|' + entry[0]);");
  observe('ui/parts/mainmenu/sliding.gls.js', "(entry.obj).addclass('menublock-item-active');",
    "(entry.obj).addclass('menublock-item-active'); #print('BRS_SELECTED|' + #to_string(active_entry_index));");
  observe('ui/parts/mainmenu/sliding.gls.js', 'current_menublock.right = 0;',
    "current_menublock.right = 0; #print('BRS_MENU_REST');");
  observe('ui/parts/mainmenu/popup.gls.js', "this.manager.push('popup', data);",
    "this.manager.push('popup', data); #print('BRS_POPUP|' + data.title);");
  observe('ui/parts/mainmenu/steps/customize_rules.gls.js', "check.on('click', toggle);",
    "#print('BRS_RULE|' + #to_string(state.blind)); check.on('click', toggle);");
  observe('ui/parts/mainmenu/steps/customize_rules.gls.js', "state.blind = !state.blind;",
    "state.blind = !state.blind; #print('BRS_RULE|' + #to_string(state.blind));");
  observe('ui/parts/mainmenu/steps/customize_rules.gls.js', 'state.blind = true;',
    "state.blind = true; #print('BRS_RULE|' + #to_string(state.blind));");
  observe('main.gls.js', 'glsmac.run();', `
glsmac.on('configure_game', (e) => {
 const game = e.game;
 game.on('start_ui', (e) => {
  const opening = #include('ui/parts/game/opening');
  const research = #include('ui/parts/game/popup/research');
  glsmac.ui.root.timer(100, () => {
   if (opening.visible_phase == null) { return true; }
   let dx = 0; let dy = 0;
   if (opening.dismiss != null) { dx = opening.dismiss_x; dy = opening.dismiss_y; }
   #print('BRS_OPENING|' + opening.visible_phase + '|' + #to_string(dx) + '|' + #to_string(dy));
   if (!#is_defined(research.rows)) { return true; }
   const state = game.get_research_state(game.get_player().id);
   let bits = ''; for (enabled of state.priorities) { bits += enabled ? '1' : '0'; }
   let checks = ''; let ids = ''; let top = 0;
   const popup = research.p.modules.popup;
   const shown = popup.popup == research.data;
   const settled = shown && !popup.popup_hiding && popup.sliding_timer == null;
   if (shown) {
    top = research.data.el.top;
    for (row of research.rows) {
     if (research.blind) { checks += row.check.text == 'X' ? '1' : '0'; }
     else { if (ids != '') { ids += ','; } ids += #to_string(row.id); }
    }
   }
   #print('BRS_STATE|' + #to_string(shown) + '|' + #to_string(settled) + '|' + #to_string(state.target_id) + '|' + bits + '|' + checks + '|' + ids + '|' + #to_string(top) + '|' + #to_string(game.get_turn()));
   return true;
  });
 });
});
glsmac.run();`);
  return {scripts, sourceSha256: hash(JSON.stringify(production))};
}

test('real setup, Shift+R, pointer research commands and persistent native state', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to the local game installation', timeout: 300000,
}, async t => {
  mkdirSync(artifacts, {recursive: true});
  const server = spawn('python3', ['tools/serve-wasm.py', build, '--port', '0', '--assets', assets], {cwd: root});
  let serverLog = ''; server.stderr.on('data', text => serverLog += text);
  t.after(() => server.kill());
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error(serverLog)), 60000);
    server.once('error', reject); server.once('exit', code => reject(Error(`Server ${code}: ${serverLog}`)));
    server.stdout.on('data', text => { const match = String(text).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
  });
  const browser = await chromium.launch({headless: true, executablePath: process.env.WASM_BROWSER_EXECUTABLE || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  t.after(() => browser.close());
  const {scripts, sourceSha256} = observedScripts();
  writeFileSync(`${artifacts}/metadata.json`, JSON.stringify({
    source_sha256: sourceSha256, observed_scripts_sha256: hash(JSON.stringify(scripts)),
    runtime_js_sha256: hash(readFileSync(`${build}/GLSMAC.js`)), runtime_wasm_sha256: hash(readFileSync(`${build}/GLSMAC.wasm`)),
    scope: 'Candidate Chromium keyboard/pointer and native state regression; no original pixel-parity claim',
  }, null, 2));
  for (const directed of [false, true]) {
    const name = directed ? 'directed' : 'blind';
    await t.test(name, async () => {
      const context = await browser.newContext({viewport: {width: 1100, height: 1100}});
      const page = await context.newPage(); page.setDefaultTimeout(60000);
      const errors = []; page.on('pageerror', error => errors.push(String(error)));
      const log = () => page.locator('#log').textContent();
      const wait = async (read, predicate, label) => {
        console.log(`research browser ${name}: waiting for ${label}`);
        for (let count = 0; count < 400; count++) {
          assert.deepEqual(errors, []); const text = await log(); assert.doesNotMatch(text, /FATAL ERROR|Unhandled exception|Aborted\(/i);
          const value = read(text); if (value && predicate(value)) { return value; } await page.waitForTimeout(100);
        }
        throw Error(`Research browser did not settle: ${label}`);
      };
      const state = text => {
        const match = [...text.matchAll(/BRS_STATE\|(true|false)\|(true|false)\|(-?\d+)\|([01]{4})\|([01]*)\|([0-9,]*)\|(-?\d+)\|(\d+)/g)].at(-1);
        return match && {shown: match[1] === 'true', settled: match[2] === 'true', target: Number(match[3]), bits: match[4], checks: match[5],
          ids: match[6] ? match[6].split(',').map(Number) : [], top: Number(match[7]), turn: Number(match[8])};
      };
      const opening = text => [...text.matchAll(/BRS_OPENING\|([^|\r\n]+)\|(\d+)\|(\d+)/g)].at(-1);
      const rule = text => [...text.matchAll(/BRS_RULE\|(true|false)/g)].at(-1)?.[1];
      const click = async (x, y) => { const bounds = await page.locator('#canvas').boundingBox(); await page.mouse.click(bounds.x + x, bounds.y + y); };
      const choose = async (label, nextMenu = true) => {
        const text = await log(); const begin = text.lastIndexOf('BRS_MENU|');
        const tail = text.slice(begin); const labels = [...tail.matchAll(/BRS_ITEM\|([^\r\n]+)/g)].map(match => match[1].toUpperCase());
        const selected = Number([...tail.matchAll(/BRS_SELECTED\|(\d+)/g)].at(-1)?.[1]); const target = labels.indexOf(label);
        assert.ok(target >= 0 && Number.isInteger(selected), `Mounted menu ${label}`);
        for (let i = 0; i < selected; i++) { await page.keyboard.press('ArrowUp'); }
        for (let i = 0; i < target; i++) { await page.keyboard.press('ArrowDown'); }
        await page.keyboard.press('Enter');
        if (nextMenu) {
          await wait(text => { const position = text.lastIndexOf('BRS_MENU|'); return {position, tail: text.slice(position)}; },
            value => value.position > begin && value.tail.includes('BRS_MENU_REST'), label);
        }
      };
      try {
        await page.goto(origin); await page.waitForFunction(() => document.body.dataset.state === 'ready');
        await page.locator('#asset-source').selectOption('remote'); await page.locator('#asset-url').fill(`${origin}/assets/manifest.json`);
        await page.evaluate(scripts => {
          for (const [name, contents] of Object.entries(scripts)) { const path = `/research-browser/GLSMAC_data/default/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, contents); }
          const run = Module.callMain; Module.callMain = args => run([...args, '--skipintro', '--datapath', '/research-browser/GLSMAC_data']);
        }, scripts);
        await page.locator('#start').click(); await page.waitForFunction(() => document.body.dataset.state === 'running');
        await page.addStyleTag({content: '#canvas {position:fixed;left:0;top:0;margin:0;max-width:none;z-index:10}'});
        await wait(text => text, text => text.includes('BRS_MENU_REST'), 'initial menu');
        for (const label of ['START GAME', 'MAKE RANDOM MAP', 'TINY PLANET', 'CITIZEN']) { await choose(label); }
        await choose(directed ? 'CUSTOMIZE RULES' : 'PLAY WITH STANDARD RULES', false);
        if (directed) {
          await wait(rule, value => value === 'true', 'custom rule checkbox');
          await page.locator('#canvas').screenshot({path: `${artifacts}/custom-rules-open.png`});
          // Native Window's styled header is 23px, with 3px body padding.
          // Checkbox and confirmation offsets come from customize_rules.
          const left = (1024 - 520) / 2 + 3; const top = (768 - 180) / 2 + 23 + 3;
          await click(left + 28, top + 31); await wait(rule, value => value === 'false', 'rule draft off');
          const oldMenu = (await log()).lastIndexOf('BRS_MENU|');
          await click(left + 514 - 25 - 100, top + 151 - 15 - 13);
          await wait(text => text, text => text.lastIndexOf('BRS_MENU|') > oldMenu && text.slice(text.lastIndexOf('BRS_MENU|')).includes('BRS_MENU_REST'), 'rule Cancel');
          const oldRules = (await log()).split('BRS_RULE|').length; await choose('CUSTOMIZE RULES', false);
          await wait(text => text, text => text.split('BRS_RULE|').length > oldRules && rule(text) === 'true', 'cancelled draft discarded');
          await click(left + 28, top + 31); await wait(rule, value => value === 'false', 'new draft off');
          await click(512, top + 151 - 55 - 13); await wait(rule, value => value === 'true', 'Standard Rules reset');
          await click(left + 28, top + 31); await wait(rule, value => value === 'false', 'Blind Research off');
          await click(left + 25 + 100, top + 151 - 15 - 13);
        }
        await wait(text => text, text => /BRS_POPUP\|Choose Your Factions/i.test(text), 'faction selector');
        const count = (await log()).split('BRS_POPUP|').length; await page.keyboard.press('Enter');
        await wait(text => text, text => text.split('BRS_POPUP|').length > count, 'name prompt'); await page.keyboard.press('Enter');
        for (const phase of ['planetfall', 'first-base-name']) { await wait(opening, value => value[1] === phase, phase); await page.keyboard.press('Enter'); }
        const tour = await wait(opening, value => value[1] === 'tour', 'tour prompt'); await click(Number(tour[2]), Number(tour[3]));
        await wait(opening, value => value[1] === 'map', 'playable map');
        await page.keyboard.press('Shift+r'); const before = await wait(state, value => value.settled, 'research popup');
        assert.equal(before.turn, 1); assert.equal(before.target, -1);
        await page.locator('#canvas').screenshot({path: `${artifacts}/${name}-open.png`});
        if (directed) {
          assert.ok(before.ids.length > 0); await click((1024 - 656) / 2 + 3 + 160, before.top + 27 + 27);
          const after = await wait(state, value => !value.shown && value.target === before.ids[0], 'native target receipt');
          assert.equal(after.turn, before.turn); await page.keyboard.press('Shift+r');
          await wait(state, value => value.settled && value.target === before.ids[0], 'directed reopen');
          await page.keyboard.press('Escape'); await page.waitForTimeout(300); assert.equal(state(await log()).shown, true);
        } else {
          assert.equal(before.checks, before.bits); const expected = before.bits.slice(0, 1) + (before.bits[1] === '1' ? '0' : '1') + before.bits.slice(2);
          await click(512, before.top + 27 + 68 + 38 + 15);
          await wait(state, value => value.bits === expected && value.checks === expected, 'native priority receipt');
          await page.keyboard.press('Escape'); await wait(state, value => !value.shown, 'priority Escape'); await page.keyboard.press('Shift+r');
          await wait(state, value => value.settled && value.checks === expected, 'priority reopen');
          await page.keyboard.press('Enter'); await wait(state, value => !value.shown && value.bits === expected, 'priority Enter');
          await page.keyboard.press('Shift+r'); const reopened = await wait(state, value => value.settled, 'priority footer');
          await click(512, reopened.top + 27 + 330 - 8 - 12);
          await wait(state, value => !value.shown && value.bits === expected, 'pointer OK footer');
        }
        assert.deepEqual(errors, []);
      } finally {
        writeFileSync(`${artifacts}/${name}.log`, await log().catch(() => ''));
        await page.locator('#canvas').screenshot({path: `${artifacts}/${name}-last.png`, timeout: 3000}).catch(() => {});
        await context.close();
      }
    });
  }
});
