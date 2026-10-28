// Native application acceptance, separate from original traversal/timing parity.
const behavior = #include('./_behavior');
behavior.scenario('normal 40 by 80 seven-owner world executes a fractional road detour across the horizontal seam',() => {
 const setup = #include('./_normal_route_corridor')(false); const f = setup.fixture; const game = f.game;
 const actor_id = setup.actor_id; const selected_y = setup.row; const target = setup.target;
 const terrain = f.map_view(); f.checkpoint('road-before');
 f.begin(actor_id,'road_to',38,selected_y);
 const before_search = f.audit_snapshot(); const inspection = f.audit_inspect();
 #print('NORMAL_ROUTE_PLAN_BEGIN|road');
 const route = #include('../default/game/terraforming_automation').search(game,game.get_um().get_unit(actor_id),game.get_um().get_unit(actor_id).get_automation(),true);
 #print('NORMAL_ROUTE_PLAN_END|road');
 test.assert(route != null && route.hops >= 6 && route.cost > 0.0);
 test.assert(f.audit_snapshot() == before_search && f.audit_inspect() == inspection,'Planning changes neither native state nor RNG nor queues');
 let moves = 0; let turns = 0; let seam = false; let multiple = false;
 while (game.get_um().get_unit(actor_id).get_automation().command != '') {
  const unrelated = f.unrelated(actor_id); const records = f.drain(actor_id,12);
  const settled_unrelated = f.unrelated(actor_id);
  if (settled_unrelated != unrelated) {
   #print('NORMAL_ROUTE_DIVERGENCE_BEFORE|' + unrelated);
   #print('NORMAL_ROUTE_DIVERGENCE_AFTER|' + settled_unrelated);
  }
  test.assert(settled_unrelated == unrelated,'Same-turn unrelated owners and native participants remain unchanged');
  if (#sizeof(records) >= 3) { multiple = true; }
  for (record of records) {
   if (record.from.x == 0 && record.x == 38) { seam = true; }
   test.assert(record.x != 4 || record.y != selected_y,'Actual movement never enters the blocked water tile'); moves++;
  }
  #print('NORMAL_ROUTE_MOVES|road|' + #json_text_exact(records)); f.checkpoint('road-settled');
  if (game.get_um().get_unit(actor_id).get_automation().command != '') {
   test.assert(turns < 4,'Road plan completes using actual remaining movement and genuine turn refresh');
   f.advance(); turns++; f.checkpoint('road-next-turn');
  }
 }
 test.assert(game.get_um().get_unit(actor_id).get_tile() == target && moves >= 6 && moves <= 8 && seam && multiple);
 test.assert(!game.has_pending_actions(f.owner.id) && f.map_view() == terrain);
 #print('NORMAL_ROUTE_RESULT|' + #json_text_exact({road_moves:moves,road_turns:turns,seam:seam,three_road_steps:multiple,row:selected_y}));
});
