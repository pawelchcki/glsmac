// Native GLSMAC invariants for the bounded NO_ORDERS/HOLD state. The public
// unit-orders traces establish command effects on one starting Scout; guards,
// snapshots, readiness and receipt restoration here are application contracts.
const behavior = #include('./_behavior');
const turns = #include('../default/units/turns');
const rejected = (callback) => {
	let failed = false;
	try { callback(); } catch { : (error) => { failed = true; } }
	test.assert(failed, 'Invalid native order mutation must reject');
};
const fixture = () => {
	const f = test.founding_fixture();
	f.scout_id = f.add_scout(f.owner.id);
	f.unit = () => { return f.game.um.get_unit(f.scout_id); };
	return f;
};
const capture = (f) => {
	const updates = f.update_count();
	return { updates: updates, bytes: f.snapshot(), ids: f.next_ids(), inspect: f.inspect() };
};
const unchanged = (f, before) => {
	test.assert(f.snapshot() == before.bytes && f.next_ids() == before.ids);
	test.assert(f.inspect() == before.inspect, 'Rejected order mutation preserves RNG, IDs, frontend and event queues');
	test.assert(f.update_count() == before.updates);
};

behavior.scenario('native unit defaults to no orders and derives readiness from real movement', () => {
	const f = fixture(); const unit = f.unit();
	test.assert(unit.get_order() == 'NO_ORDERS', 'Actual native units must expose persisted NO_ORDERS/HOLD state');
	test.assert(unit.needs_orders() && unit.movement == 0.5);
	const before = capture(f);
	test.assert(f.unit().get_order() == 'NO_ORDERS' && f.unit().needs_orders()); unchanged(f, before);
});

behavior.scenario('native Hold and activation preserve fractional movement and all nonorder state', () => {
	const f = fixture(); const unit = f.unit(); const before = capture(f);
	f.with_write(() => { unit.set_order('HOLD'); });
	test.assert(f.unit().get_order() == 'HOLD' && !f.unit().needs_orders());
	test.assert(unit.movement == 0.5 && unit.health == 1.0 && !unit.moved_this_turn);
	test.assert(f.snapshot() != before.bytes, 'Order is part of the native unit snapshot');
	f.with_write(() => { unit.set_order('NO_ORDERS'); });
	test.assert(f.unit().needs_orders() && f.unit().get_order() == 'NO_ORDERS' && unit.movement == 0.5);
	test.assert(f.snapshot() == before.bytes && f.next_ids() == before.ids);
	test.assert(f.inspect().rng == before.inspect.rng);
});

behavior.scenario('native order writes require write authorization before any mutation', () => {
	const f = fixture(); const unit = f.unit(); const before = capture(f);
	rejected(() => { unit.set_order('HOLD'); }); unchanged(f, before);
	rejected(() => { unit.needs_orders = false; }); unchanged(f, before);
});

behavior.scenario('native order setter rejects unsupported names and types without changing queues', () => {
	const f = fixture(); const unit = f.unit();
	for (invalid of ['', 'NO ORDERS', 'hold', 'SENTRY', 1, true, null, undefined]) {
		const before = capture(f);
		rejected(() => { f.with_write(() => { unit.set_order(invalid); }); }); unchanged(f, before);
	}
});

behavior.scenario('activation never restores movement and Hold can persist on an exhausted actual unit', () => {
	const f = fixture(); const unit = f.unit();
	f.with_write(() => { unit.movement = 0.0; unit.set_order('HOLD'); });
	test.assert(unit.movement == 0.0 && f.unit().get_order() == 'HOLD' && !f.unit().needs_orders());
	f.with_write(() => { unit.set_order('NO_ORDERS'); });
	test.assert(unit.movement == 0.0 && f.unit().get_order() == 'NO_ORDERS' && !f.unit().needs_orders());
});

behavior.scenario('real native turns and shipped unit callback retain Hold while replenishing movement', () => {
	const f = fixture(); const unit = f.unit(); turns.configure(f.game);
	f.with_write(() => { unit.set_order('HOLD'); unit.movement = 0.0; });
	f.with_write(() => { f.game.advance_turn(2); });
	test.assert(f.game.get_turn() == 2 && f.unit().movement == 1.0);
	test.assert(f.unit().get_order() == 'HOLD' && !f.unit().needs_orders());
	f.with_write(() => { f.game.advance_turn(3); });
	test.assert(f.game.get_turn() == 3 && f.unit().get_order() == 'HOLD' && f.unit().movement == 1.0);
});

behavior.scenario('fresh native wrapper aliases address the same live order state', () => {
	const f = fixture(); const first = f.unit(); const second = f.unit();
	test.assert(first == second);
	f.with_write(() => { second.set_order('HOLD'); });
	test.assert(first.get_order() == 'HOLD' && !first.needs_orders());
	f.with_write(() => { first.set_order('NO_ORDERS'); });
	test.assert(second.get_order() == 'NO_ORDERS' && second.needs_orders());
});

behavior.scenario('native production rollback cannot consume a produced pod with changed orders', () => {
	const f = test.founding_fixture(); f.add_worker(0); f.add_worker(1);
	f.with_write(() => {
		f.owner.add_production_choice('COLONY_POD', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 });
		f.base.select_production('COLONY_POD');
	});
	const id = f.inspect().next_unit_id; f.set_turn(2); let receipt = null;
	f.with_write(() => { receipt = f.base.process_production(2, 30); });
	const pod = f.game.um.get_unit(id); f.with_write(() => { pod.set_order('HOLD'); });
	const before = capture(f);
	rejected(() => { f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); }); });
	unchanged(f, before); test.assert(f.game.um.has_unit(id) && f.game.um.get_unit(id).get_order() == 'HOLD');
});

behavior.scenario('native manager readiness excludes held and exhausted units but counts another owned ready unit', () => {
	const f = fixture(); const scout = f.unit(); const colony = f.game.um.get_unit(f.unit_id);
	test.assert(f.game.um.has_ready_unit(f.owner.id));
	f.with_write(() => { scout.set_order('HOLD'); colony.set_order('HOLD'); });
	const before = capture(f);
	test.assert(!f.game.um.has_ready_unit(f.owner.id)); unchanged(f, before);
	test.assert(f.check_unit_readiness(), 'Actual Game readiness uses the same held-unit exclusion');
	const another_id = f.add_scout(f.owner.id); const another = f.game.um.get_unit(another_id);
	test.assert(f.game.um.has_ready_unit(f.owner.id) && !f.check_unit_readiness());
	f.with_write(() => { another.movement = 0.0; });
	test.assert(!f.game.um.has_ready_unit(f.owner.id) && f.check_unit_readiness());
	const foreign_id = f.add_scout(0);
	test.assert(f.game.um.has_ready_unit(0) && !f.game.um.has_ready_unit(f.owner.id));
	test.assert(f.game.um.get_unit(foreign_id).needs_orders());
});

behavior.scenario('readonly native readiness query validates arguments and preserves state', () => {
	const f = fixture(); const before = capture(f);
	rejected(() => { f.game.um.has_ready_unit(); }); rejected(() => { f.game.um.has_ready_unit(1, 0); });
	rejected(() => { f.game.um.has_ready_unit('1'); }); rejected(() => { f.game.um.has_ready_unit((0 - 1)); });
	rejected(() => { f.game.um.has_ready_unit(2); });
	unchanged(f, before);
});

behavior.scenario('native order callables validate argument counts without changing unit state', () => {
	const f = fixture(); const unit = f.unit(); const before = capture(f);
	rejected(() => { unit.get_order('extra'); }); rejected(() => { unit.needs_orders('extra'); });
	rejected(() => { f.with_write(() => { unit.set_order(); }); });
	rejected(() => { f.with_write(() => { unit.set_order('HOLD', 'extra'); }); });
	unchanged(f, before);
});

behavior.scenario('held unit receiving-world codec and legacy unit payload retain bounded format semantics', () => {
	const f = fixture(); const unit = f.unit(); f.with_write(() => { unit.set_order('HOLD'); });
	const before = capture(f); const result = f.unit_order_codec_probe(f.scout_id);
	test.assert(result.roundtrip && result.held && result.receiving_owner);
	test.assert(result.legacy_default && result.invalid_rejected && result.trailing_rejected && result.truncated_rejected);
	test.assert(result.receiver_unchanged && result.source_unchanged); unchanged(f, before);
});

behavior.scenario('native no-order units also transfer through the actual receiving manager codec', () => {
	const f = fixture(); const before = capture(f); const result = f.unit_order_codec_probe(f.scout_id);
	test.assert(result.roundtrip && !result.held && result.receiving_owner && result.legacy_default);
	test.assert(result.receiver_unchanged && result.source_unchanged); unchanged(f, before);
});

behavior.scenario('native frontend spawn and update request copies carry the actual held order', () => {
	const f = fixture(); const unit = f.unit(); f.with_write(() => { unit.set_order('HOLD'); });
	const before = f.snapshot(); const result = f.unit_order_sync_probe(f.scout_id);
	test.assert(result.spawn && result.update && result.copied);
	test.assert(f.snapshot() == before && unit.get_order() == 'HOLD' && unit.movement == 0.5);
});

behavior.scenario('native detached unit cannot change orders from its despawn lifecycle callback', () => {
	const f = fixture(); let refused = false; let preserved = false;
	f.game.um.on('unit_despawn', (e) => {
		if (e.unit.id == f.scout_id) {
			const before = f.snapshot(); const state = f.inspect();
			try { e.unit.set_order('HOLD'); } catch { : (error) => { refused = true; } }
			preserved = f.snapshot() == before && f.inspect() == state;
		}
	});
	f.with_write(() => { f.game.um.despawn_unit(f.scout_id); });
	test.assert(refused && preserved && !f.game.um.has_unit(f.scout_id));
});

behavior.scenario('held colony founding receipt restores its exact order on native undo', () => {
	const f = test.founding_fixture(); const colony = f.game.um.get_unit(f.unit_id);
	f.with_write(() => { colony.set_order('HOLD'); }); const before = f.snapshot(); let receipt = null;
	f.with_write(() => { receipt = f.game.found_base(f.unit_id, f.owner.id, (base) => { return { type: 'DOCTOR' }; }); });
	f.with_write(() => { f.game.rollback_found_base(receipt); });
	test.assert(f.snapshot() == before && f.game.um.get_unit(f.unit_id).get_order() == 'HOLD');
});

behavior.scenario('saved native order callables reject after their unit is destroyed', () => {
	const f = fixture(); const unit = f.unit();
	const read = unit.get_order; const write = unit.set_order; const ready = unit.needs_orders;
	f.with_write(() => { f.game.um.despawn_unit(f.scout_id); }); const before = capture(f);
	rejected(() => { read(); }); rejected(() => { ready(); });
	rejected(() => { f.with_write(() => { write('HOLD'); }); });
	unchanged(f, before);
});

behavior.scenario('saved native order and readiness callables reject after their world is retired', () => {
	const f = fixture(); const unit = f.unit();
	const read = unit.get_order; const write = unit.set_order; const ready = unit.needs_orders;
	const any_ready = f.game.um.has_ready_unit;
	f.reset();
	rejected(() => { read(); }); rejected(() => { ready(); }); rejected(() => { write('HOLD'); });
	rejected(() => { any_ready(1); });
	test.assert(f.game.get_turn() == 1);
});

behavior.scenario('actual native advance dispatches shipped unit turns and readonly base and game observers', () => {
	const f = fixture(); const unit = f.unit(); turns.configure(f.game);
	let unit_calls = 0; let base_calls = 0; let game_calls = 0; let observed_year = 0;
	f.game.um.on('unit_turn', (e) => { unit_calls++; });
	f.game.bm.on('base_turn', (e) => { base_calls++; });
	f.game.on('turn', (e) => { game_calls++; observed_year = e.year; });
	f.with_write(() => { unit.set_order('HOLD'); unit.movement = 0.0; f.game.advance_turn(2); });
	test.assert(unit_calls == 2 && base_calls == 1 && game_calls == 1);
	test.assert(observed_year == 2102 && f.game.get_year() == 2102 && f.game.get_turn() == 2);
	test.assert(f.unit().movement == 1.0 && f.unit().get_order() == 'HOLD' && !f.unit().needs_orders());
});
