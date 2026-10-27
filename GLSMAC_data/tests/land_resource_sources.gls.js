// Native source parsing and faction ownership integration. Original arithmetic
// agreement is checked separately against 576 immutable land-worker queries.
const behavior = #include('./_behavior');
const fixture = #include('./_land_resource_rules_fixture');
const consumer = #include('../default/game/land_resource_rules');
const resources = #include('../default/resources');
const configure_bases = #include('../default/game/bases');
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

// Foreign city intake must use its own native faction's technologies. Both
// players, terrain, worker links and resource callbacks are production objects;
// the forest yields and prerequisite token are declared synthetic source data.
for (owner_has_cap of [true, false]) {
	behavior.scenario('foreign native city income follows owner caps ' + #to_string(owner_has_cap), () => {
		const f = test.founding_fixture(); f.enable_economy(); f.configure('network_forest');
		f.apply_faction_starting_technologies(owner_has_cap ? ['SyntheticCap'] : []);
		const color = f.owner.get_faction().text_color;
		f.game.get_fm().add('LOCAL', {name: 'Local faction',
			starting_technologies: owner_has_cap ? [] : ['SyntheticCap'],
			colors: {text: color, text_shadow: color, border: color},
			bases: {render: {type: 'sprite_grid', file: 'synthetic.pcx', grid_x: 0, grid_y: 0,
				cell_width: 1, cell_height: 1, cell_padding: 0}, names: {land: [], water: []}}});
		// Faction selection is a setup operation; only the fixture lifecycle is
		// paused here so the real native setter can choose a distinct local faction.
		f.configure('inactive');
		f.with_write(() => { f.game.get_player().set_faction_by_id('LOCAL'); });
		test.assert(f.game.get_player().id != f.base.get_owner().id);
		test.assert(f.game.get_player().get_faction().id != f.base.get_owner().get_faction().id);
		const input = source();
		set(input, 'RESOURCEINFO', 3, 1, '5'); set(input, 'RESOURCEINFO', 3, 2, '4'); set(input, 'RESOURCEINFO', 3, 3, '3');
		resources.configure(f.game, consumer.parse(input.document));
		// The native fixture already owns its pop/facility definitions. Supply
		// only definition delivery and the unused start subscription boundary.
		configure_bases({get_bm: () => { return f.game.bm; }, on: (name, callback) => {}, event: (name, data) => {
			if (name != 'define_base_pop' && name != 'define_base_facility') { throw Error('Unexpected fixture definition event'); }
		}});
		f.add_worker(1); const tile = f.tile_at(2, 0); const pops = f.base.get_pops(); const pop = pops[0];
		f.with_write(() => { pop.set('worked_tile', tile); tile.set('working_pop', pop); f.base.add_worked_tile(tile); });
		const own_yield = tile.get_resources(f.base.get_owner());
		const local_yield = tile.get_resources();
		test.assert(own_yield != local_yield, 'Native resource caps distinguish the two real faction owners');
		const center = f.base.get_tile().get_resources(f.base.get_owner());
		const before = f.snapshot(); const terrain = f.terrain_snapshot();
		const intake = f.base.get_intake();
		test.assert(intake == {NUTRIENTS: center.NUTRIENTS + own_yield.NUTRIENTS,
			MINERALS: center.MINERALS + own_yield.MINERALS, ENERGY: center.ENERGY + own_yield.ENERGY},
			'City income must use its owner rather than the local observer');
		test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain, 'Reading foreign income preserves native state');
		test.assert(tile.get('working_pop') == pop && pop.get('worked_tile') == tile && f.base.get_worked_tiles() == [tile]);
	});
}

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

behavior.scenario('installed Ocean ImprovedSea and Borehole coefficients are independent source inputs', () => {
	const original = consumer.parse(fixture('default')); const altered = consumer.parse(fixture('altered'));
	test.assert(original.ocean == {NUTRIENTS:1,MINERALS:0,ENERGY:0} && original.improved_sea == {NUTRIENTS:2,MINERALS:1,ENERGY:3});
	test.assert(original.borehole == {NUTRIENTS:0,MINERALS:6,ENERGY:6} && original.sea_mine_bonus_tech == 'SyntheticSeaMining');
	test.assert(altered.improved_sea == {NUTRIENTS:3,MINERALS:2,ENERGY:4} && altered.borehole == {NUTRIENTS:0,MINERALS:7,ENERGY:8});
});
behavior.scenario('functional resource queries honor installed sea coefficients and independent real faction caps', () => {
	const f = test.production_fixture(); const handler = configure(consumer.parse(fixture('default'))); f.apply_faction_starting_technologies(['SyntheticCap']);
	const event = {}; event.player = f.owner; event.tile = worker(); event.tile.is_land = false;
	event.tile.features.jungle = false; event.tile.terraforming = {farm:true,mine:false,solar:false};
	test.assert(handler(event) == {NUTRIENTS:3,MINERALS:0,ENERGY:0});
	event.tile.terraforming = {farm:false,mine:true,solar:false}; test.assert(handler(event).MINERALS == 1);
	f.apply_faction_starting_technologies(['SyntheticCap','SyntheticSeaMining']); test.assert(handler(event).MINERALS == 2);
	event.tile.terraforming = {farm:false,mine:false,solar:true}; test.assert(handler(event).ENERGY == 3);
	f.apply_faction_starting_technologies([]); test.assert(handler(event).ENERGY == 2, 'Technology-free worker access never waives resource caps');
});
behavior.scenario('solar bands soil enrichment and boreholes change actual resource results without special tile fixtures', () => {
	const f = test.production_fixture(); f.apply_faction_starting_technologies(['SyntheticCap']); const handler = configure(consumer.parse(fixture('default')));
	const event = {}; event.player = f.owner; event.tile = worker(); event.tile.terraforming = {farm:true,soil_enricher:true};
	test.assert(handler(event).NUTRIENTS == 4);
	event.tile.terraforming = {solar:true};
	for (input of [[64,1],[1362,2],[2462,3],[3500,4]]) { event.tile.elevation = input[0]; test.assert(handler(event).ENERGY == input[1]); }
	event.tile.terraforming = {borehole:true}; test.assert(handler(event) == {NUTRIENTS:0,MINERALS:6,ENERGY:6});
});
