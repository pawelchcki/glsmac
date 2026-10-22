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
