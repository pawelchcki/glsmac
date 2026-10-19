// Recorded nutrient factors feed GLSMAC's existing (size + 1) growth policy.
// Thresholds, population changes and food cells are application regressions,
// not observations establishing complete original-game growth behavior.
const behavior = #include('./_behavior');
const fixture = #include('./_growth_factor_fixture');
const mocks = #include('./_ui_mocks');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const nutrients = #include('../default/ui/parts/game/popup/base_screen/nutrients');

const food_cells = (f) => {
	const display = mocks.display();
	screen.p = {}; screen.p.game = f.rules; screen.p.ui = display.ui;
	screen.production_selection = null;
	screen.sections = {};
	for (name of ['economy', 'game_state', 'facilities', 'resources', 'energy', 'middle_area', 'bottom_bar']) {
		screen.sections[name] = { set: (data) => {}, set_commerce: (data) => {}, set_energy_grid: (data) => {} };
	}
	const p = {}; p.body = display.root; p.ui = display.ui;
	p.utils = {}; p.utils.set_cells = screen.set_cells;
	nutrients.init(p); screen.sections.nutrients = nutrients;
	screen.set({ base: f.base });
	return #sizeof(nutrients.growth_cells.children);
};

for (entry of [[0, 8], [1, 9], [2, 10], [3, 10], [4, 10]]) {
	behavior.scenario('shipped growth reaches named preset threshold and consumes that threshold ' + #to_string(entry[0]), () => {
		const f = fixture(entry[0]); const threshold = entry[1] * 2;
		f.store(threshold - 1); f.turn();
		test.assert(f.base.get_size() == 1 && f.base.get('accumulated_nutrients') == threshold - 1);
		f.store(threshold); f.turn();
		test.assert(f.base.get_size() == 2, 'Actual shipped growth callback must use the recorded factor at its exact threshold');
		test.assert(f.base.get('accumulated_nutrients') == 0, 'Actual population event must consume the same pre-growth threshold');
	});
	behavior.scenario('shipped growth preserves overflow using named preset factor ' + #to_string(entry[0]), () => {
		const f = fixture(entry[0]); f.store(entry[1] * 2 + 3); f.turn();
		test.assert(f.base.get_size() == 2 && f.base.get('accumulated_nutrients') == 3);
	});
	behavior.scenario('actual base screen food cell count agrees with named preset threshold ' + #to_string(entry[0]), () => {
		const f = fixture(entry[0]); f.store(0);
		test.assert(food_cells(f) == entry[1] * 2, 'Actual nutrient section must use the per-base factor for its columns');
		const factor = f.rules.get('f_base_get_nutrient_factor');
		test.assert(#typeof(factor) == 'Callable' && factor(f.base) == entry[1]);
	});
}

for (kind of ['unknown', 'custom', 'mapfile', 'planet', 'huge_planet', 'none']) {
	behavior.scenario('unsupported growth context retains area fallback for threshold reset and screen ' + kind, () => {
		const f = fixture(1); const map = f.game.get_settings().global.map;
		if (kind == 'unknown') { map.preset_level = (0 - 1); }
		else if (kind == 'custom') { map.size_x = 88; }
		else if (kind == 'none') { f.set_owner_role('none'); }
		else { map.type = kind; }
		// The actual fixture TM is 4x4; its pre-existing area fallback is 10.
		f.store(18); f.turn();
		test.assert(f.base.get_size() == 1 && f.base.get('accumulated_nutrients') == 18);
		test.assert(food_cells(f) == 20);
		f.store(23); f.turn();
		test.assert(f.base.get_size() == 2 && f.base.get('accumulated_nutrients') == 3);
	});
}

behavior.scenario('live preset changes reach threshold reset and screen without restarting callbacks', () => {
	const f = fixture(2); f.store(18); f.turn();
	test.assert(f.base.get_size() == 1);
	f.game.get_settings().global.map.preset_level = 1;
	test.assert(food_cells(f) == 18);
	f.turn();
	test.assert(f.base.get_size() == 2 && f.base.get('accumulated_nutrients') == 0);
});
