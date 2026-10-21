// Application lifecycle invariants, separate from original city-state parity.
const behavior = #include('./_behavior');
behavior.scenario('Empty declared terrain reaches first playable turn through native startup and queued growth', () => {
	let rejected = false;
	try { test.natural_startup_fixture(41, 80, 'flat-arid'); }
	catch { : (error) => { rejected = true; } }
	test.assert(rejected, 'Odd native grid width rejects before allocation');
	rejected = false;
	try { test.natural_startup_fixture(40, 80, 'unknown'); }
	catch { : (error) => { rejected = true; } }
	test.assert(rejected, 'Unknown semantic terrain rejects');
	const f = test.natural_startup_fixture(40, 80, 'flat-arid'); const game = f.game;
	test.assert(game.get_turn() == 0, 'No first turn is pre-seeded');
	test.assert(#sizeof(game.get_players()) == 0 && #sizeof(game.bm.get_bases()) == 0, 'No owner or city is seeded');
	rejected = false;
	try { f.start_world(); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && game.get_turn() == 0, 'Startup without participants rejects before first turn');
	#include('./_natural_startup_mechanics')(f);
	rejected = false;
	try { f.initialize_single_player('GAIANS', 'Unknown'); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && #sizeof(game.get_players()) == 0, 'Invalid difficulty rejects before participant creation');
	const human = f.initialize_single_player('GAIANS');
	test.assert(f.get_player_difficulty() == 'Citizen', 'Default fixture difficulty remains Citizen');
	test.assert(game.get_settings().global.difficulty_level == 'Citizen', 'Default native State difficulty remains Citizen');
	const observed = {phases: '', turns: 0, growth: 0, population: 0, bases: 0, failed: false};
	game.on('configure', (e) => { observed.phases = observed.phases + '|configure'; });
	game.on('create_world', (e) => {
		let tiles = 0;
		for (let y = 0; y < 80; y++) {
			for (let x = y % 2; x < 40; x += 2) {
				const tile = game.tm.get_tile(x, y);
				if (!tile.is_land || tile.moisture != 1 || tile.rockiness != 1 || tile.get_base() != null) { throw Error('Incorrect declared flat arid terrain'); }
				tiles++;
			}
		}
		test.assert(tiles == 1600, 'Actual parity-valid native grid uses all declared terrain inputs');
		observed.phases = observed.phases + '|world';
	});
	game.on('start', (e) => { observed.phases = observed.phases + '|start'; });
	game.on('turn', (e) => { observed.turns = observed.turns + 1; observed.phases = observed.phases + '|turn'; });
	game.bm.on('base_spawn', (e) => {
		observed.bases = observed.bases + 1;
		test.assert(e.base.get_size() == 0, 'Actual spawn precedes natural first-turn population');
		observed.phases = observed.phases + '|base';
	});
	game.on('event_result', (e) => {
		if (!e.success) { observed.failed = true; }
		if (e.name == 'process_base_growth') { observed.growth = observed.growth + 1; }
		if (e.name == 'add_base_pop') { observed.population = observed.population + 1; }
	});
	f.start_world();
	test.assert(observed.phases == '|configure|world|start|base|turn', 'Real post-map phases and deferred city spawn retain production order');
	test.assert(game.get_turn() == 1 && observed.turns == 1, 'Native FirstTurn advances exactly once to playable epoch1');
	test.assert(observed.bases == 1 && #sizeof(game.bm.get_bases()) == 1, 'World generator creates actual single human city');
	test.assert(!observed.failed, 'No authoritative event validation failed');
	test.assert(observed.growth == 1 && observed.population == 1, 'First turn dispatches actual queued growth and population child');
	const bases = game.bm.get_bases(); const base = bases[0];
	test.assert(base.get_owner().id == human.id, 'City retains production-initialized native owner');
	test.assert(base.get_size() == 1 && #sizeof(base.get_pops()) == 1, 'Production growth initializes one actual citizen');
	test.assert(#typeof(base.get('accumulated_nutrients')) == 'Int', 'Production growth initializes nutrient storage');
	test.assert(#typeof(game.get('f_base_process_growth')) == 'Callable', 'Native start installs shipped base mechanics');
	rejected = false;
	try { f.start_world(); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && game.get_turn() == 1, 'Repeated startup rejects without advancing another turn');
	f.process_events();
	test.assert(observed.turns == 1 && observed.population == 1, 'Draining settled queue cannot replay first-turn population');
});

for (difficulty of ['Citizen', 'Specialist', 'Talent', 'Librarian', 'Thinker', 'Transcend']) {
	behavior.scenario('declared ' + difficulty + ' initializes actual native State and human Player', () => {
		const f = test.natural_startup_fixture(4, 4, 'flat-arid'); const game = f.game;
		#include('./_natural_startup_mechanics')(f);
		const human = f.initialize_single_player('GAIANS', difficulty);
		test.assert(game.get_settings().global.difficulty_level == difficulty);
		test.assert(f.get_player_difficulty() == difficulty);
		test.assert(#sizeof(game.get_players()) == 1 && game.get_player().id == human.id);
		test.assert(game.get_turn() == 0 && #sizeof(game.bm.get_bases()) == 0, 'Difficulty setup cannot pre-initialize world or turn');
	});
}
