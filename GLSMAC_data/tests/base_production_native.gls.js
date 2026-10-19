// GLSMAC facility production policy, not original-game parity. The native
// fixture supplies assets/lifecycle/write scope; all transitions, bindings and
// snapshot readers/writers are the production Base/Player/BaseManager code.
const behavior = #include('./_behavior');
const rejected = (callback) => {
	let caught = false;
	try { callback(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'expected rejection');
};
const state = (choice, minerals, turn) => { return { choice_id: choice, minerals: minerals, last_processed_turn: turn }; };

behavior.scenario('native facility choices are sorted descriptors and new bases are idle', () => {
	const f = test.production_fixture();
	test.assert(f.owner.get_production_choices() == [{ id: 'RECYCLING_TANKS', type: 'facility', facility_id: 'RECYCLING_TANKS', name: 'Recycling Tanks', description: 'Synthetic facility', cost: 32 }]);
	test.assert(f.base.get_production() == state('', 0, 0));
	test.assert(f.base.has_facility('HEADQUARTERS') && !f.base.has_facility('RECYCLING_TANKS'));
	const choices = f.owner.get_production_choices();
	choices[0].cost = 1;
	const again = f.owner.get_production_choices();
	test.assert(again[0].cost == 32, 'descriptors are copies');
});

behavior.scenario('native choice aliases sort by stable ID regardless of registration order', () => {
	const f = test.production_fixture();
	f.with_write(() => {
		f.owner.add_production_choice('ZZ_TANKS', { type: 'facility', id: 'RECYCLING_TANKS' });
		f.owner.add_production_choice('AA_TANKS', { type: 'facility', id: 'RECYCLING_TANKS' });
	});
	const choices = f.owner.get_production_choices();
	test.assert([choices[0].id, choices[1].id, choices[2].id] == ['AA_TANKS', 'RECYCLING_TANKS', 'ZZ_TANKS']);
	test.assert(choices[0].facility_id == 'RECYCLING_TANKS' && choices[2].cost == 32);
	choices[0].id = 'MUTATED';
	const again = f.owner.get_production_choices();
	test.assert(again[0].id == 'AA_TANKS');
});

behavior.scenario('native selection preserves progress and same project is idempotent', () => {
	const f = test.production_fixture();
	f.set_turn(7);
	let previous = null;
	f.with_write(() => { previous = f.base.select_production('RECYCLING_TANKS'); });
	test.assert(previous == state('', 0, 0));
	test.assert(f.base.get_production() == state('RECYCLING_TANKS', 0, 7));
	test.assert(f.update_count() == 1, 'selection queues the production update listener');
	f.set_turn(8);
	f.with_write(() => { f.base.process_production(8, 11); });
	test.assert(f.update_count() == 2, 'mineral processing queues another update');
	const before = f.base.get_production();
	const updates = f.update_count();
	f.with_write(() => { f.base.select_production('RECYCLING_TANKS'); });
	test.assert(f.base.get_production() == before && f.update_count() == updates);
});

for (choice of ['MISSING', 'STOCKPILE_ENERGY', 'HEADQUARTERS']) {
	behavior.scenario('native selection rejects unsupported or installed choice ' + choice, () => {
		const f = test.production_fixture();
		const before = f.base.get_production();
		const updates = f.update_count();
		rejected(() => { f.with_write(() => { f.base.select_production(choice); }); });
		test.assert(f.base.get_production() == before && f.update_count() == updates);
	});
}

behavior.scenario('native mutations remain read-only after an exception leaves write scope', () => {
	const f = test.production_fixture();
	rejected(() => { f.base.select_production('RECYCLING_TANKS'); });
	rejected(() => { f.with_write(() => { throw FixtureError('abort event'); }); });
	rejected(() => { f.base.select_production('RECYCLING_TANKS'); });
	rejected(() => { f.with_write(() => { f.base.select_production('MISSING'); }); });
	rejected(() => { f.base.select_production('RECYCLING_TANKS'); });
	test.assert(f.base.get_production() == state('', 0, 0));
});

behavior.scenario('idle processing records its turn without accumulating minerals', () => {
	const f = test.production_fixture();
	f.with_write(() => { f.base.process_production(1, 12); });
	test.assert(f.base.get_production() == state('', 0, 1));
});

for (gain of [1, 4]) {
	behavior.scenario('native completion at 31 plus ' + #to_string(gain) + ' preserves overflow and rolls back exactly', () => {
		const f = test.production_fixture();
		f.with_write(() => { f.base.select_production('RECYCLING_TANKS'); });
		f.set_turn(2);
		f.with_write(() => { f.base.process_production(2, 31); });
		const before = f.base.get_production();
		f.set_turn(3);
		let applied = null;
		f.with_write(() => { applied = f.base.process_production(3, gain); });
		test.assert(applied.previous == before && applied.added_facility == 'RECYCLING_TANKS');
		test.assert(f.base.get_production() == state('', gain - 1, 3));
		test.assert(f.base.has_facility('RECYCLING_TANKS') && f.base.has_facility('HEADQUARTERS'));
		rejected(() => { f.with_write(() => { f.base.select_production('RECYCLING_TANKS'); }); });
		f.with_write(() => { f.base.restore_production(applied.previous, applied.added_facility); });
		test.assert(f.base.get_production() == before && !f.base.has_facility('RECYCLING_TANKS'));
		test.assert(f.base.has_facility('HEADQUARTERS'));
	});
}

behavior.scenario('native partial production and selection roll back their markers and progress', () => {
	const f = test.production_fixture();
	let before = null;
	f.with_write(() => { before = f.base.select_production('RECYCLING_TANKS'); });
	f.set_turn(2);
	let partial = null;
	f.with_write(() => { partial = f.base.process_production(2, 12); });
	f.with_write(() => { f.base.restore_production(partial.previous, partial.added_facility); });
	test.assert(f.base.get_production() == state('RECYCLING_TANKS', 0, 1));
	f.with_write(() => { f.base.restore_production(before, ''); });
	test.assert(f.base.get_production() == state('', 0, 0));
});

behavior.scenario('native processing rejects duplicate stale future negative and malformed requests atomically', () => {
	const f = test.production_fixture();
	f.with_write(() => { f.base.select_production('RECYCLING_TANKS'); });
	for (c of [[1, 4], [0, 4], [2, 4], [1.0, 4], [1, (0 - 1)], [1, 0.5]]) {
		rejected(() => { f.with_write(() => { f.base.process_production(c[0], c[1]); }); });
		test.assert(f.base.get_production() == state('RECYCLING_TANKS', 0, 1));
	}
	f.set_turn(2);
	f.with_write(() => { f.base.process_production(2, 0); });
	test.assert(f.base.get_production() == state('RECYCLING_TANKS', 0, 2));
	rejected(() => { f.with_write(() => { f.base.process_production(2, 4); }); });
	test.assert(f.base.get_production() == state('RECYCLING_TANKS', 0, 2));
});

behavior.scenario('native restore cannot remove an unrelated installed facility', () => {
	const f = test.production_fixture();
	const before = f.base.get_production();
	rejected(() => { f.with_write(() => { f.base.restore_production(state('RECYCLING_TANKS', 31, 1), 'HEADQUARTERS'); }); });
	test.assert(f.base.get_production() == before && f.base.has_facility('HEADQUARTERS'));
});

for (phase of ['idle', 'partial', 'completed', 'overflow']) {
	behavior.scenario('actual native base and receiving registry snapshot roundtrip ' + phase, () => {
		const source = test.production_fixture();
		if (phase != 'idle') { source.with_write(() => { source.base.select_production('RECYCLING_TANKS'); }); }
		if (phase != 'idle') {
			source.set_turn(2);
			const amount = phase == 'partial' ? 17 : (phase == 'completed' ? 32 : 35);
			source.with_write(() => { source.base.process_production(2, amount); });
		}
		const snapshot = source.snapshot();
		const target = test.production_fixture();
		target.restore(snapshot);
		test.assert(target.base.get_production() == source.base.get_production());
		test.assert(target.base.get_facilities() == source.base.get_facilities());
		test.assert(target.owner.get_production_choices() == source.owner.get_production_choices());
		test.assert(target.snapshot() == snapshot);
		source.reset();
		test.assert(source.base.get_production() == state('', 0, 0));
		test.assert(target.snapshot() == snapshot, 'recipient must not depend on the old registry');
	});
}

for (kind of ['truncated', 'trailing', 'unknown_choice', 'unknown_facility', 'negative_minerals', 'negative_turn']) {
	behavior.scenario('native malformed snapshot ' + kind + ' preserves recipient state', () => {
		const source = test.production_fixture();
		const target = test.production_fixture();
		target.with_write(() => { target.base.select_production('RECYCLING_TANKS'); });
		const before = target.snapshot();
		const bad = source.corrupt_snapshot(kind);
		rejected(() => { target.restore(bad); });
		test.assert(target.snapshot() == before);
	});
}

behavior.scenario('native production-choice removal performs registration rollback', () => {
	const f = test.production_fixture();
	f.with_write(() => { f.owner.remove_production_choice('RECYCLING_TANKS'); });
	test.assert(f.owner.get_production_choices() == []);
	rejected(() => { f.with_write(() => { f.base.select_production('RECYCLING_TANKS'); }); });
});

for (in_use of ['installed', 'active']) {
	behavior.scenario('native facility definition removal rejects ' + in_use + ' base references', () => {
		const f = test.production_fixture();
		let id = 'HEADQUARTERS';
		if (in_use == 'active') {
			id = 'RECYCLING_TANKS';
			f.with_write(() => { f.base.select_production(id); });
		}
		const before = f.snapshot();
		const updates = f.update_count();
		rejected(() => { f.with_write(() => { f.game.bm.undefine_facility(id); }); });
		test.assert(f.snapshot() == before && f.update_count() == updates);
		test.assert(f.base.has_facility('HEADQUARTERS'));
	});
}

behavior.scenario('native unused facility definition removal retains installed Headquarters', () => {
	const f = test.production_fixture();
	f.with_write(() => { f.game.bm.undefine_facility('RECYCLING_TANKS'); });
	test.assert(f.owner.get_production_choices() == []);
	test.assert(f.base.has_facility('HEADQUARTERS'));
	rejected(() => { f.with_write(() => { f.base.select_production('RECYCLING_TANKS'); }); });
});
