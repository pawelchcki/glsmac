// Asset-free integration: native text parser, actual mainmenu_show registration,
// real shipped menu steps/sliding controls. Only display, sounds, engine actions
// and timer delivery are controlled; labels are never supplied to the controls
// by this fixture. Alternate synthetic text must flow through the consumer.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');

const top = '#TOPMENU\n#caption Alternate command center\n#xs 400\n#itemlist\nBegin alternate\nFast alternate\nScenario alternate\nLoad alternate\nNetwork alternate\nCredits alternate\nExit alternate\n';
const rest = '#MAPMENU\n#caption Alternate terrain\n#itemlist\nRandom alternate\nCustom alternate\nPlanet alternate\nHuge alternate\nFile alternate\n#SCENARIOMENU\n#caption Alternate scenarios\n#itemlist\nPlay alternate\nCreate alternate\nMap alternate\nEdit alternate\n#MULTIMENU\n#caption Alternate services\n#itemlist\nService one\nService two\nService three\n#END\n';

const fixture = (source) => {
	const f = { state: { loads: [], initialized: 0, deinitialized: 0, started: 0, exited: 0 } };
	f.view = mocks.display();
	f.glsmac = mocks.events();
	f.glsmac.ui = f.view.ui;
	f.glsmac.config = {};
	f.glsmac.init = () => { f.state.initialized = f.state.initialized + 1; };
	f.glsmac.deinit = () => { f.state.deinitialized = f.state.deinitialized + 1; };
	f.glsmac.start_game = () => { f.state.started = f.state.started + 1; };
	f.glsmac.exit = () => { f.state.exited = f.state.exited + 1; };
	f.glsmac.reset = () => {};
	f.glsmac.load_smac_text = (filename, format) => {
		f.state.loads :+ [filename, format];
		if (filename == 'xscript.txt' && format == 'dialogs') { return test.parse_smac_text(source, format); }
		if (filename == 'alphax.txt' && format == 'rules') { return test.parse_smac_text('#RULES\nAlternate rule, 17\n#END\n', format); }
		if (filename == 'menu.txt' && format == 'menus') { return test.parse_smac_text('#GAME\nAlternate in-game menu\nUnknown command|Ctrl+Z\n#END\n', format); }
		throw Error('Unexpected installed data request: ' + filename + '/' + format);
	};
	f.m = {}; f.m.glsmac = f.glsmac; f.m.ui = f.view.ui; f.m.root = f.view.root;
	f.view.ui.get_width = () => { return 1024; };
	// Live native settings retain their identity through mainmenu_show and its
	// actual callbacks; a script Object there would be cloned by the entrypoint.
	f.native = test.production_fixture();
	f.settings = f.native.game.get_settings();
	#include('../default/ui/parts/mainmenu/mainmenu')(f.m);
	f.show = () => { const e = {}; e.settings = f.settings; f.glsmac.emit('mainmenu_show', e); };
	f.settle = () => {
		let tick = 0;
		while (f.view.running_timers() > 0 && tick < 64) {
			for (timer of f.view.timers) { timer.tick(); }
			tick = tick + 1;
		}
		if (f.view.running_timers() > 0) { throw Error('Menu timers did not settle'); }
	};
	f.click = (text) => {
		// Production rejects input during its entry animation. Deliver that
		// actual animation before the click, rather than disabling its guard.
		f.settle();
		f.view.find('button', 'text', text).emit('mousedown', { button: 'left' });
		f.settle();
	};
	return f;
};

const rejects = (source) => {
	const f = fixture(source);
	let failed = false;
	try { f.show(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Malformed installed definition must fail explicitly');
	test.assert(f.state.started == 0 && f.state.initialized == 0, 'Invalid text must not dispatch an action');
	f.view.root.remove();
};

behavior.scenario('installed alternate labels decorate real menu controls and preserve setup callbacks', () => {
	const f = fixture(top + rest); f.show();
	test.assert(f.view.find('button', 'text', 'Alternate command center').text == 'Alternate command center');
	f.click('Begin alternate');
	test.assert(f.state.initialized == 1 && f.settings.local.game_mode == 'single');
	test.assert(f.view.find('button', 'text', 'Alternate terrain').text == 'Alternate terrain');
	f.click('Custom alternate');
	test.assert(f.settings.global.map.type == 'custom');
	// Dynamic WORLDSIZE remains the shipped named-preset control/value mapping.
	f.click('Tiny Planet');
	test.assert(f.settings.global.map.size_x == 68 && f.settings.global.map.size_y == 34);
	test.assert(f.settings.global.map.preset_level == 0);
	test.assert(f.view.find('button', 'text', 'Select ocean coverage').text == 'Select ocean coverage');
	test.assert(f.state.started == 0 && f.state.exited == 0);
	f.view.root.remove();
});

behavior.scenario('data changes quick-start label without changing its original callback ordinal', () => {
	const f = fixture(top + rest); f.show(); f.click('Fast alternate');
	test.assert(f.state.initialized == 1 && f.state.started == 1);
	test.assert(f.settings.local.game_mode == 'single' && f.settings.global.map.type == 'random');
	test.assert(f.state.exited == 0);
	f.view.root.remove();
});

behavior.scenario('scenario labels preserve unsupported actions instead of enabling text commands', () => {
	const f = fixture(top + rest); f.show(); f.click('Scenario alternate');
	test.assert(f.view.find('button', 'text', 'Alternate scenarios').text == 'Alternate scenarios');
	f.click('Play alternate');
	test.assert(f.view.find('text', 'text', 'This feature is not implemented yet.').text == 'This feature is not implemented yet.');
	test.assert(f.state.started == 0 && f.state.initialized == 0);
	f.view.root.remove();
});

behavior.scenario('parsed rules and in-game definitions are accessible and loaded once per menu controller', () => {
	const f = fixture(top + rest); f.show();
	test.assert(#sizeof(f.state.loads) == 3);
	const rules = f.m.smac_data.rules.rows('RULES');
	test.assert(rules[0] == ['Alternate rule', '17']);
	const menu = f.m.smac_data.menus.menu('GAME');
	test.assert(menu.title == 'Alternate in-game menu');
	test.assert(menu.items[0].label == 'Unknown command' && menu.items[0].shortcut == 'Ctrl+Z');
	// Reading an unknown menu action must not make an executable button.
	test.assert(#sizeof(f.view.live('button')) == 8);
	f.glsmac.emit('mainmenu_hide', {}); f.show();
	test.assert(#sizeof(f.state.loads) == 3);
	test.assert(f.view.find('button', 'text', 'Begin alternate').text == 'Begin alternate');
	f.view.root.remove();
});

behavior.scenario('caption is optional and comments and blank records are not menu actions', () => {
	const f = fixture('#TOPMENU\n; comment\n#itemlist\nBegin alternate\n\nFast alternate\nScenario alternate\nLoad alternate\nNetwork alternate\nCredits alternate\nExit alternate\n' + rest);
	f.show();
	test.assert(#sizeof(f.view.live('button')) == 7);
	f.click('Exit alternate'); test.assert(f.state.exited == 1 && f.state.started == 0);
	f.view.root.remove();
});

behavior.scenario('installed static dialog must have exactly its existing action count', () => {
	rejects('#TOPMENU\n#itemlist\nOnly one option\n' + rest);
	rejects(top + 'Extra executable-looking option\n' + rest);
});

behavior.scenario('missing and ambiguous installed dialog blocks fail without fallback labels', () => {
	rejects(rest);
	rejects(top + top + rest);
});

behavior.scenario('duplicate itemlists captions and unsupported directives are explicit errors', () => {
	rejects(top + '#itemlist\n' + rest);
	rejects(top + '#caption Another caption\n' + rest);
	rejects(top + '#button Unsupported executable-looking directive\n' + rest);
	rejects('#TOPMENU\nUnexpected body text\n#itemlist\nBegin alternate\nFast alternate\nScenario alternate\nLoad alternate\nNetwork alternate\nCredits alternate\nExit alternate\n' + rest);
});

behavior.scenario('missing installed data propagates without English labels or base-game fallback', () => {
	const f = fixture(top + rest);
	f.glsmac.load_smac_text = (filename, format) => { throw Error('Declared installed file is missing: ' + filename); };
	let failed = false;
	try { f.show(); } catch { : (e) => { failed = true; } }
	test.assert(failed && #sizeof(f.view.live('button')) == 0);
	test.assert(f.state.initialized == 0 && f.state.started == 0);
	f.view.root.remove();
});
