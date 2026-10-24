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
  observe('ui/parts/mainmenu/steps/select_faction.gls.js', "random = mode == 'random';", "random = mode == 'random'; #print('BRS_FACTION_MODE|' + mode);");
  observe('ui/parts/mainmenu/steps/customize_mapsize.gls.js', 'const horizontal = parse_dimension(width_input.value);',
    "#print('BRS_CUSTOM_INPUT|' + width_input.value + '|' + height_input.value); const horizontal = parse_dimension(width_input.value);");
  observe('ui/parts/error.gls.js', "ui.on('error', (e) => {", "ui.on('error', (e) => { #print('BRS_UI_ERROR|' + e.error);");
  observe('main.gls.js', 'glsmac.run();', `
glsmac.on('configure_game', (e) => {
 const game = e.game;
 game.on('event_result', (e) => {
  if (e.name == 'credit_research_income' && e.data.player_id == game.get_player().id) {
   #print('BRS_CREDIT|' + #to_string(e.data.turn_id) + '|' + #to_string(e.data.income) + '|' + #to_string(e.success));
  }
 });
 game.on('start_ui', (e) => {
  const opening = #include('ui/parts/game/opening');
  const research = #include('ui/parts/game/popup/research');
  const labs = #include('ui/parts/game/popup/laboratories');
  const objects = #include('ui/parts/game/bottom_bar/objects_list');
  const observed_world = {turn: (0 - 1)};
  glsmac.ui.root.timer(100, () => {
   if (opening.visible_phase == null) { return true; }
   if (opening.visible_phase == 'map' && game.get_turn() != observed_world.turn) {
    observed_world.turn = game.get_turn(); let humans = 0; let computers = 0; let units = 0; let factions = '';
    for (player of game.get_players()) {
     if (player.type == 'computer') { computers++; } else { humans++; }
     if (factions != '') { factions += ','; } factions += player.get_faction().id;
    }
    #print('BRS_ROSTER|' + factions);
    #print('BRS_PLAYER_NAME|' + game.get_player().name);
    const tm = game.get_tm();
    #print('BRS_GRID|' + #to_string(tm.get_map_width()) + '|' + #to_string(tm.get_map_height()));
    for (let y = 0; y < tm.get_map_height(); y++) { for (let x = y % 2; x < tm.get_map_width(); x += 2) { units += #sizeof(tm.get_tile(x, y).get_units()); } }
    #print('BRS_WORLD|' + #to_string(observed_world.turn) + '|' + #to_string(humans) + '|' + #to_string(computers) + '|' + #to_string(#sizeof(game.get_bm().get_bases())) + '|' + #to_string(units) + '|' + #to_string(#sizeof(game.get_contacts())));
   }
   let dx = 0; let dy = 0;
   if (opening.dismiss != null) { dx = opening.dismiss_x; dy = opening.dismiss_y; }
   #print('BRS_OPENING|' + opening.visible_phase + '|' + #to_string(dx) + '|' + #to_string(dy));
   if (!#is_defined(research.rows)) { return true; }
   const state = game.get_research_state(game.get_player().id);
   let bits = ''; for (enabled of state.priorities) { bits += enabled ? '1' : '0'; }
   let checks = ''; let ids = ''; let top = 0;
   const popup = research.p.modules.popup;
   const modal = popup.popup;
   #print('BRS_MODAL|' + (modal == null ? 'none' : modal.id) + '|' + #to_string(popup.sliding_timer == null && !popup.popup_hiding) + '|' + #to_string(modal == null ? 0 : modal.el.top) + '|' + #to_string(game.get_turn()) + '|' + objects.turn_status);
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
   const labs_shown = popup.popup != null && popup.popup.id == 'laboratories';
   const labs_settled = labs_shown && !popup.popup_hiding && popup.sliding_timer == null;
   if (#is_defined(labs.accumulated)) {
    #print('BRS_LABS|' + #to_string(labs_shown) + '|' + #to_string(labs_settled) + '|' + #to_string(popup.popups.laboratories.el.top) + '|' + #to_string(game.get_research_science(game.get_player().id).accumulated) + '|' + labs.accumulated.text + '|' + labs.per_turn.text + '|' + labs.target.text);
   }
   return true;
  });
 });
});
glsmac.run();`);
  return {scripts, sourceSha256: hash(JSON.stringify(production))};
}

test('real setup, Shift+R, pointer research commands and persistent native state', {
  skip: !assets && 'Set SMAC_ASSETS_DIR to the local game installation', timeout: 600000,
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
  const cases = process.env.RESEARCH_CASES ? process.env.RESEARCH_CASES.split(',') : ['blind', 'directed', 'random', 'custom-minimum'];
  for (const name of cases) {
    const directed = name === 'directed'; const randomSelection = name === 'random';
    const customMinimum = name === 'custom-minimum';
    const cliError = name === 'init-cli-error'; const scriptError = name === 'init-script-error';
    const scriptRetry = name === 'init-script-retry';
    const menuRetry = name === 'init-menu-retry' || scriptRetry;
    const quickError = cliError || scriptError;
    await t.test(name, async () => {
      const context = await browser.newContext({viewport: {width: 1100, height: 1100}});
      const page = await context.newPage(); page.setDefaultTimeout(60000);
      const errors = []; page.on('pageerror', error => errors.push(String(error)));
      const log = () => page.locator('#log').textContent();
      const wait = async (read, predicate, label) => {
        console.log(`research browser ${name}: waiting for ${label}`);
        for (let count = 0; count < 400; count++) {
          assert.deepEqual(errors, []); const text = await log();
          // A caught, deliberately injected script exception is this case's
          // declared input. Fatal/native/worker failures remain failures.
          const unexpected = scriptError || scriptRetry ? text.replaceAll('Unhandled exception (Error): Declared script initialization failure', 'Declared script initialization failure') : text;
          assert.doesNotMatch(unexpected, /FATAL ERROR|Unhandled exception|Aborted\(|uncaught|Pthread .*sent an error!/i);
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
      const laboratories = text => {
        const match = [...text.matchAll(/BRS_LABS\|(true|false)\|(true|false)\|(-?\d+)\|(\d+)\|([^|\r\n]*)\|([^|\r\n]*)\|([^|\r\n]*)/g)].at(-1);
        return match && {shown: match[1] === 'true', settled: match[2] === 'true', top: Number(match[3]), science: Number(match[4]), accumulated: match[5], perTurn: match[6], target: match[7]};
      };
      const modal = text => {
        const match = [...text.matchAll(/BRS_MODAL\|([^|\r\n]+)\|(true|false)\|(-?\d+)\|(\d+)\|([^|\r\n]+)/g)].at(-1);
        return match && {id: match[1], settled: match[2] === 'true', top: Number(match[3]), turn: Number(match[4]), status: match[5]};
      };
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
        await page.evaluate(({scripts, cliError, scriptError, scriptRetry}) => {
          for (const [name, contents] of Object.entries(scripts)) { const path = `/research-browser/GLSMAC_data/default/${name}`; Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); Module.FS.writeFile(path, contents); }
          if (scriptError || scriptRetry) {
            const path = '/research-browser/GLSMAC_data/default/main.gls.js';
            const source = Module.FS.readFile(path, {encoding: 'utf8'});
            Module.FS.writeFile(path, "let declared_failure_pending = true;\n" + source.replace('glsmac.run();', "glsmac.on('configure_game', (e) => { e.game.on('create_world', (e) => { if (declared_failure_pending) { declared_failure_pending = false; throw Error('Declared script initialization failure'); } }); }); glsmac.run();"));
          }
          const extra = cliError || scriptError ? ['--quickstart', '--quickstart-mapsize', cliError ? '4x2' : '32x16'] : [];
          const run = Module.callMain; Module.callMain = args => run([...args, ...extra, '--skipintro', '--datapath', '/research-browser/GLSMAC_data']);
        }, {scripts, cliError, scriptError, scriptRetry});
        await page.locator('#start').click(); await page.waitForFunction(() => document.body.dataset.state === 'running');
        await page.addStyleTag({content: '#canvas {position:fixed;left:0;top:0;margin:0;max-width:none;z-index:10}'});
        if (quickError) {
          const expected = cliError ? 'seven factions need starting tiles' : 'Declared script initialization failure';
          await wait(text => [...text.matchAll(/BRS_UI_ERROR\|([^\r\n]+)/g)].at(-1), value => value[1].includes(expected), 'native or script startup error');
          await page.waitForTimeout(500);
          assert.equal((await log()).split('BRS_UI_ERROR|').length - 1, 1, 'Exactly one error popup');
          assert.doesNotMatch(await log(), /BRS_WORLD\|/);
          await page.locator('#canvas').screenshot({path: `${artifacts}/${name}-popup.png`});
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => document.body.dataset.state === 'exited');
          assert.deepEqual(errors, []);
          assert.doesNotMatch(await log(), /Unable to achieve desired land amount/);
          return;
        }
        await wait(text => text, text => text.includes('BRS_MENU_REST'), 'initial menu');
        if (menuRetry) {
          if (!scriptRetry) {
            const removed = await page.evaluate(() => {
              const removed = [];
              const walk = directory => {
                for (const name of Module.FS.readdir(directory)) {
                  if (name === '.' || name === '..') continue;
                  const path = directory + '/' + name;
                  if (Module.FS.isDir(Module.FS.stat(path).mode)) walk(path);
                  else if (/^(x?planetx?)\.mp$/i.test(name)) { Module.FS.unlink(path); removed.push(path); }
                }
              };
              walk('/smac'); return removed;
            });
            assert.ok(removed.length > 0, 'Actual mounted Planet terrain files removed only in this disposable session');
            console.log('Declared missing-file fault input: ' + JSON.stringify(removed));
          }
          await choose('START GAME');
          if (scriptRetry) { await choose('MAKE RANDOM MAP'); await choose('TINY PLANET'); }
          else { await choose('THE MAP OF PLANET'); }
          await choose('CITIZEN');
          await choose('PLAY WITH STANDARD RULES', false);
          await wait(text => text, text => /BRS_POPUP\|Choose Your Factions/i.test(text), 'faction selector before native failure');
          const prompts = (await log()).split('BRS_POPUP|').length; await page.keyboard.press('Enter');
          await wait(text => text, text => text.split('BRS_POPUP|').length > prompts, 'name before native failure');
          await page.keyboard.press('Enter');
          const error = await wait(text => [...text.matchAll(/BRS_UI_ERROR\|([^\r\n]+)/g)].at(-1), value => scriptRetry ? value[1].includes('Declared script initialization failure') : /not found/i.test(value[1]), 'actual initialization failure');
          assert.doesNotMatch(await log(), /BRS_WORLD\|/, 'Failed native startup did not create a world');
          await page.locator('#canvas').screenshot({path: `${artifacts}/${name}-popup.png`});
          const previousMenu = (await log()).lastIndexOf('BRS_MENU|');
          if (scriptRetry) { await page.keyboard.press('Enter'); } else { await click(512, 426); }
          await wait(text => text, text => text.lastIndexOf('BRS_MENU|') > previousMenu && text.slice(text.lastIndexOf('BRS_MENU|')).includes('BRS_MENU_REST'), 'acknowledgment returns to actual main menu');
          assert.equal((await log()).split('BRS_UI_ERROR|').length - 1, 1, 'Exactly one native error delivery');
          console.log('PROVEN initialization error acknowledged; actual main menu restored: ' + error[1]);
        }
        for (const label of ['START GAME', 'MAKE RANDOM MAP']) { await choose(label); }
        if (customMinimum) {
          const oldPopup = (await log()).split('BRS_POPUP|').length;
          const oldMenu = (await log()).lastIndexOf('BRS_MENU|');
          await choose('CUSTOM SIZE', false);
          await wait(text => text, text => text.split('BRS_POPUP|').length > oldPopup, 'custom dimensions');
          const left = (1024 - 480) / 2 + 3; const top = (768 - 180) / 2 + 23 + 3;
          await click(left + 305, top + 25); await page.keyboard.press('End');
          await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.type('2');
          await click(left + 305, top + 52); await page.keyboard.press('End');
          await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.type('2');
          await page.keyboard.press('Enter');
          await wait(text => text, text => text.includes('BRS_CUSTOM_INPUT|2|2'), 'exact typed custom dimensions');
          await wait(text => text, text => text.lastIndexOf('BRS_MENU|') > oldMenu && text.slice(text.lastIndexOf('BRS_MENU|')).includes('BRS_MENU_REST'), 'custom dimensions accepted');
        } else { await choose('TINY PLANET'); }
        await choose('CITIZEN');
        const setupPopups = (await log()).split('BRS_POPUP|').length;
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
        await wait(text => text, text => text.split('BRS_POPUP|').length > setupPopups && /BRS_POPUP\|Choose Your Factions/i.test(text.slice(text.lastIndexOf('BRS_POPUP|'))), 'faction selector');
        if (randomSelection) {
          // Actual source mode button: 800x340 popup, native header/body
          // offsets, left10/top94/width240/height28 from select_faction.
          await click((1024 - 800) / 2 + 3 + 130, (768 - 340) / 2 + 23 + 3 + 108);
          await wait(text => text, text => text.includes('BRS_FACTION_MODE|random'), 'actual Random faction mode');
          const oldPopup = (await log()).split('BRS_POPUP|').length;
          await page.keyboard.press('Enter');
          await wait(text => text, text => text.split('BRS_POPUP|').length > oldPopup, 'generic Random name prompt');
          for (const character of 'Trace Commander') {
            const key = /[A-Z]/.test(character) ? `Shift+${character.toLowerCase()}` : character === ' ' ? 'Space' : character;
            await page.keyboard.press(key);
          }
          await page.keyboard.press('Enter');
        } else {
          const count = (await log()).split('BRS_POPUP|').length; await page.keyboard.press('Enter');
          await wait(text => text, text => text.split('BRS_POPUP|').length > count, 'name prompt'); await page.keyboard.press('Enter');
        }
        for (const phase of ['planetfall', 'first-base-name']) { await wait(opening, value => value[1] === phase, phase); await page.keyboard.press('Enter'); }
        const tour = await wait(opening, value => value[1] === 'tour', 'tour prompt'); await click(Number(tour[2]), Number(tour[3]));
        await wait(opening, value => value[1] === 'map', 'playable map');
        const initialWorld = await wait(text => [...text.matchAll(/BRS_WORLD\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/g)].at(-1), value => Number(value[1]) === 1, 'complete opening roster');
        assert.deepEqual(initialWorld.slice(2).map(Number), [1, 6, 7, 7, 0]);
        const roster = [...(await log()).matchAll(/BRS_ROSTER\|([^\r\n]+)/g)].at(-1)[1].split(',');
        assert.equal(new Set(roster).size, 7, 'Every native faction is distinct');
        if (!randomSelection) {
          assert.deepEqual(roster, ['CONSCIOUSNESS', 'PIRATES', 'DRONES', 'ANGELS', 'PLANETCULT', 'CARETAKERS', 'USURPERS'], 'Actual default setup preserves every displayed expansion faction');
        }
        if (randomSelection) {
          assert.deepEqual([...roster].sort(), ['CONSCIOUSNESS', 'PIRATES', 'DRONES', 'ANGELS', 'PLANETCULT', 'CARETAKERS', 'USURPERS'].sort(), 'Random selects the human from the displayed seven without replacing a faction');
          assert.match(await log(), /BRS_PLAYER_NAME\|Trace Commander(?:\r?\n|$)/, 'The generic name editor reaches the native human participant');
        }
        if (customMinimum) {
          const grid = [...(await log()).matchAll(/BRS_GRID\|(\d+)\|(\d+)/g)].at(-1);
          assert.deepEqual(grid.slice(1).map(Number), [32, 16], 'Entered 2x2 custom dimensions use the observed original minimum at world creation');
        }
        if (menuRetry) {
          assert.equal((await log()).split('BRS_UI_ERROR|').length - 1, 1, 'Valid retry produced no second error');
          assert.deepEqual(errors, []);
          return;
        }
        await page.keyboard.press('F2');
        const labs = await wait(laboratories, value => value.settled, 'Laboratories F2');
        assert.equal(labs.science, 0); assert.match(labs.accumulated, /: 0$/); assert.match(labs.perTurn, /: [0-9]+$/);
        assert.equal(labs.target, '');
        await page.locator('#canvas').screenshot({path: `${artifacts}/${name}-laboratories.png`});
        await click(512, labs.top + 27 + 220 - 10 - 12);
        await wait(laboratories, value => !value.shown, 'Laboratories pointer OK');
        await page.keyboard.press('F2'); await wait(laboratories, value => value.settled, 'Laboratories reopen');
        await page.keyboard.press('Escape'); await wait(laboratories, value => !value.shown, 'Laboratories Escape');
        await page.keyboard.press('Shift+r'); const before = await wait(state, value => value.settled, 'research popup');
        assert.equal(before.turn, 1); assert.equal(before.target, -1);
        await page.locator('#canvas').screenshot({path: `${artifacts}/${name}-open.png`});
        if (directed) {
          assert.ok(before.ids.length > 0); await click((1024 - 656) / 2 + 3 + 160, before.top + 27 + 27);
          const after = await wait(state, value => !value.shown && value.target === before.ids[0], 'native target receipt');
          assert.equal(after.turn, before.turn);
          await page.keyboard.press('F2'); const selectedLabs = await wait(laboratories, value => value.settled, 'selected target Laboratories');
          assert.ok(selectedLabs.target.length > 0); assert.equal(selectedLabs.science, 0);
          await page.keyboard.press('Enter'); await wait(laboratories, value => !value.shown, 'Laboratories Enter');
          let expectedScience = 0;
          for (let turn = 2; turn <= 6; turn++) {
            await click(899, 585);
            const ending = await wait(modal, value => value.turn === turn || (value.id === 'turn_confirmation' && value.settled), `end-turn control ${turn}`);
            if (ending.id === 'turn_confirmation') {
              await click(512, ending.top + 27 + 68 + 10);
            }
            await wait(state, value => value.turn === turn && !value.shown, `native turn ${turn}`);
            const credit = await wait(text => [...text.matchAll(/BRS_CREDIT\|(\d+)\|(\d+)\|(true|false)/g)].at(-1),
              value => Number(value[1]) === turn, `science income event ${turn}`);
            assert.equal(credit[3], 'true');
            expectedScience += Number(credit[2]);
            await wait(modal, value => value.id === 'none' && value.turn === turn && (value.status === 'active' || value.status === 'turn_complete'), `playable turn ${turn}`);
            await page.keyboard.press('F2');
            const report = await wait(laboratories, value => value.settled, `science report ${turn}`);
            assert.equal(report.science, expectedScience); assert.match(report.accumulated, new RegExp(`: ${expectedScience}$`));
            await page.keyboard.press('Enter'); await wait(laboratories, value => !value.shown, `close science report ${turn}`);
          }
          assert.ok(expectedScience > 0, 'Real normal-game turn events accumulate positive city science');
          const credits = [...(await log()).matchAll(/BRS_CREDIT\|(\d+)\|(\d+)\|(true|false)/g)];
          assert.deepEqual(credits.map(value => Number(value[1])), [2, 3, 4, 5, 6]);
          await page.keyboard.press('Shift+r');
          await wait(state, value => value.settled && value.target === before.ids[0], 'directed reopen');
          await page.keyboard.press('Escape'); await page.waitForTimeout(300); assert.equal(state(await log()).shown, true);
          const lastResearch = state(await log()); await click((1024 - 656) / 2 + 3 + 160, lastResearch.top + 27 + 27);
          await wait(state, value => !value.shown, 'close directed research for session exit');
          const worlds = [...(await log()).matchAll(/BRS_WORLD\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/g)];
          assert.deepEqual(worlds.map(value => Number(value[1])), [1, 2, 3, 4, 5, 6]);
          for (const world of worlds) { assert.deepEqual([world[2], world[3], world[4], world[6]].map(Number), [1, 6, 7, 0]); assert.ok(Number(world[5]) >= 7, 'Full native unit inventory includes every initial Scout and any new production'); }
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
        if (randomSelection) {
          assert.match(await log(), /Single-player setup: faction=RANDOM/, 'The actual nullable production setup path was used');
          for (let turn = 2; turn <= 4; turn++) {
            await click(899, 585);
            const ending = await wait(modal, value => value.turn === turn || (value.id === 'turn_confirmation' && value.settled), `Random end-turn control ${turn}`);
            if (ending.id === 'turn_confirmation') { await click(512, ending.top + 27 + 68 + 10); }
            await wait(modal, value => value.id === 'none' && value.turn === turn && (value.status === 'active' || value.status === 'turn_complete'), `Random native turn ${turn}`);
          }
        }
        await wait(modal, value => value.id === 'none' && value.settled, 'playable session before exit');
        const menuBeforeExit = (await log()).lastIndexOf('BRS_MENU|');
        await page.keyboard.press('Control+Shift+q');
        const quitting = await wait(modal, value => value.id === 'please_dont_go' && value.settled, 'native session exit confirmation');
        await click(512, quitting.top + 27 + 147 + 10);
        await wait(text => text, text => text.lastIndexOf('BRS_MENU|') > menuBeforeExit && text.slice(text.lastIndexOf('BRS_MENU|')).includes('BRS_MENU_REST'), 'main menu after native game reset');
        assert.deepEqual(errors, []);
      } finally {
        writeFileSync(`${artifacts}/${name}.log`, await log().catch(() => ''));
        await page.locator('#canvas').screenshot({path: `${artifacts}/${name}-last.png`, timeout: 3000}).catch(() => {});
        await context.close();
      }
    });
  }
});
