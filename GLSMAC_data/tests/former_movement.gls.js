const behavior = #include('./_behavior');
const fixture = #include('./_former_movement_fixture');
const move = #include('../default/game/event/move_unit');
const work = #include('../default/game/event/unit_terraform');

behavior.scenario('three native road moves exhaust one movement point and the next turn restores it', () => {
	const f = fixture(); let index = 1;
	for (x of [0, 2, 0]) {
		const e = f.move(x); const unit = f.current_unit();
		test.assert(e.resolved.is_movement_successful && unit.get_tile().x == x && unit.moved_this_turn);
		test.assert(#round(unit.movement * 3.0) == 3 - index); index++;
	}
	f.advance(); test.assert(f.current_unit().movement == 1.0 && !f.current_unit().moved_this_turn);
	f.move(2); test.assert(#round(f.current_unit().movement * 3.0) == 2);
});

for (rate of [1, 2, 4, 8]) {
	behavior.scenario('edited installed rate reaches actual native movement ' + #to_string(rate), () => {
		const f = fixture(); const consumer = #include('../default/game/movement_rules');
		f.game.set('movement_rules', consumer.parse(test.parse_smac_text('#RULES\n' + #to_string(rate) + ',\n#END\n', 'rules')));
		let x = 0;
		for (let step = 1; step <= rate; step++) {
			const e = f.move(x); const unit = f.current_unit();
			test.assert(e.resolved.is_movement_successful && #round(unit.movement * #to_float(rate)) == rate - step);
			x = x == 0 ? 2 : 0;
		}
		test.assert(f.current_unit().movement == 0.0);
	});
}

behavior.scenario('native movement rollback restores unit tile flags and RNG exactly', () => {
	const f = fixture(); const before = f.snapshot(); const e = f.move(0);
	test.assert(f.current_unit().get_tile().x == 0);
	f.with_write(() => { move.rollback(e); }); f.finish_unit_move(f.former.id);
	test.assert(f.snapshot() == before);
});

behavior.scenario('live road edits take effect after a tile wrapper was retained', () => {
	const f = fixture(); const held = f.current_unit().get_tile();
	f.with_write(() => { f.game.tm.set_terraforming(2, 2, {road: false, farm: false, mine: false, forest: false}); });
	f.move(0); test.assert(f.current_unit().movement == 0.0);
	f.advance();
	f.with_write(() => { f.game.tm.set_terraforming(2, 2, {road: true, farm: false, mine: false, forest: false}); });
	f.move(2); test.assert(held.x == 2 && #round(f.current_unit().movement * 3.0) == 2);
});

for (steps of [1, 2]) {
	behavior.scenario('partial road movement work cancellation retains its tick and exhausted resume grants no extra work ' + #to_string(steps), () => {
		const f = fixture(); f.move(0); if (steps == 2) { f.move(2); }
		f.command('farm');
		test.assert(f.current_unit().movement == 0.0 && f.current_unit().get_terraforming().work_units == 2);
		f.command('cancel_work');
		test.assert(f.current_unit().movement == 0.0 && f.current_unit().moved_this_turn && f.current_unit().get_terraforming().work_units == 2);
		f.command('farm'); test.assert(f.current_unit().get_terraforming().work_units == 2);
		f.advance();
		test.assert(f.current_unit().get_terraforming().work_units == 4 && f.current_unit().movement == 0.0);
		f.command('cancel_work');
		test.assert(f.current_unit().movement == 1.0 && !f.current_unit().moved_this_turn && f.current_unit().get_terraforming().work_units == 2);
	});
}

behavior.scenario('work command rollback after a road move preserves the complete native snapshot', () => {
	const f = fixture(); f.move(0); const before = f.snapshot(); const e = f.command('farm');
	f.with_write(() => { work.rollback(e); });
	test.assert(f.snapshot() == before);
});

behavior.scenario('partial native movement rollback preserves exact remaining movement and history', () => {
	const f = fixture(); f.move(0); const before = f.snapshot(); const e = f.move(2);
	f.with_write(() => { move.rollback(e); }); f.finish_unit_move(f.former.id);
	test.assert(f.snapshot() == before && f.current_unit().moved_this_turn);
});

for (kind of ['different-task', 'changed-requirement', 'changed-position']) {
	behavior.scenario('exhausted retained work cannot bypass command validation for ' + kind, () => {
		const f = fixture(); f.move(0); f.command('farm'); f.command('cancel_work');
		const e = {caller: f.owner.id, data: {unit_id: f.former.id, action: 'farm'}}; e.game = f.game;
		if (kind == 'different-task') { e.data.action = 'mine'; }
		if (kind == 'changed-requirement') { const rules = f.game.get('terraforming_rules'); const farm = rules.farm; farm.turns = 5; }
		if (kind == 'changed-position') {
			f.with_write(() => { const state = f.current_unit().get_terraforming(); state.tile_x = 2; f.current_unit().set_terraforming(state); });
		}
		const before = f.snapshot();
		test.assert(#is_defined(work.validate(e)));
		let caught = false; try { f.with_write(() => { work.apply(e); }); } catch { : (error) => { caught = true; } }
		test.assert(caught && f.snapshot() == before);
	});
}

behavior.scenario('exhausted same-task resume receipt restores retained inactive work exactly', () => {
	const f = fixture(); f.move(0); f.command('farm'); f.command('cancel_work');
	const before = f.snapshot(); const e = f.command('farm');
	test.assert(f.current_unit().get_order() == 'TERRAFORM' && f.current_unit().get_terraforming().work_units == 2);
	f.with_write(() => { work.rollback(e); }); test.assert(f.snapshot() == before);
});

behavior.scenario('repeated exhausted cancellation and resume never create extra work ticks', () => {
	const f = fixture(); f.move(0); f.command('farm');
	for (let index = 0; index < 3; index++) {
		f.command('cancel_work'); f.command('farm');
		test.assert(f.current_unit().get_terraforming().work_units == 2 && f.current_unit().movement == 0.0);
	}
	f.advance(); test.assert(f.current_unit().get_terraforming().work_units == 4);
});

behavior.scenario('work cannot start before the pending native move unlocks its tiles', () => {
	const f = fixture(); f.begin_move(0);
	const e = {caller: f.owner.id, data: {unit_id: f.former.id, action: 'farm'}}; e.game = f.game;
	test.assert(#is_defined(work.validate(e)) && f.current_unit().get_tile().x == 2);
	f.finish_unit_move(f.former.id);
	test.assert(!#is_defined(work.validate(e)) && f.current_unit().get_tile().x == 0);
});

const observe_world = #include('./_terrain_movement_observation');
behavior.scenario('moving cancelled location-bound work discards its credit and movement undo restores the retained job', () => {
	const f = fixture(); f.command('farm'); f.command('cancel_work'); f.advance();
	const before = observe_world(f); const work_before = f.current_unit().get_terraforming();
	test.assert(work_before.work_units == 2 && !work_before.active && work_before.tile_x == 2 && f.current_unit().movement == 1.0);
	const moved = f.move(0); const after = observe_world(f); const current = f.current_unit();
	test.assert(current.get_tile().x == 0 && current.get_terraforming().work_units == 0 && current.get_terraforming().action == '');
	test.assert(current.get_order() == 'NO_ORDERS' && after.terrain == before.terrain && after.players == before.players, 'Relocation abandons only the location-bound work, without changing terrain or either player');
	f.with_write(() => { move.rollback(moved); }); f.finish_unit_move(f.former.id);
	test.assert(observe_world(f) == before, 'Movement undo restores the complete original cancelled job and movement budget');
	const resumed = f.command('farm');
	test.assert(f.current_unit().get_terraforming().work_units == 4 && f.current_unit().get_terraforming().tile_x == 2);
	f.with_write(() => { work.rollback(resumed); }); test.assert(observe_world(f) == before);
});

behavior.scenario('movement undo preserves a later independent road edit and restores the quoted original budget', () => {
	const f = fixture(); const before = observe_world(f); const tm = f.game.tm;
	const moved = f.move(0); const flags = tm.get_terraforming(2,2); flags.road = false;
	let terrain_receipt = 0; f.with_write(() => { terrain_receipt = tm.apply_terrain([{x:2,y:2,terraforming:flags}],[]); });
	const changed_terrain = f.terrain_snapshot();
	f.with_write(() => { move.rollback(moved); }); f.finish_unit_move(f.former.id);
	const restored = observe_world(f);
	test.assert(restored.native == before.native && restored.units == before.units && restored.players == before.players);
	test.assert(restored.terrain == changed_terrain && !tm.get_terraforming(2,2).road && f.current_unit().movement == 1.0, 'Undo does not charge the new unconnected-road cost or erase the independent terrain change');
	f.with_write(() => { tm.rollback_terrain(terrain_receipt); });
	test.assert(observe_world(f) == before);
});
