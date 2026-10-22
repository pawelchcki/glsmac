// Application fixture-input invariants; these are not original-game answers.
const behavior = #include('./_behavior');
behavior.scenario('declared native name pools survive construction and fixture reset', () => {
	const f = test.selection_fixture('Existing City', 16, ['Input Grove', 'Input Grove']);
	const spawn = () => {
		let created = null;
		f.with_write(() => { created = f.game.bm.spawn_base(f.owner, f.game.tm.get_tile(0, 4), {}); });
		test.assert(created.name == 'Input Grove', 'Native registry resolves the actual declared pool');
		test.assert(f.inspect().names == ['Existing City', 'Input Grove']);
	};
	f.enable_economy(); spawn(); f.reset(); f.enable_economy(); spawn();
});
behavior.scenario('native fixture rejects invalid pools before creating players or cities', () => {
	for (names of [[], [1], [''], ['ABCDEFGHIJKLMNOPQRSTUVWXYZ'], ['Bad\nName']]) {
		let rejected = false;
		try { test.selection_fixture('Existing City', 16, names); } catch { : (error) => { rejected = true; } }
		test.assert(rejected, 'Invalid declared pool must fail before allocation');
	}
	const too_many = []; for (let i = 0; i < 65; i++) { too_many :+ 'Declared'; }
	let rejected = false;
	try { test.selection_fixture('Existing City', 16, too_many); } catch { : (error) => { rejected = true; } }
	test.assert(rejected, 'Native pool remains bounded to 64 input entries');
	for (value of [1, 'not an array', {}]) {
		rejected = false;
		try { test.selection_fixture('Existing City', 16, value); } catch { : (error) => { rejected = true; } }
		test.assert(rejected, 'Pool container must be an actual native array');
	}
	const maximum = []; for (let index = 0; index < 64; index++) { maximum :+ 'Bounded Input'; }
	const f = test.selection_fixture('Existing City', 16, maximum); f.enable_economy();
	let created = null;
	f.with_write(() => { created = f.game.bm.spawn_base(f.owner, f.game.tm.get_tile(0, 4), {}); });
	test.assert(created.name == 'Bounded Input', 'The maximum declared pool is accepted without deduplicating input');
});
behavior.scenario('zero and two argument callers retain their native default pools', () => {
	for (f of [test.selection_fixture(), test.selection_fixture('Specified City', 16)]) {
		const original_name = f.base.name; f.enable_economy(); let created = null;
		f.with_write(() => { created = f.game.bm.spawn_base(f.owner, f.game.tm.get_tile(0, 2), {}); });
		test.assert(created.name == 'Expansion', 'Existing callers retain the actual native default pool');
		test.assert(f.base.name == original_name, 'The explicit or default initial city name remains unchanged');
	}
});

const named_fixture = () => {
	const f = test.selection_fixture('Existing City', 16, ['Declared Draft']); f.enable_economy();
	f.pod_id = f.add_colony(0, 4); return f;
};
const reject = (callback) => {
	let rejected = false; try { callback(); } catch { : (error) => { rejected = true; } }
	test.assert(rejected, 'Native named-foundation guard must reject');
};
behavior.scenario('native name preview is read-only and named safety guards precede allocation', () => {
	const f = named_fixture(); const before = f.snapshot(); const caller = f.owner.id + 0; const turn = f.game.get_turn();
	test.assert(f.game.preview_found_base(f.pod_id, caller) == 'Declared Draft');
	test.assert(f.game.preview_found_base(f.pod_id, caller) == 'Declared Draft' && f.snapshot() == before);
	for (name of ['', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Bad\nName', 'Existing City']) {
		test.assert(#is_defined(f.game.validate_named_found_base(f.pod_id, caller, turn, name)));
		reject(() => { f.with_write(() => { f.game.found_named_base(f.pod_id, caller, turn, name, (base) => { return {type: 'DOCTOR'}; }); }); });
		test.assert(f.snapshot() == before);
	}
	test.assert(#is_defined(f.game.validate_named_found_base(f.pod_id, caller + 1, turn, 'Allowed')));
	test.assert(#is_defined(f.game.validate_named_found_base(f.pod_id, caller, turn + 1, 'Allowed')));
	test.assert(!#is_defined(f.game.validate_named_found_base(f.pod_id, caller, turn, 'ABCDEFGHIJKLMNOPQRSTUVWX')));
	reject(() => { f.game.found_named_base(f.pod_id, caller, turn, 'Allowed', (base) => { return {type: 'DOCTOR'}; }); });
	test.assert(f.snapshot() == before);
});
behavior.scenario('native named transaction stores raw case and its receipt restores the complete world', () => {
	const f = named_fixture(); const before = f.snapshot(); let receipt = null;
	f.with_write(() => { receipt = f.game.found_named_base(f.pod_id, f.owner.id, f.game.get_turn(), 'Raw Case', (base) => { return {type: 'DOCTOR'}; }); });
	test.assert(receipt.base_name == 'Raw Case' && !f.game.um.has_unit(f.pod_id));
	test.assert(f.inspect().names == ['Existing City', 'Raw Case']);
	f.with_write(() => { f.game.rollback_found_base(receipt); }); test.assert(f.snapshot() == before);
	reject(() => { f.with_write(() => { f.game.rollback_found_base(receipt); }); }); test.assert(f.snapshot() == before);
});
