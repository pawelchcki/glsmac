// GLSMAC application sequencing, not whole original-game agreement. Only
// terrain yields and manual delivery of a turn are controlled. Every gameplay
// command crosses the real native Game queue with shipped handlers/validators.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const register_events = #include('../default/game/events');
const select_production = #include('../default/game/event/set_base_production');

const fixture = () => {
	const f = test.founding_fixture();
	f.enable_economy();
	register_events(f.game);
	const map = f.game.get_settings().global.map;
	map.type = 'random'; map.preset_level = 0;
	f.add_worker(0);
	f.game.tm.on('get_tile_resources', (e) => {
		if (e.tile.x == 0 && e.tile.y == 0) { return { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 }; }
		if (e.tile.x == 2 && e.tile.y == 0) { return { NUTRIENTS: 1, MINERALS: 3, ENERGY: 0 }; }
		if (e.tile.x == 0 && e.tile.y == 2) { return { NUTRIENTS: 0, MINERALS: 3, ENERGY: 0 }; }
		return { NUTRIENTS: 0, MINERALS: 0, ENERGY: 0 };
	});
	const handlers = {}; const requests = []; const results = []; const spawns = [];
	const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get_turn = () => { return f.game.get_turn(); };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => {
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		requests :+ { name: name, turn: f.game.get_turn(), size: f.base.get_size(), minerals: f.base.get_production().minerals, nutrients: f.base.get('accumulated_nutrients') };
		f.game.event(name, data);
	};
	configure_bases(rules); handlers.start({});
	const pops = f.base.get_pops(); const work = f.game.get('f_base_pop_work_tile');
	f.with_write(() => {
		f.owner.add_production_choice('COLONY_POD', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 });
		work(f.base, pops[0], f.tile_at(2, 0));
		f.base.set('accumulated_nutrients', 0);
	});
	f.game.on('event_result', (e) => {
		results :+ { name: e.name, success: e.success, caller: e.caller, turn: f.game.get_turn() };
		if (!e.success) { #print('QUEUED_BASE_REJECTED|' + e.name + '|turn=' + #to_string(f.game.get_turn())); }
	});
	f.game.um.on('unit_spawn', (e) => {
		const released = f.tile_at(0, 2);
		spawns :+ { id: e.unit.id, turn: f.game.get_turn(), size: f.base.get_size(), minerals: f.base.get_production().minerals, nutrients: f.base.get('accumulated_nutrients'), worker_released: !released.has('working_pop') && !f.base.is_tile_worked(released) };
	});
	f.queued_requests = requests; f.queued_results = results; f.queued_spawns = spawns;
	f.queued_checked = 0;
	f.turn = (turn) => {
		f.set_turn(turn); f.with_write(() => { handlers.turn({}); });
		let ticks = 0;
		while (f.inspect().pending_events > 0 && ticks < 8) { f.process_events(); ticks++; }
		test.assert(f.inspect().pending_events == 0, 'Native event queue must drain within the bounded event-loop ticks');
	};
	f.choose_pod = () => {
		// Base owner one selects at startup; subsequent simulation commands are
		// genuinely queued by fixture host zero, without validator substitution.
		const e = { caller: f.owner.id }; e.game = f.game; e.data = { choice_id: 'COLONY_POD' }; e.data.base = f.base;
		test.assert(!#is_defined(select_production.validate(e)));
		f.with_write(() => { select_production.apply(e); });
	};
	return f;
};

const successful = (f) => {
	for (let index = f.queued_checked; index < #sizeof(f.queued_results); index++) {
		const result = f.queued_results[index];
		test.assert(result.caller == 0, 'Native queue must retain the real simulation-host caller');
		test.assert(result.success, 'Queued ' + result.name + ' rejected on turn ' + #to_string(result.turn) + '; inspect the native event rejection above');
	}
	f.queued_checked = #sizeof(f.queued_results);
};

behavior.scenario('real queued production completes before starvation decisions use the newly reduced population', () => {
	const f = fixture();
	test.assert(f.game.get_player().id == 0 && f.owner.id == 1);
	test.assert(f.base.get_nutrient_factor() == 8);
	f.turn(2);
	test.assert(f.base.get('accumulated_nutrients') == 1 && f.base.get_production().minerals == 0);
	f.choose_pod();
	for (let turn = 3; turn <= 17; turn++) {
		f.turn(turn); successful(f);
		const grows = turn == 17;
		test.assert(f.base.get_size() == (grows ? 2 : 1));
		test.assert(f.base.get('accumulated_nutrients') == (grows ? 0 : turn - 1));
		test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: (turn - 2) * 4, last_processed_turn: turn });
		test.assert(f.queued_spawns == []);
	}
	const before = f.base.get_pops(); const original = before[0]; const grown_tile = f.tile_at(0, 2);
	test.assert(before[1].id == 2 && before[1].get('worked_tile') == grown_tile && grown_tile.get('working_pop') == before[1]);
	test.assert(f.base.get_intake() == { NUTRIENTS: 3, MINERALS: 7, ENERGY: 0 });
	test.assert(f.base.get_consumption() == { NUTRIENTS: 4, MINERALS: 0, ENERGY: 0 });
	const next_unit = f.inspect().next_unit_id;
	f.turn(18);
	#print('QUEUED_BASE_AFTER|size=' + #to_string(f.base.get_size()) + '|nutrients=' + #to_string(f.base.get('accumulated_nutrients')) + '|minerals=' + #to_string(f.base.get_production().minerals));
	successful(f);
	for (result of f.queued_results) {
		if (result.turn == 18) {
			test.assert(result.name != 'remove_base_pop', 'The native growth stage must not queue a stale starvation event after production consumes a citizen');
		}
	}
	for (request of f.queued_requests) {
		test.assert(request.name != 'remove_base_pop', 'Population consumed by the completed project must not also receive a stale starvation removal');
	}
	test.assert(f.base.get_size() == 1 && f.base.get('accumulated_nutrients') == 1);
	test.assert(f.base.get_production() == { choice_id: '', minerals: 43, last_processed_turn: 18 });
	test.assert(f.queued_spawns == [{ id: next_unit, turn: 18, size: 1, minerals: 43, nutrients: 0, worker_released: true }]);
	const remaining = f.base.get_pops();
	test.assert(#sizeof(remaining) == 1 && remaining[0] == original);
	test.assert(!grown_tile.has('working_pop') && !f.base.is_tile_worked(grown_tile));
	const initial_tile = f.tile_at(2, 0);
	test.assert(initial_tile.get('working_pop') == original && original.get('worked_tile') == initial_tile);
	test.assert(f.base.get_worked_tiles() == [initial_tile]);
	const pod = f.game.um.get_unit(next_unit);
	test.assert(pod.get_def().id == 'ColonyPod' && pod.owner == f.owner.id && pod.get_tile() == f.base.get_tile());
});

behavior.scenario('real queued starvation accepts its actual local worker and preserves the surviving worker graph', () => {
	const f = fixture(); const initial = f.base.get_pops(); const original = initial[0];
	for (let turn = 2; turn <= 17; turn++) {
		f.turn(turn); successful(f);
		const grows = turn == 17;
		test.assert(f.base.get_size() == (grows ? 2 : 1));
		test.assert(f.base.get('accumulated_nutrients') == (grows ? 0 : turn - 1));
		test.assert(f.base.get_production() == { choice_id: '', minerals: 0, last_processed_turn: 0 });
	}
	const grown = f.base.get_pops(); const victim_tile = f.tile_at(0, 2);
	test.assert(grown[0] == original && grown[1].id == 2 && grown[1].get('worked_tile') == victim_tile);
	test.assert(victim_tile.get('working_pop') == grown[1] && f.base.is_tile_worked(victim_tile));
	test.assert(f.base.get_intake() == { NUTRIENTS: 3, MINERALS: 7, ENERGY: 0 });
	test.assert(f.base.get_consumption() == { NUTRIENTS: 4, MINERALS: 0, ENERGY: 0 });
	const ids = f.next_ids(); const unit_ids = f.inspect().unit_ids;
	f.turn(18); successful(f);
	let removals = 0;
	for (result of f.queued_results) {
		if (result.name == 'remove_base_pop') {
			test.assert(result.turn == 18 && result.caller == 0 && result.success);
			removals++;
		}
	}
	test.assert(removals == 1, 'The real starvation queue must successfully remove exactly one actual local citizen');
	test.assert(f.base.get_size() == 1 && f.base.get('accumulated_nutrients') == 0);
	test.assert(f.base.get_production() == { choice_id: '', minerals: 0, last_processed_turn: 0 });
	const remaining = f.base.get_pops(); const initial_tile = f.tile_at(2, 0);
	test.assert(#sizeof(remaining) == 1 && remaining[0] == original && original.id == 1);
	test.assert(initial_tile.get('working_pop') == original && original.get('worked_tile') == initial_tile);
	test.assert(!victim_tile.has('working_pop') && !f.base.is_tile_worked(victim_tile));
	test.assert(f.base.get_worked_tiles() == [initial_tile]);
	test.assert(f.next_ids() == ids, 'Actual removal preserves the monotonic population allocation counter');
	test.assert(f.queued_spawns == [] && f.inspect().unit_ids == unit_ids && f.base.get_tile().get_units() == []);
});
