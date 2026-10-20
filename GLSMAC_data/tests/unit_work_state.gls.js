// Native storage/lifetime prerequisites, not original work-time observations.
const behavior = #include('./_behavior');
const state = () => { return {action: 'farm', work_units: 2, required_work: 8, last_turn: 1,
	previous_work_units: 0, previous_movement: 1.0, previous_moved: false, tile_x: 0, tile_y: 0, active: true}; };

behavior.scenario('native work state owns its inputs and preserves active order through the real unit codec', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const data = state();
	f.with_write(() => { unit.set_terraforming(data); });
	test.assert(unit.get_order() == 'TERRAFORM' && !unit.needs_orders());
	test.assert(unit.get_terraforming() == data);
	data.work_units = 6; const exported = unit.get_terraforming(); exported.work_units = 4;
	test.assert(unit.get_terraforming().work_units == 2);
	const codec = f.unit_order_codec_probe(unit.id);
	test.assert(codec.roundtrip && codec.receiving_owner && codec.source_unchanged);
	test.assert(codec.invalid_rejected && codec.trailing_rejected && codec.truncated_rejected && codec.invalid_work_rejected && codec.receiver_unchanged);
	const sync = f.unit_order_sync_probe(unit.id);
	test.assert(sync.spawn && sync.update && sync.copied);
});

behavior.scenario('idle retained work and Hold retain progress without pretending an active work order', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const data = state(); data.active = false; data.last_turn = 0;
	f.with_write(() => { unit.set_terraforming(data); });
	test.assert(unit.get_order() == 'NO_ORDERS' && unit.needs_orders() && unit.get_terraforming().work_units == 2);
	f.with_write(() => { unit.set_order('HOLD'); });
	test.assert(unit.get_order() == 'HOLD' && !unit.get_terraforming().active && unit.get_terraforming().work_units == 2);
	test.assert(f.unit_order_codec_probe(unit.id).roundtrip);
});

behavior.scenario('native work mutation requires the authoritative write guard and retained methods reject despawned units', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); let denied = false;
	try { unit.set_terraforming(state()); } catch { : (e) => { denied = true; } }
	test.assert(denied && unit.get_order() == 'NO_ORDERS');
	const read = unit.get_terraforming; const write = unit.set_terraforming;
	f.with_write(() => { f.game.um.despawn_unit(unit.id); });
	let stale_read = false; let stale_write = false;
	try { read(); } catch { : (e) => { stale_read = true; } }
	try { f.with_write(() => { write(state()); }); } catch { : (e) => { stale_write = true; } }
	test.assert(stale_read && stale_write);
});

behavior.scenario('clearing native work restores the exact idle unit snapshot', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
	const empty = unit.get_terraforming(); const before = f.snapshot();
	f.with_write(() => { unit.set_terraforming(state()); unit.set_terraforming(empty); });
	test.assert(unit.get_order() == 'NO_ORDERS' && unit.get_terraforming() == empty && f.snapshot() == before);
});

behavior.scenario('retained native work methods reject after a world is retired', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
	const read = unit.get_terraforming; const write = unit.set_terraforming; f.reset(); const before = f.snapshot();
	let stale_read = false; let stale_write = false;
	try { read(); } catch { : (e) => { stale_read = true; } }
	try { f.with_write(() => { write(state()); }); } catch { : (e) => { stale_write = true; } }
	test.assert(stale_read && stale_write && f.snapshot() == before);
});

behavior.scenario('native work callables reject incomplete extra and direct active order mutations atomically', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id); const before = f.snapshot();
	let rejected = 0;
	try { unit.get_terraforming(1); } catch { : (e) => { rejected++; } }
	try { f.with_write(() => { unit.set_terraforming(); }); } catch { : (e) => { rejected++; } }
	try { f.with_write(() => { unit.set_terraforming(state(), 1); }); } catch { : (e) => { rejected++; } }
	try { f.with_write(() => { unit.set_terraforming({active: true}); }); } catch { : (e) => { rejected++; } }
	const extra = state(); extra.extra = true;
	try { f.with_write(() => { unit.set_terraforming(extra); }); } catch { : (e) => { rejected++; } }
	try { f.with_write(() => { unit.set_order('TERRAFORM'); }); } catch { : (e) => { rejected++; } }
	test.assert(rejected == 6 && f.snapshot() == before);
});

let index = 0;
for (command of ['unit_hold', 'unit_activate']) {
	behavior.scenario('shipped ' + command + ' rollback restores the complete prior active native work state', () => {
		const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
		f.with_write(() => { unit.set_terraforming(state()); }); const before = f.snapshot();
		const handler = #include('../default/game/event/' + command);
		const event = {caller: 1, data: {unit_id: f.unit_id}}; event.game = f.game;
		test.assert(!#is_defined(handler.validate(event)));
		f.with_write(() => { event.applied = handler.apply(event); });
		test.assert(!unit.get_terraforming().active);
		f.with_write(() => { handler.rollback(event); });
		test.assert(f.snapshot() == before && unit.get_terraforming().active);
	});
}

for (invalid of [{key: 'action', value: 'unknown'}, {key: 'work_units', value: (0 - 1)}, {key: 'required_work', value: 2},
	{key: 'last_turn', value: (0 - 1)}, {key: 'previous_work_units', value: 3}, {key: 'previous_movement', value: (0.0 - 0.1)},
	{key: 'previous_movement', value: 1}, {key: 'tile_x', value: 1}, {key: 'active', value: 1}, {key: 'last_turn', value: 0},
	{key: 'required_work', value: 129}, {key: 'tile_y', value: 4}, {key: 'previous_movement', value: 65.0}]) {
	behavior.scenario('invalid native work payload preserves the complete prior native snapshot ' + #to_string(index), () => {
		const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
		f.with_write(() => { unit.set_terraforming(state()); }); const before = f.snapshot(); const inspected = f.inspect(); const updates = f.update_count();
		const data = state(); data[invalid.key] = invalid.value; let rejected = false;
		try { f.with_write(() => { unit.set_terraforming(data); }); } catch { : (e) => { rejected = true; } }
		test.assert(rejected && f.snapshot() == before && f.inspect() == inspected && f.update_count() == updates);
	}); index++;
}
