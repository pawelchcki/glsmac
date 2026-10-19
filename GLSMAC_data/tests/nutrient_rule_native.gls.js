// Native global-rule state, retained callables and receiving settings.
// Numeric expected factors are covered by the public nutrient factor contract.
const behavior = #include('./_behavior');
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Invalid native nutrient configuration must fail explicitly');
};
const fixture = () => {
	const f = test.production_fixture();
	f.game.get_settings().global.map.preset_level = 2;
	return f;
};

behavior.scenario('native typed nutrient multiplier feeds the actual base factor without changing base state', () => {
	const f = fixture(); const rules = f.game.get_settings().global.rules;
	test.assert(#typeof(rules.get_nutrient_cost_factor) == 'Callable', 'Native rules need a live nutrient multiplier getter');
	test.assert(#typeof(rules.set_nutrient_cost_factor) == 'Callable', 'Native rules need a validated nutrient multiplier setter');
	test.assert(rules.get_nutrient_cost_factor() == 10 && f.base.get_nutrient_factor() == 10);
	const before = f.snapshot(); const updates = f.update_count();
	rules.set_nutrient_cost_factor(11);
	test.assert(rules.get_nutrient_cost_factor() == 11 && f.base.get_nutrient_factor() == 11);
	test.assert(f.snapshot() == before && f.update_count() == updates, 'Rule configuration must not mutate base/population/production');
});

behavior.scenario('retained native rules aliases and detached callables observe changes consistently', () => {
	const f = fixture(); const rules = f.game.get_settings().global.rules;
	const alias = f.game.get_settings().global.rules;
	const read = rules.get_nutrient_cost_factor; const write = alias.set_nutrient_cost_factor;
	write(17); test.assert(read() == 17 && alias.get_nutrient_cost_factor() == 17 && f.base.get_nutrient_factor() == 17);
	rules.set_nutrient_cost_factor(23);
	test.assert(read() == 23 && alias.get_nutrient_cost_factor() == 23);
	rejects(() => { rules.nutrient_cost_factor = 99; });
	test.assert(read() == 23, 'A script property must not shadow native rule state');
});

behavior.scenario('native multiplier rejects bad types counts and bounds atomically', () => {
	const f = fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(17);
	for (invalid of [0, 101, (0 - 1), 11.0, '11', true, null, undefined]) {
		rejects(() => { rules.set_nutrient_cost_factor(invalid); });
		test.assert(rules.get_nutrient_cost_factor() == 17 && f.base.get_nutrient_factor() == 17);
	}
	rejects(() => { rules.set_nutrient_cost_factor(); });
	rejects(() => { rules.set_nutrient_cost_factor(11, 12); });
	rejects(() => { rules.get_nutrient_cost_factor(1); });
	test.assert(rules.get_nutrient_cost_factor() == 17);
});

behavior.scenario('current receiving rules preserve the authoritative multiplier and retained aliases', () => {
	const source = fixture(); const target = fixture();
	source.game.get_settings().global.rules.set_nutrient_cost_factor(17);
	const alias = target.game.get_settings().global.rules;
	const read = alias.get_nutrient_cost_factor;
	target.restore_rules_settings(source.rules_settings_snapshot('current'));
	test.assert(read() == 17 && alias.get_nutrient_cost_factor() == 17 && target.base.get_nutrient_factor() == 17);
	source.game.get_settings().global.rules.set_nutrient_cost_factor(23);
	test.assert(read() == 17, 'Receiving settings own their copied rule rather than borrowing sender state');
	target.restore_rules_settings(source.rules_settings_snapshot('legacy'));
	test.assert(read() == 10 && target.base.get_nutrient_factor() == 10, 'Only exact empty legacy payload defaults to ten');
});

behavior.scenario('corrupt settings extension fails before changing native rules or aliases', () => {
	const source = fixture(); const target = fixture();
	const rules = target.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(17); const read = rules.get_nutrient_cost_factor;
	for (kind of ['truncated', 'trailing', 'invalid_low', 'invalid_high', 'wrong_type']) {
		rejects(() => { target.restore_rules_settings(source.rules_settings_snapshot(kind)); });
		test.assert(read() == 17 && target.base.get_nutrient_factor() == 17, 'Rejected native decode must leave the complete previous value live');
	}
});

behavior.scenario('native factor preserves exact zero and unsupported contexts after rule import', () => {
	const f = fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(1); f.game.get_settings().global.map.preset_level = 0;
	test.assert(f.base.get_nutrient_factor() == 0, 'Recorded zero must not be clamped or substituted');
	rules.set_nutrient_cost_factor(11); f.game.get_settings().global.map.preset_level = (0 - 1);
	test.assert(!#is_defined(f.base.get_nutrient_factor()));
	f.game.get_settings().global.map.preset_level = 2; f.set_owner_role('none');
	test.assert(!#is_defined(f.base.get_nutrient_factor()));
});

behavior.scenario('native rules copy construction and assignment retain independent values and live aliases', () => {
	const f = fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(17);
	const result = f.rules_copy_probe();
	test.assert(result.constructor && result.assignment, 'Actual native copy paths preserve the multiplier');
	test.assert(result.independent && result.aliases, 'Copy mutation must neither alter sender state nor stale retained destination readers');
	test.assert(result.lifetime, 'Destroying a native copy must invalidate only its own detached callables');
	test.assert(rules.get_nutrient_cost_factor() == 17 && f.base.get_nutrient_factor() == 17);
});

behavior.scenario('retained rule callables reject after their owning native settings are destroyed', () => {
	const f = fixture(); const rules = f.game.get_settings().global.rules;
	const read = rules.get_nutrient_cost_factor; const write = rules.set_nutrient_cost_factor;
	f.reset();
	rejects(() => { read(); }); rejects(() => { write(11); });
});
