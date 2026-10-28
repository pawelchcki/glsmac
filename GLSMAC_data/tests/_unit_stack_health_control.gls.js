// Isolated test-only backend control. No UI callbacks, combat policy or art.
return (game) => {
 let actor_id = null; let applied_count = 0; let rollback_count = 0;
 const command = 'fixture_stack_health_half_v1'; const nonce = 'stack-health-a-half-v1';
 const validate_health = (e) => {
  for (key in e.data) {
   if (key != 'unit_id' && key != 'owner_id' && key != 'turn' && key != 'previous_health_bits' && key != 'health' && key != 'nonce') { return 'Fixture health unknown field'; }
  }
  if (#typeof(e.caller) != 'Int' || #typeof(e.data.unit_id) != 'Int' || #typeof(e.data.owner_id) != 'Int' ||
   #typeof(e.data.turn) != 'Int' || #typeof(e.data.previous_health_bits) != 'Int' || #typeof(e.data.health) != 'Float' || #typeof(e.data.nonce) != 'String') { return 'Fixture health scalar types changed'; }
  if (actor_id == null || e.data.unit_id != actor_id || e.data.nonce != nonce || applied_count != 0 || rollback_count != 0) { return 'Fixture health actor or one-shot identity changed'; }
  if (e.caller != e.data.owner_id || e.caller != game.get_player().id || e.data.turn != game.get_turn() || !game.is_started() || game.is_turn_complete(e.caller)) { return 'Fixture health owner or turn changed'; }
  if (e.data.previous_health_bits != 1065353216 || e.data.health != 0.5 || #float_bits(e.data.health) != 1056964608) { return 'Fixture health input is not declared full-to-half change'; }
  if (!game.get_um().has_unit(actor_id)) { return 'Fixture health actor retired'; }
  const unit = game.get_um().get_unit(actor_id); const tile = unit.get_tile();
  if (unit.owner != e.caller || unit.def != 'ScoutPatrol' || unit.morale != 2 || unit.health != 1.0 || #float_bits(unit.health) != e.data.previous_health_bits ||
   unit.movement != 1.0 || unit.get_order() != 'NO_ORDERS' || tile.x != 8 || tile.y != 8 || tile.is_locked()) { return 'Fixture health live input changed'; }
 };
 game.register_event(command,{
  validate:validate_health,
  apply:(e) => {
   const error = validate_health(e); if (#is_defined(error)) { throw Error(error); }
   const unit = game.get_um().get_unit(actor_id);
   unit.health = e.data.health;
   const current = game.get_um().get_unit(actor_id);
   if (#float_bits(current.health) != 1056964608) { throw Error('Native health setter did not accept exact half'); }
   applied_count++;
   return {unit_id:actor_id,owner_id:e.caller + 0,turn:e.data.turn + 0,nonce:nonce,previous_health:1.0};
  },
  rollback:(e) => {
   if (applied_count != 1 || rollback_count != 0 || e.applied.unit_id != actor_id || e.applied.owner_id != e.caller || e.applied.turn != game.get_turn() || e.applied.nonce != nonce) { throw Error('Fixture health rollback identity changed'); }
   if (!game.get_um().has_unit(actor_id)) { throw Error('Fixture health rollback actor retired'); }
   const unit = game.get_um().get_unit(actor_id);
   if (unit.owner != e.caller || unit.def != 'ScoutPatrol' || #float_bits(unit.health) != 1056964608) { throw Error('Fixture health rollback state changed'); }
   unit.health = e.applied.previous_health; rollback_count++;
  },
 });
 return {
  command:command,nonce:nonce,
  bind_actor:(id) => {
   if (actor_id != null || #typeof(id) != 'Int' || id <= 0) { throw Error('Fixture health actor binds exactly once'); }
   actor_id = id + 0;
  },
  counts:() => { return {applied:applied_count,rolled_back:rollback_count}; },
 };
};
