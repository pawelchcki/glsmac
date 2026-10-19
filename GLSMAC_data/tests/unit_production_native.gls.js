// Bounded GLSMAC renewable-pod policy. Only the three-row component recipe and
// human mineral factor have original observations; completion is application policy.
const behavior = #include('./_behavior');
const rejected = (callback) => {
	let caught = false;
	try { callback(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'expected rejection');
};
const register = (f) => {
	f.with_write(() => {
		f.owner.add_production_choice('COLONY_POD', {
			type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1,
		});
	});
};
const fixture = () => { const f = test.founding_fixture(); register(f); return f; };
const select = (f) => { f.with_write(() => { f.base.select_production('COLONY_POD'); }); };
const process = (f, turn, minerals) => {
	f.set_turn(turn);
	let result = null;
	f.with_write(() => { result = f.base.process_production(turn, minerals); });
	return result;
};
const choice = (f) => {
	for (item of f.owner.get_production_choices()) { if (item.id == 'COLONY_POD') { return item; } }
	return null;
};

behavior.scenario('native production exports registered Colony Pod recipe and copied descriptors', () => {
	const f = test.founding_fixture();
	let supported = true;
	try { register(f); } catch { : (e) => { supported = false; } }
	test.assert(supported, 'Colony Pod must be a registered constructible unit project');
	const item = choice(f);
	test.assert(item.type == 'unit' && item.unit_id == 'ColonyPod' && item.cost == 30 && item.population_cost == 1);
	item.cost = 1;
	test.assert(choice(f).cost == 30, 'descriptor mutation cannot alter production cost');
});

behavior.scenario('size one retains complete credit until another actual citizen is available', () => {
	const f = fixture(); f.add_worker(0); select(f);
	const before = f.inspect().unit_ids;
	process(f, 2, 35);
	test.assert(f.base.get_size() == 1 && f.inspect().unit_ids == before);
	test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: 35, last_processed_turn: 2 });
	f.add_worker(1);
	const receipt = process(f, 3, 0);
	test.assert(f.base.get_size() == 1 && #sizeof(f.inspect().unit_ids) == #sizeof(before) + 1);
	test.assert(f.base.get_production() == { choice_id: '', minerals: 5, last_processed_turn: 3 });
	test.assert(#typeof(receipt.unit_receipt) == 'Int');
});

behavior.scenario('completion consumes a citizen and creates exact owned unit defaults at the base', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); select(f);
	const before = f.inspect();
	process(f, 2, 29);
	test.assert(f.base.get_size() == 2 && f.inspect().unit_ids == before.unit_ids);
	const receipt = process(f, 3, 4);
	const pod = f.game.um.get_unit(before.next_unit_id);
	test.assert(pod.owner == f.owner.id && pod.get_tile() == f.base.get_tile());
	test.assert(pod.get_def().id == 'ColonyPod' && pod.health == 1.0 && pod.morale == 1);
	test.assert(pod.movement == 1.0 && !pod.moved_this_turn && f.base.get_size() == 1);
	test.assert(f.base.get_production().minerals == 3 && f.base.get_production().choice_id == '');
	rejected(() => { f.with_write(() => { f.base.process_production(3, 4); }); });
	test.assert(#sizeof(f.inspect().unit_ids) == #sizeof(before.unit_ids) + 1);
});

behavior.scenario('completion rollback restores population, project, unit IDs and random state', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); select(f);
	const before = f.snapshot(); const inspect = f.inspect();
	const receipt = process(f, 2, 34);
	f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); });
	test.assert(f.snapshot() == before && f.inspect().next_unit_id == inspect.next_unit_id);
	rejected(() => { f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); }); });
});

behavior.scenario('throwing unit spawn listener restores production, population, RNG, IDs and update queues', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); select(f);
	f.game.um.on('unit_spawn', (e) => {
		f.game.random.get_int(0, 99);
		throw SpawnError('reject produced unit');
	});
	const before = f.snapshot(); const inspect = f.inspect();
	f.set_turn(2);
	rejected(() => { f.with_write(() => { f.base.process_production(2, 30); }); });
	test.assert(f.snapshot() == before, 'failed spawn restores complete serialized state');
	test.assert(f.inspect() == inspect, 'failed spawn restores RNG, IDs and native update bookkeeping');
});

behavior.scenario('rollback cannot delete a produced pod whose state changed', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); select(f);
	const id = f.inspect().next_unit_id;
	const receipt = process(f, 2, 30);
	const pod = f.game.um.get_unit(id);
	f.with_write(() => { pod.movement = 0.5; });
	const before = f.snapshot();
	rejected(() => { f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); }); });
	test.assert(f.snapshot() == before && f.game.um.has_unit(id));
});

behavior.scenario('manual reselection produces a second renewable Colony Pod', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); f.add_worker(0); select(f);
	const count = #sizeof(f.inspect().unit_ids);
	process(f, 2, 30); select(f); process(f, 3, 30);
	test.assert(f.base.get_size() == 1 && #sizeof(f.inspect().unit_ids) == count + 2);
	test.assert(f.base.get_production().choice_id == '' && f.base.get_production().minerals == 0);
});

const assign_last = (f, tile) => {
	const pops = f.base.get_pops();
	const pop = pops[#sizeof(pops) - 1];
	f.with_write(() => { pop.set('worked_tile', tile); tile.set('working_pop', pop); f.base.add_worked_tile(tile); });
	return pop;
};

behavior.scenario('production releases an actual worker tile and receipt restores the same citizen and backlinks', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1);
	const tile = f.tile_at(2, 0); const pop = assign_last(f, tile); select(f);
	const before = f.snapshot();
	const receipt = process(f, 2, 30);
	test.assert(!tile.has('working_pop') && !f.base.is_tile_worked(tile) && f.base.get_worked_tiles() == []);
	rejected(() => { f.with_write(() => { pop.set_type('DOCTOR'); }); });
	rejected(() => { f.with_write(() => { pop.set('worked_tile', tile); }); });
	f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); });
	test.assert(f.snapshot() == before && tile.get('working_pop') == pop);
	test.assert(pop.get('worked_tile') == tile && f.base.is_tile_worked(tile));
});

behavior.scenario('failed unit-spawn callback also restores the actual worker links and native worked set', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1);
	const tile = f.tile_at(2, 0); const pop = assign_last(f, tile); select(f);
	f.game.um.on('unit_spawn', (e) => { f.game.random.get_int(0, 99); throw SpawnError('reject worker consumption'); });
	const before = f.snapshot(); const inspect = f.inspect(); f.set_turn(2);
	rejected(() => { f.with_write(() => { f.base.process_production(2, 30); }); });
	test.assert(f.snapshot() == before && f.inspect() == inspect);
	test.assert(tile.get('working_pop') == pop && pop.get('worked_tile') == tile && f.base.is_tile_worked(tile));
});

for (entry of [[0, 24], [1, 27], [2, 30], [3, 30], [4, 30]]) {
	behavior.scenario('unit descriptor and completion share named preset price ' + #to_string(entry[0]), () => {
		const f = fixture(); const map = f.game.get_settings().global.map;
		map.type = 'random'; map.preset_level = entry[0];
		test.assert(choice(f).cost == entry[1]);
		f.add_worker(0); f.add_worker(1); select(f);
		process(f, 2, entry[1] - 1);
		test.assert(f.base.get_size() == 2 && f.base.get_production().choice_id == 'COLONY_POD');
		process(f, 3, 4);
		test.assert(f.base.get_size() == 1 && f.base.get_production().minerals == 3 && f.base.get_production().choice_id == '');
	});
}

for (kind of ['unknown', 'custom', 'mapfile']) {
	behavior.scenario('unproven map provenance retains explicit unit fallback ' + kind, () => {
		const f = fixture(); const map = f.game.get_settings().global.map;
		if (kind == 'custom') { map.type = 'custom'; map.size_x = 88; map.size_y = 44; }
		else if (kind == 'mapfile') { map.type = 'mapfile'; }
		test.assert(map.preset_level == (0 - 1) && choice(f).cost == 30);
		f.add_worker(0); f.add_worker(1); select(f); process(f, 2, 29);
		test.assert(f.base.get_size() == 2); process(f, 3, 1); test.assert(f.base.get_size() == 1);
	});
}

behavior.scenario('unit recipe copies and actual receiving-world active project codecs retain their ownership', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); select(f); process(f, 2, 13);
	const result = f.unit_recipe_codec_probe();
	test.assert(result.independent && result.copied && result.source_unchanged);
	test.assert(result.roundtrip && result.receiving_parent && result.receiving_units);
	test.assert(result.missing_definition_rejected && result.missing_morale_rejected && result.receiver_unchanged);
});

let invalid_recipe_index = 0;
for (bad of [
	{ type: 'unit', id: 'MISSING', cost: 30, cost_rows: 3, population_cost: 1 },
	{ type: 'unit', id: 'Scout', cost: 30, cost_rows: 3, population_cost: 1 },
	{ type: 'unit', id: 'ColonyPod', cost: 0, cost_rows: 3, population_cost: 1 },
	{ type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 0, population_cost: 1 },
	{ type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 0 },
	{ type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 2 },
	{ type: 'unit', id: 'ColonyPod', cost: 30.0, cost_rows: 3, population_cost: 1 },
]) {
	behavior.scenario('invalid unit recipe fails before registration or world mutation ' + #to_string(invalid_recipe_index), () => {
		const f = test.founding_fixture(); const before = f.snapshot(); const descriptors = f.owner.get_production_choices();
		rejected(() => { f.with_write(() => { f.owner.add_production_choice('BAD_POD', bad); }); });
		test.assert(f.snapshot() == before && f.owner.get_production_choices() == descriptors);
	});
	invalid_recipe_index++;
}

behavior.scenario('native unit production mutations require event write authorization', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); const initial = f.snapshot();
	rejected(() => { f.base.select_production('COLONY_POD'); });
	test.assert(f.snapshot() == initial); select(f); const before = f.snapshot(); f.set_turn(2);
	rejected(() => { f.base.process_production(2, 30); });
	test.assert(f.snapshot() == before);
	const receipt = process(f, 2, 30); const completed = f.snapshot();
	rejected(() => { f.base.rollback_unit_production(receipt.unit_receipt); });
	test.assert(f.snapshot() == completed);
});

for (kind of ['consumed', 'replaced']) {
	behavior.scenario('receipt cannot delete a consumed or replaced produced pod ' + kind, () => {
		const f = fixture(); f.add_worker(0); f.add_worker(1); select(f);
		const id = f.inspect().next_unit_id; const receipt = process(f, 2, 30);
		f.with_write(() => {
			f.game.um.despawn_unit(id);
			if (kind == 'replaced') {
				f.game.um.spawn_unit({ id: id, def: 'ColonyPod', owner: f.owner, tile: f.base.get_tile(), morale: 1, health: 1.0 });
			}
		});
		const before = f.snapshot();
		rejected(() => { f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); }); });
		test.assert(f.snapshot() == before && f.game.um.has_unit(id) == (kind == 'replaced'));
	});
}

for (target of ['base', 'tile', 'citizen']) {
	behavior.scenario('lifecycle custom mutation is rejected atomically and its guard unwinds ' + target, () => {
		const f = fixture(); f.add_worker(0); f.add_worker(1);
		const tile = f.tile_at(2, 0); const pop = assign_last(f, tile); select(f);
		f.with_write(() => { f.base.set('accumulated_nutrients', 7); });
		f.game.um.on('unit_spawn', (e) => {
			if (target == 'base') { f.base.set('accumulated_nutrients', 123); }
			else if (target == 'tile') { tile.unset('working_pop'); }
			else { pop.unset('worked_tile'); }
			throw SpawnError('custom mutation must not leak');
		});
		const before = f.snapshot(); const inspect = f.inspect(); f.set_turn(2);
		rejected(() => { f.with_write(() => { f.base.process_production(2, 30); }); });
		test.assert(f.snapshot() == before && f.inspect() == inspect);
		test.assert(f.base.get('accumulated_nutrients') == 7 && tile.get('working_pop') == pop && pop.get('worked_tile') == tile);
		f.with_write(() => { f.base.set('accumulated_nutrients', 8); });
		test.assert(f.base.get('accumulated_nutrients') == 8, 'custom mutation guard must unwind after a callback exception');
	});
}

behavior.scenario('a failed production callback cannot mutate an existing unit scalar', () => {
	const f = test.founding_fixture();
	f.with_write(() => { f.owner.add_production_choice('COLONY_POD', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 }); });
	f.add_worker(0); f.add_worker(1);
	f.with_write(() => { f.base.select_production('COLONY_POD'); });
	const existing = f.game.um.get_unit(f.unit_id);
	f.game.um.on('unit_spawn', (e) => { existing.movement = 0.125; throw SpawnError('abort after mutation'); });
	const before = f.snapshot(); const inspect = f.inspect(); f.set_turn(2);
	let caught = false;
	try { f.with_write(() => { f.base.process_production(2, 30); }); } catch { : (e) => { caught = true; } }
	test.assert(caught);
	test.assert(f.snapshot() == before && f.inspect() == inspect, 'Unit scalar callback mutation must not leak from rejected production');
	test.assert(existing.movement == 0.75);
});


behavior.scenario('a failed production callback cannot consume queued event identities', () => {
	const f = test.founding_fixture();
	f.with_write(() => { f.owner.add_production_choice('COLONY_POD', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 }); });
	f.add_worker(0); f.add_worker(1);
	f.with_write(() => { f.base.select_production('COLONY_POD'); });
	f.game.register_event('production_probe', { validate: (e) => {}, apply: (e) => {}, rollback: (e) => {} });
	f.game.um.on('unit_spawn', (e) => { f.game.event('production_probe', {}); throw SpawnError('abort after queueing'); });
	f.set_turn(2);
	let caught = false;
	try { f.with_write(() => { f.base.process_production(2, 30); }); } catch { : (e) => { caught = true; } }
	test.assert(caught);
	const results = [];
	f.game.on('event_result', (e) => { results :+ e; });
	f.game.event('production_probe', {}); f.process_events();
	test.assert(#sizeof(results) == 1 && results[0].event_id == '1_1', 'Rejected callback event queueing must preserve the next real event identity');
});

behavior.scenario('produced-unit scalar setters reject mutation before changing completion defaults', () => {
	const f = fixture(); f.add_worker(0); f.add_worker(1); select(f);
	f.game.um.on('unit_spawn', (e) => { const pod = e.unit; pod.movement = 0.125; });
	const before = f.snapshot(); const inspect = f.inspect(); f.set_turn(2);
	rejected(() => { f.with_write(() => { f.base.process_production(2, 30); }); });
	test.assert(f.snapshot() == before && f.inspect() == inspect);
	f.game.um.off('unit_spawn');
	const receipt = process(f, 2, 30);
	const pod = f.game.um.get_unit(inspect.next_unit_id);
	test.assert(pod.movement == 1.0 && pod.health == 1.0 && !pod.moved_this_turn);
});
