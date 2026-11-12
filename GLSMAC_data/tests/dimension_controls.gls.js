const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const texts = #include('./_dimension_text_fixture');
const world_sizes = #include('../default/game/world_sizes');
const customize = #include('../default/ui/parts/mainmenu/steps/customize_mapsize');
const fixture = (route, profile) => {
	const f = mocks.menu_popup(); f.native = test.production_fixture();
	f.data = texts.create(profile, texts.world_source);
	f.m.smac_data = f.data.bundle; f.m.settings = f.native.game.get_settings(); f.m.popup = f.popup;
	world_sizes.apply(f.data.bundle.rules, f.m.settings.global.rules);
	f.m.settings.global.map.type = route;
	f.m.settings.global.rules.select_world_size(f.m.settings.global.map, 4);
	f.state.routes = [];
	f.m.steps = {
		select_difficulty_level: (i) => { f.state.routes :+ 'difficulty'; },
		customize_ocean_coverage: (i) => { f.state.routes :+ 'ocean'; },
	};
	f.popup.show({title: 'Map Size', width: 480, height: 180});
	f.open = () => { customize(f.m); f.fields = f.view.live('input'); };
	return f;
};

behavior.scenario('actual controls use the loaded common caption labels and observed untouched defaults', () => {
	const f = fixture('random', 'both'); const previous_x = f.m.settings.global.map.size_x; const previous_y = f.m.settings.global.map.size_y;
	f.open();
	test.assert(f.view.find('window', 'title', 'Core Dimensions').title == 'Core Dimensions');
	test.assert(f.view.find('text', 'text', 'Meridian').text == 'Meridian');
	test.assert(f.view.find('text', 'text', 'Parallel').text == 'Parallel');
	test.assert(f.fields[0].value == '40' && f.fields[1].value == '80');
	const map = f.m.settings.global.map;
	test.assert(map.size_x == previous_x && map.size_y == previous_y && map.preset_level == 99, 'Opening declares Custom without committing edited dimensions');
});

for (route of ['random', 'custom']) {
	for (field of [0, 1]) {
		behavior.scenario('focused field ' + #to_string(field) + ' confirms displayed units on ' + route + ' route', () => {
			const f = fixture(route, 'default'); f.open();
			f.fields[0].value = '30'; f.fields[1].value = '24';
			test.assert(f.fields[field].emit('input', {}) == true);
			const map = f.m.settings.global.map;
			test.assert(map.size_x == 60 && map.size_y == 24 && map.preset_level == 99);
			test.assert(map.type == route && f.state.routes == [route == 'random' ? 'difficulty' : 'ocean']);
			test.assert(#sizeof(f.view.live('input')) == 0 && #sizeof(f.view.live('window')) == 1);
			f.fields[field].emit('input', {}); test.assert(#sizeof(f.state.routes) == 1);
		});
	}
}

behavior.scenario('application dimension boundaries and padding preserve native parity units', () => {
	for (entry of [['2', '2', 4, 2], ['2048', '4096', 4096, 4096], [' 30 ', ' 24 ', 60, 24], ['121', '80', 242, 80], ['40', '81', 80, 81]]) {
		const f = fixture('random', 'default'); f.open();
		f.fields[0].value = entry[0]; f.fields[1].value = entry[1];
		test.assert(f.view.find('button', 'text', 'OK').emit('click', {}) == true);
		test.assert(f.m.settings.global.map.size_x == entry[2] && f.m.settings.global.map.size_y == entry[3]);
		if (entry[2] > 256 || entry[3] > 128) {
			test.assert(f.state.routes == [] && f.view.find('window', 'title', 'Warning!').title == 'Warning!');
			f.view.find('button', 'text', 'OK').emit('click', {});
		}
		test.assert(f.state.routes == ['difficulty']);
	}
});

behavior.scenario('invalid displayed dimensions preserve the complete native map and keep controls open', () => {
	for (entry of [['1', '80'], ['2049', '80'], ['40', '1'], ['040', '80'], ['40', '080'], ['+40', '80'], ['40.0', '80'], ['40x', '80'], ['40', '2e1'], ['', '80'], ['999999999999999999999', '80']]) {
		const f = fixture('random', 'default'); f.open(); const before = f.native.map_settings_snapshot('current');
		f.fields[0].value = entry[0]; f.fields[1].value = entry[1];
		test.assert(f.fields[0].emit('input', {}) == true, 'Invalid input is consumed: ' + entry[0] + '/' + entry[1]);
		test.assert(f.native.map_settings_snapshot('current') == before && #sizeof(f.state.routes) == 0, 'Invalid input preserves map and route: ' + entry[0] + '/' + entry[1]);
		test.assert(#sizeof(f.view.live('input')) == 2 && #sizeof(f.view.live('window')) == 1, 'Invalid input retains popup: ' + entry[0] + '/' + entry[1]);
	}
});

for (route of ['random', 'custom']) {
	behavior.scenario('Cancel preserves native settings after edits on ' + route + ' route', () => {
		const f = fixture(route, 'default'); f.open(); const before = f.native.map_settings_snapshot('current');
		f.fields[0].value = '30'; f.fields[1].value = '24';
		test.assert(f.view.find('button', 'text', 'Cancel').emit('click', {}) == true);
		test.assert(f.native.map_settings_snapshot('current') == before && #sizeof(f.state.routes) == 0);
		test.assert(#sizeof(f.view.live('input')) == 0 && f.state.reset == 0);
	});
}

behavior.scenario('successful custom confirmation updates assigned retained native aliases', () => {
	const f = fixture('random', 'default'); const alias = f.native.game.get_settings().global.map;
	alias.size_x = 200; alias.size_y = 100; alias.preset_level = 1;
	f.open(); f.fields[0].value = '30'; f.fields[1].value = '24';
	f.fields[0].emit('input', {});
	test.assert(alias.size_x == 60 && alias.size_y == 24 && alias.preset_level == 99, 'Retained assigned wrappers must observe the committed dimensions');
});

behavior.scenario('a map imported after opening cannot accept a stale custom-size submission', () => {
	const f = fixture('random', 'default'); f.open();
	const alias = f.native.game.get_settings().global.map; alias.type = 'mapfile';
	const before = f.native.map_settings_snapshot('current');
	f.fields[0].value = '30'; f.fields[1].value = '24';
	test.assert(f.fields[0].emit('input', {}) == true);
	test.assert(f.native.map_settings_snapshot('current') == before && #sizeof(f.state.routes) == 0);
	test.assert(#sizeof(f.view.live('input')) == 2);
});

behavior.scenario('retained imported wrappers observe both restored generated-map routes', () => {
	for (route of ['random', 'custom']) {
		const f = fixture(route, 'default'); const map = f.m.settings.global.map;
		map.type = 'mapfile';
		const alias = f.native.game.get_settings().global.map; alias.type = route;
		test.assert(map.type == route, 'A retained imported wrapper must observe the restored generated route');
		f.open(); f.fields[0].value = '30'; f.fields[1].value = '24';
		f.fields[0].emit('input', {});
		test.assert(map.size_x == 60 && map.size_y == 24 && map.preset_level == 99);
		test.assert(f.state.routes == [route == 'random' ? 'difficulty' : 'ocean']);
	}
});

behavior.scenario('bad optional source data rejects before creating a partial popup', () => {
	const f = fixture('random', 'default'); f.data.sources['script.txt'] = '#CUSTOMMAP\n#caption\n';
	const before = f.native.map_settings_snapshot('current');
	let failed = false;
	try { f.open(); } catch { : (e) => { failed = true; } }
	test.assert(failed && #sizeof(f.view.live('window')) == 1 && #sizeof(f.view.live('input')) == 0);
	test.assert(f.native.map_settings_snapshot('current') == before && #sizeof(f.state.routes) == 0);
});

for (opening_route of ['random', 'custom']) {
	behavior.scenario('dimension submission follows the current generated route after opening on ' + opening_route, () => {
		const f = fixture(opening_route, 'default'); f.open();
		const map = f.m.settings.global.map; const alias = f.native.game.get_settings().global.map;
		const route = opening_route == 'random' ? 'custom' : 'random';
		const rules = f.native.rules_settings_snapshot('current'); const world = f.native.snapshot(); const updates = f.native.update_count();
		map.type = route; map.filename = 'Retained Setup.GSM'; map.ocean_coverage = 0.4; map.cloud_cover = 0.75;
		const old_field = f.fields[0];
		f.fields[0].value = '31'; f.fields[1].value = '25'; old_field.emit('input', {});
		test.assert(alias.type == route && alias.size_x == 62 && alias.size_y == 25 && alias.preset_level == 99);
		test.assert(alias.filename == 'Retained Setup.GSM' && alias.ocean_coverage == 0.4 && alias.cloud_cover == 0.75);
		test.assert(f.state.routes == [route == 'random' ? 'difficulty' : 'ocean'], 'A live route change determines the next setup question');
		test.assert(f.native.rules_settings_snapshot('current') == rules && f.native.snapshot() == world && f.native.update_count() == updates);
		const committed = f.native.map_settings_snapshot('current');
		test.assert(!old_field.emit('input', {}));
		test.assert(f.native.map_settings_snapshot('current') == committed && #sizeof(f.state.routes) == 1);
	});
}

behavior.scenario('an imported map arriving during the large-size warning is preserved when its response is delivered', () => {
	const f = fixture('random', 'default'); f.open();
	f.fields[0].value = '129'; f.fields[1].value = '80'; f.fields[0].emit('input', {});
	test.assert(f.state.routes == [] && #sizeof(f.view.live('input')) == 0);
	test.assert(f.view.find('window', 'title', 'Warning!').title == 'Warning!');
	const map = f.native.game.get_settings().global.map; map.type = 'mapfile'; map.filename = 'Later Import.GSM';
	const before = f.native.map_settings_snapshot('current'); const rules = f.native.rules_settings_snapshot('current'); const world = f.native.snapshot();
	f.view.find('button', 'text', 'OK').emit('click', {});
	test.assert(f.native.map_settings_snapshot('current') == before && f.state.routes == [], 'The warning cannot replace or advance a newer imported-map selection');
	test.assert(f.native.rules_settings_snapshot('current') == rules && f.native.snapshot() == world);
	test.assert(#sizeof(f.view.live('input')) == 0 && #sizeof(f.view.live('window')) == 1);
});
