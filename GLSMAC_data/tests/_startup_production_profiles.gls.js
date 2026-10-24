// Shared application assertions; wrappers partition the same eight source controls.
const fixture = #include('./_startup_production_fixture');
return (behavior, profiles) => {
 for (profile of profiles) {
	const input = profile;
	behavior.scenario('loaded first-city production ' + input[0] + ' ' + input[1] + ' ' + input[2], () => {
		const f = fixture({faction: input[0], difficulty: input[1], text_profile: input[2]});
		const state = f.city.get_production(); let price = 0;
		for (choice of f.human.get_production_choices()) { if (choice.id == state.choice_id) { price = choice.cost + 0; } }
		test.assert(state.choice_id == input[3] && price == input[4], 'Native source-derived project and price');
		test.assert(state.minerals == input[5], 'Native settled mineral stock=' + #to_string(state.minerals));
		test.assert(f.creation.choice_id == state.choice_id && f.creation.minerals == state.minerals - 1 && f.creation.last_processed_turn == 0,
			'Creation credit precedes actual first income');
		test.assert(state.last_processed_turn == 1 && f.city.get_intake().MINERALS - f.city.get_consumption().MINERALS == 1);
		test.assert(f.game.get_settings().global.map.preset_level == (0 - 1) && f.game.get_settings().global.map.get_rule_size_kind() == 0);
		test.assert(f.game.tm.get_map_width() == 32 && f.game.tm.get_map_height() == 16);
		for (city of f.game.bm.get_bases()) {
			if (city.get_owner().id != f.human.id) { test.assert(city.get_production().minerals == 0, 'Computer startup remains outside the human credit'); }
		}
		const before = f.city.get_production(); f.process_events();
		test.assert(f.city.get_production() == before, 'Draining the settled queue cannot apply opening income twice');
		f.retire();
	});
}
};
