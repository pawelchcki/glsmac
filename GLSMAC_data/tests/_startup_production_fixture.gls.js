// Equivalent source declarations and a loaded uniform map. No city resources,
// project, population or expected result is seeded by this fixture.
return (input) => {
	const width = #is_defined(input.world_width) ? input.world_width : 32;
	const height = #is_defined(input.world_height) ? input.world_height : 16;
	const f = test.natural_startup_fixture(width, height, 'flat-arid');
	const sources = #include('./_startup_faction_sources_fixture')({profile: input.text_profile});
	if (input.text_profile == 'gaian-industry-minus-1') {
		const lines = #split(sources.sources['gaians.txt'], '\n');
		lines[2] = lines[2] + ',SOCIAL,-INDUSTRY';
		let text = ''; for (line of lines) { text += line + '\n'; }
		sources.sources['gaians.txt'] = text; sources.reload();
	}
	sources.former_rows = input.text_profile == 'gaian-formers-cost-4' ? 4 : (input.text_profile == 'gaian-formers-cost-8' ? 8 : 0);
	sources.mineral_rule_factor = input.text_profile == 'gaian-mineral-rule-12' ? 12 : 10;
	if (#is_defined(input.declared_former_rows)) { sources.former_rows = input.declared_former_rows; }
	if (#is_defined(input.mineral_rule_factor)) { sources.mineral_rule_factor = input.mineral_rule_factor; }
	#include('./_natural_startup_mechanics')(f, sources);
	f.human = f.initialize_single_player(input.faction, input.difficulty == 'TALENT' ? 'Talent' : 'Citizen');
	f.game.get_settings().global.map.type = #is_defined(input.map_type) ? input.map_type : 'mapfile';
	const observed = {city: null, creation: null, failed: false};
	f.game.bm.on('base_spawn', (e) => {
		if (e.base.get_owner().id == f.human.id) { observed.city = e.base; observed.creation = e.base.get_production(); }
	});
	f.game.on('event_result', (e) => { if (!e.success) { observed.failed = true; } });
	f.start_world();
	test.assert(!observed.failed && observed.city != null && f.game.get_turn() == 1, 'Real first-turn queue settles successfully');
	f.city = observed.city; f.creation = observed.creation;
	return f;
};
