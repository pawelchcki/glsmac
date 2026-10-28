// Functional approximation checks; no additional original-agreement counts.
const behavior = #include('./_behavior'); const fixture = #include('./_terraform_height_fixture');
const command = #include('../default/game/event/unit_terraform'); const height = #include('../default/game/terraforming_height');
const rejected = (f,event) => {
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); const state = f.owner.get_energy_state(); const queues = f.inspect();
	test.assert(#is_defined(command.validate(event))); let denied = false;
	try { f.with_write(() => { command.apply(event); }); } catch { : (error) => { denied = true; } }
	test.assert(denied && f.snapshot() == before && f.terrain_snapshot() == terrain && f.owner.get_energy_state() == state && f.inspect() == queues);
};
for (input of [{water:false,elevation:212,action:'raise',destination:1500,fee:4},
	{water:false,elevation:1362,action:'lower',destination:500,fee:9},
	{water:true,elevation:(0-1500),action:'raise',destination:(0-500),fee:1},
	{water:true,elevation:(0-500),action:'lower',destination:(0-1500),fee:1}]) {
	behavior.scenario('real paid work completes ' + input.action + ' on ' + (input.water ? 'sea' : 'land') + ' with deterministic canonical slope and atomic undo', () => {
		const f = fixture(input.water,input.elevation,1,100); const before = f.snapshot(); const terrain = f.terrain_snapshot(); const treasury = f.owner.get_energy_state();
		const initial_epoch = f.game.get_tm().get_terrain_state(2,2).terrain_epoch;
		const quote = f.height_quote(input.action); test.assert(quote.supported && quote.fee == input.fee && quote.policy == height.policy && quote.fee_policy == height.fee_policy && quote.mode == 'functional_approximation');
		const result = f.height_command(input.action); const actual = f.game.get_tm().get_terrain_state(2,2);
		test.assert(actual.elevation.center == input.destination && actual.canonical.active && actual.is_water == input.water);
		test.assert(f.owner.get_energy_state().credits == treasury.credits - input.fee && f.former.movement == 0.0 && f.former.moved_this_turn && f.former.get_order() == 'NO_ORDERS');
		test.assert(f.former.get_terraforming().action == '' && actual.terrain_epoch > initial_epoch);
		f.with_write(() => { command.rollback(result); });
		test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain && f.owner.get_energy_state() == treasury);
	});
}
behavior.scenario('quote draft and unconfirmed cancellation are pure and never draw native RNG', () => {
	const f = fixture(false,212,1,100); const before = f.snapshot(); const terrain = f.terrain_snapshot(); const queues = f.inspect(); const treasury = f.owner.get_energy_state();
	const a = f.height_quote('raise'); const b = f.height_quote('raise');
	test.assert(a == b && a.supported && f.snapshot() == before && f.terrain_snapshot() == terrain && f.inspect() == queues && f.owner.get_energy_state() == treasury);
	const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,action:'raise',confirmed_height:false,height_quote:a}}; e.game = f.game; rejected(f,e);
});
behavior.scenario('unaffordable and stale payment consent cannot debit or partially terraform', () => {
	const unfunded = fixture(false,212,1,0); const before = unfunded.snapshot(); const quote = unfunded.height_quote('raise');
	test.assert(!quote.supported && unfunded.snapshot() == before && unfunded.owner.get_energy_state().credits == 0);
	const f = fixture(false,212,1,100); const prior = f.height_quote('raise');
	f.with_write(() => { f.owner.change_energy(1,100,f.game.get_turn()); });
	const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,action:'raise',confirmed_height:true,height_quote:prior}}; e.game = f.game; rejected(f,e);
});
behavior.scenario('one committed debit survives work turn pause actual receiving world and resumed completion', () => {
	const f = fixture(false,212,3,100); f.height_command('raise');
	test.assert(f.owner.get_energy_state().credits == 96 && f.former.get_terraforming().height.fee == 4 && f.former.get_terraforming().work_units == 2);
	const old = f.former; const source = f.game.get_tm().get_terrain_state(2,2);
	f.command('cancel_work'); test.assert(f.owner.get_energy_state().credits == 96 && #is_defined(f.former.get_terraforming().height));
	f.receive(); let retired = false; try { old.get_terraforming(); } catch { : (error) => { retired = true; } } test.assert(retired);
	test.assert(f.game.get_tm().get_terrain_state(2,2) == source && f.owner.get_energy_state().credits == 96);
	f.advance(); const resumed = f.height_quote('raise'); test.assert(resumed.supported && resumed.resuming && resumed.fee == 0);
	f.height_command('raise'); f.advance();
	test.assert(f.owner.get_energy_state().credits == 96 && f.former.get_terraforming().action == '' && f.game.get_tm().get_terrain_state(2,2).elevation.center == 1500);
});
behavior.scenario('replacing a paused height job abandons its payment and cannot reuse it for a later different job', () => {
	const f = fixture(false,212,3,100); f.height_command('raise'); f.command('cancel_work'); f.advance(); f.command('solar');
	test.assert(!#is_defined(f.former.get_terraforming().height) && f.owner.get_energy_state().credits == 96);
	f.advance(); const later = f.height_quote('lower'); test.assert(!later.supported, 'Land self-submergence remains forbidden');
	const new_raise = f.height_quote('raise'); test.assert(new_raise.supported && !new_raise.resuming && new_raise.fee == 4);
});
behavior.scenario('shelf uplift keeps its real sea worker controllable and recovery survives receiving world then clears on reversal', () => {
	const f = fixture(true,(0-500),1,100); f.height_command('raise');
	test.assert(f.former.get_tile().is_land && f.former.is_water && f.former.get_terraforming_recovery() == {active:true,x:2,y:2});
	f.receive(); test.assert(f.former.get_terraforming_recovery() == {active:true,x:2,y:2});
	f.advance(); f.height_command('lower');
	test.assert(f.former.get_tile().is_water && f.former.get_terraforming_recovery() == {active:false,x:0,y:0} && f.owner.get_energy_state().credits == 95);
});
behavior.scenario('a stale treasury receipt prevents height undo before any terrain work or recovery restoration', () => {
	const f = fixture(false,212,1,100); const event = f.height_command('raise'); f.with_write(() => { f.owner.change_energy(0,96,f.game.get_turn()); });
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); const treasury = f.owner.get_energy_state(); let denied = false;
	try { f.with_write(() => { command.rollback(event); }); } catch { : (error) => { denied = true; } }
	test.assert(denied && f.snapshot() == before && f.terrain_snapshot() == terrain && f.owner.get_energy_state() == treasury);
});

behavior.scenario('same physical target values after a real terrain ABA still invalidate pending fee consent', () => {
	const f = fixture(false,212,1,100); const prior = f.height_quote('raise'); const tm = f.game.get_tm(); const state = tm.get_terrain_state(2,2);
	f.with_write(() => {
		tm.apply_terrain([{x:2,y:2,moisture:state.moisture == 1 ? 2 : 1}],[]);
		tm.apply_terrain([{x:2,y:2,moisture:state.moisture}],[]);
	});
	test.assert(tm.get_terrain_state(2,2).moisture == state.moisture && tm.get_terrain_state(2,2).terrain_epoch > state.terrain_epoch);
	const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,action:'raise',confirmed_height:true,height_quote:prior}}; e.game = f.game; rejected(f,e);
});
behavior.scenario('height domain bounds and unrelated coastal occupants reject before any debit or terrain mutation', () => {
	for (input of [{water:false,elevation:3500,action:'raise'},{water:true,elevation:(0-3500),action:'lower'},{water:false,elevation:212,action:'lower'}]) {
		const f = fixture(input.water,input.elevation,1,100); const before = f.snapshot(); const terrain = f.terrain_snapshot(); const queues = f.inspect();
		test.assert(!f.height_quote(input.action).supported && f.snapshot() == before && f.terrain_snapshot() == terrain && f.inspect() == queues && f.owner.get_energy_state().credits == 100);
	}
	const f = fixture(true,(0-500),1,100);
	f.with_write(() => { const data = {def:'ScoutPatrol',health:1.0,morale:2}; data.owner = f.game.get_player(); data.tile = f.game.tm.get_tile(0,2); f.game.um.spawn_unit(data); });
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); const quote = f.height_quote('lower');
	test.assert(!quote.supported && f.snapshot() == before && f.terrain_snapshot() == terrain && f.owner.get_energy_state().credits == 100);
});
behavior.scenario('a coastal base class is protected even from an otherwise valid Sea Former lowering operation', () => {
	const f = fixture(true,(0-500),1,100);
	f.with_write(() => {
		f.game.um.despawn_unit(f.former.id); f.game.get_tm().apply_terrain([{x:2,y:0,canonical:{elevation:(0-500),is_water:true}}],[]);
		const data = {def:'AUTHORED_SEA_WORKER',health:1.0,morale:2}; data.owner = f.owner; data.tile = f.game.tm.get_tile(2,0); f.former = f.game.um.spawn_unit(data);
	});
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); const quote = f.height_quote('lower');
	test.assert(!quote.supported && f.snapshot() == before && f.terrain_snapshot() == terrain && f.base.get_tile().is_land && f.owner.get_energy_state().credits == 100);
});
behavior.scenario('actual source TERRAFORM metadata applies explicit provisional odd-credit upward rounding', () => {
	const f = fixture(false,1362,1,100); f.apply_faction_economy({starting_energy:0,terraform_cost_halved:true});
	const quote = f.height_quote('raise'); test.assert(quote.supported && quote.base_fee == 9 && quote.fee == 5);
	f.height_command('raise'); test.assert(f.owner.get_energy_state().credits == 95);
});

behavior.scenario('real pre-height V4 map and pending UnitWork bytes load on a receiving world without fabricated new metadata', () => {
	const f = fixture(false,212,1,100); const input = #include('./_legacy_height_wire'); const old = f.former;
	f.former = f.receive_legacy_height_world(input.map_hex,input.unit_hex);
	const rules = #include('../default/game/terraforming_rules').parse(test.parse_smac_text(#include('./_terraform_action_source'),'rules'));
	f.game.set('terraforming_rules',rules); #include('../default/units/turns').configure(f.game); #include('../default/game/terraforming').configure(f.game);
	const state = f.game.get_tm().get_terrain_state(2,2); const work = f.former.get_terraforming();
	test.assert(state.elevation.center == 1362 && state.canonical.active && state.terraforming.sensor && state.terraforming_owners.sensor == f.owner.id);
	test.assert(state.terrain_epoch == 0, 'Documented legacy epoch migration is not an observed original field');
	test.assert(work.action == 'farm' && work.work_units == 2 && work.required_work == 8 && !#is_defined(work.height));
	let retired = false; try { old.get_terraforming(); } catch { : (error) => { retired = true; } } test.assert(retired);
	f.advance(); f.advance(); f.advance();
	test.assert(f.former.get_terraforming().action == '' && f.game.get_tm().get_terrain_state(2,2).terraforming.farm && f.owner.get_energy_state().credits == 100);
});
behavior.scenario('receiving a physical world retires the old height event receipt even when logical entity IDs are retained', () => {
	const f = fixture(false,212,1,100); const applied = f.height_command('raise').applied; const id = f.former.id + 0; f.receive();
	const event = {data:{unit_id:id},applied:applied}; event.game = f.game;
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); const credits = f.owner.get_energy_state().credits; let denied = false;
	try { f.with_write(() => { command.rollback(event); }); } catch { : (error) => { denied = true; } }
	test.assert(denied && f.snapshot() == before && f.terrain_snapshot() == terrain && f.owner.get_energy_state().credits == credits);
});
behavior.scenario('damaged partial-budget worker pays once and cannot earn a second height credit by cancelling and resuming', () => {
	const f = fixture(false,212,3,100); f.with_write(() => { f.former.health = 0.5; f.former.movement = 1.0 / 3.0; });
	// Authoring through a wrapper replaces its Ptr getter with the supplied scalar.
	// Observe later authoritative commands through a fresh manager wrapper.
	f.former = f.game.get_um().get_unit(f.former.id);
	const quoted = f.height_quote('raise'); test.assert(quoted.supported && quoted.fee == 4);
	f.height_command('raise'); test.assert(f.former.get_terraforming().work_units == 2 && f.former.movement == 0.0 && f.former.health == 0.5, 'First fractional credit: ' + #json_text_exact({work_units:f.former.get_terraforming().work_units,movement:f.former.movement + 0.0,health:f.former.health + 0.0}));
	for (let repeat = 0; repeat < 3; repeat++) {
		f.command('cancel_work'); const resume = f.height_quote('raise'); test.assert(resume.supported && resume.resuming && resume.fee == 0, 'Repeated paused quote ' + #to_string(repeat) + ': ' + #json_text_exact({supported:resume.supported,reason:resume.reason}));
		f.height_command('raise'); test.assert(f.former.get_terraforming().work_units == 2 && f.owner.get_energy_state().credits == 96 && f.former.movement == 0.0, 'Repeated resumed work ' + #to_string(repeat) + ': ' + #json_text_exact({work_units:f.former.get_terraforming().work_units,credits:f.owner.get_energy_state().credits,movement:f.former.movement + 0.0}));
	}
});
const coworker = (f) => {
	let unit = null; f.with_write(() => { const data = {def:'Formers',health:1.0,morale:2}; data.owner = f.owner; data.tile = f.former.get_tile(); unit = f.game.um.spawn_unit(data); }); return unit;
};
behavior.scenario('cooperative paid orders contribute independently and LIFO undo restores every participant before refund', () => {
	const f = fixture(false,212,3,100); const first = f.former; const second = coworker(f); const initial = f.snapshot(); const terrain = f.terrain_snapshot();
	const a = f.height_command('raise'); test.assert(first.get_terraforming().work_units == 2 && f.owner.get_energy_state().credits == 96);
	f.former = second; const before_b = f.snapshot(); const b = f.height_command('raise');
	test.assert(first.get_terraforming().work_units == 4 && second.get_terraforming().work_units == 4 && f.owner.get_energy_state().credits == 92);
	f.with_write(() => { command.rollback(b); }); test.assert(f.snapshot() == before_b && f.owner.get_energy_state().credits == 96);
	f.with_write(() => { command.rollback(a); }); test.assert(f.snapshot() == initial && f.terrain_snapshot() == terrain && f.owner.get_energy_state().credits == 100);
});
behavior.scenario('first cooperative completion changes height once and stops remaining workers without another debit', () => {
	const f = fixture(false,212,3,100); const first = f.former; const second = coworker(f);
	f.height_command('raise'); f.former = second; f.height_command('raise'); f.advance();
	const committed = f.game.get_tm().get_terrain_state(2,2);
	test.assert(committed.elevation.center == 1500 && first.get_terraforming().action == '' && second.get_terraforming().action == '' && f.owner.get_energy_state().credits == 92);
	test.assert(first.movement + second.movement >= 1.0, 'A worker not needed for the final credit remains available');
	f.advance(); test.assert(f.game.get_tm().get_terrain_state(2,2) == committed && f.owner.get_energy_state().credits == 92);
});
behavior.scenario('a later cooperative participant mutation rejects undo before any participant treasury or terrain restoration', () => {
	const f = fixture(false,212,3,100); const first = f.former; const second = coworker(f); f.height_command('raise'); f.former = second; const b = f.height_command('raise');
	f.with_write(() => { first.movement = 0.5; }); const before = f.snapshot(); const terrain = f.terrain_snapshot(); let denied = false;
	try { f.with_write(() => { command.rollback(b); }); } catch { : (error) => { denied = true; } }
	test.assert(denied && f.snapshot() == before && f.terrain_snapshot() == terrain && f.owner.get_energy_state().credits == 92);
});
behavior.scenario('an arriving paid sea coworker joins shelf uplift and both initiating workers recover safely across receive', () => {
	const f = fixture(true,(0-500),3,100); const first_id = f.former.id + 0; f.height_command('raise'); let arriving = null;
	f.with_write(() => { const data = {def:'AUTHORED_SEA_WORKER',health:1.0,morale:2}; data.owner = f.owner; data.tile = f.former.get_tile(); arriving = f.game.um.spawn_unit(data); });
	f.former = arriving; const quote = f.height_quote('raise'); test.assert(quote.supported && quote.fee == 1 && !quote.resuming);
	f.height_command('raise'); f.advance();
	test.assert(f.owner.get_energy_state().credits == 98 && f.former.get_tile().is_land);
	test.assert(f.former.get_terraforming_recovery().active && f.game.um.get_unit(first_id).get_terraforming_recovery().active);
	f.receive(); test.assert(f.former.get_terraforming_recovery().active && f.game.um.get_unit(first_id).get_terraforming_recovery().active);
});
