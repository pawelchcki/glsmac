// Actual production popup manager, controls, source parser and native settings.
// Display, timers and the next setup step are controlled application boundaries.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const texts = #include('./_large_map_text_fixture');
const worlds = #include('../default/game/world_sizes');
const customize = #include('../default/ui/parts/mainmenu/steps/customize_mapsize');
const entries = (f) => {
	const result = [];
	for (button of f.view.live('button')) {
		if (button.class == 'popup-choice' || button.class == 'popup-choice-active') { result :+ button; }
	}
	return result;
};
const selected = (f) => {
	const rows = entries(f); let index = 0;
	for (row of rows) { if (row.class == 'popup-choice-active') { return index; } index++; }
	return (0 - 1);
};
const key = (f, code) => {
	const windows = f.view.live('window'); test.assert(#sizeof(windows) == 1);
	return windows[0].emit('keydown', {code: code, modifiers: {}});
};
const fixture = (route, profile) => {
	const f = mocks.menu_popup(); f.native = test.production_fixture(); f.data = texts(profile);
	f.m.settings = f.native.game.get_settings(); f.m.smac_data = f.data.bundle; f.m.popup = f.popup;
	worlds.apply(f.data.bundle.rules, f.m.settings.global.rules);
	f.m.settings.global.rules.select_world_size(f.m.settings.global.map, 2); f.m.settings.global.map.type = route;
	f.state.routes = [];
	f.m.steps = {select_difficulty_level: (i) => { f.state.routes :+ 'difficulty'; }, customize_ocean_coverage: (i) => { f.state.routes :+ 'ocean'; }};
	const show = f.popup.show;
	f.popup.show = (data) => { f.state.popup = data; return show(data); };
	f.popup.show({title: 'Caller', width: 480, height: 180});
	f.popup.show({title: 'Scope', width: 480, height: 180, cancel_scope: 'map_setup'});
	f.open = () => { customize(f.m); f.fields = f.view.live('input'); };
	f.submit = (horizontal, vertical) => {
		f.fields[0].value = horizontal; f.fields[1].value = vertical;
		return f.fields[1].emit('input', {});
	};
	return f;
};

for (route of ['random', 'custom']) {
	for (profile of ['default', 'both']) {
		behavior.scenario(route + ' actual warning controls consume ' + profile + ' text and defer advancement', () => {
			const f = fixture(route, profile); f.open(); test.assert(f.submit('129', '129') == true);
			const title = profile == 'both' ? 'Core Notice' : 'Warning!';
			test.assert(f.view.find('window', 'title', title).title == title);
			const rows = entries(f); test.assert(#sizeof(rows) == 2 && selected(f) == 0);
			test.assert(rows[0].text == (profile == 'both' ? 'Proceed here.' : 'Continue anyway.'));
			test.assert(rows[1].text == (profile == 'both' ? 'Return here.' : 'Never mind.'));
			test.assert(#sizeof(f.view.live('input')) == 0 && f.state.routes == []);
			const windows = f.view.live('window');
			test.assert(windows[0].emit('keydown', {code: 'DOWN', modifiers: {shift: true}}) == false && selected(f) == 0);
			test.assert(windows[0].emit('keydown', {code: 'ESCAPE', modifiers: {shift: true}}) == false && f.state.routes == []);
			test.assert(key(f, 'ESCAPE') == true);
			test.assert(f.state.routes == [route == 'random' ? 'difficulty' : 'ocean']);
		});
	}
	behavior.scenario(route + ' warning list clamps arrows ignores Home End and clicks only select', () => {
		const f = fixture(route, 'default'); f.open(); f.submit('129', '80');
		test.assert(key(f, 'UP') == true && selected(f) == 0);
		key(f, 'DOWN'); key(f, 'DOWN'); test.assert(selected(f) == 1 && f.state.routes == []);
		key(f, 'HOME'); key(f, 'END'); test.assert(selected(f) == 1);
		key(f, 'UP'); key(f, 'UP'); test.assert(selected(f) == 0);
		const rows = entries(f); rows[1].emit('click', {});
		test.assert(selected(f) == 1 && f.state.routes == [] && #sizeof(f.view.live('window')) == 1);
		key(f, 'ESCAPE'); test.assert(f.state.routes == []);
		test.assert(f.view.find('window', 'title', 'Caller').title == 'Caller' && #sizeof(f.manager.data_stack) == 1 && f.state.reset == 0);
	});
	behavior.scenario(route + ' default and selected confirmation callbacks complete only once', () => {
		const f = fixture(route, 'default'); f.open(); f.submit('129', '80');
		const data = f.state.popup; const confirm = data.buttons[0].onclick;
		test.assert(confirm({}) == true && f.state.routes == [route == 'random' ? 'difficulty' : 'ocean']);
		const stack_size = #sizeof(f.manager.data_stack);
		confirm({}); data.on_keydown({code: 'ESCAPE', modifiers: {}});
		test.assert(#sizeof(f.state.routes) == 1 && #sizeof(f.manager.data_stack) == stack_size && f.state.reset == 0);
		const canceled = fixture(route, 'default'); canceled.open(); canceled.submit('129', '80');
		const canceled_data = canceled.state.popup; const rows = entries(canceled); rows[1].emit('click', {});
		canceled.view.find('button', 'text', 'OK').emit('click', {});
		canceled_data.buttons[0].onclick({}); canceled_data.on_keydown({code: 'ENTER', modifiers: {}});
		test.assert(canceled.state.routes == [] && #sizeof(canceled.manager.data_stack) == 1 && canceled.state.reset == 0);
	});
	behavior.scenario(route + ' small odd and inclusive boundary dimensions advance without warnings', () => {
		for (dimensions of [['30', '49', 60, 49], ['128', '128', 256, 128], ['2', '2', 4, 2]]) {
			const f = fixture(route, 'default'); f.open(); f.submit(dimensions[0], dimensions[1]);
			test.assert(#sizeof(entries(f)) == 0 && f.state.routes == [route == 'random' ? 'difficulty' : 'ocean']);
			test.assert(f.m.settings.global.map.size_x == dimensions[2] && f.m.settings.global.map.size_y == dimensions[3]);
			test.assert(f.m.settings.global.map.preset_level == 99);
		}
	});
}

behavior.scenario('warning state retains native aliases while Load Map selects its independent pricing input', () => {
	const f = fixture('random', 'default'); const alias = f.native.game.get_settings().global.map;
	alias.size_x = 200; alias.size_y = 100; alias.preset_level = 1;
	f.m.settings.global.rules.set_nutrient_cost_factor(13);
	f.open(); f.submit('129', '129');
	test.assert(alias.size_x == 258 && alias.size_y == 129 && alias.preset_level == 99);
	test.assert(f.native.base.get_nutrient_factor() == 13 && f.state.routes == []);
	alias.type = 'mapfile'; const before = f.native.map_settings_snapshot('current');
	key(f, 'ENTER');
	test.assert(f.native.map_settings_snapshot('current') == before && f.state.routes == []);
	// Imported setup loses its generated preset, but Load Map has observed
	// pricing input zero independently of dimensions and that prior preset.
	test.assert(alias.preset_level == (0 - 1) && alias.get_rule_size_kind() == 0);
	test.assert(f.m.settings.global.rules.get_nutrient_cost_factor() == 13);
	test.assert(f.native.base.get_nutrient_factor() == 10);
	test.assert(f.view.find('window', 'title', 'Caller').title == 'Caller');
	// Other imported routes without a pricing contract remain unavailable.
	alias.type = 'planet';
	test.assert(!#is_defined(f.native.base.get_nutrient_factor()));
});

behavior.scenario('malformed warning data rejects before committing dimensions or closing the input popup', () => {
	const f = fixture('random', 'default');
	f.data.sources['script.txt'] = '#CUSTOMMAP\n#caption Custom Map Size\n#VERYLARGEMAP\n#caption Warning!\n#itemlist\nUnsupported body\nFirst\nSecond\n';
	f.open(); const before = f.native.map_settings_snapshot('current');
	let failed = false;
	try { f.submit('129', '80'); } catch { : (e) => { failed = true; } }
	test.assert(failed && f.native.map_settings_snapshot('current') == before && f.state.routes == []);
	test.assert(#sizeof(f.view.live('input')) == 2 && #sizeof(f.manager.data_stack) == 3);
});
