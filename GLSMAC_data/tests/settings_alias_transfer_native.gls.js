// Native application transfer invariants, using only synthetic settings.
// Assigned wrappers, fresh native wrappers and actual serialized state must
// agree after decode. No original gameplay or malformed whole-State claim.
const behavior = #include('./_behavior');
const map_fields = ['type', 'filename', 'size_x', 'size_y', 'preset_level', 'ocean_coverage', 'erosive_forces', 'native_lifeforms', 'cloud_cover'];
const source_values = {
	type: 'custom', filename: 'synthetic-source.map', size_x: 68, size_y: 34, preset_level: 0,
	ocean_coverage: 0.25, erosive_forces: 0.5, native_lifeforms: 0.75, cloud_cover: 0.125,
};
const target_values = {
	type: 'random', filename: 'synthetic-target.map', size_x: 112, size_y: 56, preset_level: 2,
	ocean_coverage: 0.5, erosive_forces: 0.75, native_lifeforms: 0.25, cloud_cover: 0.5,
};
const assign_map = (map, values) => {
	map.type = values.type; map.filename = values.filename;
	map.size_x = values.size_x; map.size_y = values.size_y;
	map.ocean_coverage = values.ocean_coverage; map.erosive_forces = values.erosive_forces;
	map.native_lifeforms = values.native_lifeforms; map.cloud_cover = values.cloud_cover;
	// Size assignment deliberately clears provenance; declare it last.
	map.preset_level = values.preset_level;
};
const pair = () => {
	const f = {};
	f.source = test.production_fixture(); f.target = test.production_fixture();
	f.from = f.source.game.get_settings().global; f.to = f.target.game.get_settings().global;
	f.source_map = f.from.map; f.target_map = f.to.map;
	assign_map(f.source_map, source_values); assign_map(f.target_map, target_values);
	f.from.difficulty_level = 'Citizen'; f.to.difficulty_level = 'Transcend';
	f.from.game_name = 'Synthetic sender'; f.to.game_name = 'Synthetic receiver';
	return f;
};
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Malformed settings transfer must reject');
};
const assert_target_unchanged = (f) => {
	const fresh = f.target.game.get_settings().global;
	for (key of map_fields) {
		test.assert(f.target_map[key] == target_values[key], 'Rejected transfer changed retained map field ' + key);
		test.assert(fresh.map[key] == target_values[key], 'Rejected transfer changed native map field ' + key);
	}
	test.assert(f.to.difficulty_level == 'Transcend' && fresh.difficulty_level == 'Transcend');
	test.assert(f.to.game_name == 'Synthetic receiver' && fresh.game_name == 'Synthetic receiver');
};

for (mode of ['map', 'global']) {
	for (field of map_fields) {
		behavior.scenario(mode + ' transfer refreshes assigned retained map field ' + field, () => {
			const f = pair();
			const wire = mode == 'map' ? f.source.map_settings_snapshot('current') : f.source.global_settings_snapshot('current');
			if (mode == 'map') { f.target.restore_map_settings(wire); }
			else { f.target.restore_global_settings(wire); }
			const actual = mode == 'map' ? f.target.map_settings_snapshot('current') : f.target.global_settings_snapshot('current');
			test.assert(actual == wire, 'Actual native settings bytes must match the received wire');
			const fresh = f.target.game.get_settings().global.map;
			test.assert(fresh[field] == source_values[field], 'Fresh native map field must contain the received value');
			test.assert(f.target_map[field] == source_values[field], 'Retained assigned map field must contain the received value');
			test.assert(f.target_map[field] == fresh[field], 'Retained and fresh map wrappers must agree');
		});
	}
}

for (property of ['difficulty_level', 'game_name']) {
	behavior.scenario('GlobalSettings transfer refreshes assigned retained ' + property, () => {
		const f = pair(); const wire = f.source.global_settings_snapshot('current');
		f.target.restore_global_settings(wire);
		const fresh = f.target.game.get_settings().global;
		const expected = property == 'difficulty_level' ? 'Citizen' : 'Synthetic sender';
		test.assert(f.target.global_settings_snapshot('current') == wire);
		test.assert(fresh[property] == expected, 'Fresh native global field must contain the received value');
		test.assert(f.to[property] == expected, 'Retained assigned global field must contain the received value');
		test.assert(f.to[property] == fresh[property]);
	});
}

behavior.scenario('rejected direct MapSettings transfer preserves native bytes and every retained assigned field', () => {
	const f = pair(); const before = f.target.map_settings_snapshot('current');
	for (kind of ['trailing', 'invalid_level']) {
		rejects(() => { f.target.restore_map_settings(f.source.map_settings_snapshot(kind)); });
		test.assert(f.target.map_settings_snapshot('current') == before);
		assert_target_unchanged(f);
	}
});

behavior.scenario('rejected aggregate transfer preserves native bytes and every retained assigned field', () => {
	const f = pair(); const before = f.target.global_settings_snapshot('current');
	for (kind of ['invalid_rules', 'truncated_name']) {
		rejects(() => { f.target.restore_global_settings(f.source.global_settings_snapshot(kind)); });
		test.assert(f.target.global_settings_snapshot('current') == before);
		assert_target_unchanged(f);
	}
});

behavior.scenario('unknown wire difficulty rejects before changing any native global field or retained alias', () => {
	const f = pair();
	f.from.rules.set_nutrient_cost_factor(17); f.from.rules.set_mineral_cost_factor(23);
	f.to.rules.set_nutrient_cost_factor(29); f.to.rules.set_mineral_cost_factor(31);
	const nutrient_read = f.to.rules.get_nutrient_cost_factor; const mineral_read = f.to.rules.get_mineral_cost_factor;
	const before = f.target.global_settings_snapshot('current');
	for (kind of ['invalid_difficulty', 'invalid_difficulty_wide']) {
		rejects(() => { f.target.restore_global_settings(f.source.global_settings_snapshot(kind)); });
		test.assert(f.target.global_settings_snapshot('current') == before, 'Invalid full-width mapped difficulty must reject before committing map rules difficulty or name');
		assert_target_unchanged(f);
		test.assert(nutrient_read() == 29 && mineral_read() == 31);
	}
});
