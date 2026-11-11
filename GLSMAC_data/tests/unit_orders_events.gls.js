// Authoritative GSE handlers on actual native entities. No expected command
// effects are supplied by display/transport mocks in this suite.
const behavior = #include('./_behavior');
const hold = #include('../default/game/event/unit_hold');
const sentry = #include('../default/game/event/unit_sentry');
const activate = #include('../default/game/event/unit_activate');
const skip = #include('../default/game/event/unit_skip_turn');

const event = (f, data, caller) => {
	const e = { caller: caller }; e.game = f.game; e.data = data;
	return e;
};
const apply = (f, handler, e) => {
	const reason = handler.validate(e);
	test.assert(!#is_defined(reason), #is_defined(reason) ? reason : 'Accepted native command');
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
	for (handler of [hold, sentry, activate, skip]) {
		for (data of [{}, { unit_id: null }, { unit_id: '1' }, { unit_id: 0 }, { unit_id: (0 - 1) }, { unit_id: 99999 }]) {
			rejected(f, handler, event(f, data, 1));
		}
		rejected(f, handler, event(f, { unit_id: f.unit_id }, 0));
	}
});

behavior.scenario('dead locked and completed or inactive turns reject every unit command', () => {
	for (kind of ['dead', 'locked', 'completed', 'inactive']) {
		const f = test.founding_fixture(); f.configure(kind);
		for (handler of [hold, sentry, activate, skip]) { rejected(f, handler, event(f, { unit_id: f.unit_id }, 1)); }
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
	for (handler of [hold, sentry, activate, skip]) { rejected(f, handler, event(f, { unit_id: unit.id }, 1)); }
});

behavior.scenario('legacy wrapper requests require the exact current native manager entity', () => {
	const f = test.founding_fixture(); const other = test.founding_fixture();
	const data = {}; data.unit = f.game.um.get_unit(f.unit_id);
	const e = event(f, data, 1); apply(f, skip, e); f.with_write(() => { skip.rollback(e); });
	const wrong = { unit_id: f.unit_id }; wrong.unit = other.game.um.get_unit(other.unit_id);
	for (handler of [hold, sentry, activate, skip]) { rejected(f, handler, event(f, wrong, 1)); }
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

// Capture every actual unit, including the other participant's Scout. This is
// detached observation through public native properties and methods, not a
// display mock predicting command effects.
const unit_state = (f, id) => {
	const unit = f.game.um.get_unit(id); const tile = unit.get_tile();
	return {id: unit.id + 0, owner: unit.owner + 0, definition: unit.def,
		x: tile.x + 0, y: tile.y + 0, movement: unit.movement + 0.0,
		health: unit.health + 0.0, morale: unit.morale + 0, moved: unit.moved_this_turn == true,
		order: unit.get_order(), home: unit.get_terraform_home(), work: unit.get_terraforming(),
		plan: unit.get_automation(), recovery: unit.get_terraforming_recovery()};
};
const all_unit_states = (f) => {
	const result = [];
	for (id of f.inspect().unit_ids) { result :+ unit_state(f, id); }
	return result;
};
const world_state = (f) => {
	const result = {bytes: f.snapshot(), turn: f.game.get_turn() + 0, players: []};
	for (player of f.game.get_players()) {
		const row = {id: player.id + 0, completed: f.game.is_turn_complete(player.id)};
		row.energy = player.get_energy_state(); row.research = f.game.get_research_state(player.id); row.science = f.game.get_research_science(player.id);
		result.players :+ row;
	}
	return result;
};

for (command of [
	{ name: 'Hold', handler: hold, order: 'HOLD' },
	{ name: 'Sentry', handler: sentry, order: 'SENTRY' },
	{ name: 'Activate', handler: activate, order: 'NO_ORDERS' },
	{ name: 'Skip', handler: skip, order: 'NO_ORDERS' },
]) {
	for (owner of [0, 1]) {
		behavior.scenario(command.name + ' isolates the command and undo to native owner ' + #to_string(owner), () => {
			const f = test.founding_fixture(); f.enable_economy();
			const first = f.add_scout(0); const second = f.add_scout(1);
			const id = owner == 0 ? first : second; const unit = f.game.um.get_unit(id);
			if (command.name == 'Activate') { f.with_write(() => { unit.set_order('HOLD'); }); }
			const before = world_state(f); const state = all_unit_states(f); const inspect = f.inspect();
			const e = event(f, {unit_id: id}, owner); apply(f, command.handler, e);
			const after = all_unit_states(f);
			test.assert(#sizeof(before.players) == 2 && #sizeof(state) == 3 && #sizeof(after) == 3, 'Observe both actual players and the initial Colony Pod');
			for (let index = 0; index < #sizeof(state); index++) {
				const was = state[index]; const now = after[index];
				if (was.id == id) {
					test.assert(now.order == command.order && now.owner == owner);
					test.assert(now.movement == (command.name == 'Skip' ? 0.0 : was.movement));
					test.assert(now.health == was.health && now.morale == was.morale && now.moved == was.moved);
				} else { test.assert(now == was, 'Commands preserve each companion and foreign unit in full'); }
			}
			test.assert(f.inspect().rng == inspect.rng && f.inspect().next_unit_id == inspect.next_unit_id);
			f.with_write(() => { command.handler.rollback(e); });
			test.assert(world_state(f) == before, 'Undo restores unit and base bytes and every active player\'s observed state');
		});
	}
}

for (kind of ['dead', 'locked', 'completed', 'inactive']) {
	behavior.scenario('apply rechecks a native ' + kind + ' change after successful validation', () => {
		for (handler of [hold, sentry, activate, skip]) {
			const f = test.founding_fixture();
			const e = event(f, {unit_id: f.unit_id}, 1);
			test.assert(!#is_defined(handler.validate(e)), 'The request was valid before delivery was delayed');
			f.configure(kind);
			const before = world_state(f);
			const inspect = f.inspect(); let failed = false;
			try { f.with_write(() => { handler.apply(e); }); } catch { : (error) => { failed = true; } }
			test.assert(failed, 'An earlier successful validation does not authorize a changed world');
			const after = world_state(f);
			test.assert(after == before && f.inspect() == inspect);
		}
	});
}

behavior.scenario('interleaved owners can undo independently without undoing the other accepted command', () => {
	const f = test.founding_fixture(); f.enable_economy(); const first = f.add_scout(0); const second = f.add_scout(1);
	const before = world_state(f);
	const h = event(f, {unit_id: first}, 0); apply(f, hold, h);
	const s = event(f, {unit_id: second}, 1); apply(f, sentry, s);
	const foreign = unit_state(f, second);
	f.with_write(() => { hold.rollback(h); });
	test.assert(f.game.um.get_unit(first).get_order() == 'NO_ORDERS');
	test.assert(unit_state(f, second) == foreign);
	test.assert(world_state(f) != before, 'The other player\'s accepted Sentry is still present');
	f.with_write(() => { sentry.rollback(s); });
	test.assert(world_state(f) == before, 'Both independent undos restore both owners\' observed native state');
});

behavior.scenario('ordinary order receipts unwind in state order and reject an older overlapping receipt', () => {
	const f = test.founding_fixture(); const before = world_state(f);
	const h = event(f, {unit_id: f.unit_id}, 1); apply(f, hold, h);
	const s = event(f, {unit_id: f.unit_id}, 1); apply(f, sentry, s);
	const pending = world_state(f); const inspect = f.inspect(); let failed = false;
	try { f.with_write(() => { hold.rollback(h); }); } catch { : (error) => { failed = true; } }
	test.assert(failed && world_state(f) == pending && f.inspect() == inspect);
	f.with_write(() => { sentry.rollback(s); });
	test.assert(f.game.um.get_unit(f.unit_id).get_order() == 'HOLD');
	f.with_write(() => { hold.rollback(h); });
	test.assert(world_state(f) == before);
});

for (kind of ['movement', 'health', 'morale', 'moved', 'turn', 'order']) {
	behavior.scenario('ordinary undo refuses a later ' + kind + ' state without overwriting it', () => {
		for (handler of [hold, sentry, activate]) {
			const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
			f.with_write(() => { unit.set_order('SENTRY'); });
			const e = event(f, {unit_id: f.unit_id}, 1); apply(f, handler, e);
			f.with_write(() => {
				if (kind == 'movement') { unit.movement = 0.25; }
				if (kind == 'health') { unit.health = 0.5; }
				if (kind == 'morale') { unit.morale = 1.0; }
				if (kind == 'moved') { unit.moved_this_turn = false; }
				if (kind == 'order') { unit.set_order(unit.get_order() == 'HOLD' ? 'SENTRY' : 'HOLD'); }
			});
			if (kind == 'turn') { f.set_turn(2); }
			const before = world_state(f); const inspect = f.inspect(); let failed = false;
			try { f.with_write(() => { handler.rollback(e); }); } catch { : (error) => { failed = true; } }
			test.assert(failed && world_state(f) == before && f.inspect() == inspect);
		}
	});
}

behavior.scenario('receipts from a retired world cannot change the replacement world', () => {
	for (handler of [hold, sentry, activate, skip]) {
		const f = test.founding_fixture(); const e = event(f, {unit_id: f.unit_id}, 1); apply(f, handler, e);
		f.reset();
		const before = world_state(f); const inspect = f.inspect(); let failed = false;
		try { f.with_write(() => { handler.rollback(e); }); } catch { : (error) => { failed = true; } }
		test.assert(failed && world_state(f) == before && f.inspect() == inspect);
	}
});
