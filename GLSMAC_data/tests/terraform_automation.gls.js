// Functional application contracts, separate from original automation parity.
const behavior = #include('./_behavior');
const fixture = #include('./_terraform_automation_fixture');
const command = #include('../default/game/event/unit_terraform_plan');
const step = #include('../default/game/event/unit_terraform_plan_step');
for (item of [{id:'farm_solar_road',improvement:'solar'},{id:'farm_mine_road',improvement:'mine'}]) {
 behavior.scenario('shipped ' + item.id + ' completes all three effects through successive authoritative work ticks',() => {
  const f = fixture('arid'); const location = f.former.get_tile(); const energy = f.owner.get_energy_state();
  f.begin(item.id); f.complete_plan(12);
  const flags = f.game.get_tm().get_terraforming(location.x,location.y);
  test.assert(flags.farm && flags[item.improvement] && flags.road);
  test.assert(f.former.get_tile() == location && f.former.get_order() == 'NO_ORDERS' && f.former.get_automation().epoch == 2);
  test.assert(f.owner.get_energy_state().credits == energy.credits,'Unpriced chained improvements never fabricate charges');
 });
}
for (id of ['road_to','tube_to']) {
 behavior.scenario('shipped ' + id + ' builds the actor tile and actual routed destination before completing',() => {
  const f = fixture('arid'); const base_tile = f.base.get_tile(); f.begin(id,base_tile.x + 0,base_tile.y + 0); f.complete_plan(20);
  const start = f.game.get_tm().get_terraforming(2,2);
  test.assert(start.road && f.former.get_tile() == base_tile,'The owned city is the endpoint, without inventing a terrain flag on its base tile');
  if (id == 'tube_to') { test.assert(start.mag_tube); }
  test.assert(f.former.get_automation().command == '' && !f.former.get_terraforming().active);
 });
}
for (entry of [{id:'auto_roads',flag:'road'},{id:'auto_tubes',flag:'mag_tube'},{id:'auto_sensors',flag:'sensor'}]) {
 behavior.scenario('shipped ' + entry.id + ' executes and exhausts its reachable eligible native map',() => {
  const f = fixture('arid'); f.begin(entry.id); f.complete_plan(80);
  let improved = 0;
  for (let y = 0; y < f.game.get_tm().get_map_height(); y++) {
   for (let x = y % 2; x < f.game.get_tm().get_map_width(); x += 2) {
    const flags = f.game.get_tm().get_terraforming(x,y); if (flags[entry.flag]) { improved++; }
   }
  }
  test.assert(improved > 1 && f.observed.steps > 1 && f.former.get_automation().command == '');
 });
}
behavior.scenario('shipped automatic fungus removal moves to actual fungus, clears it and completes',() => {
 const f = fixture('fungus'); f.begin('auto_remove_fungus'); f.complete_plan(20);
 test.assert(!f.game.get_tm().get_terrain_state(0,2).features.xenofungus);
 test.assert(f.former.get_tile().x == 0 && f.former.get_tile().y == 2 && !f.former.get_terraforming().active);
});
for (id of ['auto_home_base','auto_former']) {
 behavior.scenario('shipped ' + id + ' performs real improvements and terminates without inventing original priorities',() => {
  const f = fixture('arid'); const base = f.base;
  f.begin(id); f.complete_plan(100);
  let farms = 0;
  for (let y = 0; y < f.game.get_tm().get_map_height(); y++) {
   for (let x = y % 2; x < f.game.get_tm().get_map_width(); x += 2) {
    if (f.game.get_tm().get_terraforming(x,y).farm) { farms++; }
   }
  }
  test.assert(farms > 0 && f.former.get_automation().command == '');
  if (id == 'auto_home_base') { test.assert(f.former.get_terraform_home() == base.id,'Initial fallback is explicitly assigned once and persists after plan completion'); }
 });
}
behavior.scenario('queued work is fenced by cancellation, stale cursor, turn, owner and native lifetime',() => {
 const f = fixture('arid'); const start = f.begin('farm_mine_road'); const current = f.former.get_automation();
 const old = {caller:0,data:{unit_id:f.former.id + 0,expected_epoch:current.epoch,expected_cursor:current.cursor,turn_id:f.game.get_turn() + 0}}; old.game = f.game;
 f.begin('cancel'); const before = f.snapshot();
 test.assert(#is_defined(step.validate(old)) && f.snapshot() == before);
 // The already queued stale host event is deliberately rejected, not applied.
 f.process_events(); test.assert(!f.game.get_tm().get_terraforming(2,2).farm && f.former.get_automation().command == '');
 old.caller = f.owner.id; test.assert(#is_defined(step.validate(old)));
 const data = {caller:99,data:{unit_id:f.former.id + 0,command:'auto_roads',expected_epoch:f.former.get_automation().epoch}}; data.game = f.game;
 test.assert(#is_defined(command.validate(data)) && f.snapshot() == before);
});
behavior.scenario('routing selection never fakes an absent, wrong-parity, foreign, or unreachable destination',() => {
 const f = fixture('arid'); const event = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,command:'road_to',expected_epoch:0}}; event.game = f.game;
 const before = f.snapshot();
 test.assert(!#is_defined(#include('../default/game/terraforming_automation').validate_selection(event)),'Read-only menu availability needs no fabricated destination');
 test.assert(#is_defined(command.validate(event)));
 for (target of [[99,2],[0,1],[(0 - 1),2]]) {
  event.data.target_x = target[0]; event.data.target_y = target[1]; test.assert(#is_defined(command.validate(event)));
 }
 test.assert(f.snapshot() == before);
});
behavior.scenario('a failed routed partial-MP step restores the previous plan cursor and complete native graph',() => {
 const f = fixture('arid'); const tile = f.former.get_tile();
 f.with_write(() => {
  const flags = f.game.get_tm().get_terraforming(tile.x,tile.y); flags.road = true;
  f.game.get_tm().apply_terrain([{x:tile.x + 0,y:tile.y + 0,terraforming:flags}],[]);
  f.former.movement = 0.000001;
 });
 const destination = f.base.get_tile(); f.begin('road_to',destination.x + 0,destination.y + 0);
 const plan = f.former.get_automation();
 const e = {caller:0,data:{unit_id:f.former.id + 0,expected_epoch:plan.epoch,expected_cursor:plan.cursor,turn_id:f.game.get_turn() + 0}}; e.game = f.game;
 test.assert(!#is_defined(step.validate(e)));
 f.with_write(() => { e.resolved = step.resolve(e); });
 test.assert(e.resolved.kind == 'move' && !e.resolved.movement_successful);
 const before = f.snapshot();
 f.with_write(() => { e.applied = step.apply(e); });
 // The intent resolves a fresh canonical wrapper. The earlier wrapper has
 // its authored movement setter cached, so observe native movement anew.
 f.former = f.game.get_um().get_unit(f.former.id);
 test.assert(f.former.get_automation().cursor == plan.cursor + 1 && f.former.movement == 0.0);
 f.with_write(() => { step.rollback(e); });
 test.assert(f.snapshot() == before && f.former.get_automation() == plan && !f.former.get_tile().is_locked());
});
