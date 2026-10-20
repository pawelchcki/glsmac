// Native transaction + shipped opening/event lifecycle. Display and explicit
// local acknowledgement delivery are boundaries; stores are never recalculated.
const behavior = #include('./_behavior');
const make = #include('./_base_open_fixture');
const handler = #include('../default/game/event/reconcile_base_citizens');
const fixture = () => { return make({profile: 'stacked', initial_base: {workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9}, setup: ['wait', 'wait']}); };
const reject = (callback) => {
	let caught = false; try { callback(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'Expected authoritative rejection');
};
const reconcile = (f) => {
	let receipt = null; f.native.with_write(() => { receipt = f.base.reconcile_citizens(f.native.owner.id, f.game.get_turn()); }); return receipt;
};
const add_worker = (f, tile) => {
	let worker = null;
	f.native.with_write(() => {
		worker = f.base.create_pop({type: 'WORKER'});
		if (#is_defined(tile)) { worker.set('worked_tile', tile); tile.set('working_pop', worker); f.base.add_worked_tile(tile); }
	});
	return worker;
};

behavior.scenario('closed join stays transient and actual Enter reconciles without choosing productive terrain', () => {
	const f = fixture(); const initial = f.base.get_pops(); const doctor = initial[0];
	f.action('join'); const joined = f.base.get_pops(); const worker = joined[1];
	test.assert(worker.get_type() == 'WORKER' && !worker.has('worked_tile') && f.context().screen == 'map');
	// Deliberately make assignment attractive and fail if allocation is queried.
	f.game.set('f_base_find_best_or_worst_tiles', (base, tiles, count, modifier) => { throw Error('Management must not allocate terrain'); });
	f.game.tm.on('get_tile_resources', (e) => { return {NUTRIENTS: 9, MINERALS: 9, ENERGY: 9}; });
	const units = f.native.inspect().unit_ids; const selected = f.selected_id(); const counts = f.native.next_ids();
	f.action('open'); const after = f.base.get_pops();
	test.assert(after[0] == doctor && after[1] == worker && worker.get_type() == 'DOCTOR');
	test.assert(f.context() == {screen: 'base', title_matches_base: true});
	test.assert(f.base.get_worked_tiles() == [] && !worker.has('worked_tile'));
	test.assert(f.base.get('accumulated_nutrients') == 0 && f.base.get_production().minerals == 9);
	test.assert(f.native.inspect().unit_ids == units && f.selected_id() == selected && f.native.next_ids() == counts && f.game.get_turn() == 1);
	const snapshot = f.native.snapshot(); f.action('close'); f.action('open'); f.action('close');
	test.assert(f.native.snapshot() == snapshot && f.context().screen == 'map' && f.selected_id() == selected);
	f.view.root.remove();
});

behavior.scenario('canonical control produces no reconciliation writes or frontend population packet', () => {
	const f = fixture(); const before = f.native.snapshot(); f.native.frontend_packets(); const updates = f.native.update_count();
	f.action('open'); f.action('close'); f.action('open'); f.action('close');
	test.assert(f.native.snapshot() == before && f.native.update_count() == updates);
	test.assert(f.native.frontend_packets().bases == [] && f.management_receipts[0].applied.receipt == 0);
	f.view.root.remove();
});

behavior.scenario('assigned Workers and specialists keep identities variants links stores and production', () => {
	const f = fixture(); const tile = f.native.tile_at(0, 2); const assigned = add_worker(f, tile); const idle = add_worker(f);
	const original = f.base.get_pops(); const variants = [original[0].variant, assigned.variant, idle.variant];
	f.native.with_write(() => { f.base.set('accumulated_nutrients', 17); f.base.restore_production({choice_id: 'RECYCLING_TANKS', minerals: 23, last_processed_turn: 1}, ''); });
	const counts = f.native.next_ids(); const receipt = reconcile(f); const after = f.base.get_pops();
	test.assert(after == original && [after[0].variant, assigned.variant, idle.variant] == variants);
	test.assert(assigned.get_type() == 'WORKER' && idle.get_type() == 'DOCTOR' && assigned.get('worked_tile') == tile && tile.get('working_pop') == assigned);
	test.assert(f.base.get_worked_tiles() == [tile] && f.base.get('accumulated_nutrients') == 17 && f.base.get_production() == {choice_id: 'RECYCLING_TANKS', minerals: 23, last_processed_turn: 1});
	test.assert(f.native.next_ids() == counts && receipt > 0);
	f.view.root.remove();
});

behavior.scenario('native rollback preserves object identities and emits complete frontend population updates', () => {
	const f = fixture(); const worker = add_worker(f); const before = f.native.snapshot(); f.native.frontend_packets();
	const receipt = reconcile(f); const packets = f.native.frontend_packets();
	test.assert(packets.bases == [{id: f.base.id, pops: ['DOCTOR', 'DOCTOR']}] && packets.spawned_bases == 0 && packets.removed_bases == 0);
	f.native.with_write(() => { f.base.rollback_citizen_reconciliation(receipt); });
	test.assert(f.native.snapshot() == before && worker.get_type() == 'WORKER');
	test.assert(f.native.frontend_packets().bases == [{id: f.base.id, pops: ['DOCTOR', 'WORKER']}]);
	reject(() => { f.native.with_write(() => { f.base.rollback_citizen_reconciliation(receipt); }); });
	f.view.root.remove();
});

behavior.scenario('reconciliation undo then join undo restores the exact closed-map starting snapshot', () => {
	const f = fixture(); const before = f.native.snapshot(); let joined = null;
	f.native.with_write(() => { joined = f.game.join_base(f.units[2].id, f.base.id, f.native.owner.id); });
	const receipt = reconcile(f);
	reject(() => { f.native.with_write(() => { f.game.rollback_join_base(joined); }); });
	f.native.with_write(() => { f.base.rollback_citizen_reconciliation(receipt); f.game.rollback_join_base(joined); });
	test.assert(f.native.snapshot() == before); f.view.root.remove();
});

behavior.scenario('native read-only ownership turn and lock guards precede all changes', () => {
	const f = fixture(); const worker = add_worker(f); const before = f.native.snapshot();
	reject(() => { f.base.reconcile_citizens(f.native.owner.id, 1); });
	for (args of [[0, 1], [f.native.owner.id, 2], [f.native.owner.id, 0]]) {
		test.assert(#is_defined(f.base.validate_citizen_reconciliation(args[0], args[1])));
		reject(() => { f.native.with_write(() => { f.base.reconcile_citizens(args[0], args[1]); }); });
	}
	f.native.configure_unit(f.units[0].id, 'locked');
	reject(() => { reconcile(f); });
	test.assert(worker.get_type() == 'WORKER' && f.native.snapshot() == before); f.view.root.remove();
});

for (kind of ['missing_pop_link', 'missing_tile_link', 'hidden_tile_claim', 'specialist_work_link']) {
	behavior.scenario('broken ' + kind + ' rejects all reconciliation targets without repairing terrain', () => {
		const f = fixture(); const idle = add_worker(f); const tile = f.native.tile_at(0, 2); const broken = add_worker(f, tile);
		f.native.with_write(() => {
			if (kind == 'missing_pop_link') { broken.unset('worked_tile'); }
			if (kind == 'missing_tile_link') { tile.unset('working_pop'); }
			if (kind == 'hidden_tile_claim') { broken.unset('worked_tile'); f.base.remove_worked_tile(tile); }
			if (kind == 'specialist_work_link') { broken.set_type('DOCTOR'); }
		});
		test.assert(#is_defined(f.base.validate_citizen_reconciliation(f.native.owner.id, 1)));
		reject(() => { reconcile(f); });
		test.assert(idle.get_type() == 'WORKER' && f.base.get_size() == 3 && f.base.get('accumulated_nutrients') == 0 && f.base.get_production().minerals == 9);
		f.view.root.remove();
	});
}

behavior.scenario('rollback rejects changed city later turn and out-of-order receipts', () => {
	const f = fixture(); add_worker(f); const first = reconcile(f); add_worker(f); const second = reconcile(f); const after = f.native.snapshot();
	reject(() => { f.native.with_write(() => { f.base.rollback_citizen_reconciliation(first); }); });
	test.assert(f.native.snapshot() == after);
	f.native.with_write(() => { f.base.set('accumulated_nutrients', 1); }); const changed = f.native.snapshot();
	reject(() => { f.native.with_write(() => { f.base.rollback_citizen_reconciliation(second); }); });
	test.assert(f.native.snapshot() == changed);
	f.native.with_write(() => { f.base.set('accumulated_nutrients', 0); }); f.native.set_turn(2); const later = f.native.snapshot();
	reject(() => { f.native.with_write(() => { f.base.rollback_citizen_reconciliation(second); }); });
	test.assert(f.native.snapshot() == later); f.view.root.remove();
});

behavior.scenario('matching acknowledgement alone opens once after native reconciliation', () => {
	const f = fixture(); f.action('join'); f.defer_management = true; f.action('open'); const request = f.management_requests[0];
	test.assert(!f.popup.is_shown() && f.list.management_pending != null); f.action('open'); test.assert(#sizeof(f.management_requests) == 1);
	for (change of ['name', 'caller', 'token', 'base', 'turn']) {
		const e = {name: 'reconcile_base_citizens', caller: f.native.owner.id, success: true}; e.data = {} + request;
		if (change == 'name') { e.name = 'join_base'; }
		if (change == 'caller') { e.caller = 0; }
		if (change == 'token') { e.data.request_token = e.data.request_token + 1; }
		if (change == 'base') { e.data.base_id = e.data.base_id + 1; }
		if (change == 'turn') { e.data.turn_id = e.data.turn_id + 1; }
		f.events.emit('event_result', e); test.assert(!f.popup.is_shown() && f.list.management_pending != null);
	}
	f.deliver_management(0, true); test.assert(f.context().screen == 'base' && f.list.management_pending == null);
	const e = {name: 'reconcile_base_citizens', caller: f.native.owner.id, success: true}; e.data = request;
	f.action('close'); f.events.emit('event_result', e); test.assert(!f.popup.is_shown()); f.view.root.remove();
});

for (kind of ['reject', 'escape', 'select_unit', 'select_tile', 'turn', 'remove', 'despawn']) {
	behavior.scenario('pending base opening survives ' + kind + ' without an obsolete popup', () => {
		const f = fixture(); f.action('join'); f.defer_management = true; f.action('open');
		if (kind == 'escape') { test.assert(f.list.frame.emit('keydown', {code: 'ESCAPE', modifiers: {}})); }
		if (kind == 'select_unit') { f.events.select_unit(f.units[1]); }
		if (kind == 'select_tile') { f.events.select_tile(f.native.tile_at(0, 2)); }
		if (kind == 'turn') { f.native.set_turn(2); f.events.emit('turn', {}); }
		if (kind == 'remove') { f.list.frame.remove(); }
		if (kind == 'despawn') { f.native.with_write(() => { f.game.bm.despawn_base(f.base.id); }); }
		f.deliver_management(0, kind != 'reject');
		test.assert(!f.popup.is_shown()); f.view.root.remove();
	});
}

behavior.scenario('event validates malformed scalar identity and undo retains native base identity', () => {
	const f = fixture(); add_worker(f); const before = f.native.snapshot();
	const e = {caller: f.native.owner.id, data: {base_id: f.base.id, turn_id: 1, request_token: 1}}; e.game = f.game;
	test.assert(!#is_defined(handler.validate(e)));
	f.native.with_write(() => { e.applied = handler.apply(e); });
	f.native.with_write(() => { handler.rollback(e); }); test.assert(f.native.snapshot() == before);
	for (data of [{base_id: 999999, turn_id: 1, request_token: 1}, {base_id: f.base.id, turn_id: 2, request_token: 1}, {base_id: f.base.id, turn_id: 1, request_token: 0}, {base_id: '1', turn_id: 1, request_token: 1}]) {
		e.data = data; test.assert(#is_defined(handler.validate(e)));
	}
	test.assert(f.native.snapshot() == before); f.view.root.remove();
});

behavior.scenario('foreign inspection opens read-only without sending reconciliation', () => {
	const f = fixture(); add_worker(f); const before = f.native.snapshot();
	f.events.get_player = () => { return f.game.get_player(0); };
	f.action('open'); test.assert(f.context().screen == 'base' && f.management_requests == [] && f.native.snapshot() == before);
	f.action('close'); test.assert(f.native.snapshot() == before); f.view.root.remove();
});

behavior.scenario('removed panel acknowledgements cannot collide with replacement panel requests', () => {
	const f = fixture(); f.action('join'); f.defer_management = true; f.action('open'); const first = f.management_requests[0];
	f.list.frame.remove(); f.list.init(f.p); f.events.select_unit(f.units[0]); f.action('open'); const second = f.management_requests[1];
	test.assert(second.request_token != first.request_token && f.list.management_pending != null);
	f.deliver_management(0, true); test.assert(!f.popup.is_shown() && f.list.management_pending.request_token == second.request_token);
	f.deliver_management(1, true); test.assert(f.context().screen == 'base'); f.view.root.remove();
});

behavior.scenario('Escape before deferred selection sends no management command', () => {
	const f = fixture(); f.events.select_base(f.base);
	test.assert(f.list.frame.emit('keydown', {code: 'ESCAPE', modifiers: {}}));
	for (timer of f.view.timers) { if (timer.interval == 0 && timer.running) { timer.tick(); } }
	test.assert(f.management_requests == [] && !f.popup.is_shown()); f.view.root.remove();
});

behavior.scenario('intervening actual confirmation modal keeps input ownership after management acknowledgement', () => {
	const f = fixture(); f.action('join'); f.defer_management = true; f.action('open');
	let results = 0; f.popup.show('turn_confirmation', (result) => { results = results + 1; });
	f.deliver_management(0, true);
	test.assert(f.popup.is_shown() && f.popup.popup.id == 'turn_confirmation' && results == 0 && f.list.management_pending == null);
	f.popup.popup.el.emit('keydown', {code: 'ESCAPE', modifiers: {}});
	test.assert(!f.popup.is_shown() && results == 1); f.view.root.remove();
});

behavior.scenario('owned base navigation may reconcile while the preceding base screen stays shown', () => {
	const f = fixture(); f.action('open'); f.defer_management = true; let second = null;
	f.native.with_write(() => { f.native.add_snapshot_base(0, 2); });
	for (base of f.game.bm.get_bases()) { if (base != f.base) { second = base; } }
	test.assert(second != null); f.events.select_base(second);
	for (timer of f.view.timers) { if (timer.interval == 0 && timer.running) { timer.tick(); } }
	const screen = f.popup.popup_def;
	test.assert(f.popup.popup.id == 'base_screen' && screen.base == f.base && f.list.management_pending.base_id == second.id, 'Original base remains visible before navigation acknowledgement');
	f.deliver_management(1, true);
	test.assert(f.popup.popup.id == 'base_screen' && screen.base == second && f.list.management_pending == null, 'Matching acknowledgement renders the second actual base');
	f.view.root.remove();
});

behavior.scenario('in-flight native Hold completion changes selection and cancels the pending base opening', () => {
	const f = fixture(); const flush = f.flush; f.flush = () => {};
	f.action('hold'); test.assert(#sizeof(f.state.queued) == 1 && f.units[2].get_order() == 'NO_ORDERS');
	f.flush = flush; f.defer_management = true; f.action('open');
	test.assert(f.units[2].get_order() == 'HOLD' && f.selected_id() == f.units[0].id && f.list.management_pending == null);
	f.deliver_management(0, true); test.assert(!f.popup.is_shown()); f.view.root.remove();
});
