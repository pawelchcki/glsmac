// Only the no-base factor at modeled default rule10/GROWTH0 is integrated.
// Expected factors are recorded economy.human_nutrient_factor.v1 observations.
const behavior = #include('./_behavior');
const fixture = (level) => {
	const f = test.production_fixture();
	f.game.get_settings().global.map.preset_level = level;
	return f;
};

for (entry of [[0, 8], [1, 9], [2, 10], [3, 10], [4, 10]]) {
	behavior.scenario('readonly native nutrient factor uses explicit named preset ' + #to_string(entry[0]), () => {
		const f = fixture(entry[0]); const before = f.snapshot();
		test.assert(#typeof(f.base.get_nutrient_factor) == 'Callable', 'Base must expose the readonly no-argument nutrient factor API');
		test.assert(f.base.get_nutrient_factor() == entry[1]);
		test.assert(f.snapshot() == before && f.update_count() == 0, 'Reading the factor must not mutate base state or publish updates');
	});
}

for (role of ['single', 'host', 'player', 'none']) {
	behavior.scenario('native nutrient factor supports only modeled human role ' + role, () => {
		const f = fixture(1); f.set_owner_role(role);
		const actual = f.base.get_nutrient_factor();
		if (role == 'none') { test.assert(!#is_defined(actual)); }
		else { test.assert(actual == 9); }
	});
}

behavior.scenario('native nutrient factor rejects extra arguments', () => {
	const f = fixture(1); let rejected = false;
	try { f.base.get_nutrient_factor(1); }
	catch { GSEInvalidCall: (e) => { rejected = true; } }
	test.assert(rejected && f.base.get_nutrient_factor() == 9);
});

behavior.scenario('unknown preset dimensions do not infer a nutrient factor', () => {
	const f = fixture(0 - 1); const map = f.game.get_settings().global.map;
	for (dimensions of [[68, 34], [88, 44], [112, 56], [400, 200]]) {
		map.size_x = dimensions[0]; map.size_y = dimensions[1];
		test.assert(!#is_defined(f.base.get_nutrient_factor()));
	}
});

for (change of ['size_x', 'size_y', 'mapfile', 'planet', 'huge_planet']) {
	behavior.scenario('actual native settings invalidate nutrient provenance after ' + change, () => {
		const f = fixture(1); const map = f.game.get_settings().global.map;
		test.assert(f.base.get_nutrient_factor() == 9);
		if (change == 'size_x') { map.size_x = 88; }
		else if (change == 'size_y') { map.size_y = 44; }
		else { map.type = change; }
		test.assert(map.preset_level == (0 - 1) && !#is_defined(f.base.get_nutrient_factor()));
	});
}

for (kind of ['current', 'legacy']) {
	behavior.scenario('native nutrient query reads receiving settings provenance after decode ' + kind, () => {
		const source = fixture(0); const target = fixture(1);
		target.restore_map_settings(source.map_settings_snapshot(kind));
		if (kind == 'current') { test.assert(target.base.get_nutrient_factor() == 8); }
		else { test.assert(!#is_defined(target.base.get_nutrient_factor())); }
	});
}
