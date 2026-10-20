const mocks = #include('./_mocks');
const resources = #include('../default/resources');
const rules = #include('../default/game/land_resource_rules');
const fixture = #include('./_land_resource_rules_fixture');
for (input of headless_inputs) {
	const capture = mocks.capture_tm_handler('get_tile_resources');
	resources.configure(capture.game, rules.parse(fixture(input.profile)));
	const handler = capture.get();
	const improvements = input.improvement;
	const tile = {x: input.x, y: input.y, is_land: true, is_water: false,
		moisture: input.rainfall + 1, rockiness: input.rockiness + 1, elevation: 10,
		features: {xenofungus: false, jungle: false, river: false},
		bonuses: {nutrient: false, minerals: false, energy: false},
		terraforming: {
			farm: improvements == 'farm' || improvements == 'farm-mine' || improvements == 'farm-mine-road',
			mine: improvements == 'mine' || improvements == 'mine-road' || improvements == 'farm-mine' || improvements == 'farm-mine-road',
			road: improvements == 'mine-road' || improvements == 'farm-mine-road' || improvements == 'forest-road',
			forest: improvements == 'forest' || improvements == 'forest-road',
		}, get_base: () => { return null; }};
	const technologies = input.cap_tech_owned ? ['SyntheticCap'] : [];
	const player = {id: input.faction_id, get_faction: () => { return {starting_technologies: technologies}; }};
	const event = {}; event.player = player; event.tile = tile;
	const result = handler(event);
	test.assert(#typeof(result.NUTRIENTS) == 'Int');
	test.assert(#typeof(result.MINERALS) == 'Int');
	test.assert(#typeof(result.ENERGY) == 'Int');
	#print('HECO_RESULT|' + input.id + '|' + #to_string(result.NUTRIENTS) + '|' + #to_string(result.MINERALS) + '|' + #to_string(result.ENERGY));
}
#print('HECO_DONE|' + #to_string(#sizeof(headless_inputs)));
