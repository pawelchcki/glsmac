// Explicit isolated-human fixture: this suite covers bounded mechanics, not the production opponent roster.
// Synthetic application invariants; no installed names, original state or pixels.
const behavior = #include('./_behavior');
const make = (interactive) => {
	const f = test.natural_startup_fixture(16, 16, 'flat-arid');
	#include('./_natural_startup_mechanics')(f);
	f.initialize_isolated_player('GAIANS'); f.start_world(interactive); return f;
};
const headquarters = (game) => { const bases = game.bm.get_bases(); return bases[0]; };
const command = (f, action, name) => {
	const state = f.game.get_opening_state(); const bases = f.game.bm.get_bases(); const base = bases[0];
	const data = {session: state.session, action: action, base_id: 0, previous_name: '', name: ''};
	if (action == 'name') { data.base_id = base.id; data.previous_name = base.name + ''; data.name = name; }
	f.game.event('opening_command', data); f.process_events(); return data;
};
const rejects = (cb) => { let rejected = false; try { cb(); } catch { : (error) => { rejected = true; } } test.assert(rejected); };
behavior.scenario('Noninteractive native startup retains its existing first-turn lifecycle', () => {
	const f = make(false); test.assert(f.game.get_turn() == 1); test.assert(f.game.get_opening_state().phase == 'none');
	test.assert(!f.game.get_opening_state().automatic_end_turn);
});
behavior.scenario('Interactive world has a real Headquarters at turn zero until its name is confirmed', () => {
	const f = make(true); const game = f.game; const base = headquarters(game);
	test.assert(game.get_turn() == 0 && game.get_opening_state().phase == 'planetfall');
	test.assert(base.name != '' && base.has_facility('HEADQUARTERS'));
	test.assert(#is_defined(base.validate_rename(0, 0, base.name, 'Ordinary')));
	rejects(() => { f.first_turn(); }); test.assert(game.get_turn() == 0);
	command(f, 'planetfall', ''); test.assert(game.get_opening_state().phase == 'first-base-name' && game.get_turn() == 0);
	command(f, 'name', '  Synthetic Haven  '); test.assert(base.name == '  Synthetic Haven  ' && game.get_turn() == 0);
	f.opening_tick(); test.assert(game.get_opening_state().phase == 'tour' && game.get_turn() == 1);
	rejects(() => { f.first_turn(); }); f.opening_tick(); test.assert(game.get_turn() == 1);
	command(f, 'dismiss', ''); test.assert(game.get_opening_state().phase == 'map' && game.get_turn() == 1);
	test.assert(!#is_defined(base.validate_rename(0, 1, base.name, 'Ordinary')));
});
behavior.scenario('Opening rejects wrong authority, city identity, stale fields and duplicate acknowledgements', () => {
	const f = make(true); const game = f.game; const state = game.get_opening_state(); const base = headquarters(game);
	test.assert(#is_defined(game.validate_opening(1, state.session, 'planetfall', 0, '', '')));
	test.assert(#is_defined(game.validate_opening(0, state.session + 1, 'planetfall', 0, '', '')));
	test.assert(#is_defined(game.validate_opening(0, state.session, 'dismiss', 0, '', '')));
	command(f, 'planetfall', '');
	test.assert(#is_defined(game.validate_opening(0, state.session, 'planetfall', 0, '', '')));
	test.assert(#is_defined(game.validate_opening(0, state.session, 'name', base.id + 1, base.name, 'Other')));
	test.assert(#is_defined(game.validate_opening(0, state.session, 'name', base.id, 'Stale Name', 'Other')));
	test.assert(f.opening_owner_probe());
	rejects(() => { game.apply_opening(0, state.session, 'name', base.id, base.name, 'Other'); });
	test.assert(game.get_turn() == 0 && game.get_opening_state().phase == 'first-base-name');
});
behavior.scenario('Initial naming preserves ordinary printable-ASCII length and empty-name policy', () => {
	const f = make(true); const game = f.game; command(f, 'planetfall', ''); const state = game.get_opening_state(); const base = headquarters(game);
	for (name of ['1234567890123456789012345', 'line\nbreak']) { test.assert(#is_defined(game.validate_opening(0, state.session, 'name', base.id, base.name, name))); }
	command(f, 'name', ''); test.assert(base.name == '' && game.get_turn() == 0); f.opening_tick(); test.assert(game.get_turn() == 1);
});
behavior.scenario('Gameplay commands cannot start the first turn through the pending opening', () => {
	const f = make(true); const game = f.game; const rejected = {count: 0};
	game.on('event_result', (e) => { if (!e.success) { rejected.count = rejected.count + 1; } });
	game.event('complete_turn', {}); game.event('advance_turn', {turn_id: 1}); f.process_events(); f.opening_tick();
	test.assert(rejected.count == 2 && game.get_turn() == 0 && game.get_opening_state().phase == 'planetfall');
});
behavior.scenario('Rejected naming and failing result listeners cannot dispatch or duplicate FirstTurn', () => {
	const f = make(true); const game = f.game; const turns = {count: 0};
	game.on('turn', (e) => { turns.count = turns.count + 1; });
	command(f, 'planetfall', ''); command(f, 'name', 'invalid\nname'); f.opening_tick();
	test.assert(game.get_turn() == 0 && turns.count == 0 && game.get_opening_state().phase == 'first-base-name');
	game.on('event_result', (e) => { if (e.name == 'opening_command' && e.success) { throw Error('Synthetic view failure after commitment'); } });
	command(f, 'name', 'Committed Haven');
	test.assert(game.get_turn() == 0 && turns.count == 0 && game.get_opening_state().phase == 'starting');
	f.opening_tick(); f.opening_tick();
	test.assert(game.get_turn() == 1 && turns.count == 1 && game.get_opening_state().phase == 'tour');
	command(f, 'name', 'Duplicate Haven'); f.opening_tick();
	test.assert(game.get_turn() == 1 && turns.count == 1 && headquarters(game).name == 'Committed Haven');
});
behavior.scenario('Removed Headquarters and retired worlds invalidate pending opening authority', () => {
	const f = make(true); const game = f.game; const state = game.get_opening_state(); const base = headquarters(game);
	f.with_write(() => { game.bm.despawn_base(base); }); f.opening_tick();
	test.assert(game.get_opening_state().phase == 'failed' && game.get_turn() == 0);
	test.assert(#is_defined(game.validate_opening(0, state.session, 'planetfall', 0, '', '')));
	f.retire(); test.assert(game.get_opening_state().phase == 'none' && game.get_turn() == 0);
	test.assert(#is_defined(game.validate_opening(0, state.session, 'planetfall', 0, '', '')));
});
