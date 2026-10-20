const make = #include('./_faction_ratings_fixture');
const factions = #include('../default/factions');
const nutrient = #include('../default/game/nutrient_rules');
const mineral = #include('../default/game/mineral_rules');
const catalog = factions.source_catalog();
let count = 0;
for (input of faction_inputs) {
	const data = make(input.profile); const native = test.production_fixture();
	const definitions = {};
	factions.configure({
		add: (id, definition) => { definitions[id] = definition; },
		import_colors: (name) => { return {}; }, import_base_names: (name) => { return {}; },
	}, data.glsmac);
	const index = (input.preset == 'base' ? 0 : 7) + input.slot; const id = catalog[index].id;
	const actual = native.apply_faction_ratings(definitions[id].social_ratings);
	const document = data.glsmac.load_smac_text('alphax.txt', 'rules');
	const nr = nutrient.parse(document); const mr = mineral.parse(document);
	const rules = native.game.get_settings().global.rules;
	rules.set_nutrient_cost_factor(nr); rules.set_mineral_cost_factor(mr);
	const codec = native.faction_identity_codec();
	test.assert(codec.received && codec.roundtrip && codec.independent, 'Actual native codecs preserve imported faction ratings');
	#print('RATINGS_RESULT|' + input.id + '|' + #to_string(actual.social_ratings.growth) + '|' + #to_string(actual.social_ratings.industry) + '|' +
		#to_string(rules.get_nutrient_cost_factor()) + '|' + #to_string(rules.get_mineral_cost_factor()));
	count++;
}
#print('RATINGS_DONE|' + #to_string(count));
