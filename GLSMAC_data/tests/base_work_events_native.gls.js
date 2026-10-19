// GLSMAC worker-command application invariants, not original-game comparisons.
// Native objects, helpers and events are real. Terrain yields, available worker
// locations and declaration artwork are controlled asset-free boundaries.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const work_event = #include('../default/game/event/work_base_tile');
const unwork_event = #include('../default/game/event/unwork_base_tile');

const fixture = (type, assigned) => {
	const f = test.founding_fixture(); f.enable_economy(); f.add_worker(0);
	const handlers = {}; const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => { test.assert(name == 'define_base_pop' || name == 'define_base_facility'); };
	configure_bases(rules); handlers.start({});
	f.a = f.tile_at(2, 0); f.b = f.tile_at(0, 2); f.outside = f.tile_at(1, 1);
	f.game.bm.off('get_base_workable_tiles');
	f.game.bm.on('get_base_workable_tiles', (e) => {
		const tiles = [];
		if (e.base == f.base) {
			const a = f.a; const b = f.b; tiles :+ a; tiles :+ b;
		} else {
			const outside = f.outside; tiles :+ outside;
		}
		return tiles;
	});
	f.game.tm.on('get_tile_resources', (e) => {
		if (e.tile.x == 0 && e.tile.y == 0) { return { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 }; }
		if (e.tile.x == 2 && e.tile.y == 0) { return { NUTRIENTS: 3, MINERALS: 4, ENERGY: 1 }; }
		if (e.tile.x == 0 && e.tile.y == 2) { return { NUTRIENTS: 1, MINERALS: 7, ENERGY: 2 }; }
		return { NUTRIENTS: 0, MINERALS: 0, ENERGY: 0 };
	});
	const pops = f.base.get_pops(); f.pop = pops[0];
	const work = f.game.get('f_base_pop_work_tile');
	f.with_write(() => {
		f.pop.set_type(type); f.base.set('accumulated_nutrients', 7);
		if (assigned == 'a') { work(f.base, f.pop, f.a); }
		else if (assigned == 'b') { work(f.base, f.pop, f.b); }
	});
	f.add_other_worker = () => {
		f.add_snapshot_base(2, 2);
		let other = null; let pop = null;
		for (base of f.game.bm.get_bases()) { if (base != f.base) { other = base; } }
		f.with_write(() => { pop = other.create_pop({ type: 'WORKER' }); work(other, pop, f.outside); });
		const result = {}; result.base = other; result.pop = pop; result.tile = f.outside;
		return result;
	};
	return f;
};

const request = (f, tile, pop, base, caller) => {
	const e = { caller: #is_defined(caller) ? caller : f.owner.id };
	e.game = f.game; e.data = {};
	e.data.base = #is_defined(base) ? base : f.base;
	e.data.tile = tile;
	if (#is_defined(pop)) { e.data.pop = pop; }
	return e;
};

const capture = (f) => {
	const updates = f.update_count();
	return { updates: updates, snapshot: f.snapshot(), ids: f.next_ids(), inspect: f.inspect() };
};

const unchanged = (f, before) => {
	test.assert(f.snapshot() == before.snapshot && f.next_ids() == before.ids);
	test.assert(f.inspect() == before.inspect, 'Rejected command must preserve RNG, native IDs and notification queues');
	test.assert(f.update_count() == before.updates);
};

const reject = (f, handler, e, other) => {
	const before = capture(f);
	let other_before = null;
	if (#is_defined(other)) { other_before = capture(other); }
	const error = handler.validate(e);
	test.assert(#typeof(error) == 'String' && error != '', 'Invalid native worker command must reject before apply');
	unchanged(f, before);
	if (#is_defined(other)) { unchanged(other, other_before); }
};

const apply = (f, handler, e) => {
	test.assert(!#is_defined(handler.validate(e)));
	f.with_write(() => { e.applied = handler.apply(e); });
};

const graph = (f, type, assigned) => {
	test.assert(f.pop.get_type() == type && f.pop.get_base() == f.base && f.base.get_size() == 1);
	const worked = f.base.get_worked_tiles();
	if (assigned == '') {
		test.assert(!f.pop.has('worked_tile') && worked == []);
		test.assert(!f.a.has('working_pop') && !f.b.has('working_pop'));
		test.assert(!f.base.is_tile_worked(f.a) && !f.base.is_tile_worked(f.b));
		test.assert(f.base.get_intake() == { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 });
	} else {
		const tile = assigned == 'a' ? f.a : f.b; const free = assigned == 'a' ? f.b : f.a;
		test.assert(f.pop.get('worked_tile') == tile && tile.get('working_pop') == f.pop);
		test.assert(worked == [tile] && f.base.is_tile_worked(tile));
		test.assert(!free.has('working_pop') && !f.base.is_tile_worked(free));
		if (assigned == 'a') { test.assert(f.base.get_intake() == { NUTRIENTS: 5, MINERALS: 5, ENERGY: 1 }); }
		else { test.assert(f.base.get_intake() == { NUTRIENTS: 3, MINERALS: 8, ENERGY: 2 }); }
	}
	test.assert(f.base.get_consumption() == { NUTRIENTS: 2, MINERALS: 0, ENERGY: 0 });
	test.assert(f.base.get('accumulated_nutrients') == 7);
};

const restored = (f, before) => {
	test.assert(f.snapshot() == before.snapshot && f.next_ids() == before.ids, 'Actual receipt rollback must restore the prior native worker graph and type');
	const after = f.inspect();
	test.assert(after.rng == before.inspect.rng && after.next_base_id == before.inspect.next_base_id && after.next_unit_id == before.inspect.next_unit_id);
	test.assert(f.update_count() == before.updates + 2, 'Apply and rollback each deliver a coalesced base update');
};

behavior.scenario('native unwork event changes Worker to Doctor and its receipt restores the worker and intake', () => {
	const f = fixture('WORKER', 'a'); graph(f, 'WORKER', 'a'); const before = capture(f);
	const e = request(f, f.a);
	apply(f, unwork_event, e); graph(f, 'DOCTOR', '');
	f.with_write(() => { unwork_event.rollback(e); }); graph(f, 'WORKER', 'a'); restored(f, before);
});

behavior.scenario('native work event accepts a local wrapper alias and rollback restores the previous Doctor type', () => {
	const f = fixture('DOCTOR', ''); graph(f, 'DOCTOR', ''); const before = capture(f);
	const pops = f.base.get_pops(); const alias = pops[0]; test.assert(alias == f.pop);
	const e = request(f, f.a, alias);
	apply(f, work_event, e); graph(f, 'WORKER', 'a');
	f.with_write(() => { work_event.rollback(e); }); graph(f, 'DOCTOR', ''); restored(f, before);
});

behavior.scenario('native work reassignment and receipt undo restore the previous tile and all three backlinks', () => {
	const f = fixture('WORKER', 'a'); graph(f, 'WORKER', 'a'); const before = capture(f);
	const e = request(f, f.b, f.pop);
	apply(f, work_event, e); graph(f, 'WORKER', 'b');
	f.with_write(() => { work_event.rollback(e); }); graph(f, 'WORKER', 'a'); restored(f, before);
});

for (kind of ['foreign_caller', 'same_world_pop', 'other_world_pop', 'other_world_base', 'other_world_tile', 'center', 'outside', 'occupied', 'stale_pop']) {
	behavior.scenario('native work rejects without mutation: ' + kind, () => {
		const f = fixture('DOCTOR', ''); let other = undefined;
		let tile = f.a; let pop = f.pop; let base = f.base; let caller = f.owner.id;
		if (kind == 'foreign_caller') { caller = 0; }
		else if (kind == 'same_world_pop') {
			const foreign = f.add_other_worker(); pop = foreign.pop;
			test.assert(pop.id == f.pop.id && pop.get_base() != f.base);
		} else if (kind == 'other_world_pop' || kind == 'other_world_base' || kind == 'other_world_tile') {
			other = fixture('DOCTOR', '');
			if (kind == 'other_world_pop') { pop = other.pop; test.assert(pop.id == f.pop.id && pop.get_base().id == f.base.id); }
			else if (kind == 'other_world_base') { base = other.base; pop = other.pop; tile = other.a; }
			else { tile = other.a; test.assert(tile.x == f.a.x && tile.y == f.a.y && tile != f.a); }
		} else if (kind == 'center') { tile = f.base.get_tile(); }
		else if (kind == 'outside') { tile = f.outside; }
		else if (kind == 'occupied') {
			const work = f.game.get('f_base_pop_work_tile');
			f.with_write(() => { const worker = f.base.create_pop({ type: 'WORKER' }); work(f.base, worker, f.a); });
		} else {
			const stale = f.pop; f.with_write(() => { f.base.destroy_pop(stale); }); f.add_worker(0); pop = stale;
		}
		const e = request(f, tile, pop, base, caller);
		reject(f, work_event, e, other);
	});
}

for (kind of ['foreign_caller', 'same_world_other_base_tile', 'other_world_tile', 'other_world_base', 'free_tile']) {
	behavior.scenario('native unwork rejects without mutation: ' + kind, () => {
		const f = fixture('WORKER', 'a'); let other = undefined;
		let tile = f.a; let base = f.base; let caller = f.owner.id;
		if (kind == 'foreign_caller') { caller = 0; }
		else if (kind == 'same_world_other_base_tile') { const foreign = f.add_other_worker(); tile = foreign.tile; }
		else if (kind == 'other_world_tile' || kind == 'other_world_base') {
			other = fixture('WORKER', 'a'); tile = other.a;
			if (kind == 'other_world_base') { base = other.base; }
		} else { tile = f.b; }
		const e = request(f, tile, undefined, base, caller);
		reject(f, unwork_event, e, other);
	});
}
