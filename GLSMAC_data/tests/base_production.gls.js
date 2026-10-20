// GLSMAC facility-production regressions, not original-game observations.
// Costs are supplied by the declared facility registry. Resource and growth
// boundaries below prove event ordering without reproducing native production.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const growth_stage = #include('../default/game/event/process_base_growth');

const callback_fixture = () => {
	const f = {};
	f.state = { globals: {}, handlers: {}, events: [], trace: [], bases: [], turn: 2 };
	const bm = {};
	bm.on = (name, callback) => {};
	bm.get_bases = () => { return f.state.bases; };
	f.game = {};
	f.game.get_bm = () => { return bm; };
	f.game.get_tm = () => { return {
		get_map_width: () => { return 20; },
		get_map_height: () => { return 20; },
	}; };
	f.game.get_turn = () => { return f.state.turn; };
	f.game.is_master = () => { return true; };
	f.game.on = (name, callback) => { f.state.handlers[name] = callback; };
	f.game.get = (key) => { return f.state.globals[key]; };
	f.game.set = (key, value) => { f.state.globals[key] = value; };
	f.game.event = (name, data) => {
		if (name == 'process_base_growth') {
			const e = { caller: 0 }; e.game = f.game; e.data = data;
			test.assert(!#is_defined(growth_stage.validate(e)));
			growth_stage.apply(e); return;
		}
		if (name == 'process_base_production') { data.base.record_production_turn(data.turn_id); }
		const record = { name: name }; record.data = data;
		f.state.events :+ record;
		f.state.trace :+ name;
	};
	f.add_base = (id, choice) => {
		const b = {};
		b.state = { minerals: 8, consumed: 1, nutrients: 0, accumulated: 0, size: 1, last_turn: 1, choice: choice };
		b.base = {};
		b.base.id = id;
		b.base.record_production_turn = (turn) => { b.state.last_turn = turn; };
		b.base.get_production = () => { return { choice_id: b.state.choice, minerals: 0, last_processed_turn: b.state.last_turn }; };
		b.base.get_intake = () => { return { NUTRIENTS: b.state.nutrients, MINERALS: b.state.minerals, ENERGY: 0 }; };
		b.base.get_consumption = () => { return { NUTRIENTS: 0, MINERALS: b.state.consumed, ENERGY: 0 }; };
		b.base.get_size = () => { return b.state.size; };
		b.base.get = (key) => { return key == 'accumulated_nutrients' ? b.state.accumulated : undefined; };
		b.base.has = (key) => { return key == 'accumulated_nutrients'; };
		b.base.set = (key, value) => {
			b.state.accumulated = value;
			b.state.minerals = 99; // Expose a growth mutation after the snapshot.
			f.state.trace :+ 'growth';
		};
		b.base.get_unworked_tiles = () => { return []; };
		const base = b.base;
		f.state.bases :+ base;
		return b;
	};
	configure_bases(f.game);
	f.state.handlers.start({});
	f.state.events = []; f.state.trace = [];
	return f;
};

behavior.scenario('production exports a shared mineral-surplus helper', () => {
	const f = callback_fixture();
	const pending = f.game.get('f_base_get_pending_production');
	test.assert(#typeof(pending) == 'Callable', 'Production must expose its real mineral helper to the base UI');
	const b = f.add_base(1, 'RECYCLING_TANKS');
	for (c of [[0 - 2, 3, 0], [0, 0, 0], [2, 3, 0], [3, 3, 0], [8, 1, 7]]) {
		b.state.minerals = c[0]; b.state.consumed = c[1];
		test.assert(pending(b.base) == c[2]);
	}
});
behavior.scenario('production snapshots minerals before growth can change resource intake', () => {
	const f = callback_fixture();
	const b = f.add_base(7, 'RECYCLING_TANKS');
	b.state.size = 0;
	f.state.handlers.turn({});
	test.assert(f.state.trace == ['process_base_production', 'growth', 'add_base_pop']);
	test.assert(#sizeof(f.state.events) == 2);
	const production = f.state.events[0];
	test.assert(production.data.base.id == 7 && production.data.turn_id == 2 && production.data.minerals == 7);
	test.assert(b.state.minerals == 99, 'Growth changed intake after the production snapshot');
	test.assert(f.state.events[1].name == 'add_base_pop' && f.state.events[1].data.type == 'DOCTOR');
});
behavior.scenario('idle bases preserve growth without emitting production credits', () => {
	const f = callback_fixture();
	const b = f.add_base(1, '');
	b.state.size = 0;
	f.state.handlers.turn({});
	test.assert(f.state.trace == ['growth', 'add_base_pop']);
	test.assert(#sizeof(f.state.events) == 1 && f.state.events[0].name == 'add_base_pop');
});
behavior.scenario('an initial project selected this turn waits for the next production credit', () => {
	const f = callback_fixture(); f.state.turn = 1;
	const b = f.add_base(1, 'COLONY_POD'); b.state.last_turn = 1;
	f.state.handlers.turn({});
	test.assert(f.state.events == [], 'Startup must not enqueue production already marked processed by initial selection');
	test.assert(b.state.last_turn == 1, 'Initial selection does not consume next-turn production');
	f.state.turn = 2; f.state.events = []; b.state.minerals = 8;
	f.state.handlers.turn({});
	test.assert(#sizeof(f.state.events) == 1 && f.state.events[0].name == 'process_base_production');
	test.assert(f.state.events[0].data.turn_id == 2 && f.state.events[0].data.minerals == 7);
});
behavior.scenario('each active base captures its own surplus without changing growth frequency', () => {
	const f = callback_fixture();
	const first = f.add_base(1, 'RECYCLING_TANKS');
	const idle = f.add_base(2, '');
	const last = f.add_base(3, 'RECYCLING_TANKS');
	last.state.minerals = 2; last.state.consumed = 4;
	f.state.handlers.turn({});
	test.assert(f.state.trace == ['process_base_production', 'growth', 'growth', 'process_base_production', 'growth']);
	test.assert(#sizeof(f.state.events) == 2);
	test.assert(f.state.events[0].data.base.id == 1 && f.state.events[0].data.minerals == 7);
	test.assert(f.state.events[1].data.base.id == 3 && f.state.events[1].data.minerals == 0);
});

behavior.scenario('default game registry installs both production event handlers', () => {
	const registered = {};
	const game = {};
	game.register_event = (name, handler) => { registered[name] = handler; };
	#include('../default/game/events')(game);
	test.assert(#typeof(registered.set_base_production.validate) == 'Callable');
	test.assert(#typeof(registered.process_base_production.apply) == 'Callable');
	test.assert(#typeof(registered.process_base_growth.apply) == 'Callable');
});

// Actual native Base/Player wrappers own selection, accumulation, completion,
// write authorization and rollback state. This requires the production fixture
// runtime; the fixture supplies only a synthetic registry and controlled turns.
const set_production = #include('../default/game/event/set_base_production');
const process_production = #include('../default/game/event/process_base_production');
const native_event = (f, caller, data) => {
	const e = { caller: caller, applied: {} };
	e.game = f.game; e.data = data; e.data.base = f.base;
	return e;
};
const apply_native = (f, handler, e) => {
	const error = handler.validate(e);
	test.assert(!#is_defined(error), #is_defined(error) ? error : '');
	f.with_write(() => { e.applied = handler.apply(e); });
	return e;
};
const select_native = (f) => {
	return apply_native(f, set_production, native_event(f, f.owner.id, { choice_id: 'RECYCLING_TANKS' }));
};
const process_native = (f, turn, minerals) => {
	return apply_native(f, process_production, native_event(f, 0, { turn_id: turn, minerals: minerals }));
};
const declared_cost = (f) => {
	for (choice of f.owner.get_production_choices()) {
		if (choice.id == 'RECYCLING_TANKS') { return choice.cost; }
	}
	throw Error('Fixture must provide the declared Recycling Tanks choice');
};

behavior.scenario('production selection event uses native state and rolls back exactly', () => {
	const f = test.production_fixture();
	f.set_turn(5);
	const initial = f.base.get_production();
	const facilities = f.base.get_facilities();
	const selected = select_native(f);
	const current = f.base.get_production();
	test.assert(current.choice_id == 'RECYCLING_TANKS' && current.minerals == initial.minerals);
	test.assert(current.last_processed_turn == 5 && selected.applied.previous == initial);
	f.set_turn(6);
	select_native(f);
	test.assert(f.base.get_production() == current, 'Selecting the current project cannot delay its next credit');
	f.with_write(() => { set_production.rollback(selected); });
	test.assert(f.base.get_production() == initial && f.base.get_facilities() == facilities);
});
behavior.scenario('native production events credit subsequent turns and complete a unique facility once', () => {
	const f = test.production_fixture();
	const cost = declared_cost(f);
	f.set_turn(1);
	select_native(f);
	const same_turn = native_event(f, 0, { turn_id: 1, minerals: cost });
	test.assert(process_production.validate(same_turn) == 'Base production already processed for this turn');
	test.assert(!f.base.has_facility('RECYCLING_TANKS'));
	let expected = 0;
	for (turn of [2, 3, 4]) {
		f.set_turn(turn);
		const credit = turn == 4 ? cost - 2 : 1;
		expected = expected + credit;
		process_native(f, turn, credit);
		const state = f.base.get_production();
		if (turn < 4) {
			test.assert(state.choice_id == 'RECYCLING_TANKS' && state.minerals == expected);
			test.assert(!f.base.has_facility('RECYCLING_TANKS'));
		} else {
			test.assert(state.choice_id == '' && state.minerals == 0);
			test.assert(f.base.has_facility('RECYCLING_TANKS'));
		}
		test.assert(state.last_processed_turn == turn);
	}
	f.set_turn(5);
	process_native(f, 5, 100);
	test.assert(f.base.get_production().minerals == 0, 'Idle production does not accrue minerals');
	test.assert(f.base.has_facility('RECYCLING_TANKS'));
	const duplicate = native_event(f, f.owner.id, { choice_id: 'RECYCLING_TANKS' });
	test.assert(set_production.validate(duplicate) == 'Base already has this facility');
});
behavior.scenario('partial and completing production events restore progress marker and installed facilities', () => {
	const f = test.production_fixture();
	const cost = declared_cost(f);
	f.set_turn(1);
	select_native(f);
	const selected = f.base.get_production();
	const facilities = f.base.get_facilities();
	f.set_turn(2);
	const partial = process_native(f, 2, cost - 1);
	test.assert(f.base.get_production().minerals == cost - 1 && !f.base.has_facility('RECYCLING_TANKS'));
	f.with_write(() => { process_production.rollback(partial); });
	test.assert(f.base.get_production() == selected && f.base.get_facilities() == facilities);
	process_native(f, 2, cost - 1);
	const before_completion = f.base.get_production();
	f.set_turn(3);
	const completed = process_native(f, 3, 8);
	test.assert(f.base.get_production().choice_id == '' && f.base.get_production().minerals == 7);
	test.assert(completed.applied.added_facility == 'RECYCLING_TANKS' && f.base.has_facility('RECYCLING_TANKS'));
	f.with_write(() => { process_production.rollback(completed); });
	test.assert(f.base.get_production() == before_completion && f.base.get_facilities() == facilities);
	test.assert(!f.base.has_facility('RECYCLING_TANKS'), 'Rollback removes only its newly installed facility');
});
behavior.scenario('invalid production selection events leave native base state untouched', () => {
	const f = test.production_fixture();
	const before = f.base.get_production();
	for (id of ['', 'MISSING', 'STOCKPILE_ENERGY', 1, null, undefined]) {
		const e = native_event(f, f.owner.id, { choice_id: id });
		test.assert(#typeof(set_production.validate(e)) == 'String');
		test.assert(f.base.get_production() == before && !f.base.has_facility('RECYCLING_TANKS'));
	}
	const foreign = native_event(f, f.owner.id + 1, { choice_id: 'RECYCLING_TANKS' });
	test.assert(set_production.validate(foreign) == 'Only base owner can select production');
	test.assert(f.base.get_production() == before);
});
behavior.scenario('invalid production processing events reject authority types stale turns and duplicate credits', () => {
	const f = test.production_fixture();
	f.set_turn(1);
	select_native(f);
	f.set_turn(2);
	const before = f.base.get_production();
	for (c of [
		[1, 2, 1], [0, 0, 1], [0, 0 - 1, 1], [0, 2.0, 1], [0, '2', 1],
		[0, 1, 1], [0, 3, 1], [0, 2, 0 - 1], [0, 2, 1.0], [0, 2, '1'], [0, 2, null],
	]) {
		const e = native_event(f, c[0], { turn_id: c[1], minerals: c[2] });
		test.assert(#typeof(process_production.validate(e)) == 'String');
		test.assert(f.base.get_production() == before);
	}
	process_native(f, 2, 1);
	const credited = f.base.get_production();
	const repeat = native_event(f, 0, { turn_id: 2, minerals: 1 });
	test.assert(process_production.validate(repeat) == 'Base production already processed for this turn');
	test.assert(f.base.get_production() == credited && credited.minerals == 1);
});
behavior.scenario('native event processing isolates different base and owner fixtures', () => {
	const first = test.production_fixture();
	const second = test.production_fixture();
	first.set_turn(1); second.set_turn(1);
	select_native(first); select_native(second);
	first.set_turn(2); second.set_turn(2);
	process_native(first, 2, 4);
	process_native(second, 2, 9);
	test.assert(first.base.get_production().minerals == 4);
	test.assert(second.base.get_production().minerals == 9);
	const second_state = second.base.get_production();
	first.set_turn(3);
	process_native(first, 3, declared_cost(first));
	test.assert(first.base.has_facility('RECYCLING_TANKS'));
	test.assert(!second.base.has_facility('RECYCLING_TANKS') && second.base.get_production() == second_state);
});
