// Growth must choose a specialist when the base has exhausted workable tiles.
const behavior = #include('./_behavior');
const initialize_bases = #include('../default/game/bases');

const make_world = (size, nutrients, available_tile) => {
	const state = { values: {}, handlers: {}, events: [], tiles: [] };
	if (#is_defined(available_tile)) { state.tiles :+ available_tile; }
	if (#is_defined(nutrients)) { state.values.accumulated_nutrients = nutrients; }
	const base = {
		get_size: () => { return size; },
		get_owner: () => { return { id: 1 }; },
		get_production: () => { return { choice_id: '', minerals: 0, last_processed_turn: 0 }; },
		get_intake: () => { return { NUTRIENTS: 0 }; },
		get_consumption: () => { return { NUTRIENTS: 0 }; },
		get_unworked_tiles: () => { return state.tiles; },
		get: (key) => { return state.values[key]; },
		set: (key, value) => { state.values[key] = value; },
	};
	const bm = {
		on: (name, callback) => {},
		get_bases: () => { return [base]; },
	};
	const game = {
		get_bm: () => { return bm; },
		get_tm: () => { return {
			get_map_width: () => { return 20; },
			get_map_height: () => { return 20; },
		}; },
		on: (name, callback) => { state.handlers[name] = callback; },
		set: (key, value) => {},
		event: (name, data) => {
			if (name == 'add_base_pop') { state.events :+ data; }
		},
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
behavior.scenario('last available zero-yield tile still creates a worker', () => {
	const tile = { x: 2, y: 0, get_resources: (owner) => { return { NUTRIENTS: 0, MINERALS: 0, ENERGY: 0 }; } };
	const state = make_world(3, 40, tile);
	state.handlers.turn({});
	test.assert(#sizeof(state.events) == 1 && state.events[0].type == 'WORKER', 'An available tile must create a worker');
	test.assert(state.events[0].worked_tile.x == 2 && state.events[0].worked_tile.y == 0, 'Worker must receive the available tile');
});
