// Application regression for the shared setup seam; no opponent-count parity
// assertion. The original ownership comparison remains separately pending.
const behavior = #include('./_behavior');
behavior.scenario('Empty native startup and production human-slot initialization', () => {
	const f = test.world_startup_fixture(40, 80);
	const game = f.game;
	const updates = {count: 0, player_id: null};
	game.on('player_update', (e) => { updates.count = updates.count + 1; updates.player_id = e.player.id; });
	test.assert(#sizeof(game.get_players()) == 0, 'No fixture player is seeded');
	test.assert(#sizeof(game.bm.get_bases()) == 0, 'No fixture base is seeded');
	let rejected = false;
	try { f.initialize_single_player('MISSING'); }
	catch { : (error) => { rejected = true; } }
	test.assert(rejected, 'Unknown faction rejects before participant initialization');
	test.assert(#sizeof(game.get_players()) == 0, 'Rejected faction leaves the world empty');
	const sources = #include('./_startup_faction_sources_fixture')({});
	#include('../default/factions').configure({
		add: (id, data) => { f.fm.add(id, data); },
		import_colors: (name) => { return f.colors; },
		import_base_names: (name) => { return {land: ['Synthetic City'], water: ['Synthetic Port']}; },
	}, sources.glsmac);
	const human = f.initialize_single_player('GAIANS');
	test.assert(human.id == 0 && game.get_player().id == human.id, 'Native current player uses the production human slot');
	test.assert(human.name == 'Player', 'Unconfirmed empty name retains the production default');
	test.assert(human.is_ready(), 'Production human slot is ready');
	test.assert(updates.count > 0 && updates.player_id == human.id, 'Ready notification reaches the State-associated native game');
	test.assert(human.get_faction().id == 'GAIANS', 'Selected native faction is preserved');
	test.assert(#sizeof(game.bm.get_bases()) == 0, 'Participant initialization does not fabricate bases');
	const count = #sizeof(game.get_players());
	rejected = false;
	try { f.initialize_single_player('GAIANS'); }
	catch { : (error) => { rejected = true; } }
	test.assert(rejected && #sizeof(game.get_players()) == count, 'Repeated fixture initialization rejects without changing participants');
});
