const behavior = #include('./_behavior');
const fixture = #include('./_facility_cost_fixture');
const cost = (f) => {
	for (choice of f.owner.get_production_choices()) {
		if (choice.id == 'OBSERVED_TANKS') { return choice.cost; }
	}
	return 0;
};

for (entry of [[1, 36], [2, 40], [3, 40], [4, 40], [0, 32]]) {
	behavior.scenario('native descriptor uses explicit human preset level ' + #to_string(entry[0]), () => {
		const f = fixture(entry[0]);
		test.assert(cost(f) == entry[1], 'Descriptor must use four declared rows and the recorded rule10 INDUSTRY0 factor');
		// The pre-existing fixture facility has no row declaration.
		for (choice of f.owner.get_production_choices()) {
			if (choice.id == 'RECYCLING_TANKS') { test.assert(choice.cost == 32); }
		}
	});
}

behavior.scenario('unknown dimensions never imply original map preset provenance', () => {
	const f = fixture(0 - 1); const map = f.game.get_settings().global.map;
	map.size_x = 88; map.size_y = 44;
	test.assert(map.preset_level == -1 && cost(f) == 32);
	map.size_x = 400; map.size_y = 200;
	test.assert(map.preset_level == -1 && cost(f) == 32);
});

for (field of ['size_x', 'size_y']) {
	behavior.scenario('native dimension assignment clears named provenance: ' + field, () => {
		const f = fixture(1); const map = f.game.get_settings().global.map;
		if (field == 'size_x') { map.size_x = 88; }
		else { map.size_y = 44; }
		test.assert(map.preset_level == -1 && cost(f) == 32);
	});
}

for (kind of ['mapfile', 'planet', 'huge_planet']) {
	behavior.scenario('native imported map kind clears named provenance: ' + kind, () => {
		const f = fixture(1); const map = f.game.get_settings().global.map;
		map.type = kind;
		test.assert(map.preset_level == -1 && cost(f) == 32, 'After import type=' + #to_string(map.type) + ' retained=' + #to_string(map.preset_level) + ' fresh=' + #to_string(f.game.get_settings().global.map.preset_level) + ' cost=' + #to_string(cost(f)));
		let rejected = false;
		try { map.preset_level = 1; }
		catch { GSEInvalidAssignment: (e) => { rejected = true; } }
		test.assert(rejected && map.preset_level == -1 && cost(f) == 32);
	});
}

behavior.scenario('invalid native preset assignments preserve the previous explicit level', () => {
	const f = fixture(1); const map = f.game.get_settings().global.map;
	for (invalid of [0 - 2, 5, 1.0, '1', null]) {
		let rejected = false;
		try { map.preset_level = invalid; }
		catch { GSEInvalidAssignment: (e) => { rejected = true; } }
		test.assert(rejected && map.preset_level == 1);
	}
});

behavior.scenario('shipped Tanks explicitly declares four rows without rewriting Headquarters units', () => {
	const f = fixture(1);
	const definitions = #include('../default/game/facilities');
	let tanks_rows = 0; let headquarters_rows = 0;
	f.with_write(() => {
		f.game.bm.undefine_facility('RECYCLING_TANKS');
		const loader = {};
		loader.event = (name, data) => {
			if (data.id == 'RECYCLING_TANKS') {
				tanks_rows = data.def.cost_rows;
				f.game.bm.define_facility(data.id, data.def);
			}
			if (data.id == 'HEADQUARTERS') { headquarters_rows = data.def.cost_rows; }
		};
		definitions.define(loader);
	});
	test.assert(tanks_rows == 4 && headquarters_rows == 0);
	for (choice of f.owner.get_production_choices()) {
		if (choice.id == 'RECYCLING_TANKS') { test.assert(choice.cost == 36); }
	}
});

behavior.scenario('fresh native facility registry retains row units and uses independently restored receiving map settings', () => {
	const source = fixture(1);
	source.with_write(() => { source.base.select_production('OBSERVED_TANKS'); });
	source.set_turn(2); source.with_write(() => { source.base.process_production(2, 35); });
	const bases = source.snapshot(); const map = source.map_settings_snapshot('current');
	const target = test.production_fixture(); target.restore(bases);
	test.assert(cost(target) == 32, 'Production fixture snapshot deliberately excludes global map settings');
	target.restore_map_settings(map);
	test.assert(cost(target) == 36 && target.map_settings_snapshot('current') == map);
	source.reset(); target.set_turn(3);
	target.with_write(() => { target.base.process_production(3, 1); });
	test.assert(target.base.has_facility('OBSERVED_TANKS') && target.base.get_production() == { choice_id: '', minerals: 0, last_processed_turn: 3 });
});

behavior.scenario('legacy native map settings restore with unknown provenance and explicit mineral fallback', () => {
	const source = fixture(1); const legacy = source.map_settings_snapshot('legacy');
	const target = fixture(4); target.restore_map_settings(legacy);
	test.assert(target.game.get_settings().global.map.preset_level == (0 - 1) && cost(target) == 32);
});

for (kind of ['invalid_level', 'trailing']) {
	behavior.scenario('malformed native map settings leave live provenance and cost unchanged: ' + kind, () => {
		const f = fixture(1); const before = f.map_settings_snapshot('current');
		let rejected = false;
		try { f.restore_map_settings(f.map_settings_snapshot(kind)); }
		catch { GSEInvalidCall: (e) => { rejected = true; } }
		test.assert(rejected && f.map_settings_snapshot('current') == before && cost(f) == 36);
	});
}

for (role of ['single', 'host', 'player', 'none']) {
	behavior.scenario('facility cost factor applies only to modeled human player roles: ' + role, () => {
		const f = fixture(1); f.set_owner_role(role);
		test.assert(cost(f) == (role == 'none' ? 32 : 36));
	});
}

for (rows of [0 - 1, (1000000000 * 1000000000), '4', null]) {
	behavior.scenario('invalid declared row units reject before publishing a facility: ' + #to_string(rows), () => {
		const f = fixture(1); let rejected = false;
		try {
			f.with_write(() => {
				f.game.bm.define_facility('INVALID_ROWS', {
					name: 'Invalid', description: '', cost: 32, cost_rows: rows,
					render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 },
				});
			});
		} catch { : (e) => { rejected = true; } }
		test.assert(rejected && cost(f) == 36);
	});
}

behavior.scenario('actual lobby named choices carry preset provenance and native event rollback restores it', () => {
	const f = fixture(1);
	const mocks = #include('./_ui_mocks');
	const events = mocks.events;
	const configure_lobby = #include('../default/ui/parts/mainmenu/steps/multiplayer_lobby/game_settings');
	const settings_event = #include('../default/game/event/game_settings');
	const selects = []; let applied = null; let sent = null;
	const game = {};
	game.get_settings = () => { return f.game.get_settings(); };
	game.get_players = () => { return []; };
	game.is_slave = () => { return false; };
	game.trigger = (name, data) => {};
	game.event = (name, data) => {
		sent = data.changes;
		const e = { caller: 0 }; e.game = game; e.data = data;
		f.with_write(() => { e.applied = settings_event.apply(e); });
		applied = e;
	};
	const body = {};
	body.text = (props) => {};
	body.listen = (object, name, callback) => {};
	body.select = (props) => {
		const select = events(); select.items = props.items; select.value = props.value;
		selects :+ select; return select;
	};
	const i = { glsmac: {} }; i.glsmac.game = game;
	i.make_section = (title, style, callback) => { callback(body, {}); };
	configure_lobby(i);
	let sizes = null;
	for (select of selects) { if (select.items[0][0] == '0' && select.items[0][1] == 'Tiny Planet') { sizes = select; } }
	test.assert(sizes != null);
	for (entry of [['68x34', 0, 68, 34, 32], ['88x44', 1, 88, 44, 36], ['112x56', 2, 112, 56, 40], ['140x70', 3, 140, 70, 40], ['180x90', 4, 180, 90, 40]]) {
		const before = f.map_settings_snapshot('current');
		test.assert(sizes.emit('select', { value: #to_string(entry[1]) }) == true);
		test.assert(sent == [['planet_size', entry[0]], ['preset_level', entry[1]]]);
		const map = f.game.get_settings().global.map;
		test.assert(map.size_x == entry[2] && map.size_y == entry[3] && map.preset_level == entry[1] && cost(f) == entry[4]);
		f.with_write(() => { settings_event.rollback(applied); });
		test.assert(f.map_settings_snapshot('current') == before && cost(f) == 36);
	}
});

for (change of ['size_x', 'size_y', 'mapfile']) {
	behavior.scenario('retained native wrapper observes cleared assigned preset after ' + change, () => {
		const f = fixture(0); const map = f.game.get_settings().global.map;
		map.preset_level = 1;
		if (change == 'size_x') { map.size_x = 88; }
		else if (change == 'size_y') { map.size_y = 44; }
		else { map.type = 'mapfile'; }
		test.assert(map.preset_level == (0 - 1) && f.game.get_settings().global.map.preset_level == (0 - 1) && cost(f) == 32);
	});
}

behavior.scenario('retained wrappers observe another wrapper assigning native preset provenance', () => {
	const f = fixture(0); const first = f.game.get_settings().global.map;
	const second = f.game.get_settings().global.map;
	first.preset_level = 1; second.preset_level = 2;
	test.assert(first.preset_level == 2 && second.preset_level == 2 && cost(f) == 40);
});

for (kind of ['current', 'legacy']) {
	behavior.scenario('retained assigned preset observes actual native settings decode: ' + kind, () => {
		const source = fixture(4); const bytes = source.map_settings_snapshot(kind);
		const target = fixture(0); const retained = target.game.get_settings().global.map;
		retained.preset_level = 1;
		target.restore_map_settings(bytes);
		const expected = kind == 'current' ? 4 : (0 - 1);
		test.assert(retained.preset_level == expected && target.game.get_settings().global.map.preset_level == expected);
		test.assert(cost(target) == (kind == 'current' ? 40 : 32));
	});
}
