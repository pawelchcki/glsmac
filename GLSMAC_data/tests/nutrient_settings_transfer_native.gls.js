// Native application settings-transfer invariants. This does not claim original
// growth parity or atomicity of the enclosing State/faction payload.
const behavior = #include('./_behavior');
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Malformed aggregate global settings must reject');
};
const configure = (f, level, width, height, factor, name) => {
	const settings = f.game.get_settings().global;
	settings.map.size_x = width; settings.map.size_y = height;
	settings.map.preset_level = level;
	settings.rules.set_nutrient_cost_factor(factor); settings.game_name = name;
};
const pair = () => {
	const f = {};
	f.source = test.production_fixture(); f.target = test.production_fixture();
	configure(f.source, 0, 68, 34, 17, 'Source settings');
	configure(f.target, 2, 112, 56, 23, 'Target settings');
	return f;
};

behavior.scenario('actual aggregate GlobalSettings transfer preserves receiving aliases and independent values', () => {
	const f = pair(); const settings = f.target.game.get_settings().global;
	const map = settings.map; map.preset_level = 2;
	const read = settings.rules.get_nutrient_cost_factor;
	const wire = f.source.global_settings_snapshot('current');
	f.target.restore_global_settings(wire);
	test.assert(f.target.global_settings_snapshot('current') == wire);
	test.assert(read() == 17 && settings.rules.get_nutrient_cost_factor() == 17);
	test.assert(map.preset_level == 0, 'Aggregate decode refreshes a retained assigned preset wrapper');
	test.assert(settings.map.size_x == 68 && settings.map.size_y == 34);
	test.assert(settings.game_name == 'Source settings');
	configure(f.source, 4, 160, 80, 29, 'Changed sender');
	test.assert(f.target.global_settings_snapshot('current') == wire && read() == 17);
});

behavior.scenario('nested exact empty legacy Rules payload defaults to ten through GlobalSettings', () => {
	const f = pair(); const settings = f.target.game.get_settings().global;
	const read = settings.rules.get_nutrient_cost_factor;
	f.target.restore_global_settings(f.source.global_settings_snapshot('legacy_rules'));
	test.assert(read() == 10 && settings.rules.get_nutrient_cost_factor() == 10);
	test.assert(settings.map.preset_level == 0 && settings.map.size_x == 68 && settings.map.size_y == 34);
	test.assert(settings.game_name == 'Source settings');
});

behavior.scenario('actual pre-world State wire carries GlobalSettings and independent faction definitions', () => {
	const f = test.production_fixture(); const before = f.snapshot();
	const result = f.state_rules_wire_probe();
	test.assert(result.received && result.roundtrip, 'Actual State Serialize and Deserialize retain complete global settings');
	test.assert(result.aliases && result.independent, 'Receiving native Rules keep identity and do not borrow sender state');
	test.assert(result.factions, 'Actual State wire also decodes independent faction definitions');
	test.assert(f.snapshot() == before, 'Pre-world wire probe never replaces the live fixture world');
});

behavior.scenario('invalid nested Rules reject before changing any receiving GlobalSettings field', () => {
	const f = pair(); const settings = f.target.game.get_settings().global;
	const map = settings.map; map.preset_level = 2;
	const read = settings.rules.get_nutrient_cost_factor;
	const before = f.target.global_settings_snapshot('current');
	rejects(() => { f.target.restore_global_settings(f.source.global_settings_snapshot('invalid_rules')); });
	test.assert(f.target.global_settings_snapshot('current') == before, 'Invalid nested Rules must preserve the entire previous global settings payload');
	test.assert(read() == 23 && map.preset_level == 2);
	test.assert(settings.map.size_x == 112 && settings.map.size_y == 56 && settings.game_name == 'Target settings');
});

behavior.scenario('truncated field after valid Rules rejects before changing receiving GlobalSettings', () => {
	const f = pair(); const settings = f.target.game.get_settings().global;
	const map = settings.map; map.preset_level = 2;
	const read = settings.rules.get_nutrient_cost_factor;
	const before = f.target.global_settings_snapshot('current');
	rejects(() => { f.target.restore_global_settings(f.source.global_settings_snapshot('truncated_name')); });
	test.assert(f.target.global_settings_snapshot('current') == before, 'A late decode failure must not commit earlier map or Rules fields');
	test.assert(read() == 23 && map.preset_level == 2);
	test.assert(settings.map.size_x == 112 && settings.map.size_y == 56 && settings.game_name == 'Target settings');
});
