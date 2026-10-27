// Controlled application acceptance on a native normal-size map. These are
// authored terrain/recipe inputs, not an original-game trace or timing oracle.
const plan_event = #include('../default/game/event/unit_terraform_plan');
const observer = #include('./_state_trace_observer');
return () => {
 const f = test.natural_startup_fixture(40,80,'flat-arid'); const game = f.game;
 #include('./_natural_startup_mechanics')(f);
 f.initialize_single_player('GAIANS','Citizen'); f.start_world(); f.enable_movement();
 game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
 const rows = test.parse_smac_text(#include('./_terraform_action_source'),'rules').rows('TERRAIN');
 for (row of rows) { row[4] = '1'; }
 game.set('terraforming_rules',#include('../default/game/terraforming_rules').parse({rows:(block) => { return rows; }}));
 f.process_events();
 const tm = game.get_tm(); const owner = game.get_player();
 const read = observer.make(game,'native-basic-v1','explicit-world').read;
 f.all_players = () => {
  const result = read(); result.economy_research = []; result.rng = f.audit_inspect().rng + '';
  for (entry of result.units) {
   const unit = game.get_um().get_unit(entry.raw_id);
   entry.work = unit.get_terraforming(); entry.plan = unit.get_automation(); entry.home = unit.get_terraform_home();
   entry.recovery = unit.get_terraforming_recovery(); entry.moved_this_turn = unit.moved_this_turn == true;
  }
  for (player of game.get_players()) {
   const owned = [];
   for (let id = 0; id < 89; id++) { if (game.technologies.has_tech(id,player.id + 1)) { owned :+ id; } }
   result.economy_research :+ {owner:player.id + 0,energy:player.get_energy_state(),research:game.get_research_state(player.id),science:game.get_research_science(player.id),technologies:owned};
   let units = 0; let bases = 0;
   for (unit of result.units) { if (unit.owner == observer.player_id(player)) { units++; } }
   for (base of result.bases) { if (base.owner == observer.player_id(player)) { bases++; } }
   test.assert(units > 0 && bases > 0,'Each of seven real native owners retains units and a base');
  }
  result.projects = [];
  for (base of game.get_bm().get_bases()) { result.projects :+ {id:base.id + 0,owner:base.get_owner().id + 0,project:base.get_production()}; }
  test.assert(#sizeof(result.players) == 7 && #sizeof(result.economy_research) == 7);
  return result;
 };
 f.map_view = () => {
  const result = [];
  for (let y = 0; y < 80; y++) {
   for (let x = y % 2; x < 40; x += 2) {
    const state = tm.get_terrain_state(x,y);
    result :+ [x,y,state.elevation.center + 0,state.is_water == true,state.terraforming.road == true,state.terraforming.mag_tube == true];
   }
  }
  return #json_text_exact(result);
 };
 f.checkpoint = (name) => { const value = f.all_players(); #print('NORMAL_ROUTE_STATE|' + name + '|' + #json_text_exact(value)); return value; };
 f.unrelated = (actor_id) => {
  const value = f.all_players(); const units = [];
  for (unit of value.units) { if (unit.raw_id != actor_id) { units :+ #clone(unit); } }
  value.units = units; return #json_text_exact(value);
 };
 f.begin = (actor_id,command,x,y) => {
  const actor = game.get_um().get_unit(actor_id);
  const event = {caller:owner.id + 0,data:{unit_id:actor_id,command:command,expected_epoch:actor.get_automation().epoch}}; event.game = game;
  if (#is_defined(x)) { event.data.target_x = x; event.data.target_y = y; }
  const error = plan_event.validate(event); if (#is_defined(error)) { throw Error(error); }
  f.with_write(() => { event.applied = plan_event.apply(event); }); return event;
 };
 f.drain = (actor_id,limit) => {
  const records = []; let callbacks = 0;
  while (true) {
   f.process_events(); const actor = game.get_um().get_unit(actor_id); const tile = actor.get_tile();
   if (!tile.is_locked() && f.audit_inspect().pending_events == 0) { break; }
   test.assert(callbacks < limit,'Real queued movement settles within a finite callback bound');
   if (tile.is_locked()) {
    const before = {x:tile.x + 0,y:tile.y + 0,mp:actor.movement + 0.0};
    f.finish_unit_move(actor_id); const current = game.get_um().get_unit(actor_id); const at = current.get_tile();
    records :+ {from:before,x:at.x + 0,y:at.y + 0,mp:current.movement + 0.0,turn:game.get_turn() + 0,cursor:current.get_automation().cursor}; callbacks++;
   }
  }
  return records;
 };
 f.turn_log = {active:false,events:[]};
 game.on('event_result',(e) => {
  if (f.turn_log.active) {
   f.turn_log.events :+ {name:e.name + '',success:e.success == true,data:e.data,pending_next_batch:f.audit_inspect().pending_events};
  }
 });
 f.advance = () => {
  f.with_write(() => {
   for (player of game.get_players()) { if (!game.is_turn_complete(player.id)) { game.complete_turn(player.id); } }
   const handler = #include('../default/game/event/advance_turn'); const event = {caller:0,data:{turn_id:game.get_turn() + 1}}; event.game = game;
   const error = handler.validate(event); if (#is_defined(error)) { throw Error(error); } handler.apply(event);
  });
  // AdvanceTurn queues production/growth and host plan steps. The natural
  // fixture's real queue drain processes every native batch (bounded at1000),
  // including children, without acknowledging any physical movement callback.
  const queued = f.audit_inspect().pending_events; f.turn_log.events = []; f.turn_log.active = true;
  f.process_events(); f.turn_log.active = false;
  const remaining = f.audit_inspect().pending_events;
  test.assert(remaining == 0,'The real turn queue must settle before same-turn movement baselines');
  for (receipt of f.turn_log.events) { test.assert(receipt.success,'Every queued turn followup validates'); }
  #print('NORMAL_ROUTE_TURN_SETTLE|' + #json_text_exact({turn:game.get_turn() + 0,queued_before:queued,queued_after:remaining,receipts:f.turn_log.events}));
 };
 f.owner = owner; return f;
};
