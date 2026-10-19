// Synthetic terrain yields and manual turn delivery are fixture boundaries.
// Intake, consumption, worker choice, growth, production and unit creation use
// shipped scripts/native objects. Recorded helper witnesses establish Tiny's
// factors and component rows only, not whole original-game growth/production.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const select_production = #include('../default/game/event/set_base_production');
const process_production = #include('../default/game/event/process_base_production');
const add_pop = #include('../default/game/event/add_base_pop');
const growth_stage = #include('../default/game/event/process_base_growth');

const fixture = (worker_nutrients) => {
	const f = test.founding_fixture();
	const nutrients = #is_defined(worker_nutrients) ? worker_nutrients : 6;
	f.enable_economy();
	const map = f.game.get_settings().global.map;
	map.type = 'random'; map.preset_level = 0;
	f.add_worker(0);
	f.game.tm.on('get_tile_resources', (e) => {
		if (e.tile.x == 0 && e.tile.y == 0) { return { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 }; }
		if (e.tile.x == 2 && e.tile.y == 0) { return { NUTRIENTS: nutrients, MINERALS: 3, ENERGY: 0 }; }
		if (e.tile.x == 0 && e.tile.y == 2) { return { NUTRIENTS: nutrients, MINERALS: 5, ENERGY: 0 }; }
		return { NUTRIENTS: 0, MINERALS: 0, ENERGY: 0 };
	});
	const events = [];
	const growth = [];
	const spawns = [];
	const handlers = {};
	const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get_turn = () => { return f.game.get_turn(); };
	rules.is_master = () => { return f.game.is_master(); };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => {
		// Native fixture definitions provide asset-free declarations only.
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		const e = { caller: 0 }; e.game = f.game; e.data = data;
		if (name == 'process_base_growth') {
			e.game = rules;
			test.assert(!#is_defined(growth_stage.validate(e))); growth_stage.apply(e); return;
		}
		const before = f.base.get_production();
		const credit = name == 'process_base_production' ? data.minerals : 0;
		const row = [name, f.game.get_turn(), credit, f.base.get_size(), before.minerals, f.base.get('accumulated_nutrients')];
		if (name == 'process_base_production') {
			test.assert(!#is_defined(process_production.validate(e)));
			e.applied = process_production.apply(e);
		} else if (name == 'add_base_pop') {
			test.assert(!#is_defined(add_pop.validate(e)));
			e.applied = add_pop.apply(e);
			growth :+ e;
		} else { test.assert(false, 'Unexpected sequence event: ' + name); }
		row :+ f.base.get_size(); row :+ f.base.get_production().minerals; row :+ f.base.get('accumulated_nutrients');
		events :+ row;
	};
	configure_bases(rules);
	handlers.start({});
	const initial = f.base.get_pops();
	const work = rules.get('f_base_pop_work_tile');
	f.with_write(() => {
		f.owner.add_production_choice('COLONY_POD', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 });
		work(f.base, initial[0], f.tile_at(2, 0));
		f.base.set('accumulated_nutrients', 0);
	});
	f.game.um.on('unit_spawn', (e) => {
		const released = f.tile_at(0, 2);
		spawns :+ {
			id: e.unit.id, turn: f.game.get_turn(), owner: e.unit.owner,
			size: f.base.get_size(), minerals: f.base.get_production().minerals,
			nutrients: f.base.get('accumulated_nutrients'),
			backlink_released: !released.has('working_pop'),
			native_work_released: !f.base.is_tile_worked(released),
			worked_count: #sizeof(f.base.get_worked_tiles()),
		};
	});
	f.sequence_events = events; f.sequence_growth = growth; f.sequence_spawns = spawns;
	f.turn = (turn) => { f.set_turn(turn); f.with_write(() => { handlers.turn({}); }); };
	f.choose_pod = () => {
		const e = { caller: f.owner.id }; e.game = f.game; e.data = { choice_id: 'COLONY_POD' }; e.data.base = f.base;
		test.assert(!#is_defined(select_production.validate(e)));
		f.with_write(() => { select_production.apply(e); });
	};
	return f;
};

const state = (f, size, nutrients, project, minerals, turn, pending) => {
	test.assert(f.base.get_size() == size && f.base.get('accumulated_nutrients') == nutrients);
	test.assert(f.base.get_production() == { choice_id: project, minerals: minerals, last_processed_turn: turn });
	const get_pending = f.game.get('f_base_get_pending_production');
	test.assert(get_pending(f.base) == pending);
};

const grow_once = (f) => {
	test.assert(f.base.get_nutrient_factor() == 8);
	let cost = 0;
	for (choice of f.owner.get_production_choices()) { if (choice.id == 'COLONY_POD') { cost = choice.cost; } }
	test.assert(cost == 24, 'Declared three-row project must use Tiny human factor eight');
	state(f, 1, 0, '', 0, 0, 4);
	test.assert(f.base.get_intake() == { NUTRIENTS: 8, MINERALS: 4, ENERGY: 0 });
	test.assert(f.base.get_consumption() == { NUTRIENTS: 2, MINERALS: 0, ENERGY: 0 });
	f.turn(2); state(f, 1, 6, '', 0, 0, 4);
	test.assert(f.sequence_events == [], 'Idle nutrient accumulation must not create mineral credit');
	f.choose_pod(); state(f, 1, 6, 'COLONY_POD', 0, 2, 4);
	f.turn(3); state(f, 1, 12, 'COLONY_POD', 4, 3, 4);
	f.turn(4); state(f, 2, 2, 'COLONY_POD', 8, 4, 9);
	const pops = f.base.get_pops();
	const grown = pops[1]; const tile = f.tile_at(0, 2);
	test.assert(pops[0].id == 1 && grown.id == 2 && grown.get_type() == 'WORKER');
	test.assert(grown.get('worked_tile') == tile && tile.get('working_pop') == grown && f.base.is_tile_worked(tile));
	test.assert(f.base.get_intake() == { NUTRIENTS: 14, MINERALS: 9, ENERGY: 0 });
	test.assert(f.base.get_consumption() == { NUTRIENTS: 4, MINERALS: 0, ENERGY: 0 });
};

behavior.scenario('natural Tiny growth and Colony Pod completion share a turn without double mineral credit or stale worker backlinks', () => {
	const f = fixture(); grow_once(f);
	f.turn(5); state(f, 2, 12, 'COLONY_POD', 17, 5, 9);
	const next_unit = f.inspect().next_unit_id;
	f.turn(6); state(f, 2, 2, '', 2, 6, 9);
	test.assert(#sizeof(f.sequence_spawns) == 1);
	test.assert(f.sequence_spawns[0] == {
		id: next_unit, turn: 6, owner: f.owner.id, size: 1, minerals: 2, nutrients: 12,
		backlink_released: true, native_work_released: true, worked_count: 1,
	});
	const pod = f.game.um.get_unit(next_unit);
	test.assert(pod.get_def().id == 'ColonyPod' && pod.owner == f.owner.id && pod.get_tile() == f.base.get_tile());
	const pops = f.base.get_pops(); const tile = f.tile_at(0, 2);
	test.assert(pops[0].id == 1 && pops[1].id == 3, 'Production consumes citizen two before growth creates citizen three');
	test.assert(tile.get('working_pop') == pops[1] && pops[1].get('worked_tile') == tile && f.base.is_tile_worked(tile));
	test.assert(f.sequence_events == [
		['process_base_production', 3, 4, 1, 0, 6, 1, 4, 6],
		['process_base_production', 4, 4, 1, 4, 12, 1, 8, 12],
		['add_base_pop', 4, 0, 1, 8, 18, 2, 8, 2],
		['process_base_production', 5, 9, 2, 8, 2, 2, 17, 2],
		['process_base_production', 6, 9, 2, 17, 12, 1, 2, 12],
		['add_base_pop', 6, 0, 1, 2, 18, 2, 2, 2],
	], 'Each selected turn credits its pre-growth surplus once; completion precedes same-turn regrowth');
});

behavior.scenario('shipped worker growth event rollback restores nutrient storage and both native worker links', () => {
	const f = fixture(); grow_once(f);
	test.assert(#sizeof(f.sequence_growth) == 1);
	const growth = f.sequence_growth[0];
	const original_pops = f.base.get_pops(); const original = original_pops[0];
	const initial_tile = f.tile_at(2, 0); const grown_tile = f.tile_at(0, 2);
	const next_ids = f.next_ids();
	f.with_write(() => { add_pop.rollback(growth); });
	state(f, 1, 18, 'COLONY_POD', 8, 4, 4);
	const pops = f.base.get_pops();
	test.assert(#sizeof(pops) == 1 && pops[0] == original && original.id == 1);
	test.assert(initial_tile.get('working_pop') == original && original.get('worked_tile') == initial_tile);
	test.assert(!grown_tile.has('working_pop') && !f.base.is_tile_worked(grown_tile));
	test.assert(f.base.get_worked_tiles() == [initial_tile]);
	test.assert(f.next_ids() == next_ids, 'Undo preserves the native monotonic allocation counters');
	test.assert(f.sequence_spawns == [] && f.base.get_tile().get_units() == []);
});

behavior.scenario('shipped doctor growth rollback preserves the existing worker without a worker undo operation', () => {
	const f = fixture();
	const pops_before = f.base.get_pops(); const original = pops_before[0]; const tile = f.tile_at(2, 0);
	// The controlled workable-tile boundary leaves no free worker location.
	f.game.bm.off('get_base_workable_tiles');
	f.game.bm.on('get_base_workable_tiles', (e) => { const tiles = []; tiles :+ tile; return tiles; });
	f.turn(2); f.turn(3); f.turn(4);
	state(f, 2, 2, '', 0, 0, 4);
	test.assert(#sizeof(f.sequence_growth) == 1);
	const growth = f.sequence_growth[0]; const pops = f.base.get_pops();
	test.assert(pops[1].get_type() == 'DOCTOR' && !pops[1].has('worked_tile'));
	test.assert(!#is_defined(growth.applied.worked_tile));
	const next_ids = f.next_ids();
	f.with_write(() => { add_pop.rollback(growth); });
	state(f, 1, 18, '', 0, 0, 4);
	const remaining = f.base.get_pops();
	test.assert(#sizeof(remaining) == 1 && remaining[0] == original);
	test.assert(tile.get('working_pop') == original && original.get('worked_tile') == tile);
	test.assert(f.base.get_worked_tiles() == [tile] && f.base.is_tile_worked(tile));
	test.assert(f.next_ids() == next_ids && f.sequence_spawns == []);
});

behavior.scenario('a mineral-ready size-one Colony Pod project retains every credit until slow natural growth permits completion', () => {
	const f = fixture(1);
	const initial = f.base.get_pops(); const worker = initial[0]; const initial_tile = f.tile_at(2, 0);
	state(f, 1, 0, '', 0, 0, 4);
	test.assert(f.base.get_intake() == { NUTRIENTS: 3, MINERALS: 4, ENERGY: 0 });
	test.assert(f.base.get_consumption() == { NUTRIENTS: 2, MINERALS: 0, ENERGY: 0 });
	f.turn(2); state(f, 1, 1, '', 0, 0, 4);
	test.assert(f.sequence_events == []);
	f.choose_pod(); state(f, 1, 1, 'COLONY_POD', 0, 2, 4);
	for (let turn = 3; turn <= 17; turn++) {
		f.turn(turn);
		const grows = turn == 17;
		state(f, grows ? 2 : 1, grows ? 0 : turn - 1, 'COLONY_POD', (turn - 2) * 4, turn, grows ? 9 : 4);
		test.assert(f.sequence_spawns == [] && f.base.get_tile().get_units() == []);
		const row = f.sequence_events[turn - 3];
		test.assert(row == [
			'process_base_production', turn, 4, 1, (turn - 3) * 4, turn - 2,
			1, (turn - 2) * 4, turn - 2,
		], 'A waiting size-one project receives its actual four-mineral surplus exactly once per turn');
		if (turn == 8) {
			test.assert(f.base.get_production().minerals == 24 && f.base.get_size() == 1, 'Mineral readiness alone must not consume the only citizen');
		}
	}
	test.assert(#sizeof(f.sequence_events) == 16 && #sizeof(f.sequence_growth) == 1);
	test.assert(f.sequence_events[15] == ['add_base_pop', 17, 0, 1, 60, 16, 2, 60, 0]);
	const grown = f.base.get_pops(); const grown_tile = f.tile_at(0, 2);
	test.assert(grown[0] == worker && grown[1].id == 2 && grown[1].get('worked_tile') == grown_tile);
	test.assert(grown_tile.get('working_pop') == grown[1] && f.base.is_tile_worked(grown_tile));
	const next_unit = f.inspect().next_unit_id;
	f.turn(18); state(f, 1, 1, '', 45, 18, 4);
	test.assert(#sizeof(f.sequence_events) == 17 && #sizeof(f.sequence_growth) == 1);
	test.assert(f.sequence_events[16] == ['process_base_production', 18, 9, 2, 60, 0, 1, 45, 0]);
	test.assert(f.sequence_spawns == [{
		id: next_unit, turn: 18, owner: f.owner.id, size: 1, minerals: 45, nutrients: 0,
		backlink_released: true, native_work_released: true, worked_count: 1,
	}]);
	const pod = f.game.um.get_unit(next_unit);
	test.assert(pod.get_def().id == 'ColonyPod' && pod.owner == f.owner.id && pod.get_tile() == f.base.get_tile());
	test.assert(!grown_tile.has('working_pop') && !f.base.is_tile_worked(grown_tile));
	const remaining = f.base.get_pops();
	test.assert(#sizeof(remaining) == 1 && remaining[0] == worker && worker.get('worked_tile') == initial_tile);
	test.assert(initial_tile.get('working_pop') == worker && f.base.get_worked_tiles() == [initial_tile]);
});
