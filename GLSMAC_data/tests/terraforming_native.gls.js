// Native tile mutation prerequisites. No original work policy is simulated.
const behavior = #include('./_behavior');
const empty = () => { return {road: false, farm: false, mine: false, forest: false}; };
const fields = (object) => { let count = 0; for (key in object) { count++; } return count; };
const fixture = () => { const f = test.founding_fixture(); f.enable_economy(); return f; };
const reject = (f, action) => {
	const terrain = f.terrain_snapshot(); const before = f.snapshot(); const inspected = f.inspect();
	let rejected = false;
	try { action(); } catch { : (e) => { rejected = true; } }
	test.assert(rejected && f.terrain_snapshot() == terrain && f.snapshot() == before && f.inspect() == inspected);
};

const physical_world = (tm) => {
	const tiles = [];
	for (let y = 0; y < tm.get_map_height(); y++) {
		for (let x = y % 2; x < tm.get_map_width(); x += 2) { tiles :+ tm.get_terrain_state(x,y); }
	}
	return tiles;
};
const assert_reversed_commits = (tm,before) => {
	const after = physical_world(tm); let found = false;
	for (let index = 0; index < #sizeof(after); index++) {
		const tile = after[index];
		if (tile.x == 2 && tile.y == 2) {
			found = true;
			test.assert(tile.terrain_epoch == before[index].terrain_epoch + 2,'Both direct commits advance the persistent ABA identity');
			tile.terrain_epoch = before[index].terrain_epoch;
		}
	}
	test.assert(found && after == before,'Every physical field on every native tile is restored; only the edited identity advances');
};

behavior.scenario('complete native terrain reads expose detached raw state without mutating a world', () => {
	const f = fixture(); f.configure('arid'); const tm = f.game.get_tm();
	const before = f.terrain_snapshot(); const native = f.snapshot(); const queues = f.inspect();
	const state = tm.get_terrain_state(2, 2);
	test.assert(state.version == 1 && state.x == 2 && state.y == 2 && state.width == 4 && state.height == 4);
	test.assert(state.elevation == {center: 64, left: 64, top: 64, right: 64, bottom: 64});
	test.assert(state.is_land && !state.is_water && state.moisture == 1 && state.rockiness == 1);
	test.assert(fields(state.features) == 15 && fields(state.terraforming) == 13);
	test.assert(state.terraforming == tm.get_terraforming(2, 2) && state.terraforming_raw == 0);
	test.assert(state.imported == {active: false, source_elevation: null, source_water: null, source_corners: null});
	test.assert(state.neighbors.W == {x: 0, y: 2} && state.neighbors.E == {x: 0, y: 2});
	test.assert(tm.get_terrain_state(0, 0).neighbors.N == {x: 0, y: 0}, 'Native polar self-link is observed rather than guessed as vertical wrap');
	const detached = tm.get_terrain_state(2, 2);
	detached.elevation.center = 999; detached.features.xenofungus = true; detached.terraforming.airbase = true;
	test.assert(tm.get_terrain_state(2, 2) == state);
	test.assert(f.terrain_snapshot() == before && f.snapshot() == native && f.inspect() == queues);
});

behavior.scenario('imported terrain provenance distinguishes source center from actual shared corners', () => {
	const f = fixture(); f.configure('imported_arid'); const tm = f.game.get_tm(); const before = f.terrain_snapshot();
	const state = tm.get_terrain_state(2, 2);
	test.assert(state.elevation == {center: 2467, left: 64, top: 64, right: 64, bottom: 64});
	test.assert(state.imported == {active: true, source_elevation: 2467, source_water: false, source_corners: [64,64,64,64]});
	state.imported.source_corners[0] = 999; state.imported.source_elevation = 0;
	const again = tm.get_terrain_state(2, 2);
	test.assert(again.imported.source_elevation == 2467 && again.imported.source_corners == [64,64,64,64]);
	test.assert(f.terrain_snapshot() == before);
});

behavior.scenario('native improvement reads are detached and reversed direct commits preserve all physical terrain with advanced identity', () => {
	const f = fixture(); const tm = f.game.get_tm(); const before = f.terrain_snapshot(); const data = empty(); data.farm = true;
	const initial = tm.get_terraforming(2, 2); const world = physical_world(tm);
	f.with_write(() => { tm.set_terraforming(2, 2, data); });
	test.assert(tm.get_terraforming(2, 2).farm && !initial.farm && f.terrain_snapshot() != before);
	data.farm = false; const exported = tm.get_terraforming(2, 2); exported.farm = false;
	test.assert(tm.get_terraforming(2, 2).farm && !tm.get_terraforming(0, 2).farm);
	f.with_write(() => { tm.set_terraforming(2, 2, empty()); });
	assert_reversed_commits(tm,world); test.assert(f.terrain_snapshot() != before,'Persistent terrain identity survives serialization');
});

behavior.scenario('native bounded improvement edits preserve imported improvement flags outside the action scope', () => {
	const f = fixture(); f.configure('sensor'); const tm = f.game.get_tm(); const before = f.terrain_snapshot();
	test.assert(tm.get_terraforming(2, 2).sensor); const world = physical_world(tm);
	const flags = empty(); flags.road = true; flags.mine = true;
	f.with_write(() => { tm.set_terraforming(2, 2, flags); });
	test.assert(tm.get_terraforming(2, 2).road && tm.get_terraforming(2, 2).mine && tm.get_terraforming(2, 2).sensor);
	f.with_write(() => { tm.set_terraforming(2, 2, empty()); });
	test.assert(tm.get_terraforming(2, 2).sensor && f.terrain_snapshot() != before); assert_reversed_commits(tm,world);
});

behavior.scenario('native tile edits require the authoritative write guard', () => {
	const f = fixture(); reject(f, () => { f.game.get_tm().set_terraforming(2, 2, empty()); });
});

behavior.scenario('terrain frontend request copies own visual layers sprite deltas and metadata after the sender is destroyed', () => {
	const f = fixture(); const before = f.terrain_snapshot(); const units = f.snapshot();
	test.assert(f.terrain_patch_copy_probe());
	test.assert(f.terrain_snapshot() == before && f.snapshot() == units);
});

behavior.scenario('native tile edits reject locked tiles without publishing changes', () => {
	const f = fixture(); f.configure('locked');
	reject(f, () => { f.with_write(() => { f.game.get_tm().set_terraforming(2, 2, empty()); }); });
});

behavior.scenario('retained native tile improvement callables reject retired worlds', () => {
	const f = fixture(); const read = f.game.get_tm().get_terraforming; const write = f.game.get_tm().set_terraforming;
	const terrain_read = f.game.get_tm().get_terrain_state;
	f.reset(); f.enable_economy();
	reject(f, () => { read(2, 2); });
	reject(f, () => { terrain_read(2, 2); });
	reject(f, () => { f.with_write(() => { write(2, 2, empty()); }); });
});

let index = 0;
behavior.scenario('removed native terrain sprites leave no stale cache entry or undelivered add remove pair', () => {
	const f = fixture(); const before = f.inspect();
	test.assert(f.terrain_sprite_cache_probe() && f.inspect() == before);
});

for (fail of [false, true]) {
	behavior.scenario('artwork random scope preserves the actual native generator with failure ' + #to_string(fail), () => {
		const f = fixture(); const before = f.inspect();
		test.assert(f.terrain_random_probe(fail) && f.inspect() == before);
	});
}

for (coords of [[(0 - 1), 0], [4, 0], [0, (0 - 1)], [0, 4], [1, 0], ['2', 2]]) {
	behavior.scenario('invalid improvement coordinates cannot mutate another tile ' + #to_string(index), () => {
		const f = fixture();
		reject(f, () => { f.with_write(() => { f.game.get_tm().set_terraforming(coords[0], coords[1], empty()); }); });
		reject(f, () => { f.game.get_tm().get_terrain_state(coords[0], coords[1]); });
	}); index++;
}

let payload_index = 0;
for (data of [{}, {road: false, farm: false, mine: false}, {road: false, farm: false, mine: false, forest: 1},
	{road: false, farm: false, mine: false, forest: false, sensor: true}]) {
	behavior.scenario('malformed improvement data preserves native terrain and queues ' + #to_string(payload_index), () => {
		const f = fixture();
		reject(f, () => { f.with_write(() => { f.game.get_tm().set_terraforming(2, 2, data); }); });
	}); payload_index++;
}

behavior.scenario('explicit terraform technology policy is durable independent and defaults to the user waiver', () => {
	const f = fixture(); const rules = f.game.get_settings().global.rules;
	test.assert(rules.get_terraforming_policy() == {version: 1, ignore_technologies: true});
	const read = rules.get_terraforming_policy; const baseline = f.global_settings_snapshot('current');
	rules.set_terraforming_ignore_technologies(false);
	test.assert(read() == {version: 1, ignore_technologies: false});
	const wire = f.global_settings_snapshot('current'); test.assert(wire != baseline);
	rules.set_terraforming_ignore_technologies(true); f.restore_global_settings(wire);
	test.assert(!read().ignore_technologies);
	f.restore_global_settings(f.global_settings_snapshot('legacy_rules'));
	test.assert(read().ignore_technologies);
	const probe = f.terraforming_policy_probe();
	test.assert(probe.copy && probe.independent && probe.transfer && probe.legacy_default && probe.malformed && probe.lifetime);
	test.assert(f.state_rules_wire_probe().received);
});

// Native transaction invariants. These authored engine-unit edits do not assert
// the original game's raise/lower amount, cascade or energy formula.
behavior.scenario('atomic terrain patch supports every actual improvement and feature with exact undo', () => {
	const f = fixture(); f.configure('arid'); const tm = f.game.get_tm();
	const before = f.terrain_snapshot(); const native = f.snapshot(); const state = tm.get_terrain_state(2,2);
	const improvements = state.terraforming; const features = state.features;
	for (key in improvements) { improvements[key] = true; }
	features.xenofungus = true; features.river = true;
	let receipt = 0;
	f.with_write(() => { receipt = tm.apply_terrain([{x:2,y:2,terraforming:improvements,features:features,rockiness:3,moisture:3}], []); });
	const changed = tm.get_terrain_state(2,2);
	test.assert(changed.terraforming == improvements && changed.features.xenofungus && changed.features.river);
	test.assert(changed.moisture == 3 && changed.rockiness == 3 && f.snapshot() == native);
	f.with_write(() => { tm.rollback_terrain(receipt); });
	test.assert(f.terrain_snapshot() == before && f.snapshot() == native);
	reject(f, () => { f.with_write(() => { tm.rollback_terrain(receipt); }); });
});

behavior.scenario('shared vertex mutation refreshes all affected native centers and restores imported provenance', () => {
	const f = fixture(); f.configure('imported_arid'); const tm = f.game.get_tm(); const before = f.terrain_snapshot();
	let receipt = 0;
	f.with_write(() => { receipt = tm.apply_terrain([{x:2,y:2,elevation:{left:1064,top:1064,right:1064,bottom:1064}}], []); });
	const changed = tm.get_terrain_state(2,2);
	test.assert(changed.elevation.center == 1064 && !changed.imported.active && changed.is_land);
	const west = tm.get_terrain_state(0,2);
	test.assert(west.elevation.right == 1064 && west.elevation.center != 64, 'Actual shared corners propagate to native neighbor centers');
	f.with_write(() => { tm.rollback_terrain(receipt); });
	test.assert(f.terrain_snapshot() == before && tm.get_terrain_state(2,2).imported.active);
});

behavior.scenario('malformed patches prevalidate the whole batch before any terrain field changes', () => {
	const f = fixture(); f.configure('arid'); const tm = f.game.get_tm();
	for (bad of [{x:0,y:2,moisture:99}, {x:1,y:2,moisture:2}, {x:0,y:2,elevation:{left:99999,top:0,right:0,bottom:0}},
		{x:0,y:2,features:{xenofungus:true}}, {x:0,y:2,unexpected:true}, {x:2,y:2,moisture:3}]) {
		reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,moisture:2},bad], []); }); });
	}
	reject(f, () => { tm.apply_terrain([{x:2,y:2,moisture:2}], []); });
});

behavior.scenario('stale terrain rollback validates every changed tile before restoring any field', () => {
	const f = fixture(); const tm = f.game.get_tm(); let receipt = 0;
	f.with_write(() => { receipt = tm.apply_terrain([{x:2,y:2,moisture:2},{x:0,y:2,rockiness:3}], []); });
	f.with_write(() => { tm.apply_terrain([{x:0,y:2,moisture:3}], []); });
	reject(f, () => { f.with_write(() => { tm.rollback_terrain(receipt); }); });
});

behavior.scenario('terrain class changes cannot strand unrelated units or change a city ground class', () => {
	const f = fixture(); const tm = f.game.get_tm();
	reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,elevation:{left:(0-1000),top:(0-1000),right:(0-1000),bottom:(0-1000)}}], []); }); });
	reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:0,y:0,elevation:{left:(0-1000),top:(0-1000),right:(0-1000),bottom:(0-1000)}}], []); }); });
	reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,moisture:2}], [f.unit_id]); }); });
});

// Treasury mechanics receive authored credits. Original opening balances and
// income timing are not manufactured by this native ledger regression.
behavior.scenario('native treasury conserves credits with authoritative affordable revision-fenced debit and undo', () => {
	const f = fixture(); const player = f.owner; const before = f.snapshot();
	test.assert(player.get_energy_state() == {credits:0,last_income_turn:0,initialized:false});
	let grant = 0; let debit = 0;
	f.with_write(() => { grant = player.change_energy(25,0,f.game.get_turn()); debit = player.change_energy((0-4),25,f.game.get_turn()); });
	test.assert(player.get_energy_state().credits == 21);
	const paid = f.snapshot();
	for (change of [[(0-22),21], [1,25], [9223372036854775807,21]]) {
		let failed = false; try { f.with_write(() => { player.change_energy(change[0],change[1],f.game.get_turn()); }); } catch { : (e) => { failed = true; } }
		test.assert(failed && f.snapshot() == paid && player.get_energy_state().credits == 21);
	}
	let failed = false; try { player.change_energy(1,21,f.game.get_turn()); } catch { : (e) => { failed = true; } }
	test.assert(failed && f.snapshot() == paid);
	const codec = f.energy_codec_probe(); test.assert(codec.copy && codec.roundtrip && codec.lifetime && codec.unchanged);
	player.validate_energy_rollback(debit);
	f.with_write(() => { player.rollback_energy(debit); player.validate_energy_rollback(grant); player.rollback_energy(grant); });
	test.assert(f.snapshot() == before && player.get_energy_state().credits == 0);
});

behavior.scenario('income credits once per turn and equal-balance later transactions fence stale undo', () => {
	const f = fixture(); const player = f.owner; let income = 0; let zero = 0;
	f.with_write(() => { income = player.credit_energy_income(9,f.game.get_turn()); zero = player.change_energy(0,9,f.game.get_turn()); });
	test.assert(player.get_energy_state() == {credits:9,last_income_turn:f.game.get_turn(),initialized:false});
	const before = f.snapshot();
	for (choice of [0,1]) {
		let failed = false; try { f.with_write(() => { if (choice == 0) { player.credit_energy_income(9,f.game.get_turn()); } else { player.rollback_energy(income); } }); } catch { : (e) => { failed = true; } }
		test.assert(failed && f.snapshot() == before);
	}
	f.with_write(() => { player.rollback_energy(zero); player.rollback_energy(income); });
	test.assert(player.get_energy_state() == {credits:0,last_income_turn:0,initialized:false});
});

behavior.scenario('completed real seven-player turn collects finite native economy once without granting opening funds', () => {
	const f = test.natural_startup_fixture(16,16,'flat-arid');
	test.assert(f.game.get_settings().global.rules.get_terraforming_policy().ignore_technologies, 'Normal native default waives worker technologies');
	#include('./_natural_startup_mechanics')(f);
	f.game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
	// Authored resource inputs: each city center and its one Worker generate
	// seven energy. The existing 50% labs allocation leaves seven economy.
	f.game.on('configure', (e) => {
		f.game.get_tm().on('get_tile_resources', (tile) => { return {NUTRIENTS:2,MINERALS:1,ENERGY:7}; });
	});
	let failed = false;
	f.game.on('event_result', (e) => { if (!e.success) { failed = true; } });
	f.initialize_single_player('GAIANS','Citizen'); f.start_world();
	test.assert(!failed && #sizeof(f.game.get_players()) == 7 && #sizeof(f.game.get_bm().get_bases()) == 7);
	for (player of f.game.get_players()) { test.assert(player.get_energy_state() == {credits:0,last_income_turn:0,initialized:true}); }
	for (base of f.game.get_bm().get_bases()) { test.assert(base.get_intake().ENERGY == 14 && base.get_consumption().ENERGY == 0); }
	const before = f.audit_snapshot(); const queues = f.audit_inspect();
	let rejected = false;
	try { #include('../default/game/energy_income').plan(f.game); } catch { : (e) => { rejected = true; } }
	f.game.get_tm().validate_terrain([{x:0,y:0,rockiness:2}], []);
	test.assert(rejected && f.audit_snapshot() == before && f.audit_inspect() == queues, 'Pending turn and pure terrain preflight cannot collect or mutate the native graph');
	f.game.event('complete_turn', {}); f.process_events();
	test.assert(!failed && f.game.get_turn() == 2);
	for (player of f.game.get_players()) { test.assert(player.get_energy_state() == {credits:7,last_income_turn:1,initialized:true}); }
	f.process_events();
	for (player of f.game.get_players()) { test.assert(player.get_energy_state() == {credits:7,last_income_turn:1,initialized:true}, 'Draining the same completed phase cannot credit twice'); }
});

behavior.scenario('explicit native worker survives its own class change with retreat validation and reversible terrain', () => {
	const f = fixture(); f.configure('arid'); const tm = f.game.get_tm(); let worker = null;
	f.with_write(() => {
		f.game.get_um().despawn_unit(f.unit_id);
		f.game.get_um().define_unit('AUTHORED_ENGINE_WORKER', {name:'Engine Worker',morale:'SYNTHETIC',type:'static',movement_type:'land',movement_per_turn:1,
			can_terraform:true,combat:{kind:'civilian',offense:0,defense:1,reactor:1},
			render:{type:'sprite',file:'synthetic.pcx',x:0,y:0,w:1,h:1,cx:0,cy:0}});
		const data = {def:'AUTHORED_ENGINE_WORKER',morale:1,health:1.0}; data.owner = f.owner; data.tile = tm.get_tile(2,2);
		worker = f.game.get_um().spawn_unit(data);
	});
	const terrain = f.terrain_snapshot(); const graph = f.snapshot(); let down = 0; let reverse = 0;
	const sink = [{x:2,y:2,elevation:{left:(0-1000),top:(0-1000),right:(0-1000),bottom:(0-1000)}}];
	tm.validate_terrain(sink,[worker.id]);
	test.assert(f.terrain_snapshot() == terrain && f.snapshot() == graph, 'Preflight is pure');
	f.with_write(() => { down = tm.apply_terrain(sink,[worker.id]); });
	test.assert(worker.get_tile().is_water && worker.needs_orders() && worker.get_def().can_terraform);
	const retreat = {caller:f.owner.id}; retreat.game = f.game; retreat.data = {}; retreat.data.unit = worker; retreat.data.tile = tm.get_tile(2,0);
	test.assert(!#is_defined(#include('../default/game/event/move_unit').validate(retreat)), 'Ordinary compatible retreat remains valid after self-transition');
	f.with_write(() => { reverse = tm.apply_terrain([{x:2,y:2,elevation:{left:64,top:64,right:64,bottom:64}}],[worker.id]); });
	test.assert(worker.get_tile().is_land && worker.needs_orders());
	tm.validate_terrain_rollback(reverse);
	f.with_write(() => { tm.rollback_terrain(reverse); tm.validate_terrain_rollback(down); tm.rollback_terrain(down); });
	test.assert(f.terrain_snapshot() == terrain && f.snapshot() == graph, 'LIFO terrain undo restores the complete controlled world without moving or losing its worker');
});

behavior.scenario('named terrain edits preserve unknown raw source flags outside the supported dictionaries', () => {
	const f = fixture(); f.configure('terrain_extra_flags'); const tm = f.game.get_tm(); const before = f.terrain_snapshot();
	const state = tm.get_terrain_state(2,2); const improvements = state.terraforming; const features = state.features;
	improvements.road = true; features.xenofungus = true; let token = 0;
	f.with_write(() => { token = tm.apply_terrain([{x:2,y:2,terraforming:improvements,features:features}], []); });
	const changed = tm.get_terrain_state(2,2);
	test.assert(changed.features_raw == 32773 && changed.terraforming_raw > 32768 && changed.terraforming.sensor && changed.terraforming.road);
	f.with_write(() => { tm.rollback_terrain(token); });
	test.assert(f.terrain_snapshot() == before);
});

behavior.scenario('compound treasury preflight simulates every LIFO prestate before any credit is restored', () => {
	const f = fixture(); const player = f.owner; const turn = f.game.get_turn(); const initial = player.get_energy_state();
	let a = 0; let b = 0; let c = 0; let d = 0;
	f.with_write(() => {
		a = player.change_energy(5,0,turn); b = player.change_energy(7,5,turn);
		c = player.change_energy((0-2),12,turn); d = player.change_energy((0-3),10,turn);
	});
	test.assert(player.get_energy_state().credits == 7);
	const before = f.snapshot(); const paid = player.get_energy_state();
	for (tokens of [[c,d],[d,c,a],[d,d],[d,'invalid'],[]]) {
		let failed = false;
		try { f.with_write(() => { player.rollback_energy_sequence(tokens); }); } catch { : (e) => { failed = true; } }
		test.assert(failed && player.get_energy_state() == paid && f.snapshot() == before, 'A bad later token must not undo an earlier valid debit');
	}
	player.validate_energy_rollback_sequence([d,c,b,a]);
	test.assert(player.get_energy_state() == paid && f.snapshot() == before, 'Whole-chain preflight is pure');
	let zero = 0; f.with_write(() => { zero = player.change_energy(0,7,turn); });
	let stale = false;
	try { player.validate_energy_rollback_sequence([d,c,b,a]); } catch { : (e) => { stale = true; } }
	test.assert(stale && player.get_energy_state() == paid, 'Equal-balance ABA still fences the older compound plan');
	f.with_write(() => { player.rollback_energy_sequence([zero,d,c,b,a]); });
	test.assert(player.get_energy_state() == initial && f.snapshot() == before, 'Legitimate credits and debits unwind in one atomic native operation');
	let reused = false;
	try { player.validate_energy_rollback_sequence([d,c,b,a]); } catch { : (e) => { reused = true; } }
	test.assert(reused && player.get_energy_state() == initial);
});

behavior.scenario('canonical center edits preserve neighboring gameplay heights through later updates codecs and undo', () => {
	const f = fixture(); f.configure('imported_flat_arid_world'); const tm = f.game.get_tm();
	const before = f.terrain_snapshot(); const target = tm.get_terrain_state(2,2); const west = tm.get_terrain_state(0,2);
	let token = 0;
	f.with_write(() => { token = tm.apply_terrain([{x:2,y:2,canonical:{elevation:1362,is_water:false}}],[]); });
	const changed = tm.get_terrain_state(2,2); const neighbor = tm.get_terrain_state(0,2);
	test.assert(changed.canonical == {active:true,elevation:1362,is_water:false} && changed.elevation.center == 1362);
	test.assert(!changed.imported.active && neighbor.elevation.center == west.elevation.center && neighbor.is_water == west.is_water);
	test.assert(neighbor.elevation.right != west.elevation.right, 'Shared render geometry refreshes without a pseudo-neighbor gameplay height change');
	const codec = f.canonical_terrain_codec_probe();
	test.assert(codec.roundtrip && codec.stable && codec.malformed_rejected && codec.independent);
	f.with_write(() => { tm.rollback_terrain(token); });
	test.assert(f.terrain_snapshot() == before && tm.get_terrain_state(2,2) == target);
});

behavior.scenario('canonical terrain batches retain unrelated fields and reject mixed coordinate models atomically', () => {
	const f = fixture(); const tm = f.game.get_tm();
	reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,canonical:{elevation:700,is_water:false}},
		{x:0,y:2,elevation:{left:1,top:1,right:1,bottom:1}}],[]); }); });
	for (bad of [{elevation:99999,is_water:false},{elevation:500,is_water:1},{elevation:500,is_water:false,extra:true}]) {
		reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,canonical:bad}],[]); }); });
	}
});

behavior.scenario('new-world zero treasury initialization is stamped reversible and retryable only before startup', () => {
	const f = test.natural_startup_fixture(16,16,'flat-arid');
	#include('./_natural_startup_mechanics')(f);
	f.initialize_single_player('GAIANS','Citizen');
	const players = f.game.get_players(); const player = players[0];
	test.assert(!#is_defined(player.validate_initial_energy(0)) && player.get_energy_state() == {credits:0,last_income_turn:0,initialized:false});
	let token = 0; f.with_write(() => { token = player.initialize_energy(0); });
	test.assert(player.get_energy_state() == {credits:0,last_income_turn:0,initialized:true} && #is_defined(player.validate_initial_energy(0)));
	player.validate_energy_rollback_sequence([token]);
	f.with_write(() => { player.rollback_energy_sequence([token]); });
	test.assert(!#is_defined(player.validate_initial_energy(0)) && !player.get_energy_state().initialized);
	let reused = false; try { player.validate_energy_rollback(token); } catch { : (e) => { reused = true; } } test.assert(reused);
	f.start_world();
	for (owner of f.game.get_players()) { test.assert(owner.get_energy_state() == {credits:0,last_income_turn:0,initialized:true} && #is_defined(owner.validate_initial_energy(0))); }
	const before = f.audit_snapshot(); const inspect = f.audit_inspect();
	let failed = false; try { f.with_write(() => { player.initialize_energy(0); }); } catch { : (e) => { failed = true; } }
	test.assert(failed && f.audit_snapshot() == before && f.audit_inspect() == inspect);
});
behavior.scenario('normal seven-player opening receives source reserves plus only each actual faction ENERGY bonus', () => {
	const f = test.natural_startup_fixture(16,16,'flat-arid'); const sources = #include('./_startup_faction_sources_fixture')({});
	const lines = #split(sources.sources['morgan.txt'],'\n'); lines[2] = 'ENERGY,100'; let text = ''; for (line of lines) { text += line + '\n'; }
	sources.sources['morgan.txt'] = text; sources.reload();
	#include('./_natural_startup_mechanics')(f,sources); f.game.set('energy_rules',{starting_credits:10});
	f.initialize_single_player('GAIANS','Citizen'); f.start_world();
	let bonus_owner = 0;
	for (owner of f.game.get_players()) {
		const bonus = owner.get_faction().economy_bonuses.starting_energy;
		if (bonus == 100) { bonus_owner++; }
		test.assert(owner.get_energy_state() == {credits:10 + bonus,last_income_turn:0,initialized:true});
	}
	test.assert(bonus_owner == 1);
	const before = f.audit_snapshot(); f.process_events(); test.assert(f.audit_snapshot() == before, 'Repeated event drain cannot grant source reserves again');
});

behavior.scenario('improvement owners are explicit unknown until constructed and survive transfer receiver codec and LIFO undo', () => {
	const f = fixture(); const tm = f.game.get_tm(); const before = f.terrain_snapshot();
	const initial = tm.get_terrain_state(2,2); for (name in initial.terraforming_owners) { test.assert(initial.terraforming_owners[name] == (0-1)); }
	const flags = initial.terraforming; flags.sensor = true; flags.road = true;
	const owners = initial.terraforming_owners; owners.sensor = f.owner.id + 0; let first = 0; let transferred = 0;
	f.with_write(() => { first = tm.apply_terrain([{x:2,y:2,terraforming:flags,terraforming_owners:owners}],[]); });
	const built = tm.get_terrain_state(2,2);
	test.assert(built.terraforming_owners.sensor == f.owner.id && built.terraforming_owners.road == (0-1), 'An existing unknown road is not guessed friendly');
	const codec = f.canonical_terrain_codec_probe(); test.assert(codec.roundtrip && codec.stable && codec.malformed_rejected && codec.independent);
	owners.sensor = 0;
	f.with_write(() => { transferred = tm.apply_terrain([{x:2,y:2,terraforming_owners:owners}],[]); });
	test.assert(tm.get_terrain_state(2,2).terraforming_owners.sensor == 0);
	reject(f, () => { f.with_write(() => { tm.rollback_terrain(first); }); });
	f.with_write(() => { tm.rollback_terrain(transferred); tm.rollback_terrain(first); });
	test.assert(f.terrain_snapshot() == before);
});
behavior.scenario('malformed absent or nonlive enhancement owners reject the entire transaction before tile changes', () => {
	const f = fixture(); const tm = f.game.get_tm(); const empty = tm.get_terrain_state(2,2).terraforming_owners;
	for (invalid of [1,'owner',{}, {sensor:1}]) {
		reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,moisture:3,terraforming_owners:invalid}],[]); }); });
	}
	empty.sensor = f.owner.id + 0;
	reject(f, () => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,terraforming_owners:empty}],[]); }); });
});
behavior.scenario('portable terrain forgets builders while live world attachment validates preserved construction owners', () => {
	const f = fixture(); f.configure('sensor'); const before = f.snapshot(); const terrain = f.terrain_snapshot();
	const probe = f.construction_owner_binding_probe();
	test.assert(probe.detached_codec_preserved && probe.valid_world_preserved && probe.unknown_preserved);
	test.assert(probe.nonlive_world_rejected && probe.malformed_world_rejected);
	test.assert(probe.portable_flags_preserved_owners_unknown && probe.source_unchanged);
	test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
});
behavior.scenario('equal-state terrain ABA fences old receipts while proper LIFO undo restores the predecessor revision', () => {
	const f = fixture(); const tm = f.game.get_tm(); const initial = f.terrain_snapshot(); let a = 0; let b = 0; let c = 0;
	f.with_write(() => {
		a = tm.apply_terrain([{x:2,y:2,moisture:2}],[]);
		b = tm.apply_terrain([{x:2,y:2,moisture:3}],[]);
		c = tm.apply_terrain([{x:2,y:2,moisture:2}],[]);
	});
	reject(f, () => { f.with_write(() => { tm.rollback_terrain(a); }); });
	f.with_write(() => { tm.rollback_terrain(c); tm.rollback_terrain(b); tm.validate_terrain_rollback(a); tm.rollback_terrain(a); });
	test.assert(f.terrain_snapshot() == initial);
});

behavior.scenario('received world turn validates every restored energy stamp without changing balances or legacy funding', () => {
	const f = fixture(); const before = f.snapshot(); const terrain = f.terrain_snapshot();
	const probe = f.received_energy_turn_probe();
	test.assert(probe.past_accepted && probe.current_accepted && probe.legacy_unfunded_accepted);
	test.assert(probe.detached_future_preserved && probe.future_last_player_rejected);
	test.assert(probe.roster_and_turn_unchanged && probe.source_unchanged);
	test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
});

const wrapper_fields = (tile) => { return {water:tile.is_water == true,land:tile.is_land == true,moisture:tile.moisture + 0,rockiness:tile.rockiness + 0,elevation:tile.elevation + 0,features:#clone(tile.features),bonuses:#clone(tile.bonuses),terraforming:#clone(tile.terraforming)}; };
behavior.scenario('retained Tile handles refresh native terrain while old scalar and dictionary snapshots remain detached',() => {
 const f = fixture(); f.configure('arid'); const tm = f.game.get_tm(); const held = tm.get_tile(2,2); const second = tm.get_tile(2,2);
 const original = wrapper_fields(held); const old_moisture = held.moisture; const old_features = held.features; const old_flags = held.terraforming;
 const terrain = f.terrain_snapshot(); const flags = tm.get_terrain_state(2,2).terraforming; flags.sensor = true;
 const features = tm.get_terrain_state(2,2).features; features.river = true; let token = 0;
 f.with_write(() => { held.set('wrapper_probe',{generation:7}); token = tm.apply_terrain([{x:2,y:2,moisture:3,rockiness:2,features:features,terraforming:flags,canonical:{elevation:500,is_water:false}}],[]); });
 const current = wrapper_fields(tm.get_tile(2,2));
 test.assert(wrapper_fields(held) == current && wrapper_fields(second) == current && held == second);
 test.assert(held.get('wrapper_probe') == {generation:7} && old_moisture == original.moisture && old_features == original.features && old_flags == original.terraforming);
 // Native wrappers keep independent property dictionaries, as before.
 held.features.river = false; test.assert(second.features.river && tm.get_terrain_state(2,2).features.river);
 f.with_write(() => { tm.rollback_terrain(token); });
 test.assert(wrapper_fields(held) == original && wrapper_fields(second) == original && f.terrain_snapshot() == terrain);
 test.assert(held.get('wrapper_probe') == {generation:7} && old_features == original.features && old_flags == original.terraforming);
});
behavior.scenario('held Tile domain and shared geometry fields agree with fresh handles across atomic class change and undo',() => {
 const f = fixture(); const tm = f.game.get_tm(); const held = tm.get_tile(0,2); const neighbor = tm.get_tile(2,2);
 const original = wrapper_fields(held); const adjacent = wrapper_fields(neighbor); const terrain = f.terrain_snapshot(); let token = 0;
 f.with_write(() => { token = tm.apply_terrain([{x:0,y:2,canonical:{elevation:(0-500),is_water:true}}],[]); });
 test.assert(held.is_water && !held.is_land && held.elevation == (0-500) && wrapper_fields(held) == wrapper_fields(tm.get_tile(0,2)));
 test.assert(wrapper_fields(neighbor) == wrapper_fields(tm.get_tile(2,2)) && wrapper_fields(neighbor) == adjacent);
 f.with_write(() => { tm.rollback_terrain(token); });
 test.assert(wrapper_fields(held) == original && wrapper_fields(neighbor) == adjacent && f.terrain_snapshot() == terrain);
});
behavior.scenario('rejected terrain batches and stale undo leave every retained native Tile view unchanged',() => {
 const f = fixture(); const tm = f.game.get_tm(); const held = tm.get_tile(2,2); const other = tm.get_tile(0,2);
 const initial = wrapper_fields(held); const adjacent = wrapper_fields(other);
 reject(f,() => { f.with_write(() => { tm.apply_terrain([{x:2,y:2,moisture:3},{x:0,y:2,rockiness:99}],[]); }); });
 test.assert(wrapper_fields(held) == initial && wrapper_fields(other) == adjacent);
 let first = 0; let second = 0;
 f.with_write(() => { first = tm.apply_terrain([{x:2,y:2,moisture:2}],[]); second = tm.apply_terrain([{x:2,y:2,moisture:3}],[]); });
 const current = wrapper_fields(held); reject(f,() => { f.with_write(() => { tm.rollback_terrain(first); }); });
 test.assert(wrapper_fields(held) == current && wrapper_fields(tm.get_tile(2,2)) == current);
 f.with_write(() => { tm.rollback_terrain(second); }); test.assert(held.moisture == 2);
 f.with_write(() => { tm.rollback_terrain(first); }); test.assert(wrapper_fields(held) == initial && wrapper_fields(other) == adjacent);
});
behavior.scenario('legacy four-improvement setter refreshes retained Tile handles without replacing custom fields',() => {
 const f = fixture(); const tm = f.game.get_tm(); const held = tm.get_tile(2,2); const original = #clone(held.terraforming);
 f.with_write(() => { held.set('wrapper_probe',3); tm.set_terraforming(2,2,{road:true,farm:true,mine:false,forest:false}); });
 test.assert(held.terraforming.road && held.terraforming.farm && held.terraforming == tm.get_terraforming(2,2) && held.get('wrapper_probe') == 3);
 test.assert(!original.road && !original.farm);
});
