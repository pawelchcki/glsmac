// Actual native order/plan/work transactions. Application invariants, not
// original automation observations; complete controlled two-player worlds.
const behavior = #include('./_behavior');
const automation_fixture = #include('./_terraform_automation_fixture');
const height_fixture = #include('./_terraform_height_fixture');
const targets = [{event:'unit_activate',order:'NO_ORDERS'},{event:'unit_hold',order:'HOLD'},{event:'unit_sentry',order:'SENTRY'}];
const event = (f,name) => { const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0}}; e.game = f.game; return e; };
const apply = (f,name) => {
 const handler = #include('../default/game/event/' + name); const e = event(f,name);
 const reason = handler.validate(e); if (#is_defined(reason)) { throw Error(reason); }
 f.with_write(() => { e.applied = handler.apply(e); }); return e;
};
const reject_undo = (f,name,e) => {
 const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const credits = f.owner.get_energy_state(); let rejected = false;
 try { f.with_write(() => { #include('../default/game/event/' + name).rollback(e); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && f.snapshot() == graph && f.terrain_snapshot() == terrain && f.owner.get_energy_state() == credits,'Every stale check precedes native restoration');
};
for (target of targets) {
 behavior.scenario(target.event + ' cancels a real queued automation intent and stale work cannot restart it',() => {
  const f = automation_fixture('arid'); f.begin('farm_mine_road'); const old = f.former.get_automation();
  const terrain = f.terrain_snapshot(); const credits = f.owner.get_energy_state(); apply(f,target.event);
  const live = f.game.um.get_unit(f.former.id);
  test.assert(live.get_order() == target.order && live.get_automation().command == '' && live.get_automation().epoch == old.epoch + 1);
  test.assert(live.movement == 1.0 && !live.moved_this_turn && f.owner.get_energy_state() == credits && f.terrain_snapshot() == terrain);
  const graph = f.snapshot(); f.process_events();
  test.assert(f.snapshot() == graph && !f.game.has_pending_actions(f.owner.id),'The retired old step does not construct or move');
 });
 behavior.scenario(target.event + ' true undo restores native intent and lets its original queued operation execute once',() => {
  const f = automation_fixture('arid'); f.begin('farm_mine_road'); const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const credits = f.owner.get_energy_state();
  const e = apply(f,target.event); f.with_write(() => { #include('../default/game/event/' + target.event).rollback(e); });
  test.assert(f.snapshot() == graph && f.terrain_snapshot() == terrain && f.owner.get_energy_state() == credits);
  f.drain(); const live = f.game.um.get_unit(f.former.id);
  test.assert(f.game.get_tm().get_terraforming(2,2).farm && live.movement == 0.0 && live.get_automation().last_turn == f.game.get_turn());
 });
 behavior.scenario(target.event + ' pauses paid height work without a refund and true undo restores the complete payment identity',() => {
  const f = height_fixture(false,212,3,100); f.height_command('raise'); const graph = f.snapshot(); const terrain = f.terrain_snapshot();
  const work = f.former.get_terraforming(); const e = apply(f,target.event); const live = f.game.um.get_unit(f.former.id);
  test.assert(live.get_order() == target.order && !live.get_terraforming().active && live.get_terraforming().height == work.height);
  test.assert(live.movement == 0.0 && live.get_terraforming().work_units == 2 && f.owner.get_energy_state().credits == 96 && f.terrain_snapshot() == terrain);
  f.with_write(() => { #include('../default/game/event/' + target.event).rollback(e); });
  test.assert(f.snapshot() == graph && f.terrain_snapshot() == terrain && f.owner.get_energy_state().credits == 96);
 });
}
behavior.scenario('ordinary activation cancels a real in-progress plan even with zero remaining movement and undo restores all progress',() => {
 const f = automation_fixture('arid'); const rules = f.game.get('terraforming_rules'); rules.farm.turns = 3;
 f.begin('farm_mine_road'); f.drain();
 test.assert(f.former.get_order() == 'TERRAFORM' && f.former.get_terraforming().work_units == 2 && f.former.movement == 0.0);
 const graph = f.snapshot(); const e = apply(f,'unit_activate');
 test.assert(f.former.get_order() == 'NO_ORDERS' && f.former.get_automation().command == '' && f.former.get_terraforming().work_units == 2 && f.former.movement == 0.0);
 f.with_write(() => { #include('../default/game/event/unit_activate').rollback(e); }); test.assert(f.snapshot() == graph);
});
behavior.scenario('a later canonical movement change refuses ordinary undo before touching plan work recovery or treasury',() => {
 const f = automation_fixture('arid'); f.begin('auto_roads'); const e = apply(f,'unit_sentry');
 f.with_write(() => { const live = f.game.um.get_unit(f.former.id); live.movement = 0.5; }); reject_undo(f,'unit_sentry',e);
});
behavior.scenario('a real intervening plan start and cancellation invalidate an old activation receipt even after ordinary order ABA',() => {
 const f = automation_fixture('arid'); f.begin('auto_roads'); const e = apply(f,'unit_activate');
 f.begin('auto_tubes'); f.begin('cancel');
 test.assert(f.former.get_order() == 'NO_ORDERS' && f.former.movement == 1.0);
 reject_undo(f,'unit_activate',e);
});
behavior.scenario('a completed actual turn fences an ordinary receipt even if movement and order return to their prior values',() => {
 const f = automation_fixture('arid'); f.begin('auto_roads'); const e = apply(f,'unit_hold'); f.advance(); reject_undo(f,'unit_hold',e);
});
behavior.scenario('ordinary commands cannot cancel an automation plan during its real locked movement',() => {
 const f = automation_fixture('arid'); const base = f.base.get_tile(); f.begin('road_to',base.x + 0,base.y + 0); f.drain(); f.advance(); f.process_events();
 test.assert(f.former.get_tile().is_locked()); const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const plan = f.former.get_automation();
 for (target of targets) {
  const e = event(f,target.event); const handler = #include('../default/game/event/' + target.event); let rejected = false;
  test.assert(#is_defined(handler.validate(e))); try { f.with_write(() => { handler.apply(e); }); } catch { : (error) => { rejected = true; } }
  test.assert(rejected && f.snapshot() == graph && f.terrain_snapshot() == terrain && f.former.get_automation() == plan);
 }
 f.finish_unit_move(f.former.id);
});
const primitive = #include('../default/game/event/unit_terraform');
const ledgers = (f) => { const all = []; for (player of f.game.get_players()) { all :+ {owner:player.id + 0,state:player.get_energy_state()}; } return all; };
const manual = (f,action,quote) => {
 const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,action:action,replace_existing:true}}; e.game = f.game;
 if (#is_defined(quote)) { e.data.confirmed_height = true; e.data.height_quote = quote; } return e;
};
const plan_host = (f) => {
 f.game.register_event('unit_terraform_plan_step',#include('../default/game/event/unit_terraform_plan_step'));
 return (name) => {
  const handler = #include('../default/game/event/unit_terraform_plan');
  const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,command:name,expected_epoch:f.former.get_automation().epoch}}; e.game = f.game;
  const reason = handler.validate(e); if (#is_defined(reason)) { throw Error(reason); }
  f.with_write(() => { e.applied = handler.apply(e); }); return e;
 };
};
const reject_primitive = (f,e) => {
 const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const money = ledgers(f); let rejected = false;
 test.assert(#is_defined(primitive.validate(e))); try { f.with_write(() => { primitive.apply(e); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money,'Rejected manual consent cannot cancel a plan or charge a player');
};
behavior.scenario('manual primitive replaces actual automation only at commit and true undo restores its original queued intent',() => {
 const f = automation_fixture('arid'); f.begin('auto_roads'); const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const money = ledgers(f);
 const e = manual(f,'farm'); test.assert(!#is_defined(primitive.validate(e)) && f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money);
 f.with_write(() => { e.applied = primitive.apply(e); });
 test.assert(f.former.get_automation().command == '' && f.former.get_order() == 'NO_ORDERS' && f.game.get_tm().get_terraforming(2,2).farm);
 test.assert(f.former.movement == 0.0 && ledgers(f) == money);
 f.with_write(() => { primitive.rollback(e); }); test.assert(f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money);
 f.drain(); test.assert(f.game.get_tm().get_terraforming(2,2).road && !f.game.get_tm().get_terraforming(2,2).farm);
});
behavior.scenario('unconfirmed height quote preserves the live automation intent all terrain and every player treasury',() => {
 const f = height_fixture(false,212,1,100); const start = plan_host(f); start('auto_roads');
 const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const money = ledgers(f); const quote = f.height_quote('raise');
 test.assert(quote.supported && quote.fee == 4 && f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money);
 const e = manual(f,'raise',quote); e.data.confirmed_height = false; reject_primitive(f,e);
});
behavior.scenario('a real changed plan epoch invalidates old height consent before intent cancellation or payment',() => {
 const f = height_fixture(false,212,1,100); const start = plan_host(f); start('auto_roads'); const quote = f.height_quote('raise');
 start('auto_tubes'); reject_primitive(f,manual(f,'raise',quote));
});
behavior.scenario('height consent seals the actual live owned home assignment as well as the plan epoch',() => {
 const f = height_fixture(false,212,1,100); const start = plan_host(f); start('auto_roads'); const quote = f.height_quote('raise');
 f.with_write(() => { f.former.set_terraform_home(f.base.id); }); reject_primitive(f,manual(f,'raise',quote));
});
behavior.scenario('accepted manual height replaces an actual plan with one finite debit and true undo restores its complete native prestate',() => {
 const f = height_fixture(false,212,1,100); const start = plan_host(f); start('auto_roads'); const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const money = ledgers(f);
 const e = manual(f,'raise',f.height_quote('raise')); test.assert(!#is_defined(primitive.validate(e)));
 f.with_write(() => { e.applied = primitive.apply(e); });
 test.assert(f.former.get_automation().command == '' && f.owner.get_energy_state().credits == 96 && f.game.get_tm().get_terrain_state(2,2).elevation.center == 1500);
 f.with_write(() => { primitive.rollback(e); }); test.assert(f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money);
});
behavior.scenario('accepted distinct automation abandons old paid height before its first step while true event undo restores that paid job',() => {
 const f = height_fixture(false,1362,3,100); f.height_command('lower'); f.command('cancel_work'); f.advance(); const start = plan_host(f);
 const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const old_work = f.former.get_terraforming();
 const accepted = start('auto_roads');
 test.assert(!#is_defined(f.former.get_terraforming().height) && f.owner.get_energy_state().credits == 91 && f.terrain_snapshot() == terrain);
 const quote = f.height_quote('lower'); test.assert(quote.supported && !quote.resuming && quote.fee == 9);
 const e = manual(f,'lower',quote); f.with_write(() => { e.applied = primitive.apply(e); });
 test.assert(f.owner.get_energy_state().credits == 82 && f.former.get_terraforming().work_units == 2);
 f.with_write(() => { primitive.rollback(e); #include('../default/game/event/unit_terraform_plan').rollback(accepted); });
 test.assert(f.snapshot() == graph && f.former.get_terraforming() == old_work && f.owner.get_energy_state().credits == 91 && f.terrain_snapshot() == terrain);
 const restored = f.height_quote('lower'); test.assert(restored.supported && restored.resuming && restored.fee == 0);
});
// Inject only a failure at the terrain mutation boundary. All reads, native
// validators, units, owner ledgers and rollback operations stay authoritative.
const failing_terrain = (f,observed) => {
 const native = f.game.get_tm(); const terrain = {
  get_terrain_state:native.get_terrain_state,get_terraforming:native.get_terraforming,get_tile:native.get_tile,
  validate_terrain:native.validate_terrain,validate_terrain_rollback:native.validate_terrain_rollback,rollback_terrain:native.rollback_terrain,
  apply_terrain:(patches,workers) => {
   observed.called = true; observed.plan = f.former.get_automation(); observed.work = f.former.get_terraforming(); observed.credits = f.owner.get_energy_state().credits;
   throw Error('Injected terrain boundary failure');
  }
 };
 return {get_tm:() => { return terrain; },get_um:f.game.get_um,get_bm:f.game.get_bm,get_turn:f.game.get_turn,
  get_players:f.game.get_players,get_settings:f.game.get_settings,get:f.game.get,is_started:f.game.is_started,is_turn_complete:f.game.is_turn_complete,is_master:f.game.is_master};
};
behavior.scenario('injected terrain failure after accepted plan cancellation and debit restores the original native plan before returning failure',() => {
 const f = height_fixture(false,212,1,100); const start = plan_host(f); start('auto_roads'); const original = f.former.get_automation();
 const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const money = ledgers(f); const e = manual(f,'raise',f.height_quote('raise')); const seen = {called:false}; e.game = failing_terrain(f,seen);
 test.assert(!#is_defined(primitive.validate(e))); let rejected = false;
 try { f.with_write(() => { primitive.apply(e); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && seen.called && seen.plan.command == '' && seen.plan.epoch == original.epoch + 1 && seen.credits == 96 && seen.work.height.fee == 4,'The actual injected boundary is after intent retirement and finite debit');
 test.assert(f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money && f.former.get_automation() == original);
});
behavior.scenario('injected replacement failure restores an older committed paid height identity without refunding that earlier job',() => {
 const f = height_fixture(false,1362,3,100); f.height_command('lower'); f.command('cancel_work'); f.advance(); const rules = f.game.get('terraforming_rules'); rules.raise.turns = 1;
 const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const money = ledgers(f); const paid = f.former.get_terraforming(); const e = manual(f,'raise',f.height_quote('raise')); const seen = {called:false}; e.game = failing_terrain(f,seen);
 test.assert(!#is_defined(primitive.validate(e))); let rejected = false;
 try { f.with_write(() => { primitive.apply(e); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && seen.called && seen.credits == 82 && seen.work.action == 'raise' && seen.work.height.fee == 9);
 test.assert(f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money && f.former.get_terraforming() == paid && f.owner.get_energy_state().credits == 91);
});
behavior.scenario('draft and rejected automation selection preserve the existing paid height job and every native ledger',() => {
 const f = height_fixture(false,1362,3,100); f.height_command('lower'); f.command('cancel_work'); f.advance();
 const handler = #include('../default/game/event/unit_terraform_plan');
 const e = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,command:'road_to',expected_epoch:f.former.get_automation().epoch}}; e.game = f.game;
 const graph = f.snapshot(); const terrain = f.terrain_snapshot(); const money = ledgers(f);
 test.assert(!#is_defined(#include('../default/game/terraforming_automation').validate_selection(e)) && #is_defined(handler.validate(e)),'Target selection is pure and missing target cannot commit');
 let rejected = false; try { f.with_write(() => { handler.apply(e); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && f.snapshot() == graph && f.terrain_snapshot() == terrain && ledgers(f) == money);
 const quote = f.height_quote('lower'); test.assert(quote.supported && quote.resuming && quote.fee == 0);
});
