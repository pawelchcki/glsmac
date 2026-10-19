const behavior = #include('./_behavior');
const source = (count, rows) => { return '#WORLDSIZE\n' + count + '\n' + rows + '\n#END\n'; };
const rows = 'Amber|Swift,6,8\nBirch,8,10\nCedar,10,12\nDune,12,14\nElm|Patient,14,16';
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Invalid world-size data must reject');
};
behavior.scenario('installed world-size rows become complete independent ordered native choices', () => {
	const consumer = #include('../default/game/world_sizes');
	const doc = test.parse_smac_text(source('5', rows), 'rules');
	const sizes = consumer.parse(doc);
	test.assert(#sizeof(sizes) == 5);
	for (level of [0, 1, 2, 3, 4]) {
		test.assert(sizes[level].level == level);
		test.assert(sizes[level].size_x == 12 + level * 4 && sizes[level].size_y == 8 + level * 2);
	}
	test.assert(sizes[0].name == 'Amber' && sizes[0].description == 'Swift');
	test.assert(sizes[1].name == 'Birch' && sizes[1].description == '');
	test.assert(sizes[4].name == 'Elm' && sizes[4].description == 'Patient');
	sizes[0].name = 'Changed';
	const again = consumer.parse(doc);
	const retained = doc.rows('WORLDSIZE');
	test.assert(again[0].name == 'Amber' && retained[0] == ['5']);
});
behavior.scenario('world-size source padding comments quoting and trailing empty fields remain data', () => {
	const consumer = #include('../default/game/world_sizes');
	const text = source('5, , ; count', '; ignored\n\n"Amber|Swift", 2, 2, ,\nBirch,2048,4096\nCedar,10,12\nDune,12,14\nElm,14,16');
	const sizes = consumer.parse(test.parse_smac_text(text, 'rules'));
	test.assert(sizes[0].size_x == 4 && sizes[0].size_y == 2 && sizes[0].description == 'Swift');
	test.assert(sizes[1].size_x == 4096 && sizes[1].size_y == 4096);
});
behavior.scenario('valid installed choices reach actual native state without changing cost multipliers', () => {
	const consumer = #include('../default/game/world_sizes');
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(17); rules.set_mineral_cost_factor(23);
	const doc = test.parse_smac_text(source('5', rows), 'rules');
	consumer.apply(doc, rules); const sizes = rules.get_world_sizes();
	test.assert(sizes[0].name == 'Amber' && sizes[0].description == 'Swift' && sizes[4].size_x == 28);
	test.assert(rules.get_nutrient_cost_factor() == 17 && rules.get_mineral_cost_factor() == 23);
});
behavior.scenario('bad world-size counts and record shapes reject before native mutation', () => {
	const consumer = #include('../default/game/world_sizes');
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	const before = f.rules_settings_snapshot('current');
	for (text of [source('4', rows), source('6', rows), source('05', rows), source('+5', rows), source('5.0', rows), source('5,extra', rows), source('5', rows + '\nExtra,16,18'), source('5', 'Amber,6,8\nBirch,8,10')]) {
		rejects(() => { consumer.apply(test.parse_smac_text(text, 'rules'), rules); });
		test.assert(f.rules_settings_snapshot('current') == before);
	}
});
behavior.scenario('bad dimensions and labels including a later row leave the whole native table unchanged', () => {
	const consumer = #include('../default/game/world_sizes');
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	const before = f.rules_settings_snapshot('current');
	for (row of ['Elm,0,16', 'Elm,1,16', 'Elm,2049,16', 'Elm,14,1', 'Elm,14,3', 'Elm,14,4098', 'Elm,014,16', 'Elm,+14,16', 'Elm,14x,16', 'Elm,14.0,16', 'Elm,14,1e1', 'Elm,14', 'Elm,14,16,extra', ',14,16', '|Only description,14,16', 'Elm|One|Two,14,16']) {
		const text = source('5', 'Amber,6,8\nBirch,8,10\nCedar,10,12\nDune,12,14\n' + row);
		rejects(() => { consumer.apply(test.parse_smac_text(text, 'rules'), rules); });
		test.assert(f.rules_settings_snapshot('current') == before);
	}
});
behavior.scenario('missing and ambiguous world-size blocks reject without fallback definitions', () => {
	const consumer = #include('../default/game/world_sizes');
	for (text of ['#OTHER\n5\n', source('5', rows) + source('5', rows)]) {
		rejects(() => { consumer.parse(test.parse_smac_text(text, 'rules')); });
	}
});
behavior.scenario('startup world-size callback is pure and independent of cost callbacks', () => {
	const f = test.production_fixture(); const before = f.rules_settings_snapshot('current');
	const callbacks = {}; const glsmac = {};
	glsmac.game = { register_event: (name, handler) => {} };
	glsmac.on = (name, callback) => { callbacks[name] = callback; };
	#include('../default/game/game')(glsmac);
	const configure = callbacks.configure_world_sizes;
	test.assert(#typeof(configure) == 'Callable', 'Startup must register the pure installed world-size callback');
	const e = {}; e.document = test.parse_smac_text(source('5', rows), 'rules');
	const sizes = configure(e);
	test.assert(sizes[2].name == 'Cedar' && sizes[2].size_x == 20 && sizes[2].size_y == 12);
	test.assert(f.rules_settings_snapshot('current') == before);
});
