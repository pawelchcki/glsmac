// Bounded GLSMAC Colony Pod production policy, not original-game observations.
// Real production events and native founding-fixture objects own the lifecycle.
const behavior = #include('./_behavior');
const select = #include('../default/game/event/set_base_production');
const process = #include('../default/game/event/process_base_production');
const fixture = () => {
	const f = test.founding_fixture();
	f.with_write(() => {
		f.owner.add_production_choice('COLONY_POD', {
			type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1,
		});
	});
	return f;
};
const event = (f, caller, data) => {
	const e = { caller: caller, applied: {} };
	e.game = f.game; e.data = data; e.data.base = f.base;
	return e;
};
const apply = (f, handler, e) => {
	const error = handler.validate(e);
	test.assert(!#is_defined(error), #is_defined(error) ? error : '');
	f.with_write(() => { e.applied = handler.apply(e); });
	return e;
};
const choose = (f) => { return apply(f, select, event(f, f.owner.id, { choice_id: 'COLONY_POD' })); };
const credit = (f, turn, minerals) => {
	f.set_turn(turn);
	return apply(f, process, event(f, 0, { turn_id: turn, minerals: minerals }));
};

behavior.scenario('Colony Pod recipe can be selected through the real production event', () => {
	const f = fixture();
	f.set_turn(1);
	const initial = f.base.get_production();
	const e = apply(f, select, event(f, f.owner.id, { choice_id: 'COLONY_POD' }));
	test.assert(f.base.get_production().choice_id == 'COLONY_POD');
	test.assert(f.base.get_production().last_processed_turn == 1);
	f.with_write(() => { select.rollback(e); });
	test.assert(f.base.get_production() == initial);
});

behavior.scenario('unit completion event creates one owned pod consumes one citizen and rolls back with its receipt', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1);
	f.set_turn(1); choose(f); f.set_turn(2);
	const before = f.snapshot();
	const e = credit(f, 2, 37);
	const units = f.base.get_tile().get_units();
	test.assert(#sizeof(units) == 1 && units[0].owner == f.owner.id);
	test.assert(units[0].get_def().id == 'ColonyPod');
	test.assert(f.base.get_size() == 1);
	test.assert(f.base.get_production() == { choice_id: '', minerals: 7, last_processed_turn: 2 });
	test.assert(#typeof(e.applied.unit_receipt) == 'Int' && e.applied.added_facility == '');
	const duplicate = event(f, 0, { turn_id: 2, minerals: 37 });
	test.assert(process.validate(duplicate) == 'Base production already processed for this turn');
	test.assert(#sizeof(f.base.get_tile().get_units()) == 1);
	f.with_write(() => { process.rollback(e); });
	test.assert(f.snapshot() == before, 'Event rollback must restore unit, citizen, production and native bookkeeping');
});

behavior.scenario('size-one unit project retains credited minerals until another citizen is available', () => {
	const f = fixture(); f.add_worker(0);
	f.set_turn(1); choose(f);
	const held = credit(f, 2, 37);
	test.assert(!#is_defined(held.applied.unit_receipt));
	test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: 37, last_processed_turn: 2 });
	test.assert(f.base.get_size() == 1 && f.base.get_tile().get_units() == []);
	f.add_worker(1);
	const completed = credit(f, 3, 0);
	test.assert(#typeof(completed.applied.unit_receipt) == 'Int');
	test.assert(f.base.get_size() == 1 && #sizeof(f.base.get_tile().get_units()) == 1);
	test.assert(f.base.get_production() == { choice_id: '', minerals: 7, last_processed_turn: 3 });
	f.set_turn(4); choose(f);
	test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: 7, last_processed_turn: 4 });
});

behavior.scenario('unit selection rejects a foreign caller and accepts active switching while same-project selection is idempotent', () => {
	const f = fixture(); f.set_turn(1);
	const initial = f.base.get_production();
	const foreign = event(f, f.owner.id + 1, { choice_id: 'COLONY_POD' });
	test.assert(select.validate(foreign) == 'Only base owner can select production');
	test.assert(f.base.get_production() == initial);
	choose(f); const selected = f.base.get_production();
	f.set_turn(2); choose(f);
	test.assert(f.base.get_production() == selected);
	const switch_project = event(f, f.owner.id, { choice_id: 'RECYCLING_TANKS' });
	test.assert(!#is_defined(select.validate(switch_project)));
	test.assert(f.base.get_production() == selected);
	apply(f, select, switch_project);
	test.assert(f.base.get_production() == { choice_id: 'RECYCLING_TANKS', minerals: 0, last_processed_turn: 2 });
});

behavior.scenario('throwing real unit-spawn callback leaves event completion unchanged', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1);
	f.set_turn(1); choose(f); f.set_turn(2);
	f.game.um.on('unit_spawn', (e) => {
		f.game.random.get_int(0, 10);
		throw SpawnError('abort completion');
	});
	const before = f.snapshot();
	let caught = false;
	try { credit(f, 2, 37); } catch { : (e) => { caught = true; } }
	test.assert(caught && f.snapshot() == before);
	test.assert(f.base.get_size() == 2 && f.base.get_tile().get_units() == []);
});

behavior.scenario('processing rollback dispatches an optional unit receipt without falling through to facility restore', () => {
	const state = { receipt: 0, restored: false };
	const base = {
		rollback_unit_production: (receipt) => { state.receipt = receipt; },
		restore_production: (previous, added_facility) => { state.restored = true; },
	};
	process.rollback({ data: { base: base }, applied: { unit_receipt: 123 } });
	test.assert(state.receipt == 123 && !state.restored);
	process.rollback({ data: { base: base }, applied: { previous: {}, added_facility: '' } });
	test.assert(state.restored);
});
