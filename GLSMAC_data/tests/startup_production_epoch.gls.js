// Application regressions use compact 32x16 worlds with the eight recorded
// source controls. Strict original projection separately uses declared 40x80.
const behavior = #include('./_behavior');
const fixture = #include('./_startup_production_fixture');
const rejects = (callback) => {
	let rejected = false; try { callback(); } catch { : (e) => { rejected = true; } }
	test.assert(rejected, 'Invalid initial production plan must reject');
};
behavior.scenario('counter one cannot credit a replacement first city after the real first tick', () => {
	const f = fixture({faction: 'GAIANS', difficulty: 'CITIZEN', text_profile: 'stock'});
	const tile = f.city.get_tile();
	f.with_write(() => { f.game.bm.despawn_base(f.city); });
	const count = #sizeof(f.game.bm.get_bases());
	test.assert(f.game.get_turn() == 1 && tile.get_base() == null);
	rejects(() => { f.with_write(() => { f.game.bm.spawn_base(f.human, tile, {facilities: [], initial_production: {choice_id: 'FORMERS', minerals: 8}}); }); });
	test.assert(#sizeof(f.game.bm.get_bases()) == count && tile.get_base() == null);
	let replacement = null;
	f.with_write(() => { replacement = f.game.bm.spawn_base(f.human, tile, {facilities: []}); replacement.select_production('FORMERS'); });
	test.assert(replacement.get_production() == {choice_id: 'FORMERS', minerals: 0, last_processed_turn: 1});
	// Receiving a positive saved turn calls production AdvanceTurn before world
	// initialization completes. Exercise that entry point without create_world
	// or any preexisting city, rather than pretending a fixture counter is resume.
	const resumed = test.natural_startup_fixture(32, 16, 'flat-arid');
	#include('./_natural_startup_mechanics')(resumed);
	resumed.initialize_declared_players(['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS']);
	const owner = resumed.game.get_player(0);
	resumed.game.get_settings().global.map.type = 'mapfile';
	resumed.configure_declared_world();
	resumed.with_write(() => {
		owner.add_production_choice('RECYCLING_TANKS', {type: 'facility', id: 'RECYCLING_TANKS'});
		for (unit of resumed.game.get('starting_unit_rules')) {
			if (unit.choice == 'FORMERS') { owner.add_production_choice(unit.choice, {type: 'unit', id: unit.id, cost: unit.rows * 10, cost_rows: unit.rows, population_cost: unit.population}); }
		}
	});
	let available = false;
	for (choice of owner.get_production_choices()) { if (choice.id == 'FORMERS' && choice.cost == 16) { available = true; } }
	test.assert(available && resumed.has_offline_single_player_roster() && #sizeof(resumed.game.bm.get_bases()) == 0);
	const empty_tile = resumed.game.tm.get_tile(4, 4);
	const choices_before = owner.get_production_choices();
	for (plan of [{choice_id: 'MISSING', minerals: 8}, {choice_id: 'RECYCLING_TANKS', minerals: 8},
		{choice_id: 'FORMERS', minerals: (0 - 1)}, {choice_id: 'FORMERS', minerals: 8, extra: true}]) {
		rejects(() => { resumed.with_write(() => { resumed.game.bm.spawn_base(owner, empty_tile, {facilities: [], initial_production: plan}); }); });
		test.assert(#sizeof(resumed.game.bm.get_bases()) == 0 && empty_tile.get_base() == null && resumed.game.get_turn() == 1);
		test.assert(owner.get_production_choices() == choices_before, 'Rejected plan preserves available projects and prices');
	}
	resumed.with_write(() => {
		const preview = resumed.game.bm.spawn_base(owner, empty_tile, {facilities: [], initial_production: {choice_id: 'FORMERS', minerals: 8}});
		test.assert(preview.get_production() == {choice_id: 'FORMERS', minerals: 8, last_processed_turn: 0});
		resumed.game.bm.despawn_base(preview);
	});
	resumed.with_write(() => { resumed.game.advance_turn(1); }); resumed.process_events();
	rejects(() => { resumed.with_write(() => { resumed.game.bm.spawn_base(owner, empty_tile, {facilities: [], initial_production: {choice_id: 'FORMERS', minerals: 8}}); }); });
	test.assert(resumed.game.get_turn() == 1 && #sizeof(resumed.game.bm.get_bases()) == 0 && empty_tile.get_base() == null);
	resumed.retire(); f.retire();
});

behavior.scenario('actual world reset permits exactly one new startup credit', () => {
	const f = fixture({faction: 'GAIANS', difficulty: 'CITIZEN', text_profile: 'stock'});
	test.assert(f.city.get_production().minerals == 9);
	f.reset_world('flat-arid');
	#include('./_natural_startup_mechanics')(f);
	const human = f.initialize_single_player('GAIANS', 'Citizen');
	f.game.get_settings().global.map.type = 'mapfile';
	f.start_world(); let city = null;
	for (base of f.game.bm.get_bases()) { if (base.get_owner().id == human.id) { city = base; } }
	test.assert(city != null && f.game.get_turn() == 1 && city.get_production().minerals == 9);
	f.process_events(); test.assert(city.get_production().minerals == 9);
	f.retire();
});
