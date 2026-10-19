const behavior = #include('./_behavior');
const select_size = #include('../default/ui/parts/mainmenu/steps/select_mapsize');
const sizes = () => { return [
	{level: 0, name: 'Amber', description: 'Swift', size_x: 12, size_y: 8},
	{level: 1, name: 'Birch', description: '', size_x: 16, size_y: 10},
	{level: 2, name: 'Cedar', description: '', size_x: 20, size_y: 12},
	{level: 3, name: 'Dune', description: '', size_x: 24, size_y: 14},
	{level: 4, name: 'Elm', description: 'Patient', size_x: 28, size_y: 16},
]; };
const fixture = (route) => {
	const f = {}; f.native = test.production_fixture();
	f.settings = f.native.game.get_settings(); f.settings.global.rules.set_world_sizes(sizes());
	f.settings.global.map.type = route;
	f.state = {menu: null, difficulty: 0, climate: 0, custom: 0};
	f.i = {};
	f.i.settings = f.settings;
	f.i.sliding = {show: (data) => { f.state.menu = data; }};
	f.i.steps = {
		select_difficulty_level: (i) => { f.state.difficulty = f.state.difficulty + 1; },
		customize_ocean_coverage: (i) => { f.state.climate = f.state.climate + 1; },
		customize_mapsize: (i) => { f.state.custom = f.state.custom + 1; },
	};
	return f;
};
for (route of ['random', 'custom']) {
	behavior.scenario('actual size picker uses every native label and value on ' + route + ' route', () => {
		const f = fixture(route);
		for (level of [0, 1, 2, 3, 4]) {
			select_size(f.i); const menu = f.state.menu;
			test.assert(#sizeof(menu.entries) == 6 && menu.entries[5][0] == 'Custom Size');
			const expected = sizes();
			test.assert(menu.entries[level][0] == expected[level].name, 'Actual picker must use the installed native label');
			const choose = menu.entries[level][1]; choose();
			test.assert(f.settings.global.map.size_x == expected[level].size_x && f.settings.global.map.size_y == expected[level].size_y);
			test.assert(f.settings.global.map.preset_level == level && f.settings.global.map.type == route);
			select_size(f.i); test.assert(f.state.menu.selected == level);
		}
		test.assert(f.state.difficulty == (route == 'random' ? 5 : 0));
		test.assert(f.state.climate == (route == 'custom' ? 5 : 0));
	});
}
behavior.scenario('opening size controls and choosing custom are read-only until an explicit selection', () => {
	const f = fixture('custom'); const before = f.native.map_settings_snapshot('current');
	select_size(f.i);
	test.assert(f.native.map_settings_snapshot('current') == before);
	test.assert(f.state.menu.cancel_through == undefined && f.state.menu.cancel_scope == 'map_setup');
	const custom = f.state.menu.entries[5][1]; custom();
	test.assert(f.state.custom == 1 && f.state.climate == 0 && f.state.difficulty == 0);
	test.assert(f.native.map_settings_snapshot('current') == before);
});
behavior.scenario('matching dimensions with distinct preset identities retain the explicit remembered choice', () => {
	const f = fixture('random'); const table = sizes();
	table[4].size_x = table[0].size_x; table[4].size_y = table[0].size_y;
	f.settings.global.rules.set_world_sizes(table);
	f.settings.global.rules.select_world_size(f.settings.global.map, 4);
	select_size(f.i); test.assert(f.state.menu.selected == 4);
	const first = f.state.menu.entries[0][1]; first();
	select_size(f.i); test.assert(f.state.menu.selected == 0);
});

const lobby_fixture = (slave, duplicate) => {
	const f = fixture('random');
	if (duplicate == true) {
		const table = sizes(); table[4].size_x = table[0].size_x; table[4].size_y = table[0].size_y;
		f.settings.global.rules.set_world_sizes(table);
	}
	f.settings.global.rules.select_world_size(f.settings.global.map, 2);
	f.selects = []; f.sent = []; f.listeners = {};
	const event = #include('../default/game/event/game_settings');
	const events = #include('./_ui_mocks');
	f.game = {};
	f.game.get_settings = () => { return f.native.game.get_settings(); };
	f.game.get_players = () => { return []; };
	f.game.is_slave = () => { return slave; };
	f.game.is_started = () => { return false; };
	f.game.trigger = (name, data) => { if (#is_defined(f.listeners[name])) { const callback = f.listeners[name]; callback(data); } };
	f.game.event = (name, data) => {
		const e = {caller: 0}; e.game = f.game; e.data = data;
		const validation = event.validate(e);
		if (validation != undefined) { throw Error(validation); }
		f.sent :+ data.changes;
		f.native.with_write(() => { e.applied = event.apply(e); });
		f.applied = e;
	};
	const body = {};
	body.text = (props) => {};
	body.listen = (object, name, callback) => { f.listeners[name] = callback; };
	body.select = (props) => {
		const select = events.events(); select.items = props.items; select.value = props.value; select.readonly = props.readonly;
		f.selects :+ select; return select;
	};
	const i = {glsmac: {}}; i.glsmac.game = f.game;
	i.make_section = (title, style, callback) => { callback(body, {}); };
	#include('../default/ui/parts/mainmenu/steps/multiplayer_lobby/game_settings')(i);
	// Fixed line position is a declared display boundary; selection, command
	// validation/apply, map settings, receiving refresh and rollback are real.
	f.planet = f.selects[3];
	f.rollback = () => { f.native.with_write(() => { event.rollback(f.applied); }); };
	return f;
};
behavior.scenario('actual lobby choices use native labels and stable ordinal identities', () => {
	const f = lobby_fixture(false, false);
	test.assert(f.planet.items == [['0', 'Amber'], ['1', 'Birch'], ['2', 'Cedar'], ['3', 'Dune'], ['4', 'Elm']]);
	test.assert(f.planet.value == '2' && !f.planet.readonly);
	for (level of [0, 1, 2, 3, 4]) {
		const before = f.native.map_settings_snapshot('current');
		f.planet.emit('select', {value: #to_string(level)});
		const map = f.settings.global.map;
		test.assert(map.size_x == 12 + level * 4 && map.size_y == 8 + level * 2 && map.preset_level == level);
		test.assert(f.planet.value == #to_string(level), 'Receiving lobby refresh must resolve the same ordinal');
		f.rollback(); test.assert(f.native.map_settings_snapshot('current') == before && f.planet.value == '2');
	}
});
behavior.scenario('slave lobby controls cannot dispatch settings commands through their handlers', () => {
	const f = lobby_fixture(true, false); const before = f.native.map_settings_snapshot('current');
	test.assert(f.planet.readonly);
	f.planet.emit('select', {value: '0'});
	test.assert(#sizeof(f.sent) == 0 && f.native.map_settings_snapshot('current') == before);
});
behavior.scenario('lobby preserves distinct preset identities with equal dimensions', () => {
	const f = lobby_fixture(false, true);
	f.planet.emit('select', {value: '4'});
	test.assert(f.settings.global.map.size_x == 12 && f.settings.global.map.size_y == 8 && f.settings.global.map.preset_level == 4);
	test.assert(f.planet.value == '4');
	f.planet.emit('select', {value: '0'});
	test.assert(f.settings.global.map.size_x == 12 && f.settings.global.map.preset_level == 0 && f.planet.value == '0');
});

const controller = () => {
	const f = fixture('random');
	const mocks = #include('./_ui_mocks'); f.view = mocks.display();
	f.view.ui.get_width = () => { return 1024; };
	f.handlers = {}; f.loads = [];
	f.glsmac = {config: {}, init: () => {}, deinit: () => {}, exit: () => {}, reset: () => {}};
	f.glsmac.ui = f.view.ui; f.glsmac.game = f.native.game;
	f.glsmac.on = (name, callback) => { f.handlers[name] = callback; };
	f.glsmac.load_smac_text = (name, format) => {
		f.loads :+ name;
		if (name == 'xscript.txt') {
			return test.parse_smac_text('#TOPMENU\n#itemlist\nBegin\nFast\nScenario\nLoad\nNetwork\nCredits\nExit\n#MAPMENU\n#itemlist\nRandom\nClimate\nPlanet\nHuge\nFile\n#SCENARIOMENU\n#itemlist\nPlay\nCreate\nFile\nEdit\n#END\n', format);
		}
		if (name == 'alphax.txt') { return test.parse_smac_text('#WORLDSIZE\n5\nAmber|Swift,6,8\nBirch,8,10\nCedar,10,12\nDune,12,14\nElm|Patient,14,16\n#END\n', format); }
		if (name == 'menu.txt') { return test.parse_smac_text('#GAME\nExample\nExample command|Ctrl+E\n#END\n', format); }
		throw Error('Unexpected installed text request');
	};
	f.m = {}; f.m.glsmac = f.glsmac; f.m.root = f.view.root; f.m.ui = f.view.ui;
	#include('../default/ui/parts/mainmenu/mainmenu')(f.m);
	f.settle = () => {
		let count = 0;
		while (f.view.running_timers() > 0 && count < 64) {
			for (timer of f.view.timers) { timer.tick(); }
			count = count + 1;
		}
		if (f.view.running_timers() > 0) { throw Error('Menu timers did not settle'); }
	};
	f.click = (label) => {
		f.settle(); f.view.find('button', 'text', label).emit('mousedown', {button: 'left'}); f.settle();
	};
	f.escape = () => {
		f.settle(); f.view.find('area', 'class', 'menublock-items').emit('keydown', {code: 'ESCAPE', modifiers: {}}); f.settle();
	};
	const show = f.handlers.mainmenu_show; const e = {}; e.settings = f.settings; show(e);
	return f;
};
for (route of ['Random', 'Climate']) {
	behavior.scenario('complete menu controller preserves installed size and remembered selection through ' + route + ' cancellation', () => {
		const f = controller(); f.click('Begin'); f.click(route); f.click('Elm');
		test.assert(f.settings.global.map.size_x == 28 && f.settings.global.map.size_y == 16 && f.settings.global.map.preset_level == 4);
		f.escape();
		if (route == 'Random') { f.click('Random'); }
		test.assert(f.view.find('button', 'text', 'Elm').class == 'menublock-item-active');
		f.click('Amber');
		test.assert(f.settings.global.map.size_x == 12 && f.settings.global.map.size_y == 8 && f.settings.global.map.preset_level == 0);
		test.assert(#sizeof(f.loads) == 3, 'Menu visits share their installed definition cache');
		f.view.root.remove();
	});
}
