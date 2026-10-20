// The shipped growth stage owns nutrient accumulation. Population requests
// remain independently queued commands; these controlled boundaries test the
// stage's validation, authority and nutrient-only undo contract.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const stage = #include('../default/game/event/process_base_growth');
const fixture = (master, stored) => {
	const f = {};
	f.values = {}; f.globals = {}; f.requests = [];
	f.state = { intake: 3, size: 1, project: '', production_turn: 0 };
	if (#is_defined(stored)) { f.values.accumulated_nutrients = stored; }
	f.base = {};
	f.base.get = (key) => { return f.values[key]; };
	f.base.has = (key) => { return #is_defined(f.values[key]); };
	f.base.set = (key, value) => { f.values[key] = value; };
	f.base.unset = (key) => { f.values[key] = undefined; };
	f.base.get_size = () => { return f.state.size; };
	f.base.get_intake = () => { return { NUTRIENTS: f.state.intake }; };
	f.base.get_consumption = () => { return { NUTRIENTS: f.state.size * 2 }; };
	f.base.get_unworked_tiles = () => { return []; };
	f.base.id = 17;
	f.base.get_owner = () => { return {id: 1}; };
	f.base.get_tile = () => { return {x: 0, y: 0}; };
	f.base.get_pops = () => { return [{ id: 3, has: (key) => { return false; }, get: (key) => { return undefined; }, get_type: () => { return 'DOCTOR'; } }]; };
	f.base.get_production = () => { return { choice_id: f.state.project, minerals: 0, last_processed_turn: f.state.production_turn }; };
	f.game = {};
	f.game.get_turn = () => { return 7; };
	f.game.is_master = () => { return master; };
	f.game.get = (key) => { return f.globals[key]; };
	f.game.set = (key, value) => { f.globals[key] = value; };
	// This controlled stage fixture has no mounted notification consumer.
	f.game.trigger = (name, data) => { return false; };
	f.game.get_bm = () => { return { on: (name, callback) => {}, get_bases: () => { return []; } }; };
	f.game.get_tm = () => { return { get_map_width: () => { return 20; }, get_map_height: () => { return 20; } }; };
	const handlers = {};
	f.game.on = (name, callback) => { handlers[name] = callback; };
	f.game.event = (name, data) => {
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		test.assert(name == 'add_base_pop' || name == 'remove_base_pop', 'unexpected stage child request');
		const request = { name: name }; request.data = data; f.requests :+ request;
	};
	configure_bases(f.game); handlers.start({});
	f.event = { caller: 0, data: { turn_id: 7 } }; f.event.data.base = f.base; f.event.game = f.game;
	f.apply = () => {
		test.assert(!#is_defined(stage.validate(f.event)));
		f.event.applied = stage.apply(f.event);
	};
	return f;
};

behavior.scenario('growth stage validates authority and turn before any nutrient change', () => {
	const f = fixture(true, 4);
	f.event.caller = 1;
	test.assert(stage.validate(f.event) == 'Only host can process base growth');
	f.event.caller = 0;
	for (turn of [undefined, null, '7', 7.0, 0, (0 - 1), 6, 8]) {
		f.event.data.turn_id = turn;
		test.assert(#typeof(stage.validate(f.event)) == 'String');
		test.assert(f.values.accumulated_nutrients == 4 && f.requests == []);
	}
});

behavior.scenario('active project requires production from this turn while idle growth is independent', () => {
	const f = fixture(true, 4); f.state.project = 'COLONY_POD'; f.state.production_turn = 6;
	test.assert(stage.validate(f.event) == 'Base production must be processed before growth');
	f.state.production_turn = 7; f.apply(); test.assert(f.values.accumulated_nutrients == 5);
	stage.rollback(f.event); test.assert(f.values.accumulated_nutrients == 4);
	f.state.project = ''; f.state.production_turn = 0; f.apply();
	test.assert(f.values.accumulated_nutrients == 5 && f.requests == []);
});

for (stored of [undefined, 0, 4]) {
	behavior.scenario('growth nutrient undo restores controlled stored value ' + #to_string(stored), () => {
		const f = fixture(true, stored); f.apply();
		test.assert(f.values.accumulated_nutrients == (#is_defined(stored) ? stored + 1 : 1));
		stage.rollback(f.event);
		test.assert(f.values.accumulated_nutrients == stored && f.requests == []);
	});
}

behavior.scenario('native nutrient undo removes a previously absent custom field and restores valid snapshot', () => {
	const f = test.production_fixture(); f.add_worker(0); f.enable_economy();
	f.game.tm.on('get_tile_resources', (e) => { return { NUTRIENTS: 3, MINERALS: 1, ENERGY: 0 }; });
	const rules = {}; const handlers = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => {
		test.assert(name == 'define_base_pop' || name == 'define_base_facility', 'native fixture supplies declarations only');
	};
	configure_bases(rules); handlers.start({});
	test.assert(!f.base.has('accumulated_nutrients'));
	const before = f.snapshot();
	const e = { caller: 0, data: { turn_id: 1 } }; e.game = f.game; e.data.base = f.base;
	test.assert(!#is_defined(stage.validate(e)));
	f.with_write(() => { e.applied = stage.apply(e); });
	test.assert(f.base.has('accumulated_nutrients') && f.base.get('accumulated_nutrients') == 1);
	f.with_write(() => { stage.rollback(e); });
	test.assert(!f.base.has('accumulated_nutrients'));
	test.assert(f.snapshot() == before, 'native field presence and valid serialized base must restore exactly');
});

for (master of [true, false]) {
	behavior.scenario('replicated growth accumulates nutrients but only native master queues new population ' + #to_string(master), () => {
		const f = fixture(master, 19); f.apply();
		test.assert(f.values.accumulated_nutrients == 20);
		test.assert(#sizeof(f.requests) == (master ? 1 : 0));
		if (master) { test.assert(f.requests[0].name == 'add_base_pop' && f.requests[0].data.type == 'DOCTOR'); }
		stage.rollback(f.event); test.assert(f.values.accumulated_nutrients == 19);
	});
	behavior.scenario('only native master queues starvation population removal ' + #to_string(master), () => {
		const f = fixture(master, 0); f.state.intake = 1; f.apply();
		test.assert(f.values.accumulated_nutrients == 0 && #sizeof(f.requests) == (master ? 1 : 0));
		if (master) { test.assert(f.requests[0].name == 'remove_base_pop' && f.requests[0].data.pop.id == 3); }
		stage.rollback(f.event); test.assert(f.values.accumulated_nutrients == 0);
	});
}
