const behavior = #include('./_behavior');
const consumer = #include('../default/game/faction_ratings');
const parse = (record) => { return consumer.parse(test.parse_smac_text('#SYNTHETIC\nHeader\n' + record + '\n#END\n', 'dialogs'), 'SYNTHETIC'); };
behavior.scenario('source social magnitudes accumulate independently and tolerate a trailing delimiter', () => {
	test.assert(parse('SOCIAL,++GROWTH,SOCIAL,-GROWTH,SOCIAL,---INDUSTRY,') == {growth: 1, industry: (0 - 3)});
	test.assert(parse('TECH,Synthetic,SOCIAL,++RESEARCH') == {growth: 0, industry: 0});
});
let index = 0;
for (record of ['SOCIAL', 'SOCIAL,GROWTH', 'SOCIAL,+-INDUSTRY', 'SOCIAL,-----------GROWTH', 'SOCIAL,+++++++++++INDUSTRY']) {
	const ordinal = index; index++;
	behavior.scenario('malformed or unsupported social input rejects before configuration ' + #to_string(ordinal), () => {
		let rejected = false; try { parse(record); } catch { : (e) => { rejected = true; } }
		test.assert(rejected);
	});
}
behavior.scenario('native growth and mineral descriptors use distinct calibrated faction ratings', () => {
	const f = #include('./_facility_cost_fixture')(0);
	f.apply_faction_ratings({growth: 2, industry: (0 - 3)});
	test.assert(f.base.get_nutrient_factor() == 7);
	let cost = 0; for (choice of f.owner.get_production_choices()) { if (choice.id == 'OBSERVED_TANKS') { cost = choice.cost; } }
	test.assert(cost == 44, 'Four declared rows use the original no-base INDUSTRY factor11');
});
behavior.scenario('native rating wrappers and faction codecs own detached values', () => {
	const f = test.production_fixture(); const input = {growth: (0 - 1), industry: 2};
	const faction = f.apply_faction_ratings(input); input.growth = 5; faction.social_ratings.industry = 9;
	test.assert(f.owner.get_faction().social_ratings == {growth: (0 - 1), industry: 2});
	const codec = f.faction_identity_codec(); test.assert(codec.received && codec.roundtrip && codec.independent);
});
behavior.scenario('full native State transfer preserves nonzero faction ratings independently', () => {
	const f = test.production_fixture(); const wire = f.state_rules_wire_probe();
	test.assert(wire.ratings_received && wire.factions);
	test.assert(wire.roundtrip && wire.independent);
});
let ordinal = 0;
for (input of [{growth: 0}, {growth: 0, industry: 0, extra: 1}, {growth: false, industry: 0}, {growth: 0, industry: 1.0},
	{growth: (0 - 9), industry: 0}, {growth: 0, industry: 11}]) {
	const number = ordinal; ordinal++;
	behavior.scenario('invalid native rating payload leaves both previous values intact ' + #to_string(number), () => {
		const f = test.production_fixture(); f.apply_faction_ratings({growth: 1, industry: (0 - 1)}); let rejected = false;
		try { f.apply_faction_ratings(input); } catch { : (e) => { rejected = true; } }
		test.assert(rejected); test.assert(f.owner.get_faction().social_ratings == {growth: 1, industry: (0 - 1)});
	});
}
