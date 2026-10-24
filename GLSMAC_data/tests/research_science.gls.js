// Explicit isolated-human fixture: this suite covers bounded mechanics, not the production opponent roster.
const behavior = #include('./_behavior');
const research = #include('../default/game/research');
const rejects = (callback) => {
	let rejected = false; try { callback(); } catch { : (error) => { rejected = true; } }
	test.assert(rejected);
};
const start = (f, difficulty) => {
	#include('./_natural_startup_mechanics')(f);
	research.configure(f.game); f.initialize_isolated_player('GAIANS', #is_defined(difficulty) ? difficulty : 'Citizen'); f.game.get_settings().global.rules.set_blind_research(false);
	f.start_world();
	const definitions = #include('./_technology_rules_fixture').parse();
	f.with_write(() => { f.game.technologies.replace(#include('../default/game/technology_rules').plan(definitions, f.game.get_players())); });
	f.game.event('set_research_target', {target_id: 1}); f.process_events();
	f.next = () => { f.game.event('complete_turn', {}); f.process_events(); };
	return f;
};
const world = (difficulty) => { return start(test.natural_startup_fixture(40, 80, 'flat-arid'), difficulty); };

behavior.scenario('observed Talent opening credits science from the second native turn', () => {
	const f = world('Talent'); const values = [f.game.get_research_science(0).accumulated];
	test.assert(f.get_player_difficulty() == 'Talent' && f.game.get_player().get_difficulty_level() == 'Talent' && research.income(f.game, 0) == 1);
	for (turn of [2, 3, 4, 5, 6]) { f.next(); values :+ f.game.get_research_science(0).accumulated; }
	test.assert(values == [0, 1, 2, 3, 4, 5], 'Talent science=' + #to_string(values));
	test.assert(!f.game.technologies.has_tech(1, 1), 'Accumulating Talent science must not grant target ownership');
});

for (profile of [
	['Specialist', [0, 0, 0, 0, 1, 2]], ['Librarian', [0, 1, 2, 3, 4, 5]],
	['Thinker', [0, 1, 2, 3, 4, 5]], ['Transcend', [0, 1, 2, 3, 4, 5]],
]) {
	const difficulty = profile[0] + ''; const expected = profile[1];
	behavior.scenario('independently recorded ' + difficulty + ' opening timing reaches native turn plans', () => {
		const f = world(difficulty); const values = [f.game.get_research_science(0).accumulated];
		test.assert(f.get_player_difficulty() == difficulty && f.game.get_player().get_difficulty_level() == difficulty && research.income(f.game, 0) == 1);
		for (turn of [2, 3, 4, 5, 6]) { f.next(); values :+ f.game.get_research_science(0).accumulated; }
		test.assert(values == expected, difficulty + ' science=' + #to_string(values));
		test.assert(!f.game.technologies.has_tech(1, 1));
	});
}

behavior.scenario('shipped turn events credit actual base science along the first five observed advances', () => {
	const f = world(); const game = f.game; const accumulated = [game.get_research_science(0).accumulated];
	const results = {accepted: 0, rejected: 0};
	game.on('event_result', (e) => {
		if (e.name == 'credit_research_income') {
			if (e.success) { results.accepted = results.accepted + 1; } else { results.rejected = results.rejected + 1; }
		}
	});
	const cities = game.bm.get_bases(); const city = cities[0];
	test.assert(research.income(game, 0) == 1, 'income=' + #to_string(research.income(game, 0)) + ' intake=' + #to_string(city.get_intake()) + ' consumption=' + #to_string(city.get_consumption()) + ' pops=' + #to_string(city.get_pops()));
	for (expected_turn of [2, 3, 4, 5, 6]) {
		f.next(); const state = game.get_research_science(0); accumulated :+ state.accumulated;
		test.assert(game.get_turn() == expected_turn && state.income_turn == expected_turn);
	}
	test.assert(accumulated == [0, 0, 0, 0, 1, 2]);
	test.assert(results.accepted == 5 && results.rejected == 0);
	test.assert(game.get_research_state(0).target_id == 1 && !game.technologies.has_tech(1, 1));
	game.event('credit_research_income', {player_id: 0, turn_id: 6, income: 1}); f.process_events();
	test.assert(results.rejected == 1 && game.get_research_science(0).accumulated == 2);
});

behavior.scenario('native science credits preserve exact receipts and reject stale replay', () => {
	const f = #include('./_research_fixture')(false); f.command('set_research_target', {target_id: 1}); f.set_turn(5);
	const before = f.research_snapshot('current'); const state = f.game.get_research_state(f.owner.id); const world_before = f.snapshot();
	const first = f.command('credit_research_income', {player_id: f.owner.id, turn_id: 5, income: 3}, 0);
	test.assert(f.game.get_research_science(f.owner.id).accumulated == 3 && f.game.get_research_state(f.owner.id) == state);
	test.assert(f.snapshot() == world_before && !f.game.technologies.has_tech(1, f.owner.id + 1));
	rejects(() => { f.command('credit_research_income', {player_id: f.owner.id, turn_id: 5, income: 3}, 0); });
	f.with_write(() => { f.game.rollback_research(first.applied); }); test.assert(f.research_snapshot('current') == before);
	const retry = f.command('credit_research_income', {player_id: f.owner.id, turn_id: 5, income: 3}, 0);
	rejects(() => { f.with_write(() => { f.game.rollback_research(first.applied); }); });
	f.with_write(() => { f.game.rollback_research(retry.applied); }); test.assert(f.research_snapshot('current') == before);
});

behavior.scenario('science authority epoch type and mode checks precede mutation', () => {
	const f = #include('./_research_fixture')(false); f.command('set_research_target', {target_id: 1});
	const before = f.research_snapshot('current');
	rejects(() => { f.command('credit_research_income', {player_id: f.owner.id, turn_id: 1, income: 1}, f.owner.id); });
	rejects(() => { f.game.credit_research(f.owner.id, 1, 1); });
	for (bad of [
		{player_id: f.owner.id, turn_id: 2, income: 1}, {player_id: f.owner.id, turn_id: 1, income: (0 - 1)},
		{player_id: 7, turn_id: 1, income: 1}, {player_id: f.owner.id, turn_id: true, income: 1},
		{player_id: f.owner.id, turn_id: 1, income: 1.0}, {player_id: f.owner.id, turn_id: 1},
	]) { rejects(() => { f.command('credit_research_income', bad, 0); }); }
	f.game.get_settings().global.rules.set_blind_research(true);
	rejects(() => { f.command('credit_research_income', {player_id: f.owner.id, turn_id: 1, income: 1}, 0); });
	test.assert(f.research_snapshot('current') == before);
});

behavior.scenario('versioned native science transfer is detached and legacy data starts at zero', () => {
	const source = #include('./_research_fixture')(false); source.command('set_research_target', {target_id: 1}); source.set_turn(5);
	source.command('credit_research_income', {player_id: source.owner.id, turn_id: 5, income: 2}, 0);
	const target = #include('./_research_fixture')(false); target.restore_research(source.research_snapshot('current'));
	const received = target.game.get_research_science(target.owner.id); test.assert(received.accumulated == 2 && received.income_turn == 5);
	received.accumulated = 99; test.assert(target.game.get_research_science(target.owner.id).accumulated == 2);
	const before = target.research_snapshot('current');
	for (kind of ['science', 'income_turn', 'truncated', 'trailing']) {
		rejects(() => { target.restore_research(source.research_snapshot(kind)); }); test.assert(target.research_snapshot('current') == before);
	}
	target.restore_research(source.research_snapshot('legacy'));
	test.assert(target.game.get_research_state(target.owner.id).target_id == 1);
	const legacy = target.game.get_research_science(target.owner.id); test.assert(legacy.accumulated == 0 && legacy.income_turn == 0);
});

behavior.scenario('canonical host income survives the actual native event codec', () => {
	const f = world(); const data = {player_id: 0, turn_id: f.game.get_turn() + 0, income: research.income(f.game, 0) + 0};
	const received = f.roundtrip_event('credit_research_income', data);
	test.assert(received.caller == 0 && received.data == data && received.data.income == 1);
	const handler = #include('../default/game/event/credit_research_income'); test.assert(!#is_defined(handler.validate(received)));
	f.with_write(() => { received.applied = handler.apply(received); });
	const state = f.game.get_research_science(0); test.assert(state.accumulated == 1 && state.income_turn == 1);
});

behavior.scenario('science overflow rejects before changing stores or the income stamp', () => {
	const f = #include('./_research_fixture')(false); f.command('set_research_target', {target_id: 1}); f.set_turn(5);
	f.command('credit_research_income', {player_id: f.owner.id, turn_id: 5, income: 9223372036854775807}, 0);
	test.assert(f.game.get_research_science(f.owner.id).accumulated == 9223372036854775807);
	f.set_turn(6); const before = f.research_snapshot('current');
	rejects(() => { f.command('credit_research_income', {player_id: f.owner.id, turn_id: 6, income: 1}, 0); });
	rejects(() => { f.with_write(() => { f.game.credit_research(f.owner.id, 6, 1); }); });
	test.assert(f.research_snapshot('current') == before && f.game.get_research_science(f.owner.id).income_turn == 5);
});

behavior.scenario('resetting the same native Game clears positive science and turn stamps', () => {
	const f = world(); const same_game = f.game;
	for (turn of [2, 3, 4, 5]) { f.next(); }
	test.assert(f.game.get_research_science(0) == {accumulated: 1, income_turn: 5});
	f.reset_world('flat-arid'); test.assert(f.game == same_game);
	for (player of [0, 1, 2, 3, 4, 5, 6]) {
		test.assert(f.game.get_research_science(player) == {accumulated: 0, income_turn: 0});
	}
	start(f); test.assert(f.game.get_research_science(0) == {accumulated: 0, income_turn: 0});
	f.next(); test.assert(f.game.get_research_science(0) == {accumulated: 0, income_turn: 2});
});
