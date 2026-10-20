// Bounded native lifecycle regressions plus application invariants. Original
// evidence is replayed independently by the candidate adapter; no selection
// policy or protocol-order ordinals are implemented in this fixture.
const behavior = #include('./_behavior');
const fixture = #include('./_unit_sentry_fixture');
const sentry = #include('../default/game/event/unit_sentry');
const activate = #include('../default/game/event/unit_activate');
const event = (f, id, caller) => {
	const e = {caller: caller, data: {unit_id: id}}; e.game = f.game; return e;
};
const rejected = (callback) => {
	let failed = false; try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed);
};

behavior.scenario('production L sleeps the selected native Scout and selects another actual ready unit', () => {
	const f = fixture('stacked'); const unit = f.units[0]; const before = f.native.inspect();
	f.action('sleep');
	test.assert(f.state.queued[0].name == 'unit_sentry' && f.state.queued[0].data == {unit_id: unit.id});
	test.assert(unit.get_order() == 'SENTRY' && unit.movement == 1.0 && !unit.moved_this_turn && !unit.needs_orders());
	test.assert(f.selected_id() == f.units[1].id && f.preview.selected_unit_id == f.selected_id());
	test.assert(f.native.inspect().rng == before.rng && f.game.get_turn() == 1);
	f.events.select_unit(unit); test.assert(f.preview.order_label.text == 'SENTRY' && f.preview.movement_label.text == 'Moves: 1');
	f.view.root.remove();
});

let index = 0;
for (actions of [['sleep', 'skip', 'skip'], ['skip', 'sleep', 'skip'], ['sleep', 'sleep', 'skip'],
	['skip', 'skip', 'sleep'], ['sleep', 'skip', 'sleep'], ['skip', 'sleep', 'sleep'],
	['sleep', 'sleep', 'sleep'], ['sleep', 'hold', 'hold']]) {
	behavior.scenario('persistent orders survive actual turns and shared Wait Tab exclude sleeping units ' + #to_string(index), () => {
		const f = fixture('stacked');
		for (action of actions) { f.action(action); }
		test.assert(f.selected_id() == null && !f.game.um.has_ready_unit(f.native.owner.id) && f.native.check_unit_readiness());
		const orders = []; for (unit of f.units) { orders :+ unit.get_order(); }
		f.action('advance'); test.assert(f.game.get_turn() == 2);
		for (action of ['wait', 'tab']) {
			f.action(action);
			for (i of [0, 1, 2]) {
				const unit = f.units[i]; test.assert(unit.get_order() == orders[i] && unit.movement == 1.0);
				if (orders[i] != 'NO_ORDERS') { test.assert(!unit.needs_orders() && f.selected_id() != unit.id); }
			}
			if (f.selected_id() != null) { test.assert(f.game.um.get_unit(f.selected_id()).needs_orders()); }
		}
		f.view.root.remove();
	}); index++;
}

behavior.scenario('native Sentry codec and copied frontend packets preserve actual persisted state', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
	f.with_write(() => { unit.set_order('SENTRY'); }); const before = f.snapshot();
	const codec = f.unit_order_codec_probe(unit.id);
	test.assert(codec.roundtrip && codec.sentry && !codec.held && codec.receiving_owner && codec.legacy_default);
	test.assert(codec.invalid_rejected && codec.trailing_rejected && codec.truncated_rejected && codec.invalid_work_rejected);
	test.assert(codec.receiver_unchanged && codec.source_unchanged && f.snapshot() == before);
	const sync = f.unit_order_sync_probe(unit.id); test.assert(sync.spawn && sync.update && sync.copied);
	test.assert(unit.get_order() == 'SENTRY' && f.snapshot() == before);
});

behavior.scenario('Sentry and activation receipts restore native prior orders without restoring movement', () => {
	for (order of ['NO_ORDERS', 'HOLD', 'SENTRY']) {
		const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
		f.with_write(() => { unit.set_order(order); unit.movement = 0.0; }); const before = f.snapshot();
		const e = event(f, unit.id, f.owner.id); test.assert(!#is_defined(sentry.validate(e)));
		f.with_write(() => { e.applied = sentry.apply(e); });
		test.assert(unit.get_order() == 'SENTRY' && unit.movement == 0.0 && !unit.needs_orders());
		const a = event(f, unit.id, f.owner.id);
		f.with_write(() => { a.applied = activate.apply(a); });
		test.assert(unit.get_order() == 'NO_ORDERS' && unit.movement == 0.0 && !unit.needs_orders());
		f.with_write(() => { activate.rollback(a); sentry.rollback(e); });
		test.assert(f.snapshot() == before && unit.get_order() == order);
	}
});

behavior.scenario('Sentry work interruption rollback restores complete native progress', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
	f.with_write(() => { unit.set_terraforming({action: 'farm', work_units: 2, required_work: 8, last_turn: 1,
		previous_work_units: 0, previous_movement: 1.0, previous_moved: false, tile_x: 0, tile_y: 0, active: true}); });
	const before = f.snapshot(); const e = event(f, unit.id, f.owner.id);
	f.with_write(() => { e.applied = sentry.apply(e); });
	test.assert(unit.get_order() == 'SENTRY' && !unit.get_terraforming().active && unit.get_terraforming().work_units == 2);
	const codec = f.unit_order_codec_probe(unit.id); test.assert(codec.sentry && codec.roundtrip && codec.source_unchanged);
	f.with_write(() => { sentry.rollback(e); }); test.assert(f.snapshot() == before && unit.get_terraforming().active);
});

behavior.scenario('Sentry validates live owned healthy unlocked identities and active turns before apply', () => {
	for (kind of ['dead', 'locked', 'completed', 'inactive']) {
		const f = test.founding_fixture(); f.configure(kind); const e = event(f, f.unit_id, f.owner.id);
		const before = f.snapshot(); const inspected = f.inspect();
		test.assert(#typeof(sentry.validate(e)) == 'String'); rejected(() => { f.with_write(() => { sentry.apply(e); }); });
		test.assert(f.snapshot() == before && f.inspect() == inspected);
	}
	const f = test.founding_fixture();
	for (id of [null, '1', 0, (0 - 1), 999999]) {
		const e = event(f, id, f.owner.id); const before = f.snapshot();
		test.assert(#typeof(sentry.validate(e)) == 'String'); rejected(() => { f.with_write(() => { sentry.apply(e); }); }); test.assert(f.snapshot() == before);
	}
	const e = event(f, f.unit_id, 0); const before = f.snapshot();
	test.assert(#typeof(sentry.validate(e)) == 'String'); rejected(() => { f.with_write(() => { sentry.apply(e); }); }); test.assert(f.snapshot() == before);
});

behavior.scenario('native Sentry writes require authorization and retained setter rejects removed units', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const before = f.snapshot(); const inspected = f.inspect();
	rejected(() => { unit.set_order('SENTRY'); }); test.assert(f.snapshot() == before && f.inspect() == inspected);
	const write = unit.set_order; f.with_write(() => { f.game.um.despawn_unit(unit.id); }); const removed = f.snapshot();
	rejected(() => { f.with_write(() => { write('SENTRY'); }); }); test.assert(f.snapshot() == removed);
});

behavior.scenario('Sentry receipt refuses a despawned and replaced scalar identity', () => {
	const f = test.founding_fixture(); const id = f.unit_id; const e = event(f, id, f.owner.id);
	f.with_write(() => {
		e.applied = sentry.apply(e); f.game.um.despawn_unit(id);
		const data = {id: id, def: 'ColonyPod', health: 1.0, morale: 2}; data.owner = f.owner; data.tile = f.base.get_tile();
		f.game.um.spawn_unit(data);
	}); const before = f.snapshot();
	rejected(() => { f.with_write(() => { sentry.rollback(e); }); }); test.assert(f.snapshot() == before);
});

behavior.scenario('production L requires unmodified live turn input and removal detaches its listener', () => {
	const f = fixture('stacked'); const before = f.native.snapshot();
	for (modifiers of [{shift: true}, {ctrl: true}, {alt: true}]) { f.preview.frame.emit('keydown', {code: 'L', modifiers: modifiers}); }
	f.events.emit('turn_status', {status: 'please_wait'}); f.action('sleep');
	f.events.emit('turn_status', {status: 'active'}); f.preview.frame.remove(); f.action('sleep');
	test.assert(#sizeof(f.state.queued) == 0 && f.native.snapshot() == before); f.view.root.remove();
});

behavior.scenario('pending Sentry ignores duplicate keys and unrelated acknowledgements until its matching result', () => {
	const f = fixture('stacked'); const unit = f.units[0];
	f.preview.frame.emit('keydown', {code: 'L', modifiers: {}});
	for (data of [{name: 'unit_hold', caller: f.native.owner.id, id: unit.id},
		{name: 'unit_sentry', caller: 0, id: unit.id}, {name: 'unit_sentry', caller: f.native.owner.id, id: unit.id + 1}]) {
		f.events.emit('event_result', {name: data.name, caller: data.caller, data: {unit_id: data.id}, success: false});
		f.preview.frame.emit('keydown', {code: 'L', modifiers: {}});
	}
	test.assert(#sizeof(f.state.queued) == 1 && unit.get_order() == 'NO_ORDERS');
	f.flush(); test.assert(unit.get_order() == 'SENTRY' && f.selected_id() == f.units[1].id);
	f.view.root.remove();
});

behavior.scenario('actual activation modal blocks Sentry on a selected orderable native unit until Cancel', () => {
	const activation_fixture = #include('./_unit_activation_fixture');
	const f = activation_fixture('default'); const unit = f.units[0];
	f.events.select_unit(unit);
	test.assert(f.selected_id() == unit.id && f.preview.get_order_unit(false) == unit && !f.popup.is_shown());
	const before = f.native.snapshot(); const count = #sizeof(f.state.queued);
	f.action('open'); test.assert(f.popup.is_shown() && f.selected_id() == unit.id);
	f.preview.frame.emit('keydown', {code: 'L', modifiers: {}}); f.flush();
	test.assert(f.popup.is_shown() && f.native.snapshot() == before && #sizeof(f.state.queued) == count);
	f.action('cancel');
	test.assert(!f.popup.is_shown() && f.preview.get_order_unit(false) == unit && f.native.snapshot() == before);
	f.preview.frame.emit('keydown', {code: 'L', modifiers: {}}); f.flush();
	test.assert(#sizeof(f.state.queued) == count + 1 && f.state.queued[count].name == 'unit_sentry');
	test.assert(unit.get_order() == 'SENTRY' && unit.movement == 1.0 && !unit.needs_orders());
	f.view.root.remove();
});
