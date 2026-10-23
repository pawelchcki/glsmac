// Native world/events/units; only owned timer delivery is explicitly controlled.
const behavior = #include('./_behavior');
const policy = #include('../default/ui/parts/game/auto_end_turn');
const make = () => {
	const f = test.natural_startup_fixture(16, 16, 'flat-arid');
	#include('./_natural_startup_mechanics')(f);
	f.initialize_single_player('GAIANS'); f.start_world(true);
	const game = f.game; const state = game.get_opening_state(); const bases = game.bm.get_bases(); const base = bases[0];
	game.event('opening_command', {session: state.session, action: 'planetfall', base_id: 0, previous_name: '', name: ''}); f.process_events();
	game.event('opening_command', {session: state.session, action: 'name', base_id: base.id, previous_name: base.name + '', name: 'Synthetic Haven'}); f.process_events(); f.opening_tick();
	game.event('opening_command', {session: state.session, action: 'dismiss', base_id: 0, previous_name: '', name: ''}); f.process_events();
	const view = #include('./_ui_mocks').display();
	// Native EventEmitter::off takes event name and token; the display fixture's
	// default emitter has only a token. Preserve native subscription semantics.
	view.root.listen = (target, name, callback) => { const id = target.on(name, callback); view.root.on('remove', () => { target.off(name, id); }); };
	policy(game, view.root);
	const result = {}; result.f = f; result.game = game; result.view = view; result.base = base;
	result.tick = () => { for (timer of view.timers) { timer.tick(); } };
	result.skip = () => { for (unit of base.get_tile().get_units()) { if (unit.owner == 0 && unit.movement > 0.0) { game.event('unit_skip_turn', {unit_id: unit.id}); } } f.process_events(); };
	return result;
};
behavior.scenario('Accepted final-unit orders use normal complete-turn and keep working on later turns', () => {
	const f = make(); const counts = {complete: 0};
	f.game.on('event_result', (e) => { if (e.name == 'complete_turn' && e.success) { counts.complete = counts.complete + 1; } });
	for (turn of [1, 2, 3]) {
		test.assert(f.game.get_turn() == turn && f.game.get_um().has_ready_unit(0));
		f.skip(); test.assert(f.game.get_turn() == turn && !f.game.get_um().has_ready_unit(0));
		f.tick(); f.f.process_events(); test.assert(f.game.get_turn() == turn + 1);
	}
	test.assert(counts.complete == 3); f.view.root.remove();
});
behavior.scenario('Remaining ready units and rejected orders cannot automatically complete a turn', () => {
	const f = make(); let other = null;
	f.f.with_write(() => { const units = f.base.get_tile().get_units(); const initial = units[0]; const data = {def: initial.def, health: 1.0, morale: 2}; data.owner = f.game.get_player(); data.tile = f.base.get_tile(); other = f.game.um.spawn_unit(data); });
	f.game.event('unit_skip_turn', {unit_id: other.id}); f.f.process_events(); f.tick(); f.f.process_events();
	test.assert(f.game.get_turn() == 1 && f.game.get_um().has_ready_unit(0));
	test.assert(#sizeof(f.view.timers) == 0, 'A ready companion never starts a polling timer');
	f.game.event('unit_skip_turn', {unit_id: other.id}); f.f.process_events(); f.tick(); f.f.process_events();
	test.assert(f.game.get_turn() == 1);
	f.skip(); f.tick(); f.f.process_events(); test.assert(f.game.get_turn() == 2); f.view.root.remove();
});
behavior.scenario('Accepted movement waits for its actual native completion and readiness notification', () => {
	const f = make(); f.f.enable_movement(); const units = f.base.get_tile().get_units(); const unit = units[0];
	const tile = unit.get_tile(); const destination = f.game.tm.get_tile((tile.x + 2) % 16, tile.y);
	const data = {}; data.unit = unit; data.tile = destination;
	f.game.event('move_unit', data); f.f.process_events();
	test.assert(unit.movement > 0.0 && f.game.get_turn() == 1, 'Accepted movement has not yet spent moves during animation');
	test.assert(#sizeof(f.view.timers) == 0, 'An in-flight order does not poll readiness');
	f.f.finish_unit_move(unit.id);
	test.assert(unit.movement == 0.0 && !f.game.get_um().has_ready_unit(0));
	test.assert(#sizeof(f.view.timers) == 1, 'Native turn-complete notification schedules one owned confirmation');
	f.tick(); f.f.process_events(); test.assert(f.game.get_turn() == 2);
	f.tick(); f.f.process_events(); test.assert(f.game.get_turn() == 2, 'Stale timer cannot advance the next turn');
	f.view.root.remove();
});
behavior.scenario('Explicit pause is rechecked before completing, and removing UI cancels pending work', () => {
	const f = make(); f.skip(); f.game.set_auto_end_turn(false); f.tick(); f.f.process_events();
	test.assert(f.game.get_turn() == 1 && !f.game.is_turn_complete(0));
	f.game.set_auto_end_turn(true);
	// A canceled timer is not an implicit request to complete without a new order.
	f.tick(); f.f.process_events(); test.assert(f.game.get_turn() == 1);
	f.view.root.remove(); f.f.retire(); f.tick(); test.assert(f.game.get_turn() == 0);
	const removed = make(); removed.skip(); removed.view.root.remove(); removed.tick(); removed.f.process_events();
	test.assert(removed.game.get_turn() == 1, 'Removing the actual owner cancels its pending completion');
	removed.f.retire(); removed.tick(); test.assert(removed.game.get_turn() == 0);
});
