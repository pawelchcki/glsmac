// Native destruction membership is a GLSMAC application invariant.
// Real Base/Pop/world objects and event write guards; no original-game claim.
const behavior = #include('./_behavior');
const rejected = (callback) => {
	let caught = false;
	try { callback(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'Foreign native Pop must be rejected before changing either base');
};
const first_pop = (base) => { const pops = base.get_pops(); return pops[0]; };
const assign = (f, base, pop, tile) => {
	f.with_write(() => { pop.set('worked_tile', tile); tile.set('working_pop', pop); base.add_worked_tile(tile); });
};

behavior.scenario('destroy_pop rejects a same-ID citizen from another base in the same native world', () => {
	const f = test.founding_fixture(); f.add_worker(0); f.add_snapshot_base(2, 2);
	let other = null;
	for (base of f.game.bm.get_bases()) { if (base.id != f.base.id) { other = base; } }
	let foreign = null;
	f.with_write(() => { foreign = other.create_pop({ type: 'WORKER' }); });
	const local = first_pop(f.base);
	const local_tile = f.tile_at(2, 0); const foreign_tile = f.tile_at(0, 2);
	assign(f, f.base, local, local_tile); assign(f, other, foreign, foreign_tile);
	test.assert(local.id == foreign.id && local.get_base().id != foreign.get_base().id);
	// update_count explicitly flushes setup notifications before the baseline.
	const updates = f.update_count();
	const snapshot = f.snapshot(); const ids = f.next_ids(); const inspect = f.inspect();
	test.assert(inspect.updates == 0);
	rejected(() => { f.with_write(() => { f.base.destroy_pop(foreign); }); });
	test.assert(f.snapshot() == snapshot && f.next_ids() == ids);
	test.assert(f.inspect() == inspect, 'Rejected membership must preserve RNG, native IDs and queued notifications');
	test.assert(f.update_count() == updates);
	test.assert(first_pop(f.base) == local && first_pop(other) == foreign);
	test.assert(local_tile.get('working_pop') == local && foreign_tile.get('working_pop') == foreign);
	test.assert(f.base.is_tile_worked(local_tile) && other.is_tile_worked(foreign_tile));
});

behavior.scenario('destroy_pop rejects matching base and citizen IDs belonging to another native world', () => {
	const target = test.founding_fixture(); const source = test.founding_fixture();
	target.add_worker(0); source.add_worker(0);
	const local = first_pop(target.base); const foreign = first_pop(source.base);
	const local_tile = target.tile_at(2, 0); const foreign_tile = source.tile_at(2, 0);
	assign(target, target.base, local, local_tile); assign(source, source.base, foreign, foreign_tile);
	test.assert(local.id == foreign.id && local.get_base().id == foreign.get_base().id);
	test.assert(target.base != source.base);
	const target_updates = target.update_count(); const source_updates = source.update_count();
	const target_before = target.snapshot(); const source_before = source.snapshot();
	const target_ids = target.next_ids(); const source_ids = source.next_ids();
	const target_inspect = target.inspect(); const source_inspect = source.inspect();
	test.assert(target_inspect.updates == 0 && source_inspect.updates == 0);
	rejected(() => { target.with_write(() => { target.base.destroy_pop(foreign); }); });
	test.assert(target.snapshot() == target_before && source.snapshot() == source_before);
	test.assert(target.next_ids() == target_ids && source.next_ids() == source_ids);
	test.assert(target.inspect() == target_inspect && source.inspect() == source_inspect, 'Both native worlds retain RNG, IDs and notification queues');
	test.assert(target.update_count() == target_updates && source.update_count() == source_updates);
	test.assert(first_pop(target.base) == local && first_pop(source.base) == foreign);
	test.assert(local_tile.get('working_pop') == local && foreign_tile.get('working_pop') == foreign);
	test.assert(target.base.is_tile_worked(local_tile) && source.base.is_tile_worked(foreign_tile));
});

behavior.scenario('destroy_pop accepts a fresh wrapper alias of its actual local citizen', () => {
	const f = test.founding_fixture(); f.add_worker(0);
	const original = first_pop(f.base); const alias = first_pop(f.base);
	test.assert(original == alias && alias.get_base() == f.base);
	const updates = f.update_count(); const ids = f.next_ids(); const inspect = f.inspect();
	test.assert(inspect.updates == 0);
	f.with_write(() => { f.base.destroy_pop(alias); });
	test.assert(f.base.get_size() == 0 && f.base.get_pops() == []);
	// with_write flushes the removal notification; update_count flushes again
	// before reading its delivered total, so this checks a delivered update.
	test.assert(f.next_ids() == ids && f.update_count() == updates + 1);
	const after = f.inspect();
	test.assert(after.updates == 0 && after.rng == inspect.rng && after.next_unit_id == inspect.next_unit_id && after.next_base_id == inspect.next_base_id);
	test.assert(after.unit_ids == inspect.unit_ids && after.pending_events == inspect.pending_events);
});
