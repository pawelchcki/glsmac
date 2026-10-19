// Functional GLSMAC colony founding, not an original-game rule contract.
// Prototype and script/event boundaries execute production modules; actual
// transaction integration below uses the asset-free native founding fixture.
const behavior = #include('./_behavior');

behavior.scenario('default unit registry declares a functional land colony pod', () => {
	const definitions = {};
	const game = {};
	game.event = (name, data) => {
		if (name == 'define_unit') { definitions[data.id] = data.data; }
	};
	#include('../default/units/defs').define(game);
	const pod = definitions.ColonyPod;
	test.assert(#is_defined(pod), 'A land Colony Pod prototype must be available to normal startup');
	test.assert(pod.name == 'Colony Pod' && pod.type == 'static');
	test.assert(pod.movement_type == 'land' && pod.movement_per_turn == 1);
	test.assert(pod.render.type == 'sprite' && pod.render.w > 0 && pod.render.h > 0);
});

const colony = #include('../default/game/colony');
const found = #include('../default/game/event/found_base');
const configure_bases = #include('../default/game/bases');

behavior.scenario('shared colony validation rejects malformed ids before native lookup', () => {
	const state = { calls: 0, error: 'Native rejection', ids: [] };
	const game = {};
	game.validate_found_base = (id, caller) => {
		state.calls = state.calls + 1;
		state.ids :+ [id, caller];
		return state.error;
	};
	for (id of [undefined, null, '1', 0, (0 - 1), 1.0]) {
		test.assert(colony.validate(game, id, 1) == 'Colony unit id must be a positive integer');
	}
	for (caller of [undefined, null, '1', (0 - 1), 1.0]) {
		test.assert(colony.validate(game, 1, caller) == 'Colony owner must be a nonnegative integer');
	}
	test.assert(state.calls == 0);
	test.assert(colony.validate(game, 7, 1) == 'Native rejection');
	state.error = undefined;
	test.assert(!#is_defined(colony.validate(game, 8, 2)));
	test.assert(state.ids == [[7, 1], [8, 2]]);
});

const chooser_fixture = () => {
	const f = {};
	f.state = { globals: {}, handlers: {}, candidates: [], owner_queries: [], calls: [], restores: [] };
	f.game = {};
	f.game.on = (name, callback) => { f.state.handlers[name] = callback; };
	f.game.set = (key, value) => { f.state.globals[key] = value; };
	f.game.get = (key) => { return f.state.globals[key]; };
	f.game.event = (name, data) => {};
	f.game.get_bm = () => { return { on: (name, callback) => {} }; };
	f.game.get_tm = () => { return {
		get_map_width: () => { return 20; }, get_map_height: () => { return 20; },
	}; };
	configure_bases(f.game);
	f.state.handlers.start({});
	f.base = {};
	f.base.get_unworked_tiles = () => { return f.state.candidates; };
	f.base.get_owner = () => { return { id: 1 }; };
	f.tile = (x, nutrients, minerals, energy, occupied, has_base) => {
		const tile = { x: x, y: 0 };
		tile.has = (key) => { return occupied; };
		tile.get_base = () => { return has_base ? { id: 99 } : null; };
		tile.get_resources = (owner) => {
			f.state.owner_queries :+ owner.id;
			return { NUTRIENTS: nutrients, MINERALS: minerals, ENERGY: energy };
		};
		f.state.candidates :+ tile;
		return tile;
	};
	return f;
};
behavior.scenario('initial citizen planner preserves other bases and worker assignments', () => {
	const f = chooser_fixture();
	f.tile(2, 99, 99, 99, true, false);
	f.tile(4, 99, 99, 99, false, true);
	f.tile(6, 1, 0, 0, false, false);
	f.tile(8, 0, 2, 0, false, false);
	const plan = colony.choose_citizen(f.game, f.base);
	test.assert(plan.type == 'WORKER' && plan.worked_tile.x == 8);
	test.assert(f.state.owner_queries == [1, 1], 'Only eligible tiles are scored through the real weighted helper');
	test.assert(#sizeof(f.state.candidates) == 4, 'Planning does not mutate assignment boundaries');
});
behavior.scenario('initial citizen planner creates a doctor only without an eligible worked tile', () => {
	const f = chooser_fixture();
	f.tile(2, 1, 2, 3, true, false);
	f.tile(4, 1, 2, 3, false, true);
	test.assert(colony.choose_citizen(f.game, f.base) == { type: 'DOCTOR' });
	test.assert(f.state.owner_queries == []);
});
behavior.scenario('an eligible zero-yield tile still receives the first worker', () => {
	const f = chooser_fixture();
	f.tile(2, 0, 0, 0, false, false);
	const plan = colony.choose_citizen(f.game, f.base);
	test.assert(plan.type == 'WORKER' && plan.worked_tile.x == 2);
});
behavior.scenario('founding event delegates one atomic transaction and returns its scalar rollback receipt', () => {
	const f = chooser_fixture();
	f.tile(2, 0, 0, 0, false, false);
	f.game.validate_found_base = (id, caller) => { return; };
	const receipt = { base_id: 77, unit_id: 3 };
	f.game.found_base = (id, caller, choose) => {
		const plan = choose(f.base);
		f.state.calls :+ [id, caller, plan.type, plan.worked_tile.x];
		return receipt;
	};
	f.game.rollback_found_base = (data) => { f.state.restores :+ data.base_id; };
	const e = { caller: 1, data: { unit_id: 3 } }; e.game = f.game;
	test.assert(!#is_defined(found.validate(e)));
	e.applied = found.apply(e);
	test.assert(e.applied == receipt && f.state.calls == [[3, 1, 'WORKER', 2]]);
	found.rollback(e);
	test.assert(f.state.restores == [77]);
});
behavior.scenario('default event registry exposes the scalar founding action', () => {
	const handlers = {};
	const game = {};
	game.register_event = (name, handler) => { handlers[name] = handler; };
	#include('../default/game/events')(game);
	test.assert(#typeof(handlers.found_base.validate) == 'Callable');
	test.assert(#typeof(handlers.found_base.rollback) == 'Callable');
});

// Real native Tile/Base/Unit identity and transaction integration. Plain-object
// mocks cannot catch native reference and wrapper-identity mistakes.
const native_fixture = (has_worker_tile) => {
	const f = test.founding_fixture();
	f.game.bm.on('get_base_workable_tiles', (e) => {
		const tiles = [];
		if (has_worker_tile) { const tile = f.worker_tile; tiles :+ tile; }
		return tiles;
	});
	// The native manager supplies one candidate. Weighted selection itself is
	// covered above through the production helper with explicit resource inputs.
	f.game.set('f_base_find_best_or_worst_tiles', (base, tiles, count, modifier) => { return tiles; });
	return f;
};
const native_event = (f, caller, id) => {
	const e = { caller: caller, data: { unit_id: id } };
	e.game = f.game;
	return e;
};
const native_base = (f, id) => {
	for (base of f.game.bm.get_bases()) {
		if (base.id == id) { return base; }
	}
	throw Error('Founded base not found');
};
behavior.scenario('actual founding event retains native worker tile identity and rolls back the full pod', () => {
	const f = native_fixture(true);
	const before = f.snapshot();
	const e = native_event(f, f.owner.id, f.unit_id);
	test.assert(!#is_defined(found.validate(e)));
	f.with_write(() => { e.applied = found.apply(e); });
	const base = native_base(f, e.applied.base_id);
	test.assert(!f.game.um.has_unit(f.unit_id) && base.get_size() == 1);
	const pops = base.get_pops(); const pop = pops[0];
	test.assert(pop.get_type() == 'WORKER' && pop.get('worked_tile') == f.worker_tile);
	test.assert(f.worker_tile.get('working_pop').id == pop.id && base.is_tile_worked(f.worker_tile));
	test.assert(base.get_facilities() == {} && base.get_production().choice_id == '');
	f.with_write(() => { found.rollback(e); });
	test.assert(f.snapshot() == before, 'Rollback restores pod state, citizen assignment, RNG, names and IDs');
	test.assert(f.tile.get_base() == null && !f.worker_tile.has('working_pop'));
});
behavior.scenario('actual founding event immediately initializes a doctor when no worker tile is available', () => {
	const f = native_fixture(false);
	const before = f.snapshot();
	const e = native_event(f, f.owner.id, f.unit_id);
	f.with_write(() => { e.applied = found.apply(e); });
	const base = native_base(f, e.applied.base_id);
	const pops = base.get_pops();
	test.assert(base.get_size() == 1 && pops[0].get_type() == 'DOCTOR');
	test.assert(base.get_worked_tiles() == [] && !f.worker_tile.has('working_pop'));
	test.assert(!f.game.um.has_unit(f.unit_id) && base.get_facilities() == {});
	f.with_write(() => { found.rollback(e); });
	test.assert(f.snapshot() == before);
});
behavior.scenario('native event processing accepts one founding command and rejects its stale duplicate', () => {
	const f = native_fixture(true);
	const results = [];
	f.game.register_event('found_base', found);
	f.game.on('event_result', (e) => { results :+ e; });
	f.game.event('found_base', { unit_id: f.unit_id });
	f.game.event('found_base', { unit_id: f.unit_id });
	f.process_events();
	test.assert(#sizeof(results) == 2 && results[0].success && !results[1].success);
	test.assert(results[0].name == 'found_base' && results[1].name == 'found_base');
	test.assert(results[0].data.unit_id == f.unit_id && results[1].data.unit_id == f.unit_id);
	test.assert(results[0].caller == f.owner.id && results[0].event_id != results[1].event_id);
	test.assert(#sizeof(f.game.bm.get_bases()) == 2 && !f.game.um.has_unit(f.unit_id));
	test.assert(f.tile.get_base().get_size() == 1);
});
for (kind of ['no_moves', 'dead', 'wrong_def', 'water', 'locked', 'occupied', 'completed', 'inactive', 'animating']) {
	behavior.scenario('production founding event rejects ' + kind + ' without state changes', () => {
		const f = native_fixture(true);
		f.configure(kind);
		const before = f.snapshot();
		const results = [];
		f.game.register_event('found_base', found);
		f.game.on('event_result', (e) => { results :+ e; });
		f.game.event('found_base', { unit_id: f.unit_id });
		f.process_events();
		test.assert(#sizeof(results) == 1 && !results[0].success && results[0].data.unit_id == f.unit_id);
		test.assert(f.snapshot() == before && f.game.um.has_unit(f.unit_id));
	});
}
behavior.scenario('production founding event rejects unknown scalar ID and foreign caller before mutation', () => {
	const f = native_fixture(true);
	const before = f.snapshot();
	const foreign = native_event(f, f.owner.id + 1, f.unit_id);
	test.assert(#typeof(found.validate(foreign)) == 'String');
	const results = [];
	f.game.register_event('found_base', found);
	f.game.on('event_result', (e) => { results :+ e; });
	f.game.event('found_base', { unit_id: 999999 });
	f.process_events();
	test.assert(#sizeof(results) == 1 && !results[0].success && results[0].data.unit_id == 999999);
	test.assert(f.snapshot() == before);
});
behavior.scenario('failed initial-citizen planning releases the pending command and preserves its pod', () => {
	const f = native_fixture(true);
	f.game.set('f_base_find_best_or_worst_tiles', (base, tiles, count, modifier) => { throw PlanError('abort initial worker planning'); });
	const before = f.snapshot();
	const results = [];
	f.game.register_event('found_base', found);
	f.game.on('event_result', (e) => { results :+ e; });
	f.game.event('found_base', { unit_id: f.unit_id });
	f.process_events();
	test.assert(#sizeof(results) == 1 && !results[0].success && results[0].data.unit_id == f.unit_id);
	test.assert(f.snapshot() == before && f.game.um.has_unit(f.unit_id));
	test.assert(f.tile.get_base() == null && !f.worker_tile.has('working_pop'));
});
