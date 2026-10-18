// Known production regression. Explicitly selected by the known-issues catalog;
// the leading underscore keeps the ordinary GSE script sweep from running it.
const behavior = #include('./_behavior');
const initialize_bases = #include('../default/game/bases');

behavior.scenario('growth with no available tiles creates a doctor', () => {
	const state = { values: {}, handlers: {}, events: [] };
	const base = {
		get_size: () => { return 0; },
		get_intake: () => { return { NUTRIENTS: 0 }; },
		get_consumption: () => { return { NUTRIENTS: 0 }; },
		get_unworked_tiles: () => { return []; },
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
	state.handlers.turn({});
	test.assert(#sizeof(state.events) == 1, 'A new base must gain one population');
	test.assert(state.events[0].type == 'DOCTOR', 'Growth without an available tile must create a doctor');
	test.assert(!#is_defined(state.events[0].worked_tile), 'A specialist must not receive a worked tile');
});
