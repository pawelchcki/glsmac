// Native application data/state invariants. Original factor arithmetic and
// complete construction behavior are separate contracts.
const behavior = #include('./_behavior');
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Invalid mineral rule operation must reject');
};
const fixture = (nutrient, mineral) => {
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(nutrient); rules.set_mineral_cost_factor(mineral);
	return f;
};

behavior.scenario('typed native mineral accessors default to ten and preserve the independent nutrient rule', () => {
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	test.assert(#typeof(rules.get_mineral_cost_factor) == 'Callable', 'Native Rules need a live mineral getter');
	test.assert(#typeof(rules.set_mineral_cost_factor) == 'Callable', 'Native Rules need a validated mineral setter');
	test.assert(rules.get_mineral_cost_factor() == 10 && rules.get_nutrient_cost_factor() == 10);
	rules.set_nutrient_cost_factor(17); const before = f.snapshot(); const updates = f.update_count();
	for (value of [1, 11, 100]) {
		rules.set_mineral_cost_factor(value);
		test.assert(rules.get_mineral_cost_factor() == value && rules.get_nutrient_cost_factor() == 17);
	}
	test.assert(f.snapshot() == before && f.update_count() == updates, 'Native rule configuration does not mutate base state');
});

behavior.scenario('mineral aliases and saved getter setter remain live without shadow properties', () => {
	const f = fixture(17, 23); const rules = f.game.get_settings().global.rules;
	const alias = f.game.get_settings().global.rules;
	const read = rules.get_mineral_cost_factor; const write = alias.set_mineral_cost_factor;
	write(29); test.assert(read() == 29 && rules.get_mineral_cost_factor() == 29);
	rules.set_mineral_cost_factor(31); test.assert(read() == 31 && alias.get_mineral_cost_factor() == 31);
	rejects(() => { rules.mineral_cost_factor = 99; });
	test.assert(read() == 31 && rules.get_nutrient_cost_factor() == 17);
});

behavior.scenario('mineral native accessor counts types and bounds reject without changing either field', () => {
	const f = fixture(17, 23); const rules = f.game.get_settings().global.rules;
	const before = f.rules_settings_snapshot('current');
	for (invalid of [0, 101, (0 - 1), 11.0, '11', true, null, undefined]) {
		rejects(() => { rules.set_mineral_cost_factor(invalid); });
		test.assert(f.rules_settings_snapshot('current') == before);
	}
	rejects(() => { rules.set_mineral_cost_factor(); });
	rejects(() => { rules.set_mineral_cost_factor(11, 12); });
	rejects(() => { rules.get_mineral_cost_factor(1); });
	test.assert(rules.get_nutrient_cost_factor() == 17 && rules.get_mineral_cost_factor() == 23);
});

behavior.scenario('actual current Rules codec writes exactly nutrient then mineral and transfers independent values', () => {
	const source = fixture(17, 23); const target = fixture(29, 31);
	const record = source.rules_record_probe();
	test.assert(record.nutrient == 17 && record.mineral == 23 && record.exhausted);
	const rules = target.game.get_settings().global.rules;
	const read = rules.get_mineral_cost_factor; const nutrient_read = rules.get_nutrient_cost_factor;
	const wire = source.rules_settings_snapshot('current'); target.restore_rules_settings(wire);
	test.assert(target.rules_settings_snapshot('current') == wire && read() == 23 && nutrient_read() == 17);
	source.game.get_settings().global.rules.set_mineral_cost_factor(37);
	test.assert(read() == 23 && target.rules_settings_snapshot('current') == wire);
});

behavior.scenario('exact empty and nutrient-only candidate Rules records retain their specified compatibility', () => {
	const source = fixture(17, 23); const target = fixture(29, 31);
	const rules = target.game.get_settings().global.rules;
	const read = rules.get_mineral_cost_factor; const nutrient_read = rules.get_nutrient_cost_factor;
	target.restore_rules_settings(source.rules_settings_snapshot('legacy_nutrient'));
	test.assert(nutrient_read() == 17 && read() == 10, 'Exact b17ee4ad nutrient-only record defaults only mineral');
	target.restore_rules_settings(source.rules_settings_snapshot('legacy'));
	test.assert(nutrient_read() == 10 && read() == 10, 'Exact old empty record defaults both fields');
});

behavior.scenario('malformed present mineral extension preserves both complete native values and aliases', () => {
	const source = fixture(17, 23); const target = fixture(29, 31);
	const rules = target.game.get_settings().global.rules;
	const read = rules.get_mineral_cost_factor; const nutrient_read = rules.get_nutrient_cost_factor;
	const before = target.rules_settings_snapshot('current');
	for (kind of ['mineral_invalid_low', 'mineral_invalid_high', 'mineral_wrong_type', 'mineral_truncated', 'mineral_trailing', 'truncated', 'trailing', 'invalid_low', 'invalid_high', 'wrong_type']) {
		rejects(() => { target.restore_rules_settings(source.rules_settings_snapshot(kind)); });
		test.assert(target.rules_settings_snapshot('current') == before && nutrient_read() == 29 && read() == 31);
	}
});

behavior.scenario('actual native Rules copies preserve independent mineral fields destination aliases and lifetime', () => {
	const f = fixture(17, 23); const rules = f.game.get_settings().global.rules;
	const result = f.rules_copy_probe();
	test.assert(result.constructor && result.assignment && result.independent && result.aliases && result.lifetime);
	test.assert(result.mineral_constructor && result.mineral_assignment && result.mineral_independent && result.mineral_aliases && result.mineral_lifetime);
	test.assert(rules.get_nutrient_cost_factor() == 17 && rules.get_mineral_cost_factor() == 23);
});

behavior.scenario('actual aggregate GlobalSettings carries both rules and nutrient-only legacy compatibility', () => {
	const source = fixture(17, 23); const target = fixture(29, 31);
	const from = source.game.get_settings().global; const to = target.game.get_settings().global;
	from.map.preset_level = 0; from.game_name = 'Mineral sender';
	to.map.preset_level = 2; to.game_name = 'Mineral receiver';
	const read = to.rules.get_mineral_cost_factor; const nutrient_read = to.rules.get_nutrient_cost_factor;
	const wire = source.global_settings_snapshot('current'); target.restore_global_settings(wire);
	test.assert(target.global_settings_snapshot('current') == wire && read() == 23 && nutrient_read() == 17);
	from.rules.set_mineral_cost_factor(37); test.assert(read() == 23);
	target.restore_global_settings(source.global_settings_snapshot('legacy_nutrient_rules'));
	test.assert(read() == 10 && nutrient_read() == 17 && to.map.preset_level == 0 && to.game_name == 'Mineral sender');
	target.restore_global_settings(source.global_settings_snapshot('legacy_rules'));
	test.assert(read() == 10 && nutrient_read() == 10);
});

behavior.scenario('bad mineral and late aggregate truncation preserve all previous receiving GlobalSettings', () => {
	const source = fixture(17, 23); const target = fixture(29, 31);
	const from = source.game.get_settings().global; const to = target.game.get_settings().global;
	from.map.preset_level = 0; from.game_name = 'Different sender';
	to.map.preset_level = 2; to.game_name = 'Original receiver';
	const read = to.rules.get_mineral_cost_factor; const nutrient_read = to.rules.get_nutrient_cost_factor;
	const before = target.global_settings_snapshot('current');
	for (kind of ['invalid_mineral_rules', 'invalid_rules', 'truncated_name']) {
		rejects(() => { target.restore_global_settings(source.global_settings_snapshot(kind)); });
		test.assert(target.global_settings_snapshot('current') == before && nutrient_read() == 29 && read() == 31);
		test.assert(to.map.preset_level == 2 && to.game_name == 'Original receiver');
	}
});

behavior.scenario('actual valid pre-world State wire preserves both rule fields and independent receiving definitions', () => {
	const f = fixture(17, 23); const before = f.snapshot(); const result = f.state_rules_wire_probe();
	test.assert(result.received && result.aliases && result.roundtrip && result.independent && result.factions);
	test.assert(result.mineral_received && result.mineral_aliases && result.mineral_independent);
	test.assert(f.snapshot() == before);
});

behavior.scenario('saved mineral callables reject safely after native settings destruction', () => {
	const f = fixture(17, 23); const rules = f.game.get_settings().global.rules;
	const read = rules.get_mineral_cost_factor; const write = rules.set_mineral_cost_factor;
	f.reset(); rejects(() => { read(); }); rejects(() => { write(11); });
});
