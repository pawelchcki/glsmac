// Strict application probes for bounded basic project switching.
const behavior = #include('./_behavior');
const select_event = #include('../default/game/event/set_base_production');
const rejected = (callback) => {
	let caught = false;
	try { callback(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'expected rejection');
};
const fixture = () => {
	const f = test.founding_fixture();
	f.with_write(() => {
		f.owner.add_production_choice('COLONY_POD', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 });
		f.owner.add_production_choice('POD_ALIAS', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 });
		f.owner.add_production_choice('TANKS_ALIAS', { type: 'facility', id: 'RECYCLING_TANKS' });
	});
	f.add_worker(0); f.add_worker(1);
	return f;
};
const choose = (f, id) => { f.with_write(() => { f.base.select_production(id); }); };
const credit = (f, turn, amount) => { f.set_turn(turn); f.with_write(() => { f.base.process_production(turn, amount); }); };

for (pair of [['RECYCLING_TANKS', 'COLONY_POD'], ['COLONY_POD', 'RECYCLING_TANKS']]) {
	behavior.scenario('active switch preserves remaining credit without completing ' + pair[0], () => {
		const f = fixture(); choose(f, pair[0]); credit(f, 2, 21);
		const units = f.inspect().unit_ids; const population = f.base.get_size(); const facilities = f.base.get_facilities();
		let previous = null;
		f.with_write(() => { previous = f.base.select_production(pair[1]); });
		test.assert(previous == { choice_id: pair[0], minerals: 21, last_processed_turn: 2 });
		test.assert(f.base.get_production() == { choice_id: pair[1], minerals: 15, last_processed_turn: 2 });
		test.assert(f.inspect().unit_ids == units && f.base.get_size() == population && f.base.get_facilities() == facilities);
		rejected(() => { f.with_write(() => { f.base.process_production(2, 100); }); });
		credit(f, 3, 1); test.assert(f.base.get_production().minerals == 16);
	});
}

for (pair of [['RECYCLING_TANKS', 'TANKS_ALIAS'], ['COLONY_POD', 'POD_ALIAS']]) {
	behavior.scenario('actual project aliases are idempotent ' + pair[0], () => {
		const f = fixture(); choose(f, pair[0]); credit(f, 2, 21); f.set_turn(3);
		const before = f.snapshot();
		choose(f, pair[1]); test.assert(f.snapshot() == before);
		credit(f, 3, 1); test.assert(f.base.get_production().minerals == 22);
	});
}

behavior.scenario('switch event validates owner target and rolls back exact serialized state', () => {
	const f = fixture(); choose(f, 'RECYCLING_TANKS'); credit(f, 2, 21); f.set_turn(3);
	const e = { caller: f.owner.id, data: { choice_id: 'COLONY_POD' }, applied: {} }; e.data.base = f.base; e.game = f.game;
	const before = f.snapshot();
	test.assert(!#is_defined(select_event.validate(e)), 'active switch event must be accepted');
	f.with_write(() => { e.applied = select_event.apply(e); });
	test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: 15, last_processed_turn: 3 });
	rejected(() => { f.with_write(() => { f.base.process_production(3, 1); }); });
	f.with_write(() => { select_event.rollback(e); }); test.assert(f.snapshot() == before);
	e.caller = f.owner.id + 1; test.assert(#typeof(select_event.validate(e)) == 'String');
	e.caller = f.owner.id;
	for (id of ['MISSING', 'STOCKPILE_ENERGY', 'HEADQUARTERS']) {
		e.data.choice_id = id; test.assert(#typeof(select_event.validate(e)) == 'String');
		rejected(() => { choose(f, id); }); test.assert(f.snapshot() == before);
	}
});

behavior.scenario('loss previews share switch arithmetic and never change state', () => {
	const f = fixture(); choose(f, 'RECYCLING_TANKS'); credit(f, 2, 21);
	const before = f.snapshot();
	test.assert(f.base.get_production_switch_loss('COLONY_POD') == 6);
	test.assert(f.base.get_production_switch_loss('TANKS_ALIAS') == 0);
	rejected(() => { f.base.get_production_switch_loss('MISSING'); });
	rejected(() => { f.base.get_production_switch_loss(); });
	rejected(() => { f.base.get_production_switch_loss(1); });
	rejected(() => { f.base.get_production_switch_loss('COLONY_POD', 1); });
	rejected(() => { f.base.select_production('COLONY_POD'); });
	test.assert(f.snapshot() == before);
});

for (entry of [[0, 0], [9, 0], [10, 0], [11, 1], [12, 1], [13, 2], [19, 5], [20, 5], [21, 6], [31, 11], [99, 45], [1000000, 499995]]) {
	behavior.scenario('recorded threshold and rounding witness ' + #to_string(entry[0]), () => {
		const f = fixture();
		f.with_write(() => { f.base.restore_production({ choice_id: 'COLONY_POD', minerals: entry[0], last_processed_turn: 1 }, ''); });
		test.assert(f.base.get_production_switch_loss('RECYCLING_TANKS') == entry[1]);
		choose(f, 'RECYCLING_TANKS');
		test.assert(f.base.get_production().minerals == entry[0] - entry[1]);
		test.assert(!f.base.has_facility('RECYCLING_TANKS') && f.base.get_size() == 2);
	});
}

behavior.scenario('out of evidence mineral storage rejects preview and switch atomically', () => {
	const f = fixture();
	f.with_write(() => { f.base.restore_production({ choice_id: 'COLONY_POD', minerals: 1000001, last_processed_turn: 1 }, ''); });
	const before = f.snapshot();
	rejected(() => { f.base.get_production_switch_loss('RECYCLING_TANKS'); });
	rejected(() => { choose(f, 'RECYCLING_TANKS'); });
	test.assert(f.snapshot() == before);
});

behavior.scenario('unmodeled facility categories reject switching in both directions', () => {
	const f = fixture();
	f.with_write(() => {
		f.game.bm.define_facility('UNMODELED', {
			name: 'Unmodeled facility', description: '', cost: 32,
			render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 },
		});
		f.owner.add_production_choice('UNMODELED', { type: 'facility', id: 'UNMODELED' });
	});
	choose(f, 'COLONY_POD'); credit(f, 2, 21);
	let before = f.snapshot();
	rejected(() => { f.base.get_production_switch_loss('UNMODELED'); });
	rejected(() => { choose(f, 'UNMODELED'); }); test.assert(f.snapshot() == before);
	f.with_write(() => { f.base.restore_production({ choice_id: '', minerals: 21, last_processed_turn: 2 }, ''); });
	choose(f, 'UNMODELED'); before = f.snapshot();
	rejected(() => { choose(f, 'COLONY_POD'); }); test.assert(f.snapshot() == before);
});

behavior.scenario('out of application cost bounds rejects target before losing minerals', () => {
	const f = fixture();
	f.with_write(() => { f.owner.add_production_choice('HUGE_POD', { type: 'unit', id: 'ColonyPod', cost: 1000001, cost_rows: 3, population_cost: 1 }); });
	choose(f, 'RECYCLING_TANKS'); credit(f, 2, 21); const before = f.snapshot();
	rejected(() => { f.base.get_production_switch_loss('HUGE_POD'); });
	rejected(() => { choose(f, 'HUGE_POD'); }); test.assert(f.snapshot() == before);
});

for (role of ['single', 'host', 'player', 'none']) {
	behavior.scenario('only modeled human owner roles support changing active project ' + role, () => {
		const f = fixture(); choose(f, 'COLONY_POD'); credit(f, 2, 21); f.set_owner_role(role);
		const before = f.snapshot();
		if (role == 'none') {
			rejected(() => { f.base.get_production_switch_loss('RECYCLING_TANKS'); });
			rejected(() => { choose(f, 'RECYCLING_TANKS'); }); test.assert(f.snapshot() == before);
		} else {
			test.assert(f.base.get_production_switch_loss('RECYCLING_TANKS') == 6);
			choose(f, 'RECYCLING_TANKS'); test.assert(f.base.get_production().minerals == 15);
		}
	});
}

behavior.scenario('installed Skunkworks explicitly rejects active switching', () => {
	const f = fixture(); let base = null;
	f.with_write(() => {
		f.game.bm.define_facility('SKUNKWORKS', {
			name: 'Skunkworks', description: '', cost: 32,
			render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 },
		});
		base = f.game.bm.spawn_base(f.owner, f.tile_at(2, 0), { facilities: ['SKUNKWORKS'] });
		base.select_production('COLONY_POD');
	});
	const before = f.snapshot();
	rejected(() => { base.get_production_switch_loss('RECYCLING_TANKS'); });
	rejected(() => { f.with_write(() => { base.select_production('RECYCLING_TANKS'); }); });
	test.assert(f.snapshot() == before);
});
