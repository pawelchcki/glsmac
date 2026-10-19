// Authoritative GSE handlers on actual native entities. No expected command
// effects are supplied by display/transport mocks in this suite.
const behavior = #include('./_behavior');
const hold = #include('../default/game/event/unit_hold');
const activate = #include('../default/game/event/unit_activate');
const skip = #include('../default/game/event/unit_skip_turn');

const event = (f, data, caller) => {
	const e = { caller: caller }; e.game = f.game; e.data = data;
	return e;
};
const apply = (f, handler, e) => {
	test.assert(!#is_defined(handler.validate(e)));
	f.with_write(() => { e.applied = handler.apply(e); });
};
const rejected = (f, handler, e) => {
	const before = f.snapshot(); const inspect = f.inspect();
	test.assert(#typeof(handler.validate(e)) == 'String');
	test.assert(f.snapshot() == before && f.inspect() == inspect, 'Rejected validation changes no state RNG IDs or queues');
	let failed = false;
	try { f.with_write(() => { handler.apply(e); }); } catch { : (error) => { failed = true; } }
	test.assert(failed && f.snapshot() == before && f.inspect() == inspect, 'Apply rechecks authoritative guards');
};

behavior.scenario('Hold and Activate receipts restore exact original order without spending movement', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
	const before = f.snapshot(); const movement = unit.movement + 0.0;
	const h = event(f, { unit_id: f.unit_id }, 1); apply(f, hold, h);
	test.assert(unit.get_order() == 'HOLD' && unit.movement == movement && !unit.needs_orders());
	const a = event(f, { unit_id: f.unit_id }, 1); apply(f, activate, a);
	test.assert(unit.get_order() == 'NO_ORDERS' && unit.movement == movement && unit.needs_orders());
	f.with_write(() => { activate.rollback(a); });
	test.assert(unit.get_order() == 'HOLD' && unit.movement == movement);
	f.with_write(() => { hold.rollback(h); });
	test.assert(f.snapshot() == before);
});

behavior.scenario('Skip spends only movement and its rollback restores the native unit exactly', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
	const before = f.snapshot();
	const e = event(f, { unit_id: f.unit_id }, 1); apply(f, skip, e);
	test.assert(unit.movement == 0.0 && unit.get_order() == 'NO_ORDERS' && !unit.needs_orders());
	f.with_write(() => { skip.rollback(e); }); test.assert(f.snapshot() == before);
});

behavior.scenario('Activate does not replenish exhausted movement and Hold accepts manual exhausted selection', () => {
	const f = test.founding_fixture(); f.configure('no_moves');
	const unit = f.game.um.get_unit(f.unit_id);
	const h = event(f, { unit_id: f.unit_id }, 1); apply(f, hold, h);
	test.assert(unit.get_order() == 'HOLD' && unit.movement == 0.0);
	const a = event(f, { unit_id: f.unit_id }, 1); apply(f, activate, a);
	test.assert(unit.get_order() == 'NO_ORDERS' && unit.movement == 0.0 && !unit.needs_orders());
	rejected(f, skip, event(f, { unit_id: f.unit_id }, 1));
});

behavior.scenario('malformed nonexistent and foreign identities are rejected without mutation', () => {
	const f = test.founding_fixture();
	for (handler of [hold, activate, skip]) {
		for (data of [{}, { unit_id: null }, { unit_id: '1' }, { unit_id: 0 }, { unit_id: (0 - 1) }, { unit_id: 99999 }]) {
			rejected(f, handler, event(f, data, 1));
		}
		rejected(f, handler, event(f, { unit_id: f.unit_id }, 0));
	}
});

behavior.scenario('dead locked and completed or inactive turns reject every unit command', () => {
	for (kind of ['dead', 'locked', 'completed', 'inactive']) {
		const f = test.founding_fixture(); f.configure(kind);
		for (handler of [hold, activate, skip]) { rejected(f, handler, event(f, { unit_id: f.unit_id }, 1)); }
	}
});

behavior.scenario('native immovable definitions cannot receive these movement orders', () => {
	const f = test.founding_fixture(); let unit = null;
	f.with_write(() => {
		f.game.um.define_unit('Fixed', { name: 'Fixed', morale: 'SYNTHETIC', type: 'static', movement_type: 'immovable', movement_per_turn: 0,
			render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 } });
		const data = { def: 'Fixed', health: 1.0, morale: 2 }; data.owner = f.owner; data.tile = f.base.get_tile();
		unit = f.game.um.spawn_unit(data);
	});
	for (handler of [hold, activate, skip]) { rejected(f, handler, event(f, { unit_id: unit.id }, 1)); }
});

behavior.scenario('legacy wrapper requests require the exact current native manager entity', () => {
	const f = test.founding_fixture(); const other = test.founding_fixture();
	const data = {}; data.unit = f.game.um.get_unit(f.unit_id);
	const e = event(f, data, 1); apply(f, skip, e); f.with_write(() => { skip.rollback(e); });
	const wrong = { unit_id: f.unit_id }; wrong.unit = other.game.um.get_unit(other.unit_id);
	for (handler of [hold, activate, skip]) { rejected(f, handler, event(f, wrong, 1)); }
});

behavior.scenario('rollback cannot apply an old receipt to a despawned and replaced scalar id', () => {
	const f = test.founding_fixture(); const id = f.unit_id;
	const h = event(f, { unit_id: id }, 1); apply(f, hold, h);
	f.with_write(() => {
		f.game.um.despawn_unit(id);
		const data = { id: id, def: 'Scout', health: 1.0, morale: 2 }; data.owner = f.owner; data.tile = f.base.get_tile();
		f.game.um.spawn_unit(data);
	});
	const before = f.snapshot(); const inspect = f.inspect(); let failed = false;
	try { f.with_write(() => { hold.rollback(h); }); } catch { : (error) => { failed = true; } }
	test.assert(failed && f.snapshot() == before && f.inspect() == inspect);
});
