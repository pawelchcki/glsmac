// GLSMAC startup invariants, not original-game parity. The production world
// chooses placements and emits events; only map/player/event/RNG boundaries are
// controlled. Distances below are synthetic tile steps, not a map rule contract.
const behavior = #include('./_behavior');
const start_world = #include('../default/game/world/default');
const starting_units = [
	{id: 'ColonyPod', choice: 'COLONY_POD', prerequisite: 'None', rows: 3, population: 1},
	{id: 'Formers', choice: 'FORMERS', prerequisite: 'Ecology', rows: 2, population: 0},
	{id: 'ScoutPatrol', choice: 'SCOUT_PATROL', prerequisite: 'None', rows: 1, population: 0},
];

const make_fixture = (width, height, naval_players, tiles, draws, fallback) => {
	const f = { game: {}, state: { draws: 0, ranges_valid: true, lookups: [], distances: [], events: [] } };
	const state = f.state;
	const players = [];
	let id = 0;
	for (is_naval of naval_players) {
		const faction = { is_naval: is_naval, starting_technologies: [], economy_bonuses:{starting_energy:0,terraform_cost_halved:false} };
		const player = { id: id, is_master: false, validate_initial_energy:(amount) => { test.assert(amount == 0); } };
		player.get_faction = () => { return faction; };
		players :+ player;
		id++;
	}
	f.game.get_players = () => { return players; };
	f.game.get = (key) => {
		if (key == 'energy_rules') { return {starting_credits:0}; }
		test.assert(key == 'starting_unit_rules'); return starting_units;
	};
	// This placement-only boundary declares respect-tech mode, not a native
	// policy proof. Actual native default/transfer checks live in terrain tests.
	f.game.get_settings = () => { return {global:{rules:{get_terraforming_policy:() => { return {version:1,ignore_technologies:false}; }}}}; };
	const tm = {
		get_map_width: () => { return width; },
		get_map_height: () => { return height; },
	};
	tm.get_tile = (x, y) => {
		state.lookups :+ [x, y];
		for (tile of tiles) { if (tile.x == x && tile.y == y) { return tile; } }
		throw FixtureError('Unexpected tile lookup');
	};
	tm.get_distance = (a, b) => {
		state.distances :+ [a.x, a.y, b.x, b.y];
		let dx = a.x - b.x;
		let dy = a.y - b.y;
		if (dx < 0) { dx = 0 - dx; }
		if (dy < 0) { dy = 0 - dy; }
		return (dx + dy) / 2;
	};
	f.game.get_tm = () => { return tm; };
	f.game.random = { get_int: (low, high) => {
		// An overrun throws instead of hanging a worker when retries fail to
		// advance. This error must never be mistaken for startup exhaustion.
		if (state.draws >= 4002) { throw RandomBudgetExceeded('Unbounded startup retry'); }
		let value = fallback[state.draws % 2];
		if (state.draws < #sizeof(draws)) { value = draws[state.draws]; }
		const expected_high = state.draws % 2 == 0 ? width - 1 : height - 1;
		if (low != 0 || high != expected_high || value < low || value > high) { state.ranges_valid = false; }
		state.draws = state.draws + 1;
		return value;
	} };
	f.game.event = (name, data) => {
		const event = { name: name };
		event.data = data;
		state.events :+ event;
	};
	return f;
};

const expect_exhaustion = (f) => {
	let caught = '';
	let message = '';
	try { start_world(f.game); }
	catch { : (e) => { caught = e.type; message = e.reason; } }
	test.assert(caught == 'Error', 'startup must stop with its placement error, got ' + caught);
	test.assert(message == 'Failed to find good tile for base (try again, or try larger map or fewer players)');
	test.assert(f.state.ranges_valid, 'coordinate RNG bounds match the map');
	test.assert(f.state.events == [], 'failed placement must not leave production choices, bases or units');
};

const assert_player_events = (events, offset, owner, x, y, type) => {
	test.assert(events[offset].name == 'initialize_energy' && events[offset].data == {player_id:owner,credits:0});
	offset = offset + 1;
	test.assert(events[offset].name == 'add_production_choice' && events[offset].data.player.id == owner);
	test.assert(events[offset].data.id == 'RECYCLING_TANKS');
	test.assert(events[offset].data.data == { type: 'facility', id: 'RECYCLING_TANKS' });
	test.assert(events[offset + 1].name == 'add_production_choice' && events[offset + 1].data.player.id == owner);
	test.assert(events[offset + 1].data.id == 'STOCKPILE_ENERGY');
	test.assert(events[offset + 1].data.data.type == 'custom' && events[offset + 1].data.data.hint == 'Minerals to Energy');
	let next = offset + 2;
	if (type == 'ScoutPatrol') {
		const recipe = events[next];
		test.assert(recipe.name == 'add_production_choice' && recipe.data.player.id == owner);
		test.assert(recipe.data.id == 'COLONY_POD');
		test.assert(recipe.data.data == { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 });
		const scout = events[next + 1];
		test.assert(scout.name == 'add_production_choice' && scout.data.id == 'SCOUT_PATROL');
		test.assert(scout.data.data == {type: 'unit', id: 'ScoutPatrol', cost: 10, cost_rows: 1, population_cost: 0});
		next = next + 2;
	}
	const base = events[next];
	test.assert(base.name == 'spawn_base' && base.data.owner.id == owner);
	test.assert(base.data.tile.x == x && base.data.tile.y == y && base.data.facilities == ['HEADQUARTERS']);
	const unit = events[next + 1];
	test.assert(unit.name == 'spawn_unit' && unit.data.owner.id == owner && unit.data.type == type);
	test.assert(unit.data.tile.x == x && unit.data.tile.y == y);
	test.assert(unit.data.health == 1.0 && unit.data.morale == 1);
	if (type == 'ScoutPatrol') { test.assert(base.data.production_choice == 'COLONY_POD'); }
};

behavior.scenario('invalid coordinate parity exhausts the bounded attempt budget', () => {
	const f = make_fixture(4, 4, [false], [], [], [0, 1]);
	expect_exhaustion(f);
	test.assert(f.state.draws == 2000, '1000 attempts consume exactly two coordinates each');
	test.assert(f.state.lookups == [], 'invalid coordinates never reach the map');
});

behavior.scenario('land startup skips water and invalid parity before emitting the starting loadout', () => {
	const f = make_fixture(4, 4, [false], [
		{ x: 0, y: 0, is_water: true }, { x: 2, y: 0, is_water: false },
	], [0, 0, 0, 1, 2, 0], [0, 1]);
	start_world(f.game);
	test.assert(f.state.draws == 6 && f.state.ranges_valid);
	test.assert(f.state.lookups == [[0, 0], [2, 0]] && f.state.distances == []);
	test.assert(#sizeof(f.state.events) == 7);
	assert_player_events(f.state.events, 0, 0, 2, 0, 'ScoutPatrol');
});

behavior.scenario('naval startup skips land and accepts an odd coordinate water tile', () => {
	const f = make_fixture(4, 4, [true], [
		{ x: 0, y: 0, is_water: false }, { x: 3, y: 3, is_water: true },
	], [0, 0, 3, 3], [0, 1]);
	start_world(f.game);
	test.assert(f.state.draws == 4 && f.state.ranges_valid);
	test.assert(f.state.lookups == [[0, 0], [3, 3]]);
	test.assert(#sizeof(f.state.events) == 5);
	assert_player_events(f.state.events, 0, 0, 3, 3, 'SeaLurk');
});

behavior.scenario('mixed land and naval players receive ordered loadouts on their selected terrain', () => {
	const f = make_fixture(8, 2, [false, true], [
		{ x: 0, y: 0, is_water: false }, { x: 4, y: 0, is_water: true },
	], [0, 0, 4, 0], [0, 1]);
	start_world(f.game);
	test.assert(f.state.draws == 4 && f.state.ranges_valid);
	test.assert(#sizeof(f.state.events) == 12 && f.state.distances == [[4, 0, 0, 0]]);
	assert_player_events(f.state.events, 0, 0, 0, 0, 'ScoutPatrol');
	assert_player_events(f.state.events, 7, 1, 4, 0, 'SeaLurk');
});

behavior.scenario('the final permitted coordinate pair can still place a base', () => {
	const draws = [];
	let i = 0;
	while (i < 999) { draws :+ 0; draws :+ 1; i++; }
	draws :+ 2; draws :+ 0;
	const f = make_fixture(4, 4, [false], [{ x: 2, y: 0, is_water: false }], draws, [0, 1]);
	start_world(f.game);
	test.assert(f.state.draws == 2000 && f.state.lookups == [[2, 0]]);
	test.assert(f.state.ranges_valid && #sizeof(f.state.events) == 7);
});

behavior.scenario('terrain mismatch also consumes the full finite placement budget', () => {
	const f = make_fixture(4, 4, [false], [{ x: 0, y: 0, is_water: true }], [], [0, 0]);
	expect_exhaustion(f);
	test.assert(f.state.draws == 2000 && #sizeof(f.state.lookups) == 1000);
	test.assert(f.state.distances == []);
});

behavior.scenario('each candidate is checked against all previously selected bases', () => {
	const f = make_fixture(12, 2, [false, false, false], [
		{ x: 0, y: 0, is_water: false }, { x: 8, y: 0, is_water: false },
		{ x: 10, y: 0, is_water: false }, { x: 4, y: 0, is_water: false },
	], [0, 0, 8, 0, 10, 0, 4, 0], [0, 1]);
	start_world(f.game);
	test.assert(f.state.draws == 8 && f.state.ranges_valid);
	test.assert(f.state.distances == [[8, 0, 0, 0], [10, 0, 0, 0], [10, 0, 8, 0], [4, 0, 0, 0], [4, 0, 8, 0]]);
	test.assert(#sizeof(f.state.events) == 21);
	assert_player_events(f.state.events, 0, 0, 0, 0, 'ScoutPatrol');
	assert_player_events(f.state.events, 7, 1, 8, 0, 'ScoutPatrol');
	assert_player_events(f.state.events, 14, 2, 4, 0, 'ScoutPatrol');
});

behavior.scenario('crowded maps relax spacing until a legal two-step candidate is accepted', () => {
	const f = make_fixture(12, 2, [false, false], [
		{ x: 0, y: 0, is_water: false }, { x: 4, y: 0, is_water: false },
	], [0, 0], [4, 0]);
	start_world(f.game);
	test.assert(f.state.draws == 1006 && f.state.ranges_valid, 'spacing relaxes after the configured retries');
	test.assert(#sizeof(f.state.distances) == 502 && #sizeof(f.state.events) == 14);
	assert_player_events(f.state.events, 7, 1, 4, 0, 'ScoutPatrol');
});

for (x of [0, 2]) {
	behavior.scenario('spacing never permits overlapping or adjacent bases at x=' + #to_string(x), () => {
		const f = make_fixture(12, 2, [false, false], [
			{ x: 0, y: 0, is_water: false }, { x: 2, y: 0, is_water: false },
		], [0, 0], [x, 0]);
		expect_exhaustion(f);
		test.assert(f.state.draws == 2002 && #sizeof(f.state.distances) == 1000);
	});
}

behavior.scenario('a later naval placement failure leaves no partially initialized land player', () => {
	const f = make_fixture(8, 2, [false, true], [{ x: 0, y: 0, is_water: false }], [], [0, 0]);
	expect_exhaustion(f);
	test.assert(f.state.draws == 2002 && #sizeof(f.state.lookups) == 1001);
	test.assert(f.state.distances == [], 'wrong terrain is rejected before spacing checks');
});

behavior.scenario('an Ecology start registers and queues a Former while emitting only one Scout', () => {
	const f = make_fixture(4, 4, [false], [{x: 0, y: 0, is_water: false}], [], [0, 0]);
	const players = f.game.get_players(); const faction = players[0].get_faction();
	faction.starting_technologies = ['Ecology'];
	start_world(f.game);
	const events = f.state.events;
	test.assert(#sizeof(events) == 8);
	test.assert(events[4].name == 'add_production_choice' && events[4].data.id == 'FORMERS');
	test.assert(events[6].name == 'spawn_base' && events[6].data.production_choice == 'FORMERS');
	test.assert(events[7].name == 'spawn_unit' && events[7].data.type == 'ScoutPatrol');
});
