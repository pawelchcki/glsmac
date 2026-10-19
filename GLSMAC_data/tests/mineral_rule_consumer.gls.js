// Synthetic installed rules -> actual parser/consumers -> native global rules.
// Startup callbacks describe scalars; native S_Init owns the joint commit.
const behavior = #include('./_behavior');
const nutrient_consumer = #include('../default/game/nutrient_rules');
const source = (nutrient, mineral) => {
	return '#RULES\n31,\n; comments and blanks do not count as data rows\n\n41,\n51,61\n71,\n81,\n' + nutrient + '\n' + mineral + '\n91,\n#END\n';
};
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Invalid mineral rule must fail explicitly');
};

behavior.scenario('mineral consumer selects row six independently of neighboring nutrient data', () => {
	const consumer = #include('../default/game/mineral_rules');
	const doc = test.parse_smac_text(source('11,', '17, , ; trailing empty scalar fields'), 'rules');
	test.assert(consumer.parse(doc) == 17 && nutrient_consumer.parse(doc) == 11);
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(13);
	test.assert(#typeof(rules.set_mineral_cost_factor) == 'Callable' && #typeof(rules.get_mineral_cost_factor) == 'Callable');
	consumer.apply(doc, rules);
	test.assert(rules.get_mineral_cost_factor() == 17 && rules.get_nutrient_cost_factor() == 13);
	const rows = doc.rows('RULES');
	test.assert(rows[5] == ['11', ''] && rows[6] == ['17', '', ''], 'Import preserves native cached source data');
});

behavior.scenario('mineral canonical boundaries and parser padding remain valid scalar data', () => {
	const consumer = #include('../default/game/mineral_rules');
	for (entry of [['1,', 1], ['10,', 10], ['100,', 100], [' 11 , ,', 11], ['"17",', 17]]) {
		const doc = test.parse_smac_text(source('23,', entry[0]), 'rules');
		test.assert(consumer.parse(doc) == entry[1]);
	}
});

behavior.scenario('malformed mineral scalar syntax rejects before either native field changes', () => {
	const consumer = #include('../default/game/mineral_rules');
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(13); rules.set_mineral_cost_factor(19);
	const before = f.snapshot(); const updates = f.update_count();
	for (value of [',', '0,', '101,', '017,', '+17,', '-17,', '17.0,', '1e1,', '17x,', '17,extra', '17,,extra']) {
		const doc = test.parse_smac_text(source('11,', value), 'rules');
		rejects(() => { consumer.apply(doc, rules); });
		test.assert(rules.get_mineral_cost_factor() == 19 && rules.get_nutrient_cost_factor() == 13);
		test.assert(f.snapshot() == before && f.update_count() == updates);
	}
});

behavior.scenario('missing mineral row and missing or ambiguous blocks leave native rules unchanged', () => {
	const consumer = #include('../default/game/mineral_rules');
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(13); rules.set_mineral_cost_factor(19);
	const short_source = '#RULES\n31,\n41,\n51,61\n71,\n81,\n11,\n#END\n';
	for (text of ['#OTHER\n17,\n', short_source, source('11,', '17,') + source('23,', '29,')]) {
		const doc = test.parse_smac_text(text, 'rules');
		rejects(() => { consumer.apply(doc, rules); });
		test.assert(rules.get_mineral_cost_factor() == 19 && rules.get_nutrient_cost_factor() == 13);
	}
});

behavior.scenario('mineral scalar API leaves other rows uninterpreted', () => {
	const consumer = #include('../default/game/mineral_rules');
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(13); rules.set_mineral_cost_factor(19);
	const doc = test.parse_smac_text(source('uninterpreted neighboring nutrient field,extra', '17,'), 'rules');
	test.assert(consumer.parse(doc) == 17);
	consumer.apply(doc, rules);
	test.assert(rules.get_mineral_cost_factor() == 17 && rules.get_nutrient_cost_factor() == 13);
});

behavior.scenario('existing nutrient scalar parse and apply remain independent of malformed mineral data', () => {
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(13); rules.set_mineral_cost_factor(19);
	const doc = test.parse_smac_text(source('11,', 'uninterpreted mineral data,extra'), 'rules');
	test.assert(nutrient_consumer.parse(doc) == 11);
	nutrient_consumer.apply(doc, rules);
	test.assert(rules.get_nutrient_cost_factor() == 11 && rules.get_mineral_cost_factor() == 19);
});

behavior.scenario('actual startup registration returns separate pure nutrient and mineral scalars', () => {
	const f = test.production_fixture(); const rules = f.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(13); rules.set_mineral_cost_factor(19);
	const callbacks = {}; const glsmac = {};
	glsmac.game = { register_event: (name, handler) => {} };
	glsmac.on = (name, callback) => { callbacks[name] = callback; };
	#include('../default/game/game')(glsmac);
	const nutrient = callbacks.configure_rules; const mineral = callbacks.configure_mineral_rules;
	test.assert(#typeof(nutrient) == 'Callable' && #typeof(mineral) == 'Callable');
	const e = {}; e.document = test.parse_smac_text(source('11,', '17,'), 'rules');
	test.assert(nutrient(e) == 11 && mineral(e) == 17);
	test.assert(rules.get_nutrient_cost_factor() == 13 && rules.get_mineral_cost_factor() == 19, 'Callbacks must describe configuration without committing either field');
	const invalid = {}; invalid.document = test.parse_smac_text(source('11,', '017,'), 'rules');
	test.assert(nutrient(invalid) == 11);
	rejects(() => { mineral(invalid); });
	test.assert(rules.get_nutrient_cost_factor() == 13 && rules.get_mineral_cost_factor() == 19);
});
