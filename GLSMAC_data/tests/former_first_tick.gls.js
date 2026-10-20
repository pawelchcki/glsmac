const behavior = #include('./_behavior');
const fixture = #include('./_former_work_fixture');
const activate = #include('../default/game/event/unit_activate');
const work = #include('../default/game/event/unit_terraform');

behavior.scenario('recorded same-year cancellation retains the first Farm tick and exhausted resume adds none', () => {
	const f = fixture('normal'); f.command('farm'); f.command('cancel_work');
	let unit = f.game.um.get_unit(f.former.id);
	test.assert(unit.get_order() == 'NO_ORDERS' && unit.movement == 0.0 && unit.moved_this_turn && unit.get_terraforming().work_units == 2);
	f.command('farm'); unit = f.game.um.get_unit(f.former.id);
	test.assert(unit.get_order() == 'TERRAFORM' && unit.movement == 0.0 && unit.get_terraforming().work_units == 2);
	f.advance(); test.assert(f.game.um.get_unit(f.former.id).get_terraforming().work_units == 4);
	f.advance(); test.assert(f.game.um.get_unit(f.former.id).get_terraforming().work_units == 6);
	f.advance(); unit = f.game.um.get_unit(f.former.id);
	test.assert(unit.get_terraforming().work_units == 0 && unit.movement == 0.0 && f.game.tm.get_terraforming(2, 2).farm);
});

behavior.scenario('repeated first-year cancellation and exhausted resume cannot create movement or work', () => {
	const f = fixture('normal'); f.command('farm');
	for (let index = 0; index < 3; index++) {
		f.command('cancel_work');
		test.assert(f.game.um.get_unit(f.former.id).movement == 0.0 && f.former.get_terraforming().work_units == 2);
		f.command('farm');
		test.assert(f.game.um.get_unit(f.former.id).movement == 0.0 && f.former.get_terraforming().work_units == 2);
	}
	f.advance(); test.assert(f.former.get_terraforming().work_units == 4);
});

behavior.scenario('first-tick activation receipt restores the exact active work snapshot', () => {
	const f = fixture('normal'); f.command('farm'); const before = f.snapshot();
	const e = f.command('cancel_work');
	test.assert(f.former.get_order() == 'NO_ORDERS' && f.former.get_terraforming().work_units == 2);
	f.with_write(() => { activate.rollback(e); }); test.assert(f.snapshot() == before);
});

behavior.scenario('exhausted full-move resume receipt restores retained inactive work exactly', () => {
	const f = fixture('normal'); f.command('farm'); f.command('cancel_work');
	const before = f.snapshot(); const e = f.command('farm');
	test.assert(f.former.get_order() == 'TERRAFORM' && f.former.get_terraforming().work_units == 2);
	f.with_write(() => { work.rollback(e); }); test.assert(f.snapshot() == before);
});

behavior.scenario('retained exhausted Farm work cannot start a different task without movement', () => {
	const f = fixture('normal'); f.command('farm'); f.command('cancel_work');
	const e = {caller: f.owner.id, data: {unit_id: f.former.id, action: 'mine'}}; e.game = f.game;
	const before = f.snapshot(); test.assert(#is_defined(work.validate(e)));
	let caught = false; try { f.with_write(() => { work.apply(e); }); } catch { : (error) => { caught = true; } }
	test.assert(caught && f.snapshot() == before);
});

behavior.scenario('held-out edited Road declaration completes after its third native work tick', () => {
	const f = fixture('edited'); f.command('road');
	test.assert(f.former.get_terraforming().work_units == 2 && !f.game.tm.get_terraforming(2, 2).road);
	f.advance(); test.assert(f.former.get_terraforming().work_units == 4 && !f.game.tm.get_terraforming(2, 2).road);
	f.advance(); test.assert(f.former.get_terraforming().work_units == 0 && f.game.tm.get_terraforming(2, 2).road);
	f.advance(); test.assert(f.game.um.get_unit(f.former.id).movement == 1.0);
});
