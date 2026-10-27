// Native application prerequisites for the recorded first-base Scout/Former inventory.
// Synthetic unit recipes/terrain, not original construction or combat evidence.
const behavior = #include('./_behavior');
const fixture = () => {
	const f = test.founding_fixture(); f.add_worker(0);
	f.with_write(() => {
		f.owner.add_production_choice('SCOUT', {type: 'unit', id: 'Scout', cost: 10, cost_rows: 1, population_cost: 0});
		f.owner.add_production_choice('COLONY_POD', {type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1});
	});
	return f;
};
const choose = (f, id) => { f.with_write(() => { f.base.select_production(id); }); };
const process = (f, turn, minerals) => {
	f.set_turn(turn); let result = null;
	f.with_write(() => { result = f.base.process_production(turn, minerals); });
	return result;
};
const rejected = (callback) => {
	let caught = false; try { callback(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'Expected guarded land-unit production rejection');
};

behavior.scenario('a size-one base constructs a defined land unit without charging a citizen', () => {
	const f = fixture(); const pops = f.base.get_pops(); const citizen = pops[0];
	choose(f, 'SCOUT'); const before = f.inspect();
	process(f, 2, 9);
	test.assert(f.inspect().unit_ids == before.unit_ids && f.base.get_production().minerals == 9);
	const receipt = process(f, 3, 4); const unit = f.game.um.get_unit(before.next_unit_id);
	test.assert(unit.get_def().id == 'Scout' && unit.owner == f.owner.id && unit.get_tile() == f.base.get_tile());
	test.assert(unit.health == 1.0 && unit.movement == 1.0 && !unit.moved_this_turn);
	const current = f.base.get_pops();
	test.assert(f.base.get_size() == 1 && current[0] == citizen);
	test.assert(f.base.get_production() == {choice_id: '', minerals: 3, last_processed_turn: 3});
	test.assert(#typeof(receipt.unit_receipt) == 'Int');
});

behavior.scenario('zero-population-charge completion and rollback preserve worker links and native state', () => {
	const f = fixture(); const pops = f.base.get_pops(); const citizen = pops[0]; const tile = f.tile_at(2, 0);
	f.with_write(() => { citizen.set('worked_tile', tile); tile.set('working_pop', citizen); f.base.add_worked_tile(tile); });
	choose(f, 'SCOUT'); const before = f.snapshot(); const ids = f.inspect();
	const receipt = process(f, 2, 12);
	test.assert(tile.get('working_pop') == citizen && citizen.get('worked_tile') == tile && f.base.is_tile_worked(tile));
	f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); });
	test.assert(f.snapshot() == before && f.inspect().next_unit_id == ids.next_unit_id);
	test.assert(tile.get('working_pop') == citizen && f.base.is_tile_worked(tile));
	rejected(() => { f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); }); });
});

behavior.scenario('a rejected zero-charge spawn restores every native mutation and allocation', () => {
	const f = fixture(); choose(f, 'SCOUT');
	f.game.um.on('unit_spawn', (e) => { f.game.random.get_int(0, 99); throw SpawnError('Reject new land unit'); });
	const before = f.snapshot(); const ids = f.inspect(); f.set_turn(2);
	rejected(() => { f.with_write(() => { f.base.process_production(2, 14); }); });
	test.assert(f.snapshot() == before && f.inspect() == ids);
});

behavior.scenario('reselecting a zero-charge unit can construct repeatedly from one citizen', () => {
	const f = fixture(); const before = f.inspect();
	choose(f, 'SCOUT'); process(f, 2, 10); choose(f, 'SCOUT'); process(f, 3, 10);
	test.assert(f.base.get_size() == 1 && #sizeof(f.inspect().unit_ids) == #sizeof(before.unit_ids) + 2);
	test.assert(f.base.get_production().choice_id == '' && f.base.get_production().minerals == 0);
});

behavior.scenario('ordinary land-unit recipes survive actual native player/base/unit codecs', () => {
	const f = fixture(); choose(f, 'SCOUT'); process(f, 2, 7);
	const result = f.unit_recipe_codec_probe();
	test.assert(result.copied && result.independent && result.roundtrip && result.receiving_parent && result.receiving_units);
	test.assert(result.source_unchanged && result.receiver_unchanged && result.missing_definition_rejected);
});

behavior.scenario('switching from a partially built land unit to a pod retains basic unit credit', () => {
	const f = fixture(); choose(f, 'SCOUT'); process(f, 2, 7);
	test.assert(f.base.get_production_switch_loss('COLONY_POD') == 0);
	choose(f, 'COLONY_POD');
	test.assert(f.base.get_production().choice_id == 'COLONY_POD' && f.base.get_production().minerals == 7);
});

const define = (f, id, movement) => {
	f.with_write(() => {
		f.game.um.define_unit(id, {
			name: id, morale: 'SYNTHETIC', type: 'static', movement_type: movement, movement_per_turn: 1,
			render: {type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0},
		});
	});
};

behavior.scenario('a separately defined Former recipe constructs its actual native definition', () => {
	const f = fixture(); define(f, 'Formers', 'land');
	f.with_write(() => { f.owner.add_production_choice('FORMERS', {type: 'unit', id: 'Formers', cost: 20, cost_rows: 2, population_cost: 0}); });
	choose(f, 'FORMERS'); const id = f.inspect().next_unit_id;
	process(f, 2, 23); const unit = f.game.um.get_unit(id);
	test.assert(unit.get_def().id == 'Formers' && unit.owner == f.owner.id && unit.get_tile() == f.base.get_tile());
	test.assert(f.base.get_size() == 1 && f.base.get_production().minerals == 3);
});

for (movement of ['water', 'air', 'immovable']) {
	behavior.scenario('non-land construction remains rejected before registration: ' + movement, () => {
		const f = fixture(); define(f, 'OTHER', movement);
		const before = f.snapshot(); const choices = f.owner.get_production_choices();
		rejected(() => { f.with_write(() => {
			f.owner.add_production_choice('OTHER', {type: 'unit', id: 'OTHER', cost: 10, cost_rows: 1, population_cost: 0});
		}); });
		test.assert(f.snapshot() == before && f.owner.get_production_choices() == choices);
	});
}

// Temporary application recipe/launch invariants, not original disabled-template
// availability, naval construction or camera evidence.
const sea_worker = (profile) => {
	const f = fixture(); f.configure('flat_arid_world');
	f.with_write(() => {
		f.game.um.define_unit('SeaFormers', {name: 'Foil Formers', morale: 'SYNTHETIC', type: 'static',
			movement_type: 'water', movement_per_turn: 4, can_terraform: true,
			combat: {kind: 'civilian', offense: 0, defense: 1, reactor: 1},
			render: {type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0}});
		f.owner.add_production_choice('SEA_FORMERS', {type: 'unit', id: 'SeaFormers', cost: 40, cost_rows: 4, population_cost: 0});
	});
	if (#is_defined(profile)) { f.configure(profile); }
	return f;
};

behavior.scenario('source-capable naval worker completes at a real adjacent water launch and rolls back atomically', () => {
	const f = sea_worker('sea_worker_coast'); choose(f, 'SEA_FORMERS');
	const before = f.snapshot(); const state = f.inspect(); const terrain = f.terrain_snapshot();
	let observed_home = 0; f.game.um.on('unit_spawn', (e) => { observed_home = e.unit.get_terraform_home(); });
	const receipt = process(f, 2, 43); const unit = f.game.um.get_unit(state.next_unit_id);
	test.assert(unit.get_def().can_terraform && unit.is_water && unit.movement == 4.0);
	test.assert(unit.get_terraform_home() == f.base.id && observed_home == f.base.id, 'The originating owned base is present before the production spawn notification');
	test.assert(f.unit_order_codec_probe(unit.id).roundtrip, 'Produced home survives the actual receiving unit codec');
	test.assert(unit.owner == f.owner.id && unit.get_tile().is_water && unit.get_tile() == f.base.get_tile().get_W());
	test.assert(f.base.get_size() == 1, 'Naval worker must not consume a citizen');
	test.assert(f.base.get_production().minerals == 3, 'Actual naval project: ' + #to_string(f.base.get_production()));
	test.assert(f.terrain_snapshot() == terrain, 'Naval launch must not rewrite terrain');
	f.with_write(() => { f.base.rollback_unit_production(receipt.unit_receipt); });
	test.assert(f.snapshot() == before && f.inspect().next_unit_id == state.next_unit_id && f.terrain_snapshot() == terrain);
});

behavior.scenario('inland and locked-coast cities cannot select a naval worker or lose project credit', () => {
	for (profile of [null, 'sea_worker_coast_locked']) {
		const f = profile == null ? sea_worker() : sea_worker(profile);
		const before = f.snapshot(); const state = f.inspect();
		rejected(() => { choose(f, 'SEA_FORMERS'); });
		test.assert(f.snapshot() == before && f.inspect() == state);
	}
});

behavior.scenario('naval spawn listener failure preserves the actual launch graph project RNG IDs and queues', () => {
	const f = sea_worker('sea_worker_coast'); choose(f, 'SEA_FORMERS');
	f.game.um.on('unit_spawn', (e) => { f.game.random.get_int(0,99); throw SpawnError('Reject naval worker'); });
	f.set_turn(2); const before = f.snapshot(); const state = f.inspect(); const terrain = f.terrain_snapshot();
	rejected(() => { f.with_write(() => { f.base.process_production(2,43); }); });
	test.assert(f.snapshot() == before && f.inspect() == state && f.terrain_snapshot() == terrain);
});
