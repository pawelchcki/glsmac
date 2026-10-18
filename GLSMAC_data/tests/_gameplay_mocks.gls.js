// Small stateful boundaries around production event scripts. No engine, assets,
// rendering, original-game rules, or random implementation is simulated here.
const make_tile = (x, y) => {
	const tile = {
		x: x, y: y, is_land: true, is_water: false, rockiness: 0,
		features: { river: false, xenofungus: false },
		locked: false, adjacent: true, units: [],
	};
	tile.is_locked = () => { return tile.locked; };
	tile.is_adjactent_to = (other) => { return tile.adjacent; };
	tile.get_units = () => { return tile.units; };
	return tile;
};

const make_unit = (tile) => {
	const unit = {
		owner: 1, movement: 1.0, moved_this_turn: false,
		is_immovable: false, is_land: true, is_water: false,
		morale: 6, health: 1.0, definition: { id: 'MindWorm' },
		moves: [], delayed: false, pending: null,
	};
	unit.tile = tile;
	unit.get_tile = () => { return unit.tile; };
	unit.get_def = () => { return unit.definition; };
	unit.move_to_tile = (destination, next) => {
		unit.moves :+ [destination.x, destination.y];
		if (unit.delayed) {
			unit.pending = () => { unit.tile = destination; next(); };
		} else {
			unit.tile = destination;
			next();
		}
	};
	return unit;
};

const make_random = (values) => {
	const state = { index: 0, draws: [] };
	state.values = values;
	const random = {};
	random.get_float = (low, high) => {
		test.assert(state.index < #sizeof(state.values));
		const value = state.values[state.index];
		test.assert(value >= low && value <= high);
		state.index = state.index + 1;
		state.draws :+ [low, high];
		return value;
	};
	random.state = state;
	return random;
};

const make_event = (draws) => {
	const source = make_tile(0, 0);
	const destination = make_tile(2, 0);
	const unit = make_unit(source);
	const defender = make_unit(destination);
	defender.owner = 2;
	const event = { caller: 1, data: {}, game: {}, resolved: {}, applied: {} };
	event.data.unit = unit;
	event.data.attacker = unit;
	event.data.defender = defender;
	event.data.tile = destination;
	event.game.random = make_random(draws);
	return event;
};

return { tile: make_tile, unit: make_unit, random: make_random, event: make_event };
