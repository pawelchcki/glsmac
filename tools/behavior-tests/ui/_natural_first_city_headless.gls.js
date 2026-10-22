// Observe real startup. No city/roster/store writes or overridden mechanics.
const f = test.natural_startup_fixture(city_input.world_width, city_input.world_height, city_input.terrain);
const game = f.game;
test.assert(#sizeof(game.get_players()) == 0 && #sizeof(game.bm.get_bases()) == 0, 'Native fixture begins without owners or cities');
#include('./_natural_startup_mechanics')(f, city_sources);
const difficulties = {CITIZEN: 'Citizen', SPECIALIST: 'Specialist', TALENT: 'Talent', LIBRARIAN: 'Librarian', THINKER: 'Thinker', TRANSCEND: 'Transcend'};
const difficulty = difficulties[city_input.difficulty];
// Reference source block IDs differ from the production native faction IDs.
const factions = {GAIANS: 'GAIANS', HIVE: 'HIVE', UNIV: 'UNIVERSITY', MORGAN: 'MORGANITES',
	SPARTANS: 'SPARTANS', BELIEVE: 'BELIEVERS', PEACE: 'PEACEKEEPERS'};
const human = f.initialize_single_player(factions[city_input.faction], difficulty);
if (#is_defined(city_sources)) {
	const files = {GAIANS: 'gaians', HIVE: 'hive', UNIV: 'univ', MORGAN: 'morgan',
		SPARTANS: 'spartans', BELIEVE: 'believe', PEACE: 'peace'};
	const document = city_sources.glsmac.load_smac_text(files[city_input.faction] + '.txt', 'dialogs');
	const declared_technologies = #include('../default/game/faction_starting_technologies').parse(document, city_input.faction);
	test.assert(human.get_faction().starting_technologies == declared_technologies,
		'Selected source technology tokens reach the actual native human faction');
	for (token of human.get_faction().starting_technologies) { #print('CITY_DIAGNOSTIC|starting_technology|' + token); }
}
test.assert(game.get_settings().global.difficulty_level == difficulty && f.get_player_difficulty() == difficulty,
	'Declared difficulty reaches actual native State and Player');
const receipts = {failed: false, count: 0, birth_count: 0};
game.on('event_result', (e) => { receipts.count = receipts.count + 1; if (!e.success) { receipts.failed = true; } });
game.bm.on('base_spawn', (e) => {
	if (e.base.get_owner().id == human.id) {
		receipts.birth_count = receipts.birth_count + 1;
	}
});
f.start_world();
test.assert(!receipts.failed && receipts.count > 0, 'Native startup event queue settled without rejection');
test.assert(#typeof(game.get('f_base_process_growth')) == 'Callable', 'Actual native start installed shipped growth lifecycle');
let city = null; let count = 0;
for (base of game.bm.get_bases()) {
	if (base.get_owner().id == human.id) { city = base; count++; }
}
test.assert(city != null && receipts.birth_count == 1, 'Actual world startup produced a human first city');
// Native Game::FirstTurn establishes playable turn 1 (MY2101); the raw
// current turn is read after queue settlement, so a later turn cannot normalize to zero.
test.assert(game.get_turn() == 1, 'First playable native turn reached without a second advance');
const tile = city.get_tile();
test.assert(tile.is_land && tile.moisture == 1 && tile.rockiness == 1, 'Accepted arid case uses native flat arid land');
let workers = 0; let specialists = 0;
for (pop of city.get_pops()) {
	if (pop.get_type() == 'WORKER') { workers++; } else { specialists++; }
}
const nutrients = city.get('accumulated_nutrients');
test.assert(#typeof(nutrients) == 'Int', 'Nutrients must be initialized by production lifecycle');
// Read-only diagnostics distinguish declared inputs and actual policy decisions.
const print_yield = (label, square) => {
	const yield = square.get_resources(human);
	#print('CITY_DIAGNOSTIC|' + label + '|x=' + #to_string(square.x) + '|y=' + #to_string(square.y) +
		'|moisture=' + #to_string(square.moisture) + '|rockiness=' + #to_string(square.rockiness) +
		'|N=' + #to_string(yield.NUTRIENTS) + '|M=' + #to_string(yield.MINERALS) + '|E=' + #to_string(yield.ENERGY));
};
print_yield('center', tile);
for (square of city.get_workable_tiles()) { print_yield(city.is_tile_worked(square) ? 'worked' : 'unworked', square); }
const production = city.get_production();
const map_settings = game.get_settings().global.map;
#print('CITY_DIAGNOSTIC|settings|map_type=' + map_settings.type + '|size_kind=' + #to_string(map_settings.preset_level));
#print('CITY_DIAGNOSTIC|production|choice=' + production.choice_id + '|minerals=' + #to_string(production.minerals) +
	'|last_turn=' + #to_string(production.last_processed_turn));
for (choice of human.get_production_choices()) {
	if (choice.id == production.choice_id) { #print('CITY_DIAGNOSTIC|project|cost=' + #to_string(choice.cost)); }
}
const intake = city.get_intake(); const consumption = city.get_consumption();
#print('CITY_DIAGNOSTIC|intake|N=' + #to_string(intake.NUTRIENTS) + '|M=' + #to_string(intake.MINERALS) + '|E=' + #to_string(intake.ENERGY));
#print('CITY_DIAGNOSTIC|consumption|N=' + #to_string(consumption.NUTRIENTS) + '|M=' + #to_string(consumption.MINERALS) + '|E=' + #to_string(consumption.ENERGY));
#print('NATURAL_CASE|' + city_case_id);
#print('NATURAL_CITY|' + #to_string(city.get_size()) + '|' + #to_string(workers) + '|' + #to_string(specialists) +
	'|' + #to_string(#sizeof(city.get_worked_tiles())) + '|' + #to_string(nutrients) +
	'|' + #to_string(city.get_production().minerals) + '|' + #to_string(count) + '|' + #to_string(game.get_turn() - 1));
#print('NATURAL_END');
