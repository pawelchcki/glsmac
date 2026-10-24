// Production participant regression; original placement/AI parity remains separately pending.
const behavior = #include('./_behavior');
const configure_roster = (f, base_only) => {
	#include('../default/factions').configure({add: (id, data) => {
		let included = true;
		if (#is_defined(base_only) && base_only) {
			included = false;
			for (stock of ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS']) { if (id == stock) { included = true; } }
		}
		if (included) { f.fm.add(id, data); }
	}, import_colors: (name) => { return f.colors; }, import_base_names: (name) => { return {land: ['Synthetic City'], water: ['Synthetic Port']}; }});
};

behavior.scenario('Displayed expansion roster and an edited opponent create the exact native participants', () => {
	const f = test.world_startup_fixture(40, 80); configure_roster(f);
	const ids = ['CONSCIOUSNESS', 'PIRATES', 'GAIANS', 'ANGELS', 'PLANETCULT', 'CARETAKERS', 'USURPERS'];
	f.initialize_roster('ANGELS', {factions: ids, human_slot: 3, random_human: false});
	const players = f.game.get_players(); test.assert(#sizeof(players) == 7);
	const expected = ['ANGELS', 'CONSCIOUSNESS', 'PIRATES', 'GAIANS', 'PLANETCULT', 'CARETAKERS', 'USURPERS'];
	for (let index = 0; index < 7; index++) { test.assert(players[index].get_faction().id == expected[index], 'Native human slot zero preserves the remaining displayed row order'); }
	test.assert(f.participant_codec_invariant());
});

behavior.scenario('Malformed displayed rosters reject atomically and permit a corrected retry', () => {
	const f = test.world_startup_fixture(40, 80); configure_roster(f, true);
	for (ids of [
		['GAIANS'],
		['GAIANS', 'HIVE', 'MISSING', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'],
		['HIVE', 'GAIANS', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'],
	]) {
		let rejected = false; try { f.initialize_roster('GAIANS', {factions: ids, human_slot: 0, random_human: false}); } catch { GSEGameError: (error) => { rejected = true; } }
		test.assert(rejected && #sizeof(f.game.get_players()) == 0, 'A bad choice leaves every participant unallocated');
	}
	f.initialize_roster('GAIANS', {factions: ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'], human_slot: 0, random_human: false});
	test.assert(#sizeof(f.game.get_players()) == 7, 'A corrected request uses the same empty native state');
});

behavior.scenario('Direct native human identity setup leaves a duplicate opponent and the catalog unchanged', () => {
	const f = test.world_startup_fixture(16, 16); configure_roster(f, true);
	const catalog = f.fm.list(); const original = #clone(catalog[0].identity);
	const authored = #clone(original); authored[0] = 'Trace Commander';
	f.initialize_roster('GAIANS', {factions: ['GAIANS', 'GAIANS', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'], human_slot: 0, random_human: false}, authored);
	const players = f.game.get_players();
	test.assert(players[0].get_faction().identity == authored && players[1].get_faction().identity == original);
	const templates = f.fm.list(); test.assert(templates[0].identity == original);
	test.assert(#sizeof(f.game.bm.get_bases()) == 0, 'Identity isolation needs no world-placement fixture');
});

behavior.scenario('A native failure returned after the owner drain invalidates actual queued startup callbacks', () => {
	const f = test.world_startup_fixture(16, 16); configure_roster(f, true);
	f.initialize_single_player('GAIANS');
	test.assert(f.probe_queued_init_failure(), 'Owned error survives backend return and stale initialize/configure do not recreate the failed session');
});

behavior.scenario('An undersized custom world rejects before creating any native participant', () => {
	for (size of [[4, 2], [4, 4], [4, 8]]) {
		const f = test.world_startup_fixture(size[0], size[1]); configure_roster(f, true);
		let rejected = false;
		try { f.initialize_single_player('GAIANS'); } catch { GSEGameError: (error) => { rejected = error.reason == 'Choose a larger map: seven factions need starting tiles at least two steps apart'; } }
		test.assert(rejected && #sizeof(f.game.get_players()) == 0 && #sizeof(f.game.bm.get_bases()) == 0);
	}
});

behavior.scenario('Small maps that can fit seven separated sites remain selectable', () => {
	for (size of [[4, 14], [8, 8]]) {
		const f = test.world_startup_fixture(size[0], size[1]); configure_roster(f, true);
		f.initialize_single_player('GAIANS');
		test.assert(#sizeof(f.game.get_players()) == 7, 'Feasible small grids are accepted without changing the roster');
	}
});

behavior.scenario('Actual imported and CLI-sized grids are checked independently of setup dimensions', () => {
	for (type of ['mapfile', 'random']) {
		const f = test.world_startup_fixture(4, 2);
		const map = f.game.get_settings().global.map; map.type = type;
		test.assert(map.size_x > 4 && map.size_y > 2, 'The setup still describes a different, larger map');
		test.assert(f.startup_map_error() != '', 'Post-load validation uses actual map geometry for imports and effective CLI dimensions');
		test.assert(#sizeof(f.game.get_players()) == 0 && #sizeof(f.game.bm.get_bases()) == 0);
		f.enable_transport();
		test.assert(f.startup_map_error() == '', 'Network startup retains its existing separate roster contract');
	}
});

behavior.scenario('Empty native startup and production human-slot initialization', () => {
	const f = test.world_startup_fixture(40, 80);
	const game = f.game;
	const updates = {count: 0, player_id: null};
	game.on('player_update', (e) => { updates.count = updates.count + 1; if (e.player.id == 0) { updates.player_id = e.player.id; } });
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
	test.assert(count == 7, 'Ordinary initializer creates all seven actual participants');
	const expected = ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
	let index = 0;
	for (player of game.get_players()) {
		test.assert(player.id == index && player.get_faction().id == expected[index], 'Roster preserves configured stock order');
		test.assert(player.type == (index == 0 ? 'human' : 'computer') && player.is_ready(), 'Computer has explicit role and readiness');
		test.assert(player.is_master == (index == 0), 'Computer has no host authority');
		index++;
	}
	rejected = false;
	try { f.initialize_single_player('GAIANS'); }
	catch { : (error) => { rejected = true; } }
	test.assert(rejected && #sizeof(game.get_players()) == count, 'Repeated fixture initialization rejects without changing participants');
});

behavior.scenario('Selected expansion faction and declared source order retain the seven-slot limit', () => {
	const f = test.world_startup_fixture(40, 80);
	const declarations = {};
	#include('../default/factions').configure({
		add: (id, data) => { declarations[id] = data; },
		import_colors: (name) => { return f.colors; },
		import_base_names: (name) => { return {land: ['Synthetic City'], water: ['Synthetic Port']}; },
	});
	const order = ['PIRATES', 'PEACEKEEPERS', 'BELIEVERS', 'SPARTANS', 'MORGANITES', 'UNIVERSITY', 'HIVE', 'GAIANS'];
	for (id of order) { f.fm.add(id, declarations[id]); }
	f.initialize_single_player('PIRATES');
	const players = f.game.get_players(); test.assert(#sizeof(players) == 7);
	for (let index = 0; index < 7; index++) { test.assert(players[index].get_faction().id == order[index], 'Declared source order stays distinct from lexical faction order'); }
	test.assert(f.participant_codec_invariant(), 'Role/faction/name/difficulty survive native player codec without adding sockets or CIDs');
});

behavior.scenario('Offline computer completion allows ordinary rounds while preserving foreign action authority', () => {
	const f = test.natural_startup_fixture(40, 80, 'flat-arid'); const game = f.game;
	#include('./_natural_startup_mechanics')(f); f.initialize_single_player('GAIANS'); f.start_world();
	test.assert(f.participant_codec_invariant() && #sizeof(game.get_contacts()) == 0);
	const failures = {orders: 0, other: 0};
	game.on('event_result', (e) => { if (!e.success) { if (e.name == 'unit_skip_turn') { failures.orders = failures.orders + 1; } else { failures.other = failures.other + 1; } } });
	for (turn of [1, 2, 3]) {
		test.assert(game.get_turn() == turn && !game.is_turn_complete(0));
		let human = null; let foreign = null; let units = 0;
		for (base of game.bm.get_bases()) {
			for (unit of base.get_tile().get_units()) { units++; if (unit.owner == 0) { human = unit; } else { foreign = unit; } }
		}
		test.assert(#sizeof(game.bm.get_bases()) == 7 && units == 7, 'Every live participant retains its actual base and unit');
		for (let index = 1; index < 7; index++) { test.assert(game.is_turn_complete(index), 'Offline computers do not wait on nonexistent connections'); }
		const movement = foreign.movement + 0.0;
		game.event('unit_skip_turn', {unit_id: foreign.id}); f.process_events();
		test.assert(foreign.movement == movement && game.get_turn() == turn, 'Human caller cannot submit a computer unit order');
		game.event('unit_skip_turn', {unit_id: human.id}); f.process_events();
		game.event('complete_turn', {}); f.process_events();
		test.assert(game.get_turn() == turn + 1, 'Actual completion event advances the shared native round');
	}
	test.assert(failures.orders == 3 && failures.other == 0);
});

behavior.scenario('Network turn boundaries never auto-complete participants through the offline controller', () => {
	const f = test.world_startup_fixture(40, 80); const game = f.game;
	test.assert(!f.has_offline_single_player_roster(), 'Empty map/editor-style fixtures have no active offline roster');
	#include('../default/factions').configure({add: (id, data) => { f.fm.add(id, data); }, import_colors: (name) => { return f.colors; }, import_base_names: (name) => { return {land: [], water: []}; }});
	f.initialize_single_player('GAIANS');
	test.assert(f.has_offline_single_player_roster(), 'The early generation guard recognizes the actual seven-player roster');
	f.enable_transport();
	test.assert(!f.has_offline_single_player_roster(), 'A network transport retains its separate map-generation contract');
	f.with_write(() => { game.advance_turn(2); });
	for (player of game.get_players()) { test.assert(!game.is_turn_complete(player.id), 'A connection disables the offline computer controller'); }
});

behavior.scenario('Declared initial world bypasses natural placement and first-turn income through real factories', () => {
	const f = test.natural_startup_fixture(40, 80, 'flat-arid'); const game = f.game;
	#include('./_natural_startup_mechanics')(f);
	for (ids of [['GAIANS', 'MISSING'], ['HIVE', 'HIVE']]) {
		let rejected = false; try { f.initialize_declared_players(ids); } catch { : (error) => { rejected = true; } }
		test.assert(rejected && #sizeof(game.get_players()) == 0, 'Invalid authored participant input is atomic');
	}
	f.initialize_declared_players(['GAIANS', 'HIVE']);
	const phases = {world: 0, turn: 0};
	game.on('create_world', (e) => { phases.world = phases.world + 1; });
	game.on('turn', (e) => { phases.turn = phases.turn + 1; });
	f.configure_declared_world();
	test.assert(game.get_turn() == 1 && phases.world == 0 && phases.turn == 0);
	test.assert(#sizeof(game.bm.get_bases()) == 0 && #sizeof(game.tm.get_tile(6, 12).get_units()) == 0, 'Configuration creates no authored entities or expected answers');
	let base = null; let scout = null; let project = '';
	f.with_write(() => {
		const player = game.get_player();
		game.technologies.set(6, [(0 - 1), (0 - 1)], 0, [1, 1, 1, 1]);
		for (unit of game.get('starting_unit_rules')) {
			if (unit.id == 'ColonyPod') {
				project = unit.choice + '';
				player.add_production_choice(project, {type: 'unit', id: unit.id, cost: unit.rows * 10, cost_rows: unit.rows, population_cost: unit.population});
			}
		}
		base = game.bm.spawn_base(player, game.tm.get_tile(6, 12), {name: 'Declared Input Base', facilities: ['HEADQUARTERS']});
		base.create_pop({type: 'DOCTOR'});
		base.restore_production({choice_id: project, minerals: 3, last_processed_turn: 1}, ''); base.set('accumulated_nutrients', 0);
		scout = game.um.spawn_unit({owner: player, tile: base.get_tile(), def: 'ScoutPatrol', health: 1.0, morale: 2});
	});
	f.set_declared_research(0, [6], (0 - 1), 0); f.set_declared_research(1, [6], (0 - 1), 0);
	f.process_events();
	test.assert(base.get_tile().x == 6 && base.get_tile().y == 12 && base.get_size() == 1 && #sizeof(base.get_worked_tiles()) == 0);
	test.assert(base.get_production().minerals == 3 && base.get_production().choice_id == project && base.get('accumulated_nutrients') == 0, 'Declared stores have no implicit FirstTurn credit');
	test.assert(scout.morale == 2 && scout.movement > 0.0 && scout.get_order() == 'NO_ORDERS');
	test.assert(game.technologies.has_tech(6, 1) && game.technologies.has_tech(6, 2) && !game.technologies.has_tech(0, 1));
	test.assert(game.get_research_state(0).target_id == (0 - 1) && game.get_research_science(0).accumulated == 0);
	test.assert(phases.world == 0 && phases.turn == 0 && game.get_turn() == 1);
});

behavior.scenario('Existing Random faction input resolves during native startup and completes ordinary rounds', () => {
	const f = test.natural_startup_fixture(40, 80, 'flat-arid'); const game = f.game;
	const stock = ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
	// This authored land-world input declares the original-seven source
	// catalog. No Random result, position or postaction world is supplied.
	#include('./_natural_startup_mechanics')(f, #undefined, stock);
	const human = f.initialize_random_single_player();
	test.assert(human.id == 0 && human.type == 'human' && !#is_defined(human.get_faction()), 'Random remains deferred before native initialization');
	f.start_world();
	test.assert(#sizeof(game.get_players()) == 7 && #sizeof(game.bm.get_bases()) == 7);
	const seen = {};
	for (player of game.get_players()) {
		const id = player.get_faction().id;
		test.assert(!#is_defined(seen[id]), 'Random human faction is excluded from the computer roster'); seen[id] = true;
	}
	test.assert(f.participant_codec_invariant());
	for (turn of [1, 2, 3]) {
		for (base of game.bm.get_bases()) {
			for (unit of base.get_tile().get_units()) { if (unit.owner == 0 && unit.movement > 0.0) { game.event('unit_skip_turn', {unit_id: unit.id}); } }
		}
		f.process_events(); game.event('complete_turn', {}); f.process_events();
		test.assert(game.get_turn() == turn + 1, 'Resolved Random participant uses ordinary turn completion');
	}
});

behavior.scenario('Random human mode preserves the displayed seven while choosing the local participant', () => {
	const f = test.natural_startup_fixture(40, 80, 'flat-arid'); const game = f.game;
	#include('./_natural_startup_mechanics')(f);
	const stock = ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
	const human = f.initialize_roster('RANDOM', {factions: stock, human_slot: 5, random_human: true});
	test.assert(!#is_defined(human.get_faction()) && #sizeof(game.get_players()) == 1, 'Human choice stays deferred to the native startup RNG');
	f.start_world();
	const seen = {};
	for (player of game.get_players()) { const id = player.get_faction().id; test.assert(!#is_defined(seen[id])); seen[id] = true; }
	for (id of stock) { test.assert(#is_defined(seen[id]), 'Every displayed faction survives Random human selection from a larger catalog'); }
	test.assert(#sizeof(game.get_players()) == 7 && #sizeof(game.bm.get_bases()) == 7 && human.id == 0);
});

behavior.scenario('Random faction rows reserve explicit opponents and resolve without duplicates', () => {
	const f = test.natural_startup_fixture(40, 80, 'flat-arid'); const game = f.game;
	const stock = ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
	#include('./_natural_startup_mechanics')(f, #undefined, stock);
	f.initialize_roster('RANDOM', {factions: ['RANDOM', 'HIVE', 'RANDOM', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'], human_slot: 0, random_human: false});
	f.start_world();
	const players = game.get_players(); const seen = {};
	for (player of players) { const id = player.get_faction().id; test.assert(!#is_defined(seen[id]), 'Random rows never reuse a reserved faction'); seen[id] = true; }
	for (id of stock) { test.assert(#is_defined(seen[id])); }
	test.assert(players[1].get_faction().id == 'HIVE' && players[3].get_faction().id == 'MORGANITES');
});
