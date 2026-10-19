// GLSMAC native snapshot fidelity, not an original-savefile contract.
// Terrain resources are controlled; intake, worker assignment and growth use
// production scripts over actual native Base/Pop/Tile/RM/TM objects.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const production_event = #include('../default/game/event/process_base_production');
const growth_stage = #include('../default/game/event/process_base_growth');

const attach_rules = (f) => {
	f.enable_economy();
	f.game.tm.on('get_tile_resources', (e) => {
		if (e.tile.x == 0 && e.tile.y == 0) {
			return { NUTRIENTS: 3, MINERALS: 2, ENERGY: 1 };
		}
		return { NUTRIENTS: 3, MINERALS: 4, ENERGY: 2 };
	});
	const globals = {};
	const handlers = {};
	const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get_turn = () => { return f.game.get_turn(); };
	rules.is_master = () => { return f.game.is_master(); };
	rules.get = (key) => { return globals[key]; };
	rules.set = (key, value) => { globals[key] = value; };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => {
		// Existing synthetic pop/facility definitions supply declarations only.
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		const e = { caller: 0 };
		e.game = f.game; e.data = data;
		if (name == 'process_base_growth') {
			e.game = rules;
			test.assert(!#is_defined(growth_stage.validate(e))); growth_stage.apply(e); return;
		}
		if (name == 'process_base_production') {
			test.assert(!#is_defined(production_event.validate(e)));
			production_event.apply(e);
		} else { test.assert(false, 'Unexpected growth event in bounded fixture: ' + name); }
	};
	configure_bases(rules);
	handlers.start({});
	const result = {};
	result.get = rules.get;
	result.turn = () => { f.with_write(() => { handlers.turn({}); }); };
	return result;
};

const populated = () => {
	const f = test.production_fixture();
	f.add_worker(1);
	const rules = attach_rules(f);
	f.rules = rules;
	f.with_write(() => {
		const pops = f.base.get_pops();
		const work = rules.get('f_base_pop_work_tile');
		work(f.base, pops[0], f.tile_at(2, 0));
		f.base.set('accumulated_nutrients', 7);
		f.base.select_production('RECYCLING_TANKS');
	});
	f.set_turn(2);
	rules.turn();
	return f;
};

const inspect_links = (f) => {
	const pops = f.base.get_pops();
	const pop = pops[0];
	const worked = pop.get('worked_tile');
	const tile = f.tile_at(2, 0);
	const backlink = tile.get('working_pop');
	const worked_tiles = f.base.get_worked_tiles();
	const result = {
		pop_id: pop.id, type: pop.get_type(), variant: pop.variant,
		base_id: pop.get_base().id, owner_id: f.base.get_owner().id,
		pop_has_tile: #is_defined(worked), tile_has_pop: #is_defined(backlink),
		worked_count: #sizeof(worked_tiles), native_worked: f.base.is_tile_worked(tile),
	};
	if (#is_defined(worked)) { result.work_x = worked.x; result.work_y = worked.y; }
	if (#is_defined(backlink)) { result.back_id = backlink.id; result.back_base = backlink.get_base().id; }
	return result;
};

behavior.scenario('real growth stores nutrients before snapshot', () => {
	const source = populated();
	test.assert(source.base.get('accumulated_nutrients') == 11);
	test.assert(source.base.get_intake() == { NUTRIENTS: 6, MINERALS: 6, ENERGY: 3 });
	test.assert(source.base.get_production() == { choice_id: 'RECYCLING_TANKS', minerals: 6, last_processed_turn: 2 });
});

behavior.scenario('fresh native receiver preserves modeled growth and pending production', () => {
	const source = populated();
	const before = source.snapshot();
	const ids = source.next_ids();
	const target = test.production_fixture();
	target.restore(before);
	const rules = attach_rules(target);
	test.assert(target.base.get('accumulated_nutrients') == 11, 'Stored growth nutrients must survive fresh deferred snapshot decoding');
	test.assert(target.next_ids() == ids);
	test.assert(target.base.get_production() == source.base.get_production());
	test.assert(target.base.get_intake() == source.base.get_intake());
	const pending = rules.get('f_base_get_pending_production');
	test.assert(pending(target.base) == 6);
	target.set_turn(3);
	rules.turn();
	test.assert(target.base.get('accumulated_nutrients') == 15);
	test.assert(target.base.get_production() == { choice_id: 'RECYCLING_TANKS', minerals: 12, last_processed_turn: 3 });
});

behavior.scenario('fresh native receiver rebuilds all worker links with receiving native identity', () => {
	const source = populated();
	const expected = inspect_links(source);
	const target = test.production_fixture();
	target.restore(source.snapshot());
	const rules = attach_rules(target);
	test.assert(inspect_links(target) == expected, 'Pop, tile and native worked set must agree after restore');
	const pops = target.base.get_pops();
	target.with_write(() => {
		const unwork = rules.get('f_base_pop_unwork_tile');
		unwork(target.base, pops[0]);
	});
	test.assert(!target.tile_at(2, 0).has('working_pop') && #sizeof(target.base.get_worked_tiles()) == 0);
	test.assert(inspect_links(source) == expected, 'Receiving worker assignments must not alias source native objects');
});

behavior.scenario('worked snapshot remains self contained after original registry retires', () => {
	const source = populated();
	const expected = inspect_links(source);
	const snapshot = source.snapshot();
	const target = test.production_fixture();
	target.restore(snapshot);
	source.reset();
	attach_rules(target);
	test.assert(inspect_links(target) == expected);
	test.assert(target.snapshot() == snapshot);
	target.add_worker(0);
	const pops = target.base.get_pops();
	test.assert(pops[1].id == 2 && pops[1].variant == 0 && pops[1].get_base().id == target.base.id);
});

behavior.scenario('rejected native snapshot leaves receiving worked world and backlinks intact', () => {
	const target = populated();
	const before = target.snapshot();
	const links = inspect_links(target);
	const source = populated();
	let rejected = false;
	try { target.restore(source.corrupt_snapshot('truncated')); }
	catch { GSEInvalidCall: (e) => { rejected = true; } }
	test.assert(rejected && target.snapshot() == before);
	test.assert(inspect_links(target) == links);
	test.assert(target.base.get_intake() == { NUTRIENTS: 6, MINERALS: 6, ENERGY: 3 });
});

for (kind of ['worker_unknown_pop', 'worker_out_of_map', 'worker_bad_parity', 'worker_center', 'worker_duplicate_tile', 'worker_duplicate_pop', 'worker_nonworker']) {
	behavior.scenario('malformed worker reference rejects without replacing receiving links: ' + kind, () => {
		const source = populated();
		source.add_worker(0);
		if (kind == 'worker_nonworker') {
			source.with_write(() => {
				source.game.bm.define_pop('DOCTOR', {
					name: 'Doctor', tile_worker: false,
					renders_human: [{ type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 }],
					renders_progenitor: [{ type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 }],
				});
				const pops = source.base.get_pops(); pops[1].set_type('DOCTOR');
			});
		}
		const malformed = source.corrupt_snapshot(kind);
		const target = populated();
		const before = target.snapshot(); const links = inspect_links(target); const ids = target.next_ids();
		let rejected = false;
		try { target.restore(malformed); }
		catch { GSEInvalidCall: (e) => { rejected = true; } }
		test.assert(rejected && target.snapshot() == before);
		test.assert(inspect_links(target) == links && target.next_ids() == ids);
		test.assert(target.base.get_intake() == { NUTRIENTS: 6, MINERALS: 6, ENERGY: 3 });
	});
}

const add_second_worker = (source) => {
	source.add_snapshot_base(2, 2);
	const work = source.rules.get('f_base_pop_work_tile');
	source.with_write(() => {
		for (base of source.game.bm.get_bases()) {
			if (base.id != 1) {
				const pop = base.create_pop({ type: 'WORKER' });
				work(base, pop, source.tile_at(0, 2));
				base.set('accumulated_nutrients', 4);
			}
		}
	});
};

for (kind of ['worker_later_center', 'worker_later_claim', 'truncated_later_base']) {
	behavior.scenario('whole deferred base batch rejects a later conflicting record before attaching: ' + kind, () => {
		const source = populated();
		if (kind == 'worker_later_claim') { add_second_worker(source); }
		else { source.add_snapshot_base(2, 2); }
		const malformed = source.corrupt_snapshot(kind);
		const target = populated(); const before = target.snapshot(); const links = inspect_links(target);
		const result = target.probe_snapshot_decode(malformed);
		test.assert(result == { rejected: true, centers: 0, claims: 0, bases: 0, next_id_preserved: true }, 'Invalid later records must not publish earlier centers or worker backlinks');
		let rejected = false;
		try { target.restore(malformed); }
		catch { GSEInvalidCall: (e) => { rejected = true; } }
		test.assert(rejected && target.snapshot() == before && inspect_links(target) == links);
	});
}

behavior.scenario('valid multiple-base deferred decode preserves independent receiving centers and worker parents', () => {
	const source = populated(); add_second_worker(source);
	const snapshot = source.snapshot();
	const target = test.production_fixture(); target.restore(snapshot);
	source.reset(); attach_rules(target);
	const bases = target.game.bm.get_bases();
	test.assert(#sizeof(bases) == 2 && target.snapshot() == snapshot);
	for (base of bases) {
		const center = base.get_tile(); const pops = base.get_pops();
		test.assert(center.get_base().id == base.id && pops[0].get_base().id == base.id);
		const worked = pops[0].get('worked_tile');
		test.assert(worked.get('working_pop').get_base().id == base.id && base.is_tile_worked(worked));
		if (base.id == 1) { test.assert(base.get('accumulated_nutrients') == 11); }
		else { test.assert(base.get('accumulated_nutrients') == 4 && worked.x == 0 && worked.y == 2); }
	}
});

behavior.scenario('ordinary native pending-base processing preserves next IDs when no snapshot was loaded', () => {
	const f = test.production_fixture(); const before = f.next_ids();
	f.process_pending_bases(); f.process_pending_bases();
	test.assert(f.next_ids() == before);
});

behavior.scenario('an explicit empty native BM snapshot commits its positive next ID once', () => {
	const f = test.production_fixture(); const before = f.next_ids(); const next = before.base + 5;
	const result = f.probe_empty_snapshot(next);
	test.assert(result == { deferred_preserved: true, first: next, second: next, bases: 0 });
	test.assert(f.next_ids() == before, 'Independent fixture probe must leave existing native IDs intact');
});
