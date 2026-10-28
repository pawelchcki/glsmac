// Functional, deterministic application policy for the ten installed commands.
// Source labels are not observations of the original automation algorithm.
// Persistent intent lives exclusively in the native unit's v1 pure-data codec.
const orders = #include('./unit_orders');
const vocabulary = #include('./terraforming_actions');
const work = #include('./terraforming');
const movement = #include('./event/move_unit');
const costs = #include('./movement_cost');
const primitive = #include('./event/unit_terraform');
const limit = 9223372036854775807;
const known = (command) => {
 for (entry of vocabulary.automation) { if (entry.id == command) { return true; } }
 return false;
};
const empty = (epoch) => {
 return {version:2,command:'',epoch:epoch,owner:0,issued_turn:0,last_turn:0,target_x:0,target_y:0,origin_x:0,origin_y:0,cursor:0,phase:0};
};
const next_epoch = (unit) => {
 const value = unit.get_automation().epoch;
 if (value >= limit) { throw Error('Automation identities exhausted'); }
 return value + 1;
};
const stop = (game, unit) => {
 if (unit.get_terraforming().active) { work.cancel(game,unit); }
 unit.set_automation(empty(next_epoch(unit)));
};
const coordinate = (game, x, y) => {
 const tm = game.get_tm();
 return #typeof(x) == 'Int' && #typeof(y) == 'Int' && x >= 0 && y >= 0 &&
  x < tm.get_map_width() && y < tm.get_map_height() && x % 2 == y % 2;
};
const home = (game, unit) => {
 const saved = unit.get_terraform_home();
 if (saved > 0) {
  for (base of game.get_bm().get_bases()) { if (base.id == saved && base.get_owner().id == unit.owner) { return base; } }
  // Missing or no-longer-owned home receives one explicit new assignment.
 }
 const tm = game.get_tm(); const location = unit.get_tile(); let result = null; let distance = 0;
 for (base of game.get_bm().get_bases()) {
  if (base.get_owner().id == unit.owner) {
   const value = tm.get_distance(location,base.get_tile());
   if (result == null || value < distance || (value == distance && base.id < result.id)) { result = base; distance = value; }
  }
 }
 return result;
};
const anchor = (game, unit, plan) => {
 for (base of game.get_bm().get_bases()) {
  const tile = base.get_tile();
  if (base.id == unit.get_terraform_home() && base.get_owner().id == unit.owner && tile.x == plan.origin_x && tile.y == plan.origin_y) { return base; }
 }
 return null;
};
const in_scope = (game, unit, plan, tile) => {
 if (plan.command != 'auto_home_base') { return true; }
 const base = anchor(game,unit,plan); if (base == null) { return false; }
 for (candidate of base.get_workable_tiles()) { if (candidate == tile) { return true; } }
 return false;
};
const actions_for = (game, unit, plan, tile) => {
 if (plan.command == 'farm_solar_road') { return tile.features.xenofungus ? ['remove_fungus','farm','solar','road'] : ['farm','solar','road']; }
 if (plan.command == 'farm_mine_road') { return tile.features.xenofungus ? ['remove_fungus','farm','mine','road'] : ['farm','mine','road']; }
 if (plan.command == 'road_to' || plan.command == 'auto_roads') { return ['road']; }
 if (plan.command == 'tube_to' || plan.command == 'auto_tubes') { return ['road','mag_tube']; }
 if (plan.command == 'auto_sensors') { return ['sensor']; }
 if (plan.command == 'auto_remove_fungus') { return ['remove_fungus']; }
 if (tile.features.xenofungus) { return ['remove_fungus']; }
 if (unit.is_water) { return ['farm','solar']; }
 const flags = game.get_tm().get_terraforming(tile.x,tile.y);
 if (flags.forest || flags.borehole) { return ['road']; }
 if (flags.mine && tile.rockiness < 3) { return ['farm','road']; }
 return tile.rockiness >= 3 ? ['mine','road'] : ['farm','solar','road'];
};
const complete = (game, tile, action) => {
 if (action == 'remove_fungus') { return !tile.features.xenofungus; }
 const flags = game.get_tm().get_terraforming(tile.x,tile.y); return flags[action] == true;
};
const next_action = (game, unit, plan, tile) => {
 if (tile.get_base() != null || !in_scope(game,unit,plan,tile)) { return ''; }
 const active = unit.get_terraforming();
 if (active.active && tile == unit.get_tile()) { return active.action; }
 const actions = actions_for(game,unit,plan,tile);
 for (action of actions) {
  if (!complete(game,tile,action)) {
   // A compound order executes possible components without inventing consent
   // to erase a player's incompatible improvement.
   const flags = game.get_tm().get_terraforming(tile.x,tile.y);
   const conflict = (action == 'farm' && (flags.forest || flags.borehole || tile.rockiness >= 3)) ||
    (action == 'solar' && (flags.mine || flags.forest || flags.borehole)) ||
    (action == 'mine' && (flags.solar || flags.forest || flags.borehole));
   const rule = #include('./terraforming_rules').for_tile(game.get('terraforming_rules'),tile,action);
   if (!conflict && rule != null) {
    if (!#is_defined(work.prerequisite_error(game,unit.owner,rule.prerequisite))) {
     if (tile == unit.get_tile()) {
      if (!#is_defined(work.validate_plan_step(game,unit,action))) { return action; }
     } else { return action; }
    }
   }
  }
 }
 return '';
};
// Native graph adapter. Hypothetical sources are read only; actual commands
// always evaluate the actor's real source and passability again.
const search = (game, unit, plan, exact_target) => {
 const tm = game.get_tm(); const graph = {
  at:(x,y) => { return tm.get_tile(x,y); },
  neighbors:(tile) => { return tile.get_surrounding_tiles(); },
  accept:(tile) => { return exact_target ? tile.x == plan.target_x && tile.y == plan.target_y : next_action(game,unit,plan,tile) != ''; },
  cost:(tile,neighbor) => {
   const base = neighbor.get_base();
   if ((base != null && base.get_owner().id != unit.owner) || #is_defined(movement.validate_at(game,unit,tile,neighbor))) { return null; }
   const quote = costs.evaluate_at(game,unit,tile,neighbor);
   return quote.road_rate > 0 ? 1.0 / #to_float(quote.road_rate) : quote.total_cost;
  },
 };
 graph.source = unit.get_tile(); return #include('./worker_routes')(graph);
};
const choose = (game, unit, plan) => {
 const tile = unit.get_tile(); const pending = unit.get_terraforming();
 if (plan.cursor >= 1000000) { return {kind:'stop',action:'',x:tile.x + 0,y:tile.y + 0}; }
 if (pending.active) {
  if (pending.tile_x != tile.x || pending.tile_y != tile.y) { return {kind:'stop',action:'',x:tile.x + 0,y:tile.y + 0}; }
  return {kind:'work',action:pending.action,x:tile.x + 0,y:tile.y + 0};
 }
 if (plan.command == 'auto_home_base' && plan.phase == 0) {
  if (anchor(game,unit,plan) == null) { return {kind:'stop',action:'',x:tile.x + 0,y:tile.y + 0}; }
  if (tile.x == plan.origin_x && tile.y == plan.origin_y) { return {kind:'arrive',action:'',x:tile.x + 0,y:tile.y + 0}; }
  const destination = search(game,unit,plan,true);
  if (destination == null) { return {kind:'stop',action:'',x:tile.x + 0,y:tile.y + 0}; }
  return {kind:'move',action:'',x:destination.first_x,y:destination.first_y};
 }
 const chain = plan.command == 'farm_solar_road' || plan.command == 'farm_mine_road';
 const route = plan.command == 'road_to' || plan.command == 'tube_to';
 const action = next_action(game,unit,plan,tile);
 if (action != '') { return {kind:'work',action:action,x:tile.x + 0,y:tile.y + 0}; }
 if (chain || (plan.command == 'auto_home_base' && anchor(game,unit,plan) == null) ||
  (route && tile.x == plan.target_x && tile.y == plan.target_y)) { return {kind:'stop',action:'',x:tile.x + 0,y:tile.y + 0}; }
 const destination = search(game,unit,plan,route);
 if (destination == null || (destination.first_x == tile.x && destination.first_y == tile.y)) {
  return {kind:'stop',action:'',x:tile.x + 0,y:tile.y + 0};
 }
 return {kind:'move',action:'',x:destination.first_x,y:destination.first_y};
};
const decision = (game, unit, plan) => {
 const operation = choose(game,unit,plan);
 // A changed prerequisite, worker, or terrain invalidates the intent instead
 // of leaving a rejected host event attached to an apparently active order.
 if (operation.kind == 'work' && #is_defined(work.validate_plan_step(game,unit,operation.action))) {
  const tile = unit.get_tile(); return {kind:'stop',action:'',x:tile.x + 0,y:tile.y + 0};
 }
 return operation;
};

const validate_selection = (e) => {
 const reason = orders.validate(e,false); if (#is_defined(reason)) { return reason; }
 const unit = orders.resolve(e.game,e.data);
 if (!#is_defined(unit.get_automation)) { return 'Native worker plan storage is unavailable'; }
 if (#typeof(e.data.command) != 'String' || (e.data.command != 'cancel' && !known(e.data.command))) { return 'Unknown worker plan command'; }
 const old = unit.get_automation();
 if (#is_defined(e.data.expected_epoch) && (#typeof(e.data.expected_epoch) != 'Int' || e.data.expected_epoch != old.epoch)) { return 'Worker plan selection is stale'; }
 if (old.epoch >= limit) { return 'Automation identities exhausted'; }
 if (e.data.command == 'cancel') { if (old.command == '') { return 'Unit has no automation plan'; } return; }
 if (!unit.get_def().can_terraform || unit.health != unit.get_def().health_max || unit.movement <= 0.0 ||
  unit.movement > unit.get_def().movement_per_turn || (!unit.is_land && !unit.is_water)) { return 'Automation requires a healthy mobile worker'; }
 if (unit.is_water && e.data.command != 'auto_remove_fungus' && e.data.command != 'auto_former' && e.data.command != 'auto_home_base') { return 'This plan requires land improvements'; }
 if (e.data.command == 'auto_home_base' && home(e.game,unit) == null) { return 'Automation requires a live owned home base'; }
};
const validate = (e) => {
 const reason = validate_selection(e); if (#is_defined(reason)) { return reason; }
 if (#typeof(e.data.expected_epoch) != 'Int') { return 'Worker plan requires its observed native epoch'; }
 if (e.data.command == 'road_to' || e.data.command == 'tube_to') {
  if (!coordinate(e.game,e.data.target_x,e.data.target_y)) { return 'Routing target must be an actual map coordinate'; }
  const target_base = e.game.get_tm().get_tile(e.data.target_x,e.data.target_y).get_base();
  if (target_base == null || target_base.get_owner().id != orders.resolve(e.game,e.data).owner) { return 'Routing target must be a live owned base'; }
  const unit = orders.resolve(e.game,e.data); const plan = {command:e.data.command,target_x:e.data.target_x,target_y:e.data.target_y};
  if (search(e.game,unit,plan,true) == null) { return 'Routing target is not reachable without combat'; }
 }
};
const enqueue = (game, unit) => {
 const plan = unit.get_automation();
 if (game.is_master() && plan.command != '' && plan.last_turn < game.get_turn() && unit.movement > 0.0 && !unit.get_tile().is_locked()) {
  game.event('unit_terraform_plan_step',{unit_id:unit.id + 0,expected_epoch:plan.epoch,expected_cursor:plan.cursor,turn_id:game.get_turn() + 0});
 }
};
const step_unit = (e) => {
 const unit = orders.resolve(e.game,e.data);
 if (unit == null || #typeof(e.caller) != 'Int' || e.caller != 0) { return null; }
 const plan = unit.get_automation();
 if (plan.command == '' || plan.owner != unit.owner || #typeof(e.data.expected_epoch) != 'Int' || e.data.expected_epoch != plan.epoch ||
  #typeof(e.data.expected_cursor) != 'Int' || e.data.expected_cursor != plan.cursor || #typeof(e.data.turn_id) != 'Int' ||
  e.data.turn_id != e.game.get_turn() || plan.last_turn >= e.game.get_turn() ||
  !e.game.is_started() || e.game.is_turn_complete(unit.owner) || unit.health <= 0.0 ||
  unit.get_tile().is_locked() || unit.movement <= 0.0) { return null; }
 return unit;
};
const move_event = (game, unit, operation, resolved) => {
 const event = {caller:unit.owner + 0}; event.game = game; event.data = {}; event.data.unit = unit;
 event.data.tile = game.get_tm().get_tile(operation.x,operation.y); event.resolved = resolved;
 const plan = unit.get_automation(); event.data.automation_epoch = plan.epoch; event.data.automation_cursor = plan.cursor + 1;
 return event;
};
return {
 after_move:(game,unit_id,owner,epoch,cursor,turn) => {
  if (!game.is_master() || game.get_turn() != turn || !game.get_um().has_unit(unit_id)) { return; }
  const unit = game.get_um().get_unit(unit_id); const plan = unit.get_automation();
  if (unit.owner == owner && plan.epoch == epoch && plan.cursor == cursor && plan.command != '') { enqueue(game,unit); }
 },
 known:known, empty:empty, validate_selection:validate_selection, validate:validate, decision:decision, search:search, enqueue:enqueue,
 pending_step:(e) => {
  const unit = step_unit(e); if (unit == null) { return false; }
  const operation = decision(e.game,unit,unit.get_automation());
  if (operation.kind == 'work') { return !#is_defined(work.validate_plan_step(e.game,unit,operation.action)); }
  if (operation.kind == 'move') { return !#is_defined(movement.validate(move_event(e.game,unit,operation,{}))); }
  return false;
 },
 cancel:stop,
 start:(e) => {
  const error = validate(e); if (#is_defined(error)) { throw Error(error); }
  const unit = orders.resolve(e.game,e.data); const tile = unit.get_tile();
  const receipt = {owner:unit.owner + 0,turn:e.game.get_turn() + 0,previous_plan:unit.get_automation(),previous_work:unit.get_terraforming(),
   previous_order:unit.get_order(),previous_home:unit.get_terraform_home(),home_receipt:0,movement:unit.movement + 0.0,moved:unit.moved_this_turn == true}; receipt.unit = unit;
  if (e.data.command == 'cancel') { stop(e.game,unit); }
  else {
   work.abandon_paid_height(e.game,unit);
   if (unit.get_terraforming().active) { work.cancel(e.game,unit); }
   const home_base = e.data.command == 'auto_home_base' ? home(e.game,unit) : null;
   if (home_base != null && unit.get_terraform_home() != home_base.id) { receipt.home_receipt = unit.set_terraform_home(home_base.id + 0); }
   const place = home_base == null ? tile : home_base.get_tile();
   const plan = {version:2,command:e.data.command,epoch:next_epoch(unit),owner:unit.owner + 0,issued_turn:e.game.get_turn() + 0,last_turn:0,
    target_x:tile.x + 0,target_y:tile.y + 0,origin_x:place.x + 0,origin_y:place.y + 0,cursor:0,phase:1};
   if (home_base != null) { plan.target_x = place.x + 0; plan.target_y = place.y + 0; if (tile != place) { plan.phase = 0; } }
   if (e.data.command == 'road_to' || e.data.command == 'tube_to') { plan.target_x = e.data.target_x; plan.target_y = e.data.target_y; }
   unit.set_automation(plan); enqueue(e.game,unit);
  }
  receipt.expected_plan = unit.get_automation(); receipt.expected_work = unit.get_terraforming(); receipt.expected_order = unit.get_order();
  receipt.expected_home = unit.get_terraform_home(); receipt.expected_movement = unit.movement + 0.0; receipt.expected_moved = unit.moved_this_turn == true;
  return receipt;
 },
 rollback_start:(e) => {
  const prior = e.applied; const unit = orders.rollback_unit(e);
  if (e.game.get_turn() != prior.turn || unit.get_automation() != prior.expected_plan || unit.get_terraforming() != prior.expected_work ||
   unit.get_order() != prior.expected_order || unit.get_terraform_home() != prior.expected_home || unit.movement != prior.expected_movement || unit.moved_this_turn != prior.expected_moved) { throw Error('Worker plan receipt is stale'); }
  if (prior.home_receipt > 0) { unit.validate_terraform_home_rollback(prior.home_receipt); }
  unit.set_automation(prior.previous_plan); unit.set_terraforming(prior.previous_work);
  if (prior.home_receipt > 0) { unit.rollback_terraform_home(prior.home_receipt); }
  if (prior.previous_order != 'TERRAFORM' && prior.previous_order != 'AUTOMATE') { unit.set_order(prior.previous_order); }
  unit.movement = prior.movement; unit.moved_this_turn = prior.moved;
 },
 validate_step:(e) => {
  const unit = step_unit(e); if (unit == null) { return 'Worker plan step identity or turn is stale'; }
  const operation = decision(e.game,unit,unit.get_automation());
  if (operation.kind == 'work') { return work.validate_plan_step(e.game,unit,operation.action); }
  if (operation.kind == 'move') { return movement.validate(move_event(e.game,unit,operation,{})); }
 },
 resolve_step:(e) => {
  const unit = step_unit(e); if (unit == null) { throw Error('Worker plan step identity or turn is stale'); }
  const operation = decision(e.game,unit,unit.get_automation()); const result = {kind:operation.kind,action:operation.action,x:operation.x,y:operation.y};
  result.movement_successful = operation.kind == 'move' ? movement.resolve(move_event(e.game,unit,operation,{})).is_movement_successful : false;
  return result;
 },
 apply_step:(e) => {
  const unit = step_unit(e); if (unit == null) { throw Error('Worker plan step identity or turn is stale'); }
  const plan = unit.get_automation(); const operation = decision(e.game,unit,plan); const resolved = e.resolved;
  if (resolved.kind != operation.kind || resolved.action != operation.action || resolved.x != operation.x || resolved.y != operation.y ||
   #typeof(resolved.movement_successful) != 'Bool') { throw Error('Worker plan operation changed before apply'); }
  const receipt = {owner:unit.owner + 0,turn:e.game.get_turn() + 0,plan:plan,operation:operation,kind:operation.kind,previous_work:unit.get_terraforming(),previous_movement:unit.movement + 0.0,previous_moved:unit.moved_this_turn == true}; receipt.unit = unit;
  if (operation.kind == 'work') {
   const error = work.validate_plan_step(e.game,unit,operation.action); if (#is_defined(error)) { throw Error(error); }
   receipt.effect = primitive.apply_plan(e.game,unit,operation.action);
  } else if (operation.kind == 'move') {
   const event = move_event(e.game,unit,operation,{is_movement_successful:resolved.movement_successful});
   const error = movement.validate(event); if (#is_defined(error)) { throw Error(error); }
   receipt.effect = movement.apply(event);
  }
  if (operation.kind == 'stop') { stop(e.game,unit); }
  else { if (operation.kind == 'arrive') { plan.phase = 1; } if (operation.kind == 'work') { plan.last_turn = e.game.get_turn() + 0; } plan.cursor = plan.cursor + 1; unit.set_automation(plan); }
  receipt.expected_plan = unit.get_automation(); receipt.expected_order = unit.get_order(); receipt.expected_work = unit.get_terraforming();
  if (operation.kind != 'move') { receipt.expected_movement = unit.movement + 0.0; receipt.expected_moved = unit.moved_this_turn == true; }
  if (operation.kind == 'work') { receipt.effect.expected_order = receipt.expected_order; }
  // Failed movement completes synchronously, before this step publishes its
  // new cursor. Seal that cursor into the completed movement receipt too.
  if (operation.kind == 'move' && receipt.effect.completed) {
   receipt.effect.expected_plan = receipt.expected_plan; receipt.effect.expected_order = receipt.expected_order;
  }
  if (operation.kind == 'arrive') { enqueue(e.game,unit); }
  return receipt;
 },
 rollback_step:(e) => {
  const unit = orders.rollback_unit(e); const receipt = e.applied;
  if (e.game.get_turn() != receipt.turn || unit.get_automation() != receipt.expected_plan || unit.get_order() != receipt.expected_order ||
   (receipt.kind != 'move' && unit.get_terraforming() != receipt.expected_work) || unit.get_tile().is_locked()) { throw Error('Worker plan step receipt is stale'); }
  if (receipt.kind != 'move' && (unit.movement != receipt.expected_movement || unit.moved_this_turn != receipt.expected_moved)) { throw Error('Worker plan movement changed after receipt'); }
  if (receipt.kind == 'work') { primitive.validate_plan_rollback(e.game,unit,receipt.effect); }
  if (receipt.kind == 'move') { const event = move_event(e.game,unit,receipt.operation,{}); event.applied = receipt.effect; movement.validate_rollback(event); }
  if (receipt.kind == 'move') {
   const event = move_event(e.game,unit,receipt.operation,{}); event.applied = receipt.effect;
   movement.rollback(event,() => {
    if (unit.get_automation() == receipt.expected_plan) {
     unit.set_automation(receipt.plan); unit.set_terraforming(receipt.previous_work);
    }
   });
   return;
  } else if (receipt.kind == 'work') { primitive.rollback_plan(e.game,unit,receipt.effect); }
  unit.set_automation(receipt.plan); unit.set_terraforming(receipt.previous_work);
  if (receipt.kind == 'stop') { unit.movement = receipt.previous_movement; unit.moved_this_turn = receipt.previous_moved; }
 },
};
