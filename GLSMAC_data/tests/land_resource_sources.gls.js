// Native source parsing and faction ownership integration. Original arithmetic
// agreement is checked separately against 576 immutable land-worker queries.
const behavior = #include('./_behavior');
const fixture = #include('./_land_resource_rules_fixture');
const consumer = #include('../default/game/land_resource_rules');
const resources = #include('../default/resources');
const mocks = #include('./_mocks');
const source = () => {
	const parsed = fixture('default'); const tables = {};
	for (block of ['RESOURCEINFO', 'RULES']) { tables[block] = parsed.rows(block); }
	const result = {}; result.tables = tables;
	result.document = {rows: (block) => { return tables[block]; }};
	return result;
};
const set = (input, block, row, column, value) => { const rows = input.tables[block]; const fields = rows[row]; fields[column] = value; };
const worker = () => {
	return {is_land: true, rockiness: 1, moisture: 3,
		features: {xenofungus: false, jungle: false, river: false},
		bonuses: {nutrient: false, minerals: false, energy: false},
		terraforming: {farm: true, mine: false, forest: false, road: false},
		get_base: () => { return null; }};
};
const configure = (rules) => {
	const capture = mocks.capture_tm_handler('get_tile_resources'); resources.configure(capture.game, rules);
	return capture.get();
};

behavior.scenario('installed resource rows transfer forest farm mine and three independent cap prerequisites', () => {
	const standard = consumer.parse(fixture('default')); const altered = consumer.parse(fixture('altered'));
	test.assert(standard.forest == {NUTRIENTS: 1, MINERALS: 2, ENERGY: 1} && standard.farm_nutrients == 1);
	test.assert(standard.mine_without_road_limit == 1 && standard.mine_nutrients == (0 - 1));
	test.assert(altered.forest == {NUTRIENTS: 2, MINERALS: 3, ENERGY: 2} && altered.farm_nutrients == 2);
	test.assert(altered.mine_without_road_limit == 0 && altered.mine_nutrients == 0);
	const input = source(); set(input, 'RULES', 53, 0, 'FoodCap'); set(input, 'RULES', 54, 0, 'MineralCap'); set(input, 'RULES', 55, 0, 'EnergyCap');
	test.assert(consumer.parse(input.document).caps == {NUTRIENTS: 'FoodCap', MINERALS: 'MineralCap', ENERGY: 'EnergyCap'});
});

behavior.scenario('actual native faction ownership unlocks the source prerequisite and subsequent queries see changes', () => {
	const f = test.production_fixture(); const handler = configure(consumer.parse(fixture('altered')));
	const event = {}; event.player = f.owner; event.tile = worker();
	f.apply_faction_starting_technologies([]); const limited = handler(event);
	test.assert(limited.NUTRIENTS == 2);
	f.apply_faction_starting_technologies(['SyntheticCap']);
	test.assert(handler(event).NUTRIENTS == 4);
	f.apply_faction_starting_technologies(['Unrelated']);
	test.assert(handler(event).NUTRIENTS == 2 && limited.NUTRIENTS == 2);
});

behavior.scenario('food and mineral cap technologies do not grant one another on actual native factions', () => {
	const input = source(); set(input, 'RULES', 53, 0, 'FoodCap'); set(input, 'RULES', 54, 0, 'MineralCap');
	const handler = configure(consumer.parse(input.document)); const f = test.production_fixture();
	const event = {}; event.player = f.owner; event.tile = worker();
	f.apply_faction_starting_technologies(['MineralCap']); test.assert(handler(event).NUTRIENTS == 2);
	f.apply_faction_starting_technologies(['FoodCap']); test.assert(handler(event).NUTRIENTS == 3);
	event.tile.rockiness = 3; event.tile.terraforming = {mine: true, road: true};
	test.assert(handler(event).MINERALS == 2);
	f.apply_faction_starting_technologies(['MineralCap']); test.assert(handler(event).MINERALS == 4);
});

behavior.scenario('source cap prerequisites None and Disable retain their prerequisite semantics', () => {
	const f = test.production_fixture(); const event = {}; event.player = f.owner; event.tile = worker();
	const input = source(); set(input, 'RULES', 53, 0, 'None');
	test.assert(configure(consumer.parse(input.document))(event).NUTRIENTS == 3);
	set(input, 'RULES', 53, 0, 'Disable');
	test.assert(configure(consumer.parse(input.document))(event).NUTRIENTS == 2);
});

behavior.scenario('configured source coefficients and returned yields have independent ownership', () => {
	const f = test.production_fixture(); f.apply_faction_starting_technologies(['SyntheticCap']);
	const rules = consumer.parse(fixture('default')); const handler = configure(rules);
	rules.farm_nutrients = 9;
	const event = {}; event.player = f.owner; event.tile = worker();
	const first = handler(event); first.NUTRIENTS = 99;
	test.assert(handler(event).NUTRIENTS == 3, 'Later external edits cannot replace the configured resource rules');
});

let index = 0;
for (change of [
	['RESOURCEINFO', 3, 1, '1.0'], ['RESOURCEINFO', 3, 2, ''], ['RESOURCEINFO', 3, 3, '-1'],
	['RESOURCEINFO', 5, 1, '01'], ['RULES', 8, 0, '2'], ['RULES', 9, 0, '1'], ['RULES', 53, 0, ''],
]) {
	behavior.scenario('invalid installed land resource input fails before registering a yield callback ' + #to_string(index), () => {
		const input = source(); set(input, change[0], change[1], change[2], change[3]);
		let registered = false; let rejected = false;
		const game = {get_tm: () => { return {on: (name, callback) => { registered = true; }}; }};
		try { resources.configure(game, consumer.parse(input.document)); } catch { : (e) => { rejected = true; } }
		test.assert(rejected && !registered);
	}); index++;
}
