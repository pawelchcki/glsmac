// Application edge cases, outside the eight original source profiles.
const behavior = #include('./_behavior');
const fixture = #include('./_startup_production_fixture');
for (entry of [[2, 1], [1, 0]]) {
	const input = entry;
	behavior.scenario('zero creation bonus retains actual first income at mineral rule ' + #to_string(input[0]), () => {
		const f = fixture({faction: 'GAIANS', difficulty: 'CITIZEN', text_profile: 'stock', declared_former_rows: 1, mineral_rule_factor: input[0]});
		const state = f.city.get_production(); let price = (0 - 1); let formers = 0;
		for (choice of f.human.get_production_choices()) { if (choice.id == 'FORMERS') { price = choice.cost + 0; } }
		for (unit of f.city.get_tile().get_units()) { if (unit.owner == f.human.id && unit.get_def().id == 'Formers') { formers++; } }
		#print('ZERO_CREDIT|rule=' + #to_string(input[0]) + '|price=' + #to_string(price) + '|formers=' + #to_string(formers) +
			'|project=' + state.choice_id + '|minerals=' + #to_string(state.minerals) + '|epoch=' + #to_string(state.last_processed_turn));
		const first_income = f.city.get_intake().MINERALS - f.city.get_consumption().MINERALS;
		test.assert(price == input[1] && first_income == 1);
		test.assert(state == {choice_id: 'FORMERS', minerals: first_income, last_processed_turn: 1}, 'First actual income is credited even when creation bonus is zero');
		test.assert(f.creation == {choice_id: 'FORMERS', minerals: 0, last_processed_turn: 0}, 'Zero is an eligible creation credit');
		f.process_events(); test.assert(f.city.get_production() == state);
		// Production precedes initial growth, so the existing zero-population
		// completion guard retains this project until the next actual turn.
		test.assert(formers == 0 && f.city.get_size() == 1);
		const next_income = f.city.get_intake().MINERALS - f.city.get_consumption().MINERALS;
		test.assert(next_income == first_income);
		f.with_write(() => { f.game.advance_turn(2); }); f.process_events();
		formers = 0;
		for (unit of f.city.get_tile().get_units()) { if (unit.owner == f.human.id && unit.get_def().id == 'Formers') { formers++; } }
		test.assert(formers == 1, 'A real populated city completes the native Former on turn two');
		test.assert(f.city.get_production() == {choice_id: '', minerals: first_income + next_income - price, last_processed_turn: 2});
		f.retire();
	});
}
