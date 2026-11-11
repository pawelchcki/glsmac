// Functional application checks from installed identities, complete named flags
// and documented player rules. Not original recorded-comparison pass counts.
const behavior = #include('./_behavior'); const fixture = #include('./_terraform_primitives_fixture');
const command = #include('../default/game/event/unit_terraform');
for (water of [false,true]) {
	for (action of ['farm','soil_enricher','mine','solar','forest','road','mag_tube','bunker','airbase','sensor','remove_fungus','plant_fungus','level','condenser','mirror','borehole','aquifer']) {
		if (!water || action == 'farm' || action == 'mine' || action == 'solar' || action == 'remove_fungus' || action == 'plant_fungus') {
			behavior.scenario('technology-free actual work completes ' + action + ' on ' + (water ? 'sea' : 'land') + ' and native receipt restores it', () => {
				const f = fixture(action,water); const tm = f.game.get_tm();
				const before = f.snapshot(); const terrain = f.terrain_snapshot(); const energy = f.owner.get_energy_state();
				const expected = tm.get_terrain_state(2,2);
				if (action == 'level') { expected.rockiness = 2; }
				else if (action == 'remove_fungus') { expected.features.xenofungus = false; expected.features_raw = expected.features_raw - 4; }
				else if (action == 'plant_fungus') { expected.features.xenofungus = true; expected.features_raw = expected.features_raw + 4; }
				else if (action == 'aquifer') { expected.features.river = true; }
				else { expected.terraforming[action] = true; }
				if (action == 'condenser') { expected.moisture = #min(3,expected.moisture + 1); }
				const result = f.command(action); const actual = tm.get_terrain_state(2,2);
				if (action != 'level' && action != 'remove_fungus' && action != 'plant_fungus' && action != 'aquifer') {
					test.assert(actual.terraforming[action]);
					if (#is_defined(actual.terraforming_owners)) { test.assert(actual.terraforming_owners[action] == f.owner.id); }
				}
				else { test.assert(actual.rockiness == expected.rockiness && actual.features == expected.features); }
				test.assert(actual.elevation == expected.elevation && actual.is_water == expected.is_water && actual.moisture == expected.moisture && actual.bonus == expected.bonus);
				test.assert(f.former.get_order() == 'NO_ORDERS' && f.former.get_terraforming().work_units == 0 && f.former.movement == 0.0 && f.former.moved_this_turn);
				test.assert(f.owner.get_energy_state() == energy, 'Tech waiver never creates a resource fee or alters research');
				f.with_write(() => { command.rollback(result); });
				test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
			});
		}
	}
}
behavior.scenario('source-disabled sea rows and editor-only Monolith remain unavailable under the technology waiver', () => {
	for (action of ['soil_enricher','forest','road','mag_tube','bunker','airbase','sensor','level','monolith']) {
		const f = fixture(action,true); const before = f.snapshot(); const terrain = f.terrain_snapshot(); let rejected = false;
		try { f.command(action); } catch { : (error) => { rejected = true; } }
		test.assert(rejected && f.snapshot() == before && f.terrain_snapshot() == terrain);
	}
});
behavior.scenario('sea resource improvement rejects deep water before any work or movement debit', () => {
	const f = fixture('farm',true); f.with_write(() => { f.game.get_tm().apply_terrain([{x:2,y:2,canonical:{elevation:(0-1500),is_water:true}}],[]); });
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); let rejected = false;
	try { f.command('farm'); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && f.snapshot() == before && f.terrain_snapshot() == terrain && f.former.movement == 4.0);
});

behavior.scenario('Mine and Solar coexist with independent infrastructure in both construction directions and preserve native owners and undo', () => {
	const f = fixture('mine',false); const tm = f.game.get_tm();
	for (resource of ['mine','solar']) {
		for (infrastructure of ['sensor','bunker','airbase']) {
			for (reverse of [false,true]) {
				const existing = reverse ? resource : infrastructure;
				const action = reverse ? infrastructure : resource;
				const setup = tm.get_terrain_state(2,2); let setup_receipt = 0;
				for (name in setup.terraforming) { setup.terraforming[name] = false; setup.terraforming_owners[name] = (0-1); }
				setup.terraforming[existing] = true; setup.terraforming_owners[existing] = 0;
				f.with_write(() => { setup_receipt = tm.apply_terrain([{x:2,y:2,terraforming:setup.terraforming,terraforming_owners:setup.terraforming_owners}],[]); });
				const before = f.snapshot(); const terrain = f.terrain_snapshot();
				const expected = tm.get_terrain_state(2,2);
				expected.terraforming[action] = true; expected.terraforming_owners[action] = f.owner.id + 0;
				const receipt = f.command(action); const actual = tm.get_terrain_state(2,2);
				#print('TERRAFORM_COEXISTENCE|' + #json_text_exact({existing:existing,action:action,before:setup.terraforming_owners,after:actual.terraforming_owners,flags:actual.terraforming}));
				test.assert(actual.terraforming == expected.terraforming && actual.terraforming_owners == expected.terraforming_owners,
					'Constructing ' + action + ' must preserve independent ' + existing + ' and its recorded owner');
				test.assert(f.former.get_order() == 'NO_ORDERS' && !f.former.get_terraforming().active && f.former.movement == 0.0);
				f.with_write(() => { command.rollback(receipt); });
				test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain,'True event undo must restore work, movement and every native tile/owner');
				f.with_write(() => { tm.rollback_terrain(setup_receipt); });
			}
		}
	}
});

behavior.scenario('Forest Fungus and Borehole retain documented destruction of infrastructure while preserving roads and tubes', () => {
	const f = fixture('mine',false); const tm = f.game.get_tm();
	for (action of ['forest','plant_fungus','borehole']) {
		const setup = tm.get_terrain_state(2,2); let setup_receipt = 0;
		for (name in setup.terraforming) { setup.terraforming[name] = false; setup.terraforming_owners[name] = (0-1); }
		for (name of ['sensor','bunker','airbase','farm','soil_enricher','road','mag_tube']) { setup.terraforming[name] = true; setup.terraforming_owners[name] = 0; }
		f.with_write(() => { setup_receipt = tm.apply_terrain([{x:2,y:2,terraforming:setup.terraforming,terraforming_owners:setup.terraforming_owners}],[]); });
		const before = f.snapshot(); const terrain = f.terrain_snapshot(); const receipt = f.command(action);
		const actual = tm.get_terrain_state(2,2);
		for (name of ['sensor','bunker','airbase','farm','soil_enricher']) { test.assert(!actual.terraforming[name] && actual.terraforming_owners[name] == (0-1)); }
		for (name of ['road','mag_tube']) { test.assert(actual.terraforming[name] && actual.terraforming_owners[name] == 0); }
		test.assert(action == 'plant_fungus' ? actual.features.xenofungus : actual.terraforming[action]);
		f.with_write(() => { command.rollback(receipt); });
		test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
		f.with_write(() => { tm.rollback_terrain(setup_receipt); });
	}
});

const observe_world = #include('./_terrain_movement_observation');
const two_owner_fixture = () => {
	const f = fixture('road',false); const host = f.game.get_player();
	f.with_write(() => {
		const data = {def:'Formers',health:1.0,morale:2}; data.owner = host; data.tile = f.game.tm.get_tile(0,2);
		f.foreign_worker = f.game.um.spawn_unit(data);
	});
	return f;
};
const request = (f,unit,caller,action) => {
	const e = {caller:caller,data:{unit_id:unit.id + 0,action:action,replace_existing:true}}; e.game = f.game;
	return e;
};
const perform = (f,e) => {
	const reason = command.validate(e); test.assert(!#is_defined(reason), #is_defined(reason) ? reason : 'Accepted native work');
	f.with_write(() => { e.applied = command.apply(e); });
	return e;
};

behavior.scenario('independent completed work and non-LIFO undo isolate both native owners and tiles', () => {
	const f = two_owner_fixture(); const before = observe_world(f); const tm = f.game.tm;
	test.assert(#sizeof(before.players) == 2 && #sizeof(before.units) == 2 && f.owner.id == 1 && f.foreign_worker.owner == 0);
	const own_road = perform(f,request(f,f.former,f.owner.id,'road'));
	const first = observe_world(f); const first_tile = tm.get_terrain_state(2,2);
	test.assert(first.units[1] == before.units[1] && first.players == before.players, 'The foreign worker and both player states stay unchanged');
	const foreign_farm = perform(f,request(f,f.foreign_worker,0,'farm'));
	const both = observe_world(f); const foreign_tile = tm.get_terrain_state(0,2);
	test.assert(tm.get_terrain_state(2,2) == first_tile && both.units[0] == first.units[0] && both.players == before.players);
	test.assert(first_tile.terraforming.road && first_tile.terraforming_owners.road == 1);
	test.assert(foreign_tile.terraforming.farm && foreign_tile.terraforming_owners.farm == 0);
	f.with_write(() => { command.rollback(own_road); });
	const restored_own = observe_world(f);
	test.assert(restored_own.units[0] == before.units[0] && restored_own.units[1] == both.units[1]);
	test.assert(tm.get_terrain_state(0,2) == foreign_tile && restored_own.players == before.players, 'Undo of the earlier independent receipt preserves the later foreign completion');
	f.with_write(() => { command.rollback(foreign_farm); });
	test.assert(observe_world(f) == before, 'Both undos restore every observed unit, player and terrain field');
});

for (action of ['farm','mine','road']) {
	behavior.scenario('foreign ' + action + ' requests preserve both native owners and every terrain field', () => {
		const f = two_owner_fixture(); const before = observe_world(f); const queues = f.inspect();
		const e = request(f,f.foreign_worker,f.owner.id,action);
		test.assert(#is_defined(command.validate(e)));
		let failed = false; try { f.with_write(() => { command.apply(e); }); } catch { : (error) => { failed = true; } }
		test.assert(failed && observe_world(f) == before && f.inspect() == queues);
		const own = request(f,f.foreign_worker,0,action);
		test.assert(!#is_defined(command.validate(own)) && observe_world(f) == before, 'The same live unit and action remain available to its actual owner');
	});
}

for (change of ['improvement','construction-owner']) {
	behavior.scenario('completed work undo rejects later ' + change + ' state before restoring any actor or terrain', () => {
		const f = two_owner_fixture(); const before = observe_world(f); const tm = f.game.tm;
		const receipt = perform(f,request(f,f.former,f.owner.id,'road'));
		const tile = tm.get_terrain_state(2,2); const patch = {x:2,y:2};
		if (change == 'improvement') { tile.terraforming.sensor = true; patch.terraforming = tile.terraforming; }
		else { tile.terraforming_owners.road = 0; patch.terraforming_owners = tile.terraforming_owners; }
		let later = 0; f.with_write(() => { later = tm.apply_terrain([patch],[]); });
		const retained = observe_world(f); const queues = f.inspect(); let failed = false;
		try { f.with_write(() => { command.rollback(receipt); }); } catch { : (error) => { failed = true; } }
		test.assert(failed && observe_world(f) == retained && f.inspect() == queues, 'A stale work receipt cannot partially restore movement or terrain');
		f.with_write(() => { tm.rollback_terrain(later); command.rollback(receipt); });
		test.assert(observe_world(f) == before, 'Undo of the later native patch makes the original completed receipt valid again');
	});
}
