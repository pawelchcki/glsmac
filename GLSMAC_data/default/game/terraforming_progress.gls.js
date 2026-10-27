// A cheap native selected-tile signature gates the expensive pure cohort read.
// The signature is display state, never a job/quote/event identity or a cache
// shared between observations. No terrain search occurs in signature().
const work = #include('./terraforming');
const revision = #include('./terraforming_view_revision');
return {
 signature:(game,unit) => {
  const tile = unit.get_tile(); const base = tile.get_base(); const members = [];
  for (peer of tile.get_units()) {
   const health = peer.health;
   members :+ [peer.id + 0,peer.owner + 0,health,peer.is_water,peer.get_order(),peer.get_terraforming()];
  }
  return {revision:revision.read(game),turn:game.get_turn() + 0,x:tile.x + 0,y:tile.y + 0,
   water:tile.is_water,base_id:base == null ? 0 : base.id + 0,members:members};
 },
 read:(game,unit) => {
  if (#typeof(unit.get_terraforming_schema_version) != 'Callable' || unit.get_terraforming_schema_version() != 2 || !#is_defined(unit.get_terraforming().job)) { return null; }
  // Fresh synchronous cache. The returned detached scalar state may be shown
  // until its signature changes; the helper's terrain cache is never retained.
  return work.cohort_state(game,unit,{});
 },
 text:(state,cohort) => {
  if (cohort != null && #sizeof(cohort.participants) > 1) {
   return 'Work: ' + #to_string(cohort.cohort_work_units) + '/' + #to_string(cohort.required_work) + '; own ' + #to_string(cohort.own_work_units);
  }
  return 'Work: ' + #to_string(state.work_units) + '/' + #to_string(state.required_work);
 },
};
