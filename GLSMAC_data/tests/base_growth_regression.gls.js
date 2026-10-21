// Growth must choose a specialist when the base has exhausted workable tiles.
const behavior = #include('./_behavior');
const initialize_bases = #include('../default/game/bases');
const growth_stage = #include('../default/game/event/process_base_growth');

const make_world = (size, nutrients, available_tile) => {
	const state = { values: {}, globals: {}, handlers: {}, events: [], tiles: [] };
	if (#is_defined(available_tile)) { state.tiles :+ available_tile; }
	if (#is_defined(nutrients)) { state.values.accumulated_nutrients = nutrients; }
	const base = {
		get_size: () => { return size; },
		get_owner: () => { return { id: 1 }; },
		get_production: () => { return { choice_id: '', minerals: 0, last_processed_turn: 0 }; },
		get_intake: () => { return { NUTRIENTS: 0 }; },
		get_consumption: () => { return { NUTRIENTS: 0 }; },
		get_unworked_tiles: () => { return state.tiles; },
		get_workable_tiles: () => { return state.tiles; },
		get_tile: () => { return null; },
		is_tile_worked: (tile) => { return false; },
		get: (key) => { return state.values[key]; },
		has: (key) => { return #is_defined(state.values[key]); },
		set: (key, value) => { state.values[key] = value; },
	};
	const bm = {
		on: (name, callback) => {},
		get_bases: () => { return [base]; },
	};
	const game = {
		get_turn: () => { return 2; },
		is_master: () => { return true; },
		get_bm: () => { return bm; },
		get_tm: () => { return {
			get_map_width: () => { return 20; },
			get_map_height: () => { return 20; },
			get_tile: (x, y) => { for (tile of state.tiles) { if (tile.x == x && tile.y == y) { return tile; } } return null; },
		}; },
		on: (name, callback) => { state.handlers[name] = callback; },
		set: (key, value) => { state.globals[key] = value; },
		get: (key) => { return state.globals[key]; },
	};
	// GSE binds this callback after game exists, so its stage event can retain
	// the same receiving game object instead of an unbound literal reference.
	game.event = (name, data) => {
		if (name == 'process_base_growth') {
			const e = { caller: 0 }; e.game = game; e.data = data;
			test.assert(!#is_defined(growth_stage.validate(e))); growth_stage.apply(e);
			return;
		}
		if (name == 'add_base_pop') { state.events :+ data; }
	};
	initialize_bases(game);
	state.handlers.start({});
	return state;
};

for (c of [
	['growth with no available tiles creates a doctor', 0, undefined],
	['established base with exhausted tiles creates a doctor at threshold', 3, 40],
	['established base with exhausted tiles grows once above threshold', 3, 90],
]) {
	behavior.scenario(c[0], () => {
		const state = make_world(c[1], c[2], undefined);
		state.handlers.turn({});
		test.assert(#sizeof(state.events) == 1, 'A growing base must gain one population');
		test.assert(state.events[0].type == 'DOCTOR', 'Growth without an available tile must create a doctor');
		test.assert(!#is_defined(state.events[0].worked_tile), 'A specialist must not receive a worked tile');
	});
}
behavior.scenario('exhausted tiles do not force growth below nutrient threshold', () => {
	const state = make_world(3, 39, undefined);
	state.handlers.turn({});
	test.assert(state.events == [], 'A full base must still meet its nutrient threshold');
	test.assert(state.values.accumulated_nutrients == 39, 'Waiting for growth preserves nutrients');
});
behavior.scenario('last available zero-yield tile leaves growth as a Doctor', () => {
	const tile = { x: 2, y: 0, get_base: () => { return null; }, has: (name) => { return false; }, get_resources: (owner) => { return { NUTRIENTS: 0, MINERALS: 0, ENERGY: 0 }; } };
	const state = make_world(3, 40, tile);
	state.handlers.turn({});
	test.assert(#sizeof(state.events) == 1 && state.events[0].type == 'DOCTOR', 'Automatic growth must not assign a zero-yield tile');
	test.assert(!#is_defined(state.events[0].worked_tile), 'Zero-yield Doctor fallback must not claim terrain');
});
