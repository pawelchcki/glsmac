// Worker/Doctor single-citizen Psych witnesses come from public
// ui/cases/citizen-job.json and its twice-recorded original observations.
// Multiple-citizen additivity and native state/undo checks are GLSMAC
// application invariants, not claims about unrecorded original gameplay.
// Native Base/Pop/Tile/RM/TM and shipped worker/intake/UI data flow are real;
// terrain yields, artwork declarations and unrelated UI sections are boundaries.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const unwork_event = #include('../default/game/event/unwork_base_tile');
const screen = #include('../default/ui/parts/game/popup/base_screen');

const fixture = () => {
	const f = test.founding_fixture(); f.enable_economy(); f.add_worker(0);
	const handlers = {}; const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => { test.assert(name == 'define_base_pop' || name == 'define_base_facility'); };
	// The displayed year is outside this resource/bonus contract.
	rules.get_year = () => { return 2101; };
	configure_bases(rules); handlers.start({});
	f.tile = f.tile_at(2, 0);
	f.game.bm.off('get_base_workable_tiles');
	f.game.bm.on('get_base_workable_tiles', (e) => {
		const tile = f.tile; return [tile];
	});
	f.game.tm.on('get_tile_resources', (e) => {
		if (e.tile.x == 0 && e.tile.y == 0) { return { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 }; }
		return { NUTRIENTS: 3, MINERALS: 4, ENERGY: 0 };
	});
	const pops = f.base.get_pops(); f.pop = pops[0];
	const work = f.game.get('f_base_pop_work_tile');
	f.with_write(() => { work(f.base, f.pop, f.tile); f.base.set('accumulated_nutrients', 7); });
	const state = {};
	f.read_screen = () => {
		// Execute the actual base-screen set(), retaining its exact resource
		// and energy payloads without instantiating artwork or DOM widgets.
		screen.p = {}; screen.p.game = rules;
		screen.production_selection = null; screen.sections = {};
		for (name of ['nutrients', 'economy', 'game_state', 'facilities', 'middle_area', 'bottom_bar']) {
			screen.sections[name] = { set: (data) => {}, set_commerce: (data) => {}, set_energy_grid: (data) => {} };
		}
		screen.sections.resources = { set: (data) => { state.resources = data; } };
		screen.sections.energy = { set: (data) => { state.energy = data; } };
		screen.set({ base: f.base });
		const result = {}; result.energy = state.energy; result.resources = state.resources;
		return result;
	};
	f.to_doctor = () => {
		const e = { caller: f.owner.id }; e.game = f.game; e.data = {};
		e.data.base = f.base; e.data.tile = f.tile;
		test.assert(!#is_defined(unwork_event.validate(e)));
		f.with_write(() => { e.applied = unwork_event.apply(e); });
		return e;
	};
	return f;
};

const capture = (f) => {
	const updates = f.update_count();
	return { updates: updates, snapshot: f.snapshot(), ids: f.next_ids(), inspect: f.inspect() };
};

const unchanged = (f, before) => {
	test.assert(f.snapshot() == before.snapshot && f.next_ids() == before.ids);
	test.assert(f.inspect() == before.inspect, 'Reading specialist bonuses must preserve RNG, native IDs and notification queues');
	test.assert(f.update_count() == before.updates);
};

const bonus = (view, psych) => {
	test.assert(view.energy.psych.bonus == psych, 'Actual base-screen Psych bonus must match the supported citizen output');
	test.assert(view.energy.economy.bonus == 0 && view.energy.labs.bonus == 0);
	// Zero raw energy isolates the recorded specialist bonus, with no claim
	// about original allocation percentages or rounding.
	test.assert(view.resources.energy == { profit: 0, loss: 0 });
	test.assert(view.energy.psych.value == 0 && view.energy.economy.value == 0 && view.energy.labs.value == 0);
};

behavior.scenario('actual native Worker to Doctor exposes recorded two Psych in the base screen', () => {
	const f = fixture(); bonus(f.read_screen(), 0);
	f.to_doctor();
	test.assert(f.pop.get_type() == 'DOCTOR' && f.base.get_size() == 1);
	test.assert(!f.pop.has('worked_tile') && !f.tile.has('working_pop') && f.base.get_worked_tiles() == []);
	bonus(f.read_screen(), 2);
	test.assert(f.base.get_intake() == { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 });
});

behavior.scenario('repeated real Worker and Doctor energy reads preserve all native state', () => {
	const f = fixture(); const worker = capture(f);
	for (let worker_read = 0; worker_read < 3; worker_read++) { bonus(f.read_screen(), 0); }
	unchanged(f, worker);
	f.to_doctor(); const doctor = capture(f);
	for (let doctor_read = 0; doctor_read < 3; doctor_read++) { bonus(f.read_screen(), 2); }
	unchanged(f, doctor);
});

behavior.scenario('actual unwork receipt undo restores zero bonus and the exact native Worker graph', () => {
	const f = fixture(); const before = capture(f); const e = f.to_doctor(); bonus(f.read_screen(), 2);
	f.with_write(() => { unwork_event.rollback(e); });
	bonus(f.read_screen(), 0);
	test.assert(f.pop.get_type() == 'WORKER' && f.pop.get('worked_tile') == f.tile);
	test.assert(f.tile.get('working_pop') == f.pop && f.base.get_worked_tiles() == [f.tile] && f.base.is_tile_worked(f.tile));
	test.assert(f.snapshot() == before.snapshot && f.next_ids() == before.ids);
	const after = f.inspect();
	test.assert(after.rng == before.inspect.rng && after.next_base_id == before.inspect.next_base_id && after.next_unit_id == before.inspect.next_unit_id);
	test.assert(f.update_count() == before.updates + 2);
});

behavior.scenario('GLSMAC application aggregation counts each actual local Doctor once', () => {
	const f = fixture(); f.to_doctor();
	f.with_write(() => { f.base.create_pop({ type: 'DOCTOR' }); });
	test.assert(f.base.get_size() == 2 && f.base.get_worked_tiles() == []);
	const before = capture(f); bonus(f.read_screen(), 4); unchanged(f, before);
});

behavior.scenario('Doctor output remains readable with no available worker tile', () => {
	const f = fixture(); f.to_doctor();
	f.game.bm.off('get_base_workable_tiles');
	f.game.bm.on('get_base_workable_tiles', (e) => { return []; });
	test.assert(f.base.get_unworked_tiles() == [] && f.base.get_workable_tiles() == []);
	const before = capture(f); bonus(f.read_screen(), 2); unchanged(f, before);
});
