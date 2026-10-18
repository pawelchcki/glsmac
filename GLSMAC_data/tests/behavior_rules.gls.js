// Integration checks for production C++ bindings; original parity is audited
// separately from recorded evidence. Faction IDs here are ownership-mask IDs.
const behavior = #include('./_behavior');

const invalid = (callback) => {
	let rejected = false;
	try { callback(); }
	catch { GSEInvalidCall: (e) => { rejected = true; } };
	test.assert(rejected, 'Expected an invalid-call error');
};

behavior.scenario('custom technology table is shared with Game queries', () => {
	const f = test.rules_fixture();
	f.technologies.set(0, [(0 - 1), (0 - 1)], 2, [1, 2, 2, (0 - 3)]);
	f.technologies.set(1, [0, (0 - 1)], 0, [0, 0, 0, 0]);
	test.assert(f.game.technologies.has_tech(0, 1));
	test.assert(!f.game.technologies.has_tech(0, 0));
	test.assert(f.game.technologies.category(0) == 1);
	test.assert(f.game.technologies.available(1, 1, true));
	test.assert(!f.game.technologies.available(0, 1, true));
	test.assert(!f.game.technologies.is_prerequisite(0, 1, 0));
	test.assert(f.game.technologies.is_prerequisite(0, 1, 1));
	// The production Game wrapper must preserve its event-write guard.
	let read_only = false;
	try { f.game.technologies.set(0, [(0 - 1), (0 - 1)], 255, [0, 0, 0, 0]); }
	catch { GSEGameError: (e) => { read_only = true; } };
	test.assert(read_only);
	test.assert(!f.game.technologies.has_tech(0, 2));
});

behavior.scenario('Game lifecycle clears technology definitions and ownership', () => {
	const f = test.rules_fixture();
	f.technologies.set(0, [(0 - 1), (0 - 1)], 255, [0, 0, 0, 9]);
	test.assert(f.game.technologies.has_tech(0, 7));
	test.assert(f.game.technologies.category(0) == 3);
	f.reset();
	test.assert(!f.game.technologies.has_tech(0, 7));
	test.assert(!f.game.technologies.available(0, 1, true));
	test.assert(f.game.technologies.category(0) == 0);
	// Previously obtained wrappers see the same reset table.
	f.technologies.set(1, [(0 - 1), (0 - 1)], 2, [0, 0, 0, 0]);
	test.assert(f.game.technologies.has_tech(1, 1));
	const other = test.rules_fixture();
	test.assert(!other.game.technologies.has_tech(1, 1));
});

behavior.scenario('technology binding validates whole definitions before mutation', () => {
	const f = test.rules_fixture();
	f.technologies.set(0, [(0 - 1), (0 - 1)], 2, [1, 2, 3, 4]);
	invalid(() => { f.technologies.set(89, [(0 - 1), (0 - 1)], 2, [0, 0, 0, 0]); });
	invalid(() => { f.technologies.set(0, [(0 - 1)], 2, [0, 0, 0, 0]); });
	invalid(() => { f.technologies.set(0, [(0 - 1), 89], 2, [0, 0, 0, 0]); });
	invalid(() => { f.technologies.set(0, [(0 - 1), (0 - 1)], 256, [0, 0, 0, 0]); });
	invalid(() => { f.technologies.set(0, [(0 - 1), (0 - 1)], 2, [0, 0, 0, 32768]); });
	invalid(() => { f.technologies.set(0, [(0 - 1), (0 - 1)], 2, [0, 0, true, 0]); });
	invalid(() => { f.technologies.has_tech(0, 8); });
	invalid(() => { f.technologies.has_tech(0.0, 1); });
	invalid(() => { f.technologies.category((0 - 1)); });
	invalid(() => { f.technologies.available(0, 1, 1); });
	invalid(() => { f.technologies.is_prerequisite(0, 1, (0 - 1)); });
	invalid(() => { f.technologies.is_prerequisite(0, 1, 6); });
	test.assert(f.game.technologies.has_tech(0, 1));
	test.assert(f.game.technologies.category(0) == 3);
});

behavior.scenario('technology snapshot roundtrip replaces rows and rejects partial state', () => {
	const source = test.rules_fixture();
	const target = test.rules_fixture();
	source.technologies.set(0, [(0 - 1), (0 - 1)], 2, [(0 - 32768), 32767, 4, 5]);
	source.technologies.set(88, [0, (0 - 1)], 255, [0, 0, 0, 7]);
	target.technologies.set(1, [(0 - 1), (0 - 1)], 255, [0, 0, 0, 9]);
	const snapshot = source.snapshot();
	target.restore(snapshot);
	test.assert(target.snapshot() == snapshot);
	test.assert(target.game.technologies.has_tech(0, 1));
	test.assert(!target.game.technologies.has_tech(0, 2));
	test.assert(target.game.technologies.category(0) == 1);
	test.assert(target.game.technologies.category(88) == 3);
	test.assert(target.game.technologies.available(88, 1, true));
	test.assert(!target.game.technologies.has_tech(1, 1));
	test.assert(!target.game.technologies.available(1, 1, true));
	test.assert(target.game.technologies.category(1) == 0);
	source.reset();
	test.assert(target.snapshot() == snapshot);
	invalid(() => { target.restore(source.truncated_snapshot()); });
	test.assert(target.snapshot() == snapshot);
	invalid(() => { target.restore('invalid snapshot'); });
	test.assert(target.snapshot() == snapshot);
	invalid(() => { target.restore(snapshot + 'trailing data'); });
	test.assert(target.snapshot() == snapshot);
	invalid(() => { target.restore(source.out_of_range_snapshot()); });
	test.assert(target.snapshot() == snapshot);
});

behavior.scenario('geometry bindings preserve score units and explicit map shape', () => {
	const f = test.rules_fixture();
	const g = f.game.geometry;
	test.assert(g.same_row_distance(8, 0, 4, 0) == 2);
	test.assert(g.vector_distance(8, 4, false, 0, 0, 4, 0) == 3);
	test.assert(g.raw_vector_distance(4, 0) == 3);
	test.assert(g.vector_distance(8, 4, false, 0, 0, 6, 0) == 1);
	test.assert(g.vector_distance(8, 4, true, 0, 0, 6, 0) == 4);
	test.assert(g.raw_vector_distance((0 - 7), 9) == 8);
});

behavior.scenario('geometry binding rejects dimensions coordinates parity and types', () => {
	const f = test.rules_fixture();
	const g = f.game.geometry;
	invalid(() => { g.vector_distance(5, 4, false, 0, 0, 2, 0); });
	invalid(() => { g.vector_distance(4, 1, false, 0, 0, 2, 0); });
	invalid(() => { g.vector_distance(4, 4, 0, 0, 0, 2, 0); });
	invalid(() => { g.vector_distance(4, 4, false, (0 - 2), 0, 2, 0); });
	invalid(() => { g.vector_distance(4, 4, false, 0, 0, 4, 0); });
	invalid(() => { g.vector_distance(4, 4, false, 0, 0, 2, 4); });
	invalid(() => { g.vector_distance(4, 4, false, 0, 0, 1, 0); });
	invalid(() => { g.raw_vector_distance(4096, 0); });
	invalid(() => { g.raw_vector_distance(true, 0); });
	invalid(() => { g.same_row_distance(4, 0, 2, 1); });
	invalid(() => { g.same_row_distance(5, 0, 2, 0); });
	test.assert(g.raw_vector_distance(0, 0) == 0);
});
