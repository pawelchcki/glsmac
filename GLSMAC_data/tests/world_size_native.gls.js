const behavior = #include('./_behavior');
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Invalid native world-size operation must reject');
};
const sizes = () => { return [
	{level: 0, name: 'Amber', description: 'Swift', size_x: 12, size_y: 8},
	{level: 1, name: 'Birch', description: '', size_x: 16, size_y: 10},
	{level: 2, name: 'Cedar', description: '', size_x: 20, size_y: 12},
	{level: 3, name: 'Dune', description: '', size_x: 24, size_y: 14},
	{level: 4, name: 'Elm', description: 'Patient', size_x: 28, size_y: 16},
]; };
behavior.scenario('native world-size table accessors exist and return detached complete values', () => {
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	test.assert(#typeof(rules.get_world_sizes) == 'Callable' && #typeof(rules.set_world_sizes) == 'Callable', 'World-size properties need native accessors');
	test.assert(#typeof(rules.select_world_size) == 'Callable');
	const input = sizes(); rules.set_world_sizes(input);
	const result = rules.get_world_sizes();
	test.assert(result == input);
	input[0].name = 'Input changed'; result[1].size_x = 100;
	const again = rules.get_world_sizes();
	test.assert(again[0].name == 'Amber' && again[1].size_x == 16);
	test.assert(rules.get_nutrient_cost_factor() == 10 && rules.get_mineral_cost_factor() == 10);
});
behavior.scenario('native setter validates the entire table before changing its record', () => {
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_world_sizes(sizes()); const before = f.rules_settings_snapshot('current');
	for (invalid of [undefined, null, true, 'table', {}, [], [1, 2, 3, 4, 5]]) {
		rejects(() => { rules.set_world_sizes(invalid); });
		test.assert(f.rules_settings_snapshot('current') == before);
	}
	for (field of ['level', 'name', 'description', 'size_x', 'size_y']) {
		const input = sizes(); input[4][field] = undefined;
		rejects(() => { rules.set_world_sizes(input); });
		test.assert(f.rules_settings_snapshot('current') == before);
	}
	for (invalid of [0, 3, 4098, 28.0, '28', true]) {
		const input = sizes(); input[4].size_x = invalid;
		rejects(() => { rules.set_world_sizes(input); });
		test.assert(f.rules_settings_snapshot('current') == before);
	}
	const wrong_level = sizes(); wrong_level[4].level = 0;
	rejects(() => { rules.set_world_sizes(wrong_level); });
	const blank = sizes(); blank[4].name = '';
	rejects(() => { rules.set_world_sizes(blank); });
	test.assert(f.rules_settings_snapshot('current') == before);
	rejects(() => { rules.set_world_sizes(); }); rejects(() => { rules.get_world_sizes(1); });
	rejects(() => { rules.set_world_sizes(sizes(), 1); });
});
for (route of ['random', 'custom']) {
	behavior.scenario('native preset selection refreshes all retained map aliases on ' + route + ' route', () => {
		const f = test.production_fixture(); const settings = f.game.get_settings().global;
		const rules = settings.rules; rules.set_world_sizes(sizes());
		const map = settings.map; const alias = f.game.get_settings().global.map;
		map.type = route; alias.size_x = 100; alias.size_y = 80; alias.preset_level = 3;
		map.ocean_coverage = 0.4; map.cloud_cover = 0.75;
		const world = f.snapshot(); const updates = f.update_count();
		for (level of [0, 1, 2, 3, 4]) {
			rules.select_world_size(map, level);
			test.assert(map.size_x == 12 + level * 4 && map.size_y == 8 + level * 2 && map.preset_level == level);
			test.assert(alias.size_x == map.size_x && alias.size_y == map.size_y && alias.preset_level == level);
			test.assert(map.type == route && map.ocean_coverage == 0.4 && map.cloud_cover == 0.75);
		}
		test.assert(f.snapshot() == world && f.update_count() == updates);
	});
}
behavior.scenario('invalid selection and imported maps preserve complete native map settings', () => {
	const f = test.production_fixture(); const settings = f.game.get_settings().global;
	settings.rules.set_world_sizes(sizes()); const map = settings.map;
	for (invalid of [(0 - 1), 5, 1.0, '1', true, undefined]) {
		const before = f.map_settings_snapshot('current');
		rejects(() => { settings.rules.select_world_size(map, invalid); });
		test.assert(f.map_settings_snapshot('current') == before);
	}
	for (type of ['mapfile', 'planet', 'huge_planet']) {
		map.type = type; const before = f.map_settings_snapshot('current');
		rejects(() => { settings.rules.select_world_size(map, 0); });
		test.assert(f.map_settings_snapshot('current') == before);
	}
	rejects(() => { settings.rules.select_world_size({}, 0); });
});
behavior.scenario('configured native table survives Rules and aggregate transfer with live readers', () => {
	const source = test.production_fixture(); const target = test.production_fixture();
	const rules = source.game.get_settings().global.rules;
	const receiver = target.game.get_settings().global.rules; const read = receiver.get_world_sizes;
	rules.set_world_sizes(sizes()); rules.set_nutrient_cost_factor(17); rules.set_mineral_cost_factor(23);
	const wire = source.rules_settings_snapshot('current'); target.restore_rules_settings(wire);
	test.assert(read() == sizes() && target.rules_settings_snapshot('current') == wire);
	test.assert(receiver.get_nutrient_cost_factor() == 17 && receiver.get_mineral_cost_factor() == 23);
	const global_wire = source.global_settings_snapshot('current'); target.restore_global_settings(global_wire);
	test.assert(read() == sizes() && target.global_settings_snapshot('current') == global_wire);
	const changed = sizes(); changed[0].name = 'Changed sender'; rules.set_world_sizes(changed);
	test.assert(read() == sizes());
	const before = target.global_settings_snapshot('current');
	rejects(() => { target.restore_global_settings(source.global_settings_snapshot('truncated_name')); });
	test.assert(target.global_settings_snapshot('current') == before && read() == sizes());
});
behavior.scenario('configured native table rejects truncated and trailing Rules records atomically', () => {
	const source = test.production_fixture(); const target = test.production_fixture();
	source.game.get_settings().global.rules.set_world_sizes(sizes());
	const receiver = target.game.get_settings().global.rules;
	receiver.set_nutrient_cost_factor(29); receiver.set_mineral_cost_factor(31);
	const before = target.rules_settings_snapshot('current');
	for (kind of ['truncated', 'trailing', 'world_tag', 'world_count', 'world_name', 'world_width', 'world_height', 'world_type']) {
		rejects(() => { target.restore_rules_settings(source.rules_settings_snapshot(kind)); });
		test.assert(target.rules_settings_snapshot('current') == before);
	}
});
behavior.scenario('historical Rules records restore their complete historical table without retaining configured choices', () => {
	const source = test.production_fixture(); const target = test.production_fixture();
	const rules = target.game.get_settings().global.rules; const historical = rules.get_world_sizes();
	source.game.get_settings().global.rules.set_nutrient_cost_factor(17);
	source.game.get_settings().global.rules.set_mineral_cost_factor(23);
	for (kind of ['legacy', 'legacy_nutrient', 'legacy_costs']) {
		rules.set_world_sizes(sizes()); target.restore_rules_settings(source.rules_settings_snapshot(kind));
		test.assert(rules.get_world_sizes() == historical);
		test.assert(rules.get_nutrient_cost_factor() == (kind == 'legacy' ? 10 : 17));
		test.assert(rules.get_mineral_cost_factor() == (kind == 'legacy_costs' ? 23 : 10));
	}
});
behavior.scenario('malformed nested table preserves every receiving aggregate field', () => {
	const source = test.production_fixture(); const target = test.production_fixture();
	source.game.get_settings().global.rules.set_world_sizes(sizes());
	source.game.get_settings().global.game_name = 'Sender'; source.game.get_settings().global.map.size_x = 100;
	const rules = target.game.get_settings().global.rules; rules.set_world_sizes(sizes()); rules.set_mineral_cost_factor(31);
	const before = target.global_settings_snapshot('current');
	rejects(() => { target.restore_global_settings(source.global_settings_snapshot('invalid_world_rules')); });
	test.assert(target.global_settings_snapshot('current') == before && rules.get_world_sizes() == sizes());
});
behavior.scenario('actual copy construction assignment saved readers and native destruction preserve table ownership', () => {
	const f = test.production_fixture(); f.game.get_settings().global.rules.set_world_sizes(sizes());
	const before = f.rules_settings_snapshot('current'); const result = f.world_sizes_copy_probe();
	test.assert(result.copied && result.aliases && result.independent && result.lifetime);
	test.assert(f.rules_settings_snapshot('current') == before);
});
behavior.scenario('actual valid pre-world State wire preserves configured table and retained readers', () => {
	const f = test.production_fixture(); f.game.get_settings().global.rules.set_world_sizes(sizes());
	const before = f.rules_settings_snapshot('current'); const result = f.state_rules_wire_probe();
	test.assert(result.received && result.aliases && result.factions && result.roundtrip && result.independent);
	test.assert(result.worlds_received && result.worlds_aliases && result.worlds_independent);
	test.assert(f.rules_settings_snapshot('current') == before);
});
behavior.scenario('saved world-size functions reject safely after native Rules destruction', () => {
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	const read = rules.get_world_sizes; const write = rules.set_world_sizes;
	const select = rules.select_world_size; const map = f.game.get_settings().global.map;
	f.reset(); rejects(() => { read(); }); rejects(() => { write(sizes()); });
	rejects(() => { select(map, 0); });
});
behavior.scenario('a live Rules selector rejects a destroyed native map wrapper safely', () => {
	const owner = test.production_fixture(); const other = test.production_fixture();
	const rules = owner.game.get_settings().global.rules; const map = other.game.get_settings().global.map;
	const before = owner.rules_settings_snapshot('current'); other.reset();
	rejects(() => { rules.select_world_size(map, 0); });
	test.assert(owner.rules_settings_snapshot('current') == before);
});
