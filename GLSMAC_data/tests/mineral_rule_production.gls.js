// Loaded mineral factors feed actual native declared-price construction.
// Row declarations, selection and construction are GLSMAC application policy;
// this does not add original-executable whole-construction parity cases.
const behavior = #include('./_behavior');
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Invalid native price operation must fail explicitly');
};
const define = (f, id, fallback, rows) => {
	f.game.bm.define_facility(id, {
		name: id, description: 'Synthetic declared mineral rows', cost: fallback, cost_rows: rows,
		render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 },
	});
};
const fixture = (level, rule) => {
	const f = test.founding_fixture();
	f.game.get_settings().global.map.preset_level = level;
	f.game.get_settings().global.rules.set_mineral_cost_factor(rule);
	f.with_write(() => {
		f.game.bm.undefine_facility('RECYCLING_TANKS');
		define(f, 'RECYCLING_TANKS', 32, 4);
		f.owner.add_production_choice('COLONY_POD', {
			type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1,
		});
	});
	return f;
};
const choice = (f, id) => {
	for (item of f.owner.get_production_choices()) { if (item.id == id) { return item; } }
	return null;
};
const select = (f, id) => { f.with_write(() => { f.base.select_production(id); }); };
const process = (f, turn, minerals) => {
	f.set_turn(turn); let receipt = null;
	f.with_write(() => { receipt = f.base.process_production(turn, minerals); });
	return receipt;
};
const assert_pod = (f, id) => {
	test.assert(f.game.um.has_unit(id), 'Completion creates an actual native unit');
	const pod = f.game.um.get_unit(id);
	test.assert(pod.get_def().id == 'ColonyPod' && pod.owner == f.owner.id);
	test.assert(pod.get_tile() == f.base.get_tile() && pod.movement == 1.0 && pod.health == 1.0);
};

behavior.scenario('Standard rule eleven exports actual forty-four and thirty-three mineral prices', () => {
	const f = fixture(2, 11);
	test.assert(f.game.get_settings().global.rules.get_mineral_cost_factor() == 11);
	const tanks = choice(f, 'RECYCLING_TANKS'); const pod = choice(f, 'COLONY_POD');
	test.assert(tanks != null && tanks.type == 'facility' && tanks.cost == 44);
	test.assert(pod != null && pod.type == 'unit' && pod.cost == 33 && pod.population_cost == 1);
	const before = f.snapshot(); const inspect = f.inspect();
	test.assert(f.base.get_production_switch_loss('RECYCLING_TANKS') == 0);
	test.assert(f.base.get_production_switch_loss('COLONY_POD') == 0);
	test.assert(f.snapshot() == before && f.inspect() == inspect, 'Price preview is read-only');
	tanks.cost = 1; pod.cost = 1;
	test.assert(choice(f, 'RECYCLING_TANKS').cost == 44 && choice(f, 'COLONY_POD').cost == 33);
});

behavior.scenario('actual facility completion uses loaded cost and retains exact overflow', () => {
	const f = fixture(2, 11); select(f, 'RECYCLING_TANKS');
	test.assert(f.base.get_production() == { choice_id: 'RECYCLING_TANKS', minerals: 0, last_processed_turn: 1 });
	process(f, 2, 43);
	test.assert(!f.base.has_facility('RECYCLING_TANKS') && f.base.get_production().minerals == 43);
	const before = f.snapshot(); const receipt = process(f, 3, 6);
	test.assert(f.base.has_facility('RECYCLING_TANKS'));
	test.assert(f.base.get_production() == { choice_id: '', minerals: 5, last_processed_turn: 3 });
	f.with_write(() => { f.base.restore_production(receipt.previous, receipt.added_facility); });
	f.set_turn(2); test.assert(f.snapshot() == before, 'Native rollback retains the loaded-price project exactly');
});

behavior.scenario('actual unit completion charges thirty-three minerals and one real citizen', () => {
	const f = fixture(2, 11); f.add_worker(0); f.add_worker(1); select(f, 'COLONY_POD');
	const before = f.inspect(); process(f, 2, 32);
	test.assert(f.base.get_size() == 2 && f.inspect().unit_ids == before.unit_ids);
	process(f, 3, 6); assert_pod(f, before.next_unit_id);
	test.assert(f.base.get_size() == 1 && #sizeof(f.inspect().unit_ids) == #sizeof(before.unit_ids) + 1);
	test.assert(f.base.get_production() == { choice_id: '', minerals: 5, last_processed_turn: 3 });
});

behavior.scenario('loaded prices preserve the existing basic-item switch witness and preview purity', () => {
	const f = fixture(2, 11); f.add_worker(0); f.add_worker(1);
	select(f, 'RECYCLING_TANKS'); process(f, 2, 12);
	const before = f.snapshot(); const inspect = f.inspect();
	test.assert(f.base.get_production_switch_loss('COLONY_POD') == 1);
	test.assert(f.snapshot() == before && f.inspect() == inspect);
	select(f, 'COLONY_POD');
	test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: 11, last_processed_turn: 2 });
	test.assert(f.base.get_size() == 2 && f.inspect().unit_ids == inspect.unit_ids && !f.base.has_facility('RECYCLING_TANKS'));
	process(f, 3, 22); assert_pod(f, inspect.next_unit_id);
	test.assert(f.base.get_production().minerals == 0 && f.base.get_size() == 1);
});

behavior.scenario('authoritative receiving rules change the completion threshold of an existing project', () => {
	const source = fixture(2, 11); const f = fixture(2, 10);
	select(f, 'RECYCLING_TANKS'); process(f, 2, 35);
	const before = f.snapshot(); const read = f.game.get_settings().global.rules.get_mineral_cost_factor;
	f.restore_rules_settings(source.rules_settings_snapshot('current'));
	test.assert(read() == 11 && choice(f, 'RECYCLING_TANKS').cost == 44 && f.snapshot() == before);
	process(f, 3, 8);
	test.assert(!f.base.has_facility('RECYCLING_TANKS') && f.base.get_production().minerals == 43);
	source.game.get_settings().global.rules.set_mineral_cost_factor(8);
	f.restore_rules_settings(source.rules_settings_snapshot('current'));
	test.assert(read() == 8 && choice(f, 'RECYCLING_TANKS').cost == 32);
	process(f, 4, 0);
	test.assert(f.base.has_facility('RECYCLING_TANKS') && f.base.get_production().minerals == 11);
});

behavior.scenario('unknown imported unmodeled and undeclared prices retain explicit fallbacks', () => {
	const f = fixture(2, 11);
	f.game.get_settings().global.map.preset_level = (0 - 1);
	test.assert(choice(f, 'RECYCLING_TANKS').cost == 32 && choice(f, 'COLONY_POD').cost == 30);
	f.game.get_settings().global.map.preset_level = 2;
	f.game.get_settings().global.map.type = 'mapfile';
	test.assert(choice(f, 'RECYCLING_TANKS').cost == 32 && choice(f, 'COLONY_POD').cost == 30);
	const other = fixture(2, 11); other.set_owner_role('none');
	test.assert(choice(other, 'RECYCLING_TANKS').cost == 32 && choice(other, 'COLONY_POD').cost == 30);
	const plain = fixture(2, 11);
	plain.with_write(() => {
		define(plain, 'NO_ROWS', 27, 0);
		plain.owner.add_production_choice('NO_ROWS', { type: 'facility', id: 'NO_ROWS' });
	});
	test.assert(choice(plain, 'NO_ROWS').cost == 27);
});

behavior.scenario('actual factor one hundred accepts its safe multiplication boundary and rejects overflow', () => {
	const f = fixture(2, 100);
	// GSE's literal parser and WASM std::stol are limited to 32 bits. Build
	// the exact signed-64-bit row boundary from accepted integer chunks.
	const safe_rows = (922337203 * 100000000) + 68547758;
	f.with_write(() => {
		define(f, 'LARGE_ROWS', 32, safe_rows);
		f.owner.add_production_choice('LARGE_ROWS', { type: 'facility', id: 'LARGE_ROWS' });
	});
	test.assert(#to_string(choice(f, 'LARGE_ROWS').cost) == '9223372036854775800');
	// This accepted row declaration fits the old rule-ten range. Raising the
	// actual factor must reject multiplication rather than wrap or fall back.
	f.game.get_settings().global.rules.set_mineral_cost_factor(10);
	f.with_write(() => {
		f.game.bm.undefine_facility('LARGE_ROWS');
		define(f, 'LARGE_ROWS', 32, safe_rows + 1);
	});
	select(f, 'LARGE_ROWS');
	f.game.get_settings().global.rules.set_mineral_cost_factor(100);
	const before = f.snapshot(); const inspect = f.inspect();
	rejects(() => { f.owner.get_production_choices(); });
	rejects(() => { f.base.get_production_switch_loss('LARGE_ROWS'); });
	rejects(() => { select(f, 'LARGE_ROWS'); });
	f.set_turn(2);
	rejects(() => { f.with_write(() => { f.base.process_production(2, 0); }); });
	test.assert(f.snapshot() == before && f.inspect() == inspect, 'Overflow rejection preserves production populations units RNG and queues');
});

behavior.scenario('Tiny rule one zero projects remain selectable and complete only on a processed later turn', () => {
	const f = fixture(0, 1); f.add_worker(0); f.add_worker(1);
	test.assert(choice(f, 'RECYCLING_TANKS').cost == 0 && choice(f, 'COLONY_POD').cost == 0);
	test.assert(f.base.get_production_switch_loss('RECYCLING_TANKS') == 0);
	select(f, 'RECYCLING_TANKS');
	test.assert(!f.base.has_facility('RECYCLING_TANKS') && f.base.get_production().choice_id == 'RECYCLING_TANKS');
	const selected = f.snapshot();
	rejects(() => { f.with_write(() => { f.base.process_production(1, 7); }); });
	test.assert(f.snapshot() == selected);
	process(f, 2, 7);
	test.assert(f.base.has_facility('RECYCLING_TANKS') && f.base.get_production().minerals == 7 && f.base.get_production().choice_id == '');
	const before = f.inspect(); select(f, 'COLONY_POD');
	test.assert(f.inspect().unit_ids == before.unit_ids && f.base.get_size() == 2);
	process(f, 3, 0); assert_pod(f, before.next_unit_id);
	test.assert(f.base.get_size() == 1 && f.base.get_production() == { choice_id: '', minerals: 7, last_processed_turn: 3 });
});

behavior.scenario('zero unit price still holds at size one and retains all credit through its real population charge', () => {
	const f = fixture(0, 1); f.add_worker(0); select(f, 'COLONY_POD');
	const before = f.inspect(); process(f, 2, 5);
	test.assert(f.base.get_size() == 1 && f.inspect().unit_ids == before.unit_ids);
	test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: 5, last_processed_turn: 2 });
	f.add_worker(1); process(f, 3, 0); assert_pod(f, before.next_unit_id);
	test.assert(f.base.get_size() == 1 && f.base.get_production() == { choice_id: '', minerals: 5, last_processed_turn: 3 });
});

behavior.scenario('valid zero declared prices preserve active switching loss and accumulated overflow', () => {
	const f = fixture(2, 11); f.add_worker(0); f.add_worker(1);
	select(f, 'RECYCLING_TANKS'); process(f, 2, 12);
	f.game.get_settings().global.map.preset_level = 0;
	f.game.get_settings().global.rules.set_mineral_cost_factor(1);
	const before = f.snapshot();
	test.assert(f.base.get_production_switch_loss('COLONY_POD') == 1 && f.snapshot() == before);
	select(f, 'COLONY_POD');
	test.assert(f.base.get_production() == { choice_id: 'COLONY_POD', minerals: 11, last_processed_turn: 2 });
	const id = f.inspect().next_unit_id; process(f, 3, 0); assert_pod(f, id);
	test.assert(f.base.get_production().minerals == 11 && f.base.get_size() == 1 && !f.base.has_facility('RECYCLING_TANKS'));
});

behavior.scenario('zero explicit fallback without a supported row price remains unavailable', () => {
	const f = fixture(0, 1);
	f.with_write(() => {
		define(f, 'NO_PRICE', 0, 0);
		define(f, 'ZERO_FALLBACK_ROWS', 0, 4);
		f.owner.add_production_choice('NO_PRICE', { type: 'facility', id: 'NO_PRICE' });
		f.owner.add_production_choice('ZERO_FALLBACK_ROWS', { type: 'facility', id: 'ZERO_FALLBACK_ROWS' });
	});
	test.assert(choice(f, 'NO_PRICE') == null);
	test.assert(choice(f, 'ZERO_FALLBACK_ROWS') != null && choice(f, 'ZERO_FALLBACK_ROWS').cost == 0);
	const before = f.snapshot();
	rejects(() => { f.base.get_production_switch_loss('NO_PRICE'); });
	rejects(() => { select(f, 'NO_PRICE'); });
	test.assert(f.snapshot() == before);
	f.game.get_settings().global.map.preset_level = (0 - 1);
	test.assert(choice(f, 'ZERO_FALLBACK_ROWS') == null);
	rejects(() => { select(f, 'ZERO_FALLBACK_ROWS'); });
	test.assert(f.snapshot() == before);
});
