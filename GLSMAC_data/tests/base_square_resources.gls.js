// GLSMAC resource-handler regressions. Original agreement is established only
// by the separate 504-case bounded economy comparison, not these state probes.
const behavior = #include('./_behavior');
const mocks = #include('./_mocks');
const resources = #include('../default/resources');
const capture = mocks.capture_tm_handler('get_tile_resources');
resources.configure(capture.game);
const handler = capture.get();

const fixture = () => {
	const state = { is_base: true, tanks: false, headquarters: false, facility_queries: 0 };
	const base = {
		has_facility: (id) => {
			state.facility_queries = state.facility_queries + 1;
			if (id == 'HEADQUARTERS') { return state.headquarters; }
			if (id == 'RECYCLING_TANKS') { return state.tanks; }
			return false;
		},
	};
	const event = {
		player: { id: 1 },
		tile: {
			is_land: true, rockiness: 1, moisture: 1,
			features: { xenofungus: false, jungle: false, river: false },
			bonuses: { nutrient: false, minerals: false, energy: false },
			get_base: () => { return state.is_base ? base : null; },
		},
	};
	const result = {};
	result.state = state;
	result.event = event;
	result.query = () => { return handler(event); };
	return result;
};

const assert_resources = (result, nutrients, minerals, energy) => {
	test.assert(result.NUTRIENTS == nutrients);
	test.assert(result.MINERALS == minerals);
	test.assert(result.ENERGY == energy);
};

behavior.scenario('ordinary worker tile never receives base facility bonuses', () => {
	const f = fixture();
	f.state.is_base = false;
	f.state.tanks = true;
	f.state.headquarters = true;
	f.event.tile.features.river = true;
	assert_resources(f.query(), 0, 0, 1);
	test.assert(f.state.facility_queries == 0);
});

behavior.scenario('repeated base resource queries return stable fresh values', () => {
	const f = fixture();
	f.state.tanks = true;
	const first = f.query();
	assert_resources(first, 3, 2, 2);
	assert_resources(f.query(), 3, 2, 2);
	first.NUTRIENTS = 99;
	first.MINERALS = 99;
	first.ENERGY = 99;
	assert_resources(f.query(), 3, 2, 2);
});

behavior.scenario('removing Recycling Tanks restores baseline without changing previous output', () => {
	const f = fixture();
	f.state.tanks = true;
	const with_tanks = f.query();
	assert_resources(with_tanks, 3, 2, 2);
	f.state.tanks = false;
	assert_resources(f.query(), 2, 1, 1);
	assert_resources(with_tanks, 3, 2, 2);
});

behavior.scenario('Headquarters Recycling Tanks and river energy stack independently', () => {
	const f = fixture();
	f.state.tanks = true;
	f.state.headquarters = true;
	f.event.tile.features.river = true;
	assert_resources(f.query(), 3, 2, 4);
	f.state.headquarters = false;
	assert_resources(f.query(), 3, 2, 3);
	f.state.tanks = false;
	assert_resources(f.query(), 2, 1, 2);
});
