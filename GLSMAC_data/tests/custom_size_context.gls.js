// Custom kind 99 and factors have separate immutable original witnesses.
// Persistence, item row declarations and construction are application coverage.
const behavior = #include('./_behavior');
const facility = #include('./_facility_cost_fixture');
const cost = (f) => {
	for (choice of f.owner.get_production_choices()) {
		if (choice.id == 'OBSERVED_TANKS') { return choice.cost; }
	}
	return 0;
};
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed);
};

for (route of ['random', 'custom']) {
	for (entry of [[1, 1], [10, 10], [13, 13], [100, 100]]) {
		behavior.scenario(route + ' Custom kind consumes loaded food and mineral rule ' + #to_string(entry[0]), () => {
			const f = facility(99); const global = f.game.get_settings().global;
			global.map.type = route;
			global.rules.set_nutrient_cost_factor(entry[0]); global.rules.set_mineral_cost_factor(entry[0]);
			const before = f.snapshot(); const updates = f.update_count();
			test.assert(global.map.preset_level == 99 && f.base.get_nutrient_factor() == entry[1]);
			test.assert(cost(f) == 4 * entry[1]);
			test.assert(f.snapshot() == before && f.update_count() == updates);
		});
	}
	behavior.scenario(route + ' Custom survives receiving map and rule settings with retained aliases', () => {
		const source = facility(99); const target = facility(0);
		source.game.get_settings().global.map.type = route;
		source.game.get_settings().global.rules.set_nutrient_cost_factor(13);
		source.game.get_settings().global.rules.set_mineral_cost_factor(13);
		const alias = target.game.get_settings().global.map;
		alias.size_x = 200; alias.size_y = 100; alias.preset_level = 1;
		target.restore_map_settings(source.map_settings_snapshot('current'));
		target.restore_rules_settings(source.rules_settings_snapshot('current'));
		test.assert(alias.type == route && alias.preset_level == 99);
		test.assert(target.map_settings_snapshot('current') == source.map_settings_snapshot('current'));
		test.assert(target.base.get_nutrient_factor() == 13 && cost(target) == 52);
		source.game.get_settings().global.map.preset_level = 0;
		test.assert(alias.preset_level == 99 && cost(target) == 52);
		target.restore_map_settings(source.map_settings_snapshot('legacy'));
		test.assert(alias.preset_level == (0 - 1) && !#is_defined(target.base.get_nutrient_factor()) && cost(target) == 32);
	});
}

for (field of ['size_x', 'size_y', 'mapfile', 'planet', 'huge_planet']) {
	behavior.scenario('Custom provenance is invalidated by independent edit ' + field, () => {
		const f = facility(99); const map = f.game.get_settings().global.map;
		const alias = f.game.get_settings().global.map; alias.preset_level = 99;
		if (field == 'size_x') { map.size_x = 200; }
		else if (field == 'size_y') { map.size_y = 100; }
		else {
			map.type = field;
			rejects(() => { alias.preset_level = 99; });
		}
		test.assert(map.preset_level == (0 - 1) && alias.preset_level == (0 - 1));
		if (field == 'mapfile') { test.assert(f.base.get_nutrient_factor() == 8 && cost(f) == 32); }
		else { test.assert(!#is_defined(f.base.get_nutrient_factor()) && cost(f) == 32); }
	});
}

behavior.scenario('Custom declaration permits only the observed kind and keeps named selection bounds', () => {
	const f = facility(99); const global = f.game.get_settings().global;
	for (invalid of [(0 - 2), 5, 98, 100, '99', 99.0, null]) {
		rejects(() => { global.map.preset_level = invalid; });
		test.assert(global.map.preset_level == 99 && cost(f) == 40);
	}
	rejects(() => { global.rules.select_world_size(global.map, 99); });
	test.assert(global.map.preset_level == 99);
});

behavior.scenario('actual Custom facility construction spends loaded price and retains overflow', () => {
	const f = facility(99); f.game.get_settings().global.rules.set_mineral_cost_factor(13);
	f.with_write(() => { f.base.select_production('OBSERVED_TANKS'); });
	f.set_turn(2); f.with_write(() => { f.base.process_production(2, 51); });
	test.assert(!f.base.has_facility('OBSERVED_TANKS') && f.base.get_production().minerals == 51);
	f.set_turn(3); f.with_write(() => { f.base.process_production(3, 6); });
	test.assert(f.base.has_facility('OBSERVED_TANKS'));
	test.assert(f.base.get_production() == { choice_id: '', minerals: 5, last_processed_turn: 3 });
});

behavior.scenario('actual Custom unit construction spends loaded price and charges a citizen', () => {
	const f = test.founding_fixture(); f.game.get_settings().global.map.preset_level = 99;
	f.game.get_settings().global.rules.set_mineral_cost_factor(13);
	f.add_worker(0); f.add_worker(1); const before = f.inspect();
	f.with_write(() => {
		f.owner.add_production_choice('COLONY_POD', {type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1});
		f.base.select_production('COLONY_POD');
	});
	f.set_turn(2); f.with_write(() => { f.base.process_production(2, 38); });
	test.assert(f.base.get_size() == 2 && f.inspect().unit_ids == before.unit_ids);
	f.set_turn(3); f.with_write(() => { f.base.process_production(3, 6); });
	test.assert(f.base.get_size() == 1 && #sizeof(f.inspect().unit_ids) == #sizeof(before.unit_ids) + 1);
	test.assert(f.base.get_production() == { choice_id: '', minerals: 5, last_processed_turn: 3 });
	test.assert(f.game.um.get_unit(before.next_unit_id).get_def().id == 'ColonyPod');
});
