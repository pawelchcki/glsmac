// Real text parser -> bounded consumer -> native rules -> shipped growth.
const behavior = #include('./_behavior');
const growth_fixture = #include('./_growth_factor_fixture');
const mocks = #include('./_ui_mocks');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const nutrients = #include('../default/ui/parts/game/popup/base_screen/nutrients');
const source = (value) => {
	return '#RULES\n31,\n; comments and blank records are not rows\n\n41,\n51,61\n71,\n81,\n' + value + '\n91,\n#END\n';
};
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Malformed installed rule must fail explicitly');
};

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

behavior.scenario('actual parsed scalar row selects data row five field zero and feeds native factor', () => {
	const consumer = #include('../default/game/nutrient_rules');
	const doc = test.parse_smac_text(source('11, , ; allowed trailing empty fields'), 'rules');
	test.assert(consumer.parse(doc) == 11, 'Physical lines and neighboring row values must not select the multiplier');
	const f = test.production_fixture(); f.game.get_settings().global.map.preset_level = 2;
	consumer.apply(doc, f.game.get_settings().global.rules);
	test.assert(f.base.get_nutrient_factor() == 11);
	const imported_rows = doc.rows('RULES');
	test.assert(imported_rows[5] == ['11', '', ''], 'Import leaves cached source rows unchanged');
});

behavior.scenario('canonical boundary values survive production parser and consumer', () => {
	const consumer = #include('../default/game/nutrient_rules');
	for (entry of [['1,', 1], ['10,', 10], ['100,', 100]]) {
		const doc = test.parse_smac_text(source(entry[0]), 'rules');
		test.assert(consumer.parse(doc) == entry[1]);
	}
});

behavior.scenario('imported native multiplier drives twenty-two actual nutrient-section cells', () => {
	const consumer = #include('../default/game/nutrient_rules');
	const f = growth_fixture(2); f.store(0);
	consumer.apply(test.parse_smac_text(source('11,'), 'rules'), f.game.get_settings().global.rules);
	test.assert(f.base.get_nutrient_factor() == 11);
	test.assert(food_cells(f) == 22, 'Actual base screen and nutrient section must consume the native imported factor');
});

behavior.scenario('actual game registration returns parsed startup rules without mutating settings', () => {
	const f = test.production_fixture(); const callbacks = {};
	const glsmac = {};
	glsmac.game = { register_event: (name, handler) => {} };
	glsmac.on = (name, callback) => { callbacks[name] = callback; };
	#include('../default/game/game')(glsmac);
	const configure = callbacks.configure_rules;
	test.assert(#typeof(configure) == 'Callable', 'Both native startup routes require the shipped configure_rules registration');
	const e = {}; e.document = test.parse_smac_text(source('11,'), 'rules');
	test.assert(configure(e) == 11);
	test.assert(f.game.get_settings().global.rules.get_nutrient_cost_factor() == 10, 'Startup callback describes a value; native startup owns the commit');
	const invalid = {}; invalid.document = test.parse_smac_text(source('011,'), 'rules');
	rejects(() => { configure(invalid); });
	test.assert(f.game.get_settings().global.rules.get_nutrient_cost_factor() == 10);
});

behavior.scenario('invalid scalar syntax and additional nonempty fields leave native settings unchanged', () => {
	const consumer = #include('../default/game/nutrient_rules');
	const f = test.production_fixture(); f.game.get_settings().global.map.preset_level = 2;
	const rules = f.game.get_settings().global.rules; rules.set_nutrient_cost_factor(17);
	const before = f.snapshot(); const updates = f.update_count();
	for (value of [',', '0,', '101,', '011,', '+11,', '-11,', '11.0,', '1e1,', '11x,', '11,extra', '11,,extra']) {
		const doc = test.parse_smac_text(source(value), 'rules');
		rejects(() => { consumer.apply(doc, rules); });
		test.assert(rules.get_nutrient_cost_factor() == 17 && f.base.get_nutrient_factor() == 17);
		test.assert(f.snapshot() == before && f.update_count() == updates);
	}
});

behavior.scenario('missing and ambiguous mapped blocks or rows reject without changing settings', () => {
	const consumer = #include('../default/game/nutrient_rules');
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(17);
	for (text of ['#OTHER\n11,\n', '#RULES\n31,\n41,\n51,61\n71,\n81,\n', source('11,') + source('23,')]) {
		const doc = test.parse_smac_text(text, 'rules');
		rejects(() => { consumer.apply(doc, rules); });
		test.assert(rules.get_nutrient_cost_factor() == 17);
	}
});

for (overflow of [0, 3]) {
	behavior.scenario('imported multiplier reaches actual growth threshold and nutrient reset with overflow ' + #to_string(overflow), () => {
		const consumer = #include('../default/game/nutrient_rules');
		const f = growth_fixture(2);
		consumer.apply(test.parse_smac_text(source('11,'), 'rules'), f.game.get_settings().global.rules);
		f.store(21); f.turn();
		test.assert(f.base.get_size() == 1 && f.base.get('accumulated_nutrients') == 21, 'Former threshold twenty must not grow');
		f.store(22 + overflow); f.turn();
		test.assert(f.base.get_size() == 2 && f.base.get('accumulated_nutrients') == overflow, 'Consume exactly the imported pre-growth threshold');
	});
}
