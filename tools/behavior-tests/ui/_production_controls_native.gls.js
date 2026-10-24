const f = #include('./_startup_production_fixture')(production_input);
const state = f.city.get_production(); let recipe = null;
for (choice of f.human.get_production_choices()) { if (choice.id == state.choice_id) { recipe = choice; } }
test.assert(recipe != null && recipe.type == 'unit', 'Observe an available native production recipe');
const city = f.city; let workers = 0; let doctors = 0;
for (pop of city.get_pops()) { if (pop.get_type() == 'WORKER') { workers++; } else if (pop.get_type() == 'DOCTOR') { doctors++; } }
const intake = city.get_intake(); const consumption = city.get_consumption();
#print('PRODUCTION_NATIVE|' + #uppercase(recipe.name) + '|' + #to_string(state.minerals) + '|' + #to_string(recipe.cost) +
	'|' + #to_string(f.game.get_turn()) + '|' + #to_string(city.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) +
	'|' + #to_string(#sizeof(city.get_worked_tiles())) + '|' + #to_string(city.get('accumulated_nutrients')) +
	'|' + #to_string(intake.MINERALS) + '|' + #to_string(consumption.MINERALS));
f.retire();
