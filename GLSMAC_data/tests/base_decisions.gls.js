// Exercise the real default/game/bases callbacks and their exported helpers.
// This is GLSMAC's current weighted tile heuristic, not strategic AI or an
// original-game differential contract. Resource values are explicit fixtures;
// yields, facilities, factions, manager mutation and graphics are not simulated.
const behavior = #include('./_behavior');
const initialize_bases = #include('../default/game/bases');

const make_tile = (x, y, nutrients, minerals, energy) => {
	const tile = { x: x, y: y };
	const values = {};
	const resources = { NUTRIENTS: nutrients, MINERALS: minerals, ENERGY: energy };
	tile.get_resources = (owner) => { return resources; };
	tile.get = (key) => { return values[key]; };
	tile.set = (key, value) => { values[key] = value; };
	tile.unset = (key) => { values[key] = undefined; };
	return tile;
};
const make_pop = (id, type) => {
	const pop = { id: id };
	const values = {};
	let current_type = type;
	pop.get = (key) => { return values[key]; };
	pop.set = (key, value) => { values[key] = value; };
	pop.unset = (key) => { values[key] = undefined; };
	pop.has = (key) => { return #is_defined(values[key]); };
	pop.set_type = (value) => { current_type = value; };
	pop.get_type = () => { return current_type; };
	return pop;
};
const make_base = () => {
	const result = { base: {}, state: { pops: [], worked: [], unworked: [], values: {}, intake: 0, size: 1 } };
	const base = result.base;
	const state = result.state;
	state.center = make_tile(0, 0, 2, 1, 1);
	base.get_owner = () => { return { id: 7 }; };
	base.get_size = () => { return state.size; };
	base.get_tile = () => { return state.center; };
	base.get_pops = () => { return state.pops; };
	base.get_worked_tiles = () => { return state.worked; };
	base.get_unworked_tiles = () => { return state.unworked; };
	base.get = (key) => { return state.values[key]; };
	base.set = (key, value) => { state.values[key] = value; };
	base.get_intake = () => { return { NUTRIENTS: state.intake }; };
	base.get_consumption = () => { return { NUTRIENTS: state.size * 2 }; };
	base.add_worked_tile = (tile) => { state.worked :+ tile; };
	base.remove_worked_tile = (tile) => {
		let remaining = [];
		for (old of state.worked) { if (old.x != tile.x || old.y != tile.y) { remaining :+ old; } }
		state.worked = remaining;
	};
	return result;
};
const make_game = (width, height) => {
	const result = { game: {}, state: { values: {}, handlers: {}, bm_handlers: {}, events: [], bases: [] } };
	const game = result.game;
	const state = result.state;
	const bm = {};
	bm.on = (name, callback) => { state.bm_handlers[name] = callback; };
	bm.get_bases = () => { return state.bases; };
	game.get_bm = () => { return bm; };
	game.get_tm = () => { return {
		get_map_width: () => { return width; },
		get_map_height: () => { return height; },
	}; };
	game.on = (name, callback) => { state.handlers[name] = callback; };
	game.get = (key) => { return state.values[key]; };
	game.set = (key, value) => { state.values[key] = value; };
	game.event = (name, data) => {
		const event = { name: name };
		event.data = data;
		state.events :+ event;
	};
	initialize_bases(game);
	state.handlers.start({});
	state.events = []; // Definition events only register metadata; no assets load.
	return result;
};
const coordinates = (tiles) => {
	let result = [];
	for (candidate of tiles) { const tile = candidate; result :+ [tile.x, tile.y]; }
	return result;
};

// Full threshold boundaries, including a non-square map: growth is based on
// area, and the next size's cost is (population + 1) times this registered base.
for (c of [
	[1000, 1, 10], [1001, 1, 11], [1800, 1, 11], [1801, 1, 12],
	[3000, 1, 12], [3001, 1, 13], [4000, 1, 13], [4001, 1, 14],
	[5500, 1, 14], [5501, 1, 15], [80, 70, 15],
]) {
	behavior.scenario('map growth threshold ' + #to_string(c[0]) + 'x' + #to_string(c[1]), () => {
		const f = make_game(c[0], c[1]);
		test.assert(f.game.get('map_growth_base') == c[2]);
		const b = make_base();
		b.state.values.accumulated_nutrients = c[2] * 2 + 3;
		f.game.get('f_base_reset_nutrients')(f.game, b.base);
		test.assert(b.state.values.accumulated_nutrients == 3);
	});
}
const f = make_game(20, 20);
const best_or_worst = f.game.get('f_base_find_best_or_worst_tiles');
// IDs are coordinates, so two representations of a wrapped map position must
// never both be selected. Ties retain input order for both best and worst.
const selection_cases = [
	['nutrients beat one mineral', [[0, 0, 1, 0, 0], [1, 0, 0, 1, 0]], 1, 1, [[0, 0]]],
	['minerals beat one energy', [[0, 0, 0, 0, 1], [1, 0, 0, 1, 0]], 1, 1, [[1, 0]]],
	['mixed yields beat one nutrient', [[0, 0, 1, 0, 0], [1, 0, 0, 1, 2]], 1, 1, [[1, 0]]],
	['best ties retain first', [[4, 1, 1, 0, 0], [2, 1, 0, 1, 1]], 1, 1, [[4, 1]]],
	['reordered best ties retain first', [[2, 1, 0, 1, 1], [4, 1, 1, 0, 0]], 1, 1, [[2, 1]]],
	['worst ties retain first', [[4, 1, 1, 0, 0], [2, 1, 0, 1, 1]], 1, 0 - 1, [[4, 1]]],
	['descending multiple choices', [[0, 0, 0, 0, 0], [1, 0, 2, 0, 0], [2, 0, 0, 2, 0]], 3, 1, [[1, 0], [2, 0], [0, 0]]],
	['ascending multiple choices', [[0, 0, 0, 0, 0], [1, 0, 2, 0, 0], [2, 0, 0, 2, 0]], 3, 0 - 1, [[0, 0], [2, 0], [1, 0]]],
	['zero requested', [[0, 0, 1, 0, 0]], 0, 1, []],
	['empty candidates', [], 3, 1, []],
	['request beyond candidate count', [[0, 0, 1, 0, 0]], 5, 1, [[0, 0]]],
	['duplicate coordinates selected once', [[2, 1, 1, 0, 0], [2, 1, 2, 0, 0], [4, 1, 0, 1, 0]], 5, 1, [[2, 1], [4, 1]]],
	['coordinate y distinguishes tiles', [[2, 1, 1, 0, 0], [2, 3, 1, 0, 0]], 2, 1, [[2, 1], [2, 3]]],
	['all zero scores remain stable', [[6, 1, 0, 0, 0], [2, 3, 0, 0, 0], [4, 1, 0, 0, 0]], 4, 1, [[6, 1], [2, 3], [4, 1]]],
];
for (c of selection_cases) {
	behavior.scenario('worked tile selection ' + c[0], () => {
		const b = make_base();
		let tiles = [];
		for (t of c[1]) { tiles :+ make_tile(t[0], t[1], t[2], t[3], t[4]); }
		const before = coordinates(tiles);
		const chosen = best_or_worst(b.base, tiles, c[2], c[3]);
		test.assert(coordinates(chosen) == c[4]);
		test.assert(coordinates(tiles) == before);
		test.assert(#sizeof(chosen) <= c[2] && #sizeof(chosen) <= #sizeof(tiles));
	});
}
behavior.scenario('tile scoring receives the base owner', () => {
	const b = make_base();
	const state = { owners: [] };
	const tile = { x: 2, y: 0, get_resources: (owner) => {
		state.owners :+ owner.id;
		return { NUTRIENTS: 1, MINERALS: 0, ENERGY: 0 };
	} };
	test.assert(coordinates(best_or_worst(b.base, [tile], 1, 1)) == [[2, 0]]);
	test.assert(state.owners == [7]);
});
behavior.scenario('current weighted heuristic stays fixed across base nutrient needs', () => {
	const b = make_base();
	const tiles = [make_tile(2, 0, 1, 0, 0), make_tile(4, 0, 0, 1, 0)];
	// Explicit limitation: production does not yet adapt weights to shortages.
	for (intake of [0, 2, 20]) {
		b.state.intake = intake;
		test.assert(coordinates(best_or_worst(b.base, tiles, 1, 1)) == [[2, 0]]);
	}
});

const make_neighborhood = () => {
	let tiles = [];
	for (let i = 0; i <= 20; i++) {
		const tile = make_tile(i, 0, 0, 0, 0);
		for (direction of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
			tile['get_' + direction] = () => { return tile; };
		}
		tiles :+ tile;
	}
	tiles[0].get_N = () => { return tiles[1]; };
	tiles[0].get_NE = () => { return tiles[2]; };
	tiles[0].get_E = () => { return tiles[3]; };
	tiles[0].get_SE = () => { return tiles[4]; };
	tiles[0].get_S = () => { return tiles[5]; };
	tiles[0].get_SW = () => { return tiles[6]; };
	tiles[0].get_W = () => { return tiles[7]; };
	tiles[0].get_NW = () => { return tiles[8]; };
	tiles[1].get_NW = () => { return tiles[9]; };
	tiles[1].get_NE = () => { return tiles[10]; };
	tiles[2].get_NE = () => { return tiles[11]; };
	tiles[3].get_NE = () => { return tiles[12]; };
	tiles[3].get_SE = () => { return tiles[13]; };
	tiles[4].get_SE = () => { return tiles[14]; };
	tiles[5].get_SE = () => { return tiles[15]; };
	tiles[5].get_SW = () => { return tiles[16]; };
	tiles[6].get_SW = () => { return tiles[17]; };
	tiles[7].get_SW = () => { return tiles[18]; };
	tiles[7].get_NW = () => { return tiles[19]; };
	tiles[8].get_NW = () => { return tiles[20]; };
	return tiles;
};
behavior.scenario('workable radius visits twenty surrounding positions in stable order', () => {
	const b = make_base();
	const tiles = make_neighborhood();
	b.state.center = tiles[0];
	const e = {}; e.base = b.base;
	const result = f.state.bm_handlers.get_base_workable_tiles(e);
	let expected = [];
	for (let i = 1; i <= 20; i++) { expected :+ [i, 0]; }
	test.assert(coordinates(result) == expected);
});
behavior.scenario('workable radius removes wrapped duplicates and the center', () => {
	const b = make_base();
	const tiles = make_neighborhood();
	b.state.center = tiles[0];
	// Several compass paths reach the center or repeated coordinate positions.
	tiles[0].get_S = () => { return tiles[0]; };
	tiles[0].get_SW = () => { return tiles[1]; };
	tiles[8].x = 2;
	tiles[10].x = 9;
	const e = {}; e.base = b.base;
	const result = f.state.bm_handlers.get_base_workable_tiles(e);
	test.assert(coordinates(result) == [[1, 0], [2, 0], [3, 0], [4, 0], [7, 0], [9, 0], [11, 0], [12, 0], [13, 0], [14, 0], [18, 0], [19, 0], [20, 0]]);
});

for (c of [
	['first population is automatic', 0, undefined, 0, 0, true],
	['first population stores surplus', 0, undefined, 3, 3, true],
	['missing storage starts at zero', 1, undefined, 4, 2, false],
	['zero surplus keeps storage', 1, 4, 2, 4, false],
	['positive surplus accumulates', 2, 5, 7, 8, false],
	['deficit consumes storage', 2, 5, 1, 2, false],
	['exact zero storage avoids starvation', 2, 3, 1, 0, false],
	['one below threshold waits', 1, 18, 3, 19, false],
	['exact threshold grows', 1, 19, 3, 20, true],
	['over threshold grows once', 1, 80, 4, 82, true],
	['next population raises threshold', 2, 25, 4, 25, false],
]) {
	behavior.scenario('base turn ' + c[0], () => {
		const world = make_game(20, 20);
		const b = make_base();
		b.state.size = c[1]; b.state.intake = c[3];
		if (#is_defined(c[2])) { b.state.values.accumulated_nutrients = c[2]; }
		b.state.unworked = [make_tile(2, 0, 0, 1, 0), make_tile(4, 0, 1, 0, 0)];
		world.state.bases = [b.base];
		world.state.handlers.turn({});
		test.assert(b.state.values.accumulated_nutrients == c[4]);
		test.assert(#sizeof(world.state.events) == (c[5] ? 1 : 0));
		if (c[5]) {
			const event = world.state.events[0];
			test.assert(event.name == 'add_base_pop' && event.data.type == 'WORKER');
			test.assert(event.data.worked_tile.x == 4 && event.data.worked_tile.y == 0);
		}
	});
}
behavior.scenario('growth decision waits through turns and preserves overflow after population creation boundary', () => {
	const world = make_game(20, 20);
	const b = make_base();
	b.state.intake = 5; b.state.values.accumulated_nutrients = 12;
	b.state.unworked = [make_tile(2, 0, 1, 0, 0)]; world.state.bases = [b.base];
	world.state.handlers.turn({}); test.assert(b.state.values.accumulated_nutrients == 15 && world.state.events == []);
	world.state.handlers.turn({}); test.assert(b.state.values.accumulated_nutrients == 18 && world.state.events == []);
	world.state.handlers.turn({}); test.assert(b.state.values.accumulated_nutrients == 21 && #sizeof(world.state.events) == 1);
	// Complete only the manager boundary, using the production nutrient helper.
	world.game.get('f_base_reset_nutrients')(world.game, b.base);
	b.state.size = 2; world.state.events = [];
	world.state.handlers.turn({});
	test.assert(b.state.values.accumulated_nutrients == 2 && world.state.events == []);
});

for (specialists of [true, false]) {
	behavior.scenario('starvation chooses ' + (specialists ? 'first specialist before worker' : 'lowest scoring worked tile'), () => {
		const world = make_game(20, 20);
		const b = make_base();
		const best = make_tile(2, 0, 3, 0, 0);
		const worst = make_tile(4, 0, 0, 0, 1);
		const worker_best = make_pop(1, 'WORKER');
		const worker_worst = make_pop(2, 'WORKER');
		const doctor = make_pop(3, 'DOCTOR');
		const doctor_later = make_pop(4, 'DOCTOR');
		worker_best.set('worked_tile', best); best.set('working_pop', worker_best);
		worker_worst.set('worked_tile', worst); worst.set('working_pop', worker_worst);
		b.state.worked = [best, worst];
		b.state.pops = specialists ? [worker_best, doctor, doctor_later, worker_worst] : [worker_best, worker_worst];
		b.state.size = #sizeof(b.state.pops); b.state.intake = 0; b.state.values.accumulated_nutrients = 1;
		world.state.bases = [b.base]; world.state.handlers.turn({});
		test.assert(#sizeof(world.state.events) == 1 && world.state.events[0].name == 'remove_base_pop');
		test.assert(world.state.events[0].data.pop.id == (specialists ? 3 : 2));
		// Starvation defers nutrient reset and population mutation to its event.
		test.assert(b.state.values.accumulated_nutrients == 1);
		test.assert(#sizeof(b.state.pops) == (specialists ? 4 : 2));
	});
}
behavior.scenario('starvation tie keeps first worked tile', () => {
	const world = make_game(20, 20);
	const b = make_base();
	const first = make_tile(4, 0, 1, 0, 0);
	const second = make_tile(2, 0, 0, 1, 1);
	const p1 = make_pop(1, 'WORKER'); const p2 = make_pop(2, 'WORKER');
	p1.set('worked_tile', first); first.set('working_pop', p1);
	p2.set('worked_tile', second); second.set('working_pop', p2);
	b.state.pops = [p2, p1]; b.state.worked = [first, second]; b.state.size = 2;
	world.state.bases = [b.base]; world.state.handlers.turn({});
	test.assert(world.state.events[0].data.pop.id == 1);
});

behavior.scenario('intake sums center and all worked tiles while consumption scales with population', () => {
	const b = make_base();
	b.state.worked = [make_tile(2, 0, 3, 0, 2), make_tile(4, 0, 0, 2, 1)];
	const e = {}; e.base = b.base;
	test.assert(f.state.bm_handlers.get_base_intake(e) == { NUTRIENTS: 5, MINERALS: 3, ENERGY: 4 });
	for (size of [0, 1, 2, 20]) {
		b.state.size = size;
		test.assert(f.state.bm_handlers.get_base_consumption(e) == { NUTRIENTS: size * 2, MINERALS: 0, ENERGY: 0 });
	}
});
behavior.scenario('work reassignment removes old links and unwork converts worker to doctor', () => {
	const b = make_base();
	const pop = make_pop(1, 'DOCTOR');
	const first = make_tile(2, 0, 1, 0, 0); const second = make_tile(4, 0, 2, 0, 0);
	const work = f.game.get('f_base_pop_work_tile'); const unwork = f.game.get('f_base_pop_unwork_tile');
	work(b.base, pop, first);
	test.assert(pop.get_type() == 'WORKER' && coordinates(b.state.worked) == [[2, 0]]);
	test.assert(pop.get('worked_tile').x == 2 && first.get('working_pop').id == 1);
	work(b.base, pop, second);
	test.assert(!#is_defined(first.get('working_pop')) && second.get('working_pop').id == 1);
	test.assert(coordinates(b.state.worked) == [[4, 0]] && pop.get('worked_tile').x == 4);
	// Reassigning the same tile remains a single worked-tile entry.
	work(b.base, pop, second); test.assert(coordinates(b.state.worked) == [[4, 0]]);
	unwork(b.base, pop, 'DOCTOR');
	test.assert(pop.get_type() == 'DOCTOR' && !pop.has('worked_tile') && b.state.worked == []);
	test.assert(!#is_defined(second.get('working_pop')));
	unwork(b.base, pop, 'WORKER'); test.assert(pop.get_type() == 'DOCTOR' && b.state.worked == []);
});
behavior.scenario('nutrient reset handles missing, insufficient and surplus storage', () => {
	for (stored of [undefined, 0, 19, 20, 25]) {
		const b = make_base();
		if (#is_defined(stored)) { b.state.values.accumulated_nutrients = stored; }
		f.game.get('f_base_reset_nutrients')(f.game, b.base);
		test.assert(b.state.values.accumulated_nutrients == (stored == 25 ? 5 : 0));
	}
});
behavior.scenario('each base advances independently in one turn', () => {
	const world = make_game(20, 20);
	const a = make_base(); const b = make_base();
	a.state.values.accumulated_nutrients = 18; a.state.intake = 3;
	b.state.values.accumulated_nutrients = 1; b.state.intake = 5;
	world.state.bases = [a.base, b.base]; world.state.handlers.turn({});
	test.assert(a.state.values.accumulated_nutrients == 19 && b.state.values.accumulated_nutrients == 4);
	test.assert(world.state.events == []);
});
