// GLSMAC native safety/rollback invariants. Other unit contexts are application
// policy, not additional original Disband observations.
const behavior = #include('./_behavior');
const reject = (callback) => { let rejected = false; try { callback(); } catch { : (error) => { rejected = true; } } test.assert(rejected); };
const disband = (f, id) => { let receipt = null; f.with_write(() => { receipt = f.game.disband_unit(id, f.owner.id, f.game.get_turn()); }); return receipt; };
behavior.scenario('ordinary native disband removes only its actual unit and receipt restores exact state', () => {
	const f = test.founding_fixture(); const before = f.snapshot(); const id = f.unit_id + 0; const tile = f.tile;
	test.assert(!#is_defined(f.game.validate_unit_disband(id, f.owner.id, f.game.get_turn())));
	const receipt = disband(f, id); test.assert(!f.game.um.has_unit(id) && #sizeof(tile.get_units()) == 0);
	test.assert(receipt.unit_id == id && receipt.owner == f.owner.id && receipt.turn_id == f.game.get_turn());
	f.with_write(() => { f.game.rollback_unit_disband(receipt); }); test.assert(f.snapshot() == before);
	reject(() => { f.with_write(() => { f.game.rollback_unit_disband(receipt); }); }); test.assert(f.snapshot() == before);
});
behavior.scenario('native identity owner turn and write guards reject before any removal', () => {
	const f = test.founding_fixture(); const before = f.snapshot(); const turn = f.game.get_turn();
	for (args of [[999999,f.owner.id,turn],[f.unit_id,0,turn],[f.unit_id,f.owner.id,turn + 1],[(0 - 1),f.owner.id,turn]]) {
		test.assert(#is_defined(f.game.validate_unit_disband(args[0], args[1], args[2])));
		reject(() => { f.with_write(() => { f.game.disband_unit(args[0], args[1], args[2]); }); });
	}
	reject(() => { f.game.disband_unit(f.unit_id, f.owner.id, turn); });
	reject(() => { f.game.validate_unit_disband('bad', f.owner.id, turn); }); test.assert(f.snapshot() == before);
});
behavior.scenario('native readiness and tile guards retain units under rejected removal', () => {
	for (kind of ['no_moves','dead','locked','completed','inactive','animating']) {
		const f = test.founding_fixture(); f.configure(kind); const before = f.snapshot();
		test.assert(#is_defined(f.game.validate_unit_disband(f.unit_id, f.owner.id, f.game.get_turn())));
		reject(() => { disband(f, f.unit_id); }); test.assert(f.snapshot() == before);
	}
});
behavior.scenario('lifecycle throw and forbidden mutation restore native state queues and random draws', () => {
	for (kind of ['throw','custom','unit','event']) {
		const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
		f.game.um.on('unit_despawn', (e) => {
			f.game.random.get_int(0, 10);
			if (kind == 'custom') { f.base.set('accumulated_nutrients', 999); }
			else if (kind == 'unit') { unit.movement = 0.0; }
			else if (kind == 'event') { f.game.event('unit_hold', {unit_id: f.unit_id}); }
			else { throw AbortDisband('controlled lifecycle rejection'); }
		});
		const before = f.snapshot(); const inspected = f.inspect();
		reject(() => { disband(f, f.unit_id); }); test.assert(f.snapshot() == before && f.inspect() == inspected && f.game.um.get_unit(f.unit_id) == unit);
	}
});
behavior.scenario('native disband receipts reject wrong identity and enforce reverse transaction order', () => {
	const f = test.founding_fixture(); const second_id = f.add_colony(0, 2); const before = f.snapshot();
	const first = disband(f, f.unit_id); const second = disband(f, second_id); const removed = f.snapshot();
	for (field of ['transaction_id','unit_id','owner','turn_id']) {
		const wrong = #clone(second); wrong[field] = wrong[field] + 1;
		reject(() => { f.with_write(() => { f.game.rollback_unit_disband(wrong); }); }); test.assert(f.snapshot() == removed);
	}
	reject(() => { f.with_write(() => { f.game.rollback_unit_disband(first); }); }); test.assert(f.snapshot() == removed);
	f.with_write(() => { f.game.rollback_unit_disband(second); f.game.rollback_unit_disband(first); }); test.assert(f.snapshot() == before);
});
behavior.scenario('stale native turn or changed prototype cannot resurrect a disbanded unit', () => {
	for (kind of ['turn','prototype']) {
		const f = test.founding_fixture(); const receipt = disband(f, f.unit_id);
		if (kind == 'turn') { f.set_turn(f.game.get_turn() + 1); }
		else { f.with_write(() => { f.game.um.undefine_unit('ColonyPod'); }); }
		const before = f.snapshot(); reject(() => { f.with_write(() => { f.game.rollback_unit_disband(receipt); }); }); test.assert(f.snapshot() == before);
	}
});
behavior.scenario('receipt restores the complete paused native work payload and scalar unit state', () => {
	const f = test.founding_fixture(); const unit = f.game.um.get_unit(f.unit_id);
	f.with_write(() => { unit.set_terraforming({action: 'farm', work_units: 2, required_work: 8, last_turn: f.game.get_turn(), previous_work_units: 0,
		previous_movement: 0.75, previous_moved: true, tile_x: unit.get_tile().x, tile_y: unit.get_tile().y, active: false}); });
	const work = unit.get_terraforming(); const before = f.snapshot(); const receipt = disband(f, f.unit_id);
	f.with_write(() => { f.game.rollback_unit_disband(receipt); });
	test.assert(f.snapshot() == before && f.game.um.get_unit(f.unit_id).get_terraforming() == work);
});
behavior.scenario('successful lifecycle random draws are undone by the matching native receipt', () => {
	const f = test.founding_fixture(); f.game.um.on('unit_despawn', () => { f.game.random.get_int(0, 10); });
	const before = f.snapshot(); const receipt = disband(f, f.unit_id); f.with_write(() => { f.game.rollback_unit_disband(receipt); }); test.assert(f.snapshot() == before);
});
