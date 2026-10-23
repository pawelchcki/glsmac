// Application native safety; no additional original geometry policy is claimed.
const behavior = #include('./_behavior');
const reject = (callback) => { let rejected = false; try { callback(); } catch { : (error) => { rejected = true; } } test.assert(rejected); };
behavior.scenario('near-site queries validate native identity owner and readiness without mutation', () => {
	const f = test.selection_fixture('Existing City', 16); const id = f.add_colony(1, 3); const caller = f.owner.id + 0; const before = f.snapshot();
	test.assert(!#is_defined(f.game.validate_found_base_unit(id, caller)) && f.game.is_found_base_adjacent(id, caller));
	test.assert(#is_defined(f.game.validate_found_base(id, caller)));
	for (args of [[id,caller + 1],[99999,caller],[(0 - 1),caller]]) { reject(() => { f.game.is_found_base_adjacent(args[0], args[1]); }); }
	reject(() => { f.game.is_found_base_adjacent('bad', caller); }); reject(() => { f.game.is_found_base_adjacent(id); });
	test.assert(f.snapshot() == before);
	f.configure_unit(id, 'no_moves'); const spent = f.snapshot(); reject(() => { f.game.is_found_base_adjacent(id, caller); }); test.assert(f.snapshot() == spent);
});
behavior.scenario('native near-site rejection precedes naming allocation and both founding transactions', () => {
	const f = test.selection_fixture('Existing City', 16); f.enable_economy(); const id = f.add_colony(1, 3); const caller = f.owner.id + 0; const before = f.snapshot();
	let chooser_called = false; const chooser = (base) => { chooser_called = true; return {type: 'DOCTOR'}; };
	reject(() => { f.game.preview_found_base(id, caller); });
	reject(() => { f.with_write(() => { f.game.found_base(id, caller, chooser); }); });
	reject(() => { f.with_write(() => { f.game.found_named_base(id, caller, f.game.get_turn(), 'Chosen Town', chooser); }); });
	test.assert(!chooser_called && f.snapshot() == before);
});
