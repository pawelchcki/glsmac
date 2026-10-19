// Native worker removal and undo; a GLSMAC event lifecycle regression.
const behavior = #include('./_behavior');
const configure_bases = #include('../default/game/bases');
const remove_pop = #include('../default/game/event/remove_base_pop');

behavior.scenario('shipped worker removal and rollback preserve surviving citizens and restore a valid worker graph', () => {
	const f = test.founding_fixture(); f.enable_economy(); f.add_worker(0); f.add_worker(1);
	f.game.get_settings().global.map.preset_level = 0;
	f.game.tm.on('get_tile_resources', (e) => { return { NUTRIENTS: 1, MINERALS: 1, ENERGY: 0 }; });
	const handlers = {}; const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => { test.assert(name == 'define_base_pop' || name == 'define_base_facility'); };
	configure_bases(rules); handlers.start({});
	const initial = f.base.get_pops(); const survivor = initial[0]; const victim = initial[1];
	const first_tile = f.tile_at(2, 0); const second_tile = f.tile_at(0, 2);
	const work = f.game.get('f_base_pop_work_tile');
	f.with_write(() => {
		work(f.base, survivor, first_tile); work(f.base, victim, second_tile);
		f.base.set('accumulated_nutrients', 23);
	});
	const before = f.base.get_production(); const ids = f.next_ids();
	const e = { caller: 0 }; e.game = f.game; e.data = {}; e.data.base = f.base; e.data.pop = victim;
	test.assert(!#is_defined(remove_pop.validate(e)));
	f.with_write(() => { e.applied = remove_pop.apply(e); });
	test.assert(f.base.get_size() == 1 && f.base.get('accumulated_nutrients') == 0);
	test.assert(!second_tile.has('working_pop') && !f.base.is_tile_worked(second_tile));
	test.assert(first_tile.get('working_pop') == survivor && survivor.get('worked_tile') == first_tile);
	test.assert(f.base.get_production() == before && f.next_ids() == ids);
	f.with_write(() => { remove_pop.rollback(e); });
	test.assert(f.base.get_size() == 2 && f.base.get('accumulated_nutrients') == 23);
	const restored = f.base.get_pops(); const replacement = restored[1];
	test.assert(restored[0] == survivor && replacement.id == ids.pop && replacement.get_type() == 'WORKER');
	test.assert(replacement.get('worked_tile') == second_tile && second_tile.get('working_pop') == replacement && f.base.is_tile_worked(second_tile));
	test.assert(first_tile.get('working_pop') == survivor && survivor.get('worked_tile') == first_tile);
	test.assert(#sizeof(f.base.get_worked_tiles()) == 2 && f.base.get_production() == before);
	const after = f.next_ids();
	test.assert(after.base == ids.base && after.pop == ids.pop + 1, 'Removal undo recreates a citizen through the existing monotonic allocator');
});

behavior.scenario('shipped doctor removal and rollback preserve the existing worker without assigning a new worker tile', () => {
	const f = test.founding_fixture(); f.enable_economy(); f.add_worker(0);
	f.game.get_settings().global.map.preset_level = 0;
	const handlers = {}; const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => { test.assert(name == 'define_base_pop' || name == 'define_base_facility'); };
	configure_bases(rules); handlers.start({});
	const initial = f.base.get_pops(); const worker = initial[0]; const tile = f.tile_at(2, 0);
	const work = f.game.get('f_base_pop_work_tile'); let doctor = null;
	f.with_write(() => {
		work(f.base, worker, tile); doctor = f.base.create_pop({ type: 'DOCTOR' });
		f.base.set('accumulated_nutrients', 23);
	});
	const ids = f.next_ids();
	const e = { caller: 0 }; e.game = f.game; e.data = {}; e.data.base = f.base; e.data.pop = doctor;
	test.assert(!#is_defined(remove_pop.validate(e)));
	f.with_write(() => { e.applied = remove_pop.apply(e); });
	test.assert(f.base.get_size() == 1 && f.base.get('accumulated_nutrients') == 0);
	test.assert(!#is_defined(e.applied.old_worked_tile) && f.base.get_worked_tiles() == [tile]);
	test.assert(tile.get('working_pop') == worker && worker.get('worked_tile') == tile && f.next_ids() == ids);
	f.with_write(() => { remove_pop.rollback(e); });
	const restored = f.base.get_pops(); const replacement = restored[1];
	test.assert(f.base.get_size() == 2 && f.base.get('accumulated_nutrients') == 23);
	test.assert(restored[0] == worker && replacement.get_type() == 'DOCTOR' && replacement.id == ids.pop && !replacement.has('worked_tile'));
	test.assert(f.base.get_worked_tiles() == [tile] && tile.get('working_pop') == worker && worker.get('worked_tile') == tile);
	const after = f.next_ids(); test.assert(after.base == ids.base && after.pop == ids.pop + 1);
});
