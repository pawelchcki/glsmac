// Application cooperation policy. Each native work counter is that worker's
// own contribution; the cohort total is computed, never copied into peers.
const policy = 'application.cooperative-work.v1';
const effects = #include('./terraforming_effects');
const fields = ['farm','soil_enricher','mine','solar','forest','road','mag_tube','bunker','airbase','sensor','condenser','mirror','borehole'];
const prepare = (game,unit,action,required) => {
 const tm = game.get_tm(); const origin = unit.get_tile(); const cache = {};
 const read_state = (x,y) => {
  const key = #to_string(x) + ':' + #to_string(y);
  if (!#is_defined(cache[key])) { cache[key] = tm.get_terrain_state(x,y); }
  return cache[key];
 };
 const patches = effects.plan(game,unit,action,read_state);
 const geometry = tm.get_terrain_geometry(origin.x,origin.y);
 if (#sizeof(patches) == 0 || #sizeof(patches) > geometry[5]) { throw Error('Cooperative work exceeds the supported terrain transaction capacity'); }
 // Native Object properties are sorted. Padded coordinate keys give numeric
 // y/x order without scanning the world or quadratic insertion sorting.
 const points = {};
 for (patch of patches) {
  const key = #to_string(patch.y + 10000) + ':' + #to_string(patch.x + 10000);
  if (#is_defined(points[key])) { throw Error('Cooperative terrain plan contains duplicate squares'); }
  points[key] = {x:patch.x + 0,y:patch.y + 0};
 }
 const guards = [];
 for (point of points) {
  const state = read_state(point.x,point.y);
  if (state.width > 4096 || state.height > 4096) { throw Error('Cooperative work requires supported world dimensions'); }
  const owners = []; for (name of fields) { owners :+ (state.terraforming_owners[name] + 0); }
  // Persistent per-tile epochs reject ABA; the compact physical baseline also
  // distinguishes unit reception into a different map with coincident epochs.
  // No corners/bonus/output patches: these effects do not write or validate them.
  guards :+ [point.x,point.y,state.terrain_epoch + 0,state.elevation.center + 0,state.is_water ? 1 : 0,
   state.moisture + 0,state.rockiness + 0,state.features_raw + 0,state.terraforming_raw + 0,owners];
 }
 const identity = #json_text_exact({policy:policy,owner:unit.owner + 0,action:action,domain:unit.is_water ? 'water' : 'land',
  x:origin.x + 0,y:origin.y + 0,required_work:required,tiles:guards});
 // GSE #sizeof supports arrays, not Strings. The fixed <=4096 compact
 // tuples are source-bounded below 512KiB; Native ValidWork enforces bytes
 // authoritatively before storing metadata. No guessed string length API.
 const result = {job:{version:1,policy:policy,owner:unit.owner + 0,terrain_identity:identity}};
 result.patches = patches; return result;
};
const capture = (unit) => {
 const tile = unit.get_tile(); const movement = unit.movement; const health = unit.health;
 const state = {owner:unit.owner + 0,x:tile.x + 0,y:tile.y + 0,order:unit.get_order(),work:unit.get_terraforming(),
  recovery:unit.get_terraforming_recovery(),movement:movement,moved:unit.moved_this_turn == true,
  health:health,morale:unit.morale + 0,definition:unit.def + '',
  plan:unit.get_automation(),home:unit.get_terraform_home()}; state.unit = unit; return state;
};
const matches = (unit,state,action,required,job,x,y,water) => {
 const tile = unit.get_tile();
 return unit.owner == job.owner && unit.get_def().can_terraform && unit.health > 0.0 && unit.is_water == water &&
  tile.x == x && tile.y == y && state.tile_x == x && state.tile_y == y && state.action == action && state.required_work == required &&
  #is_defined(state.job) && state.job == job && !#is_defined(state.height);
};
const collect = (unit,action,required,job) => {
 const tile = unit.get_tile(); const result = [];
 // Native Tile::units is ordered by native unit ID. Retain that order in
 // receipts and traces; no callback or own contribution enters job identity.
 for (other of tile.get_units()) {
  const state = other.get_terraforming();
  if (matches(other,state,action,required,job,tile.x,tile.y,unit.is_water)) { result :+ capture(other); }
 }
 return result;
};
const total = (states) => { let value = 0; for (state of states) { value = value + state.work.work_units; } return value; };
return {
 policy:policy,prepare:prepare,matches:matches,collect:collect,total:total,capture:capture,
 seal:(states) => { for (state of states) { state.expected = capture(state.unit); } },
 validate:(game,states) => {
  for (state of states) {
   if (!game.get_um().has_unit(state.unit.id)) { throw Error('Cooperative worker retired before rollback'); }
   const live = game.get_um().get_unit(state.unit.id);
   if (live != state.unit || capture(live) != state.expected) { throw Error('Cooperative work changed before rollback'); }
  }
 },
 rollback:(states) => {
  for (state of states) {
   const unit = state.unit; unit.set_terraforming(state.work); unit.set_terraforming_recovery(state.recovery);
   if (state.order != 'TERRAFORM' && state.order != 'AUTOMATE') { unit.set_order(state.order); }
   unit.movement = state.movement; unit.moved_this_turn = state.moved;
  }
 },
 // The optional cache belongs to ONE synchronous observation, never a UI
 // lifetime or later read. This avoids repeating a river search for each peer.
 state:(game,unit,read_cache) => {
  const own = unit.get_terraforming(); if (!#is_defined(own.job)) { return null; }
  const tile = unit.get_tile();
  if (!matches(unit,own,own.action,own.required_work,own.job,tile.x,tile.y,unit.is_water)) { return null; }
  const cache = #is_defined(read_cache) ? read_cache : {}; const key = own.job.terrain_identity;
  if (!#is_defined(cache[key])) {
   let valid = false;
   try { valid = prepare(game,unit,own.action,own.required_work).job == own.job; }
   catch { : (error) => { valid = false; } }
   const entry = {valid:valid,total:0,participants:[]};
   if (valid) {
    const members = collect(unit,own.action,own.required_work,own.job); const participants = [];
    for (member of members) { participants :+ {unit_id:member.unit.id + 0,work_units:member.work.work_units,active:member.work.active}; }
    entry.total = total(members); entry.participants = participants;
   }
   cache[key] = entry;
  }
  const entry = cache[key]; if (!entry.valid) { return null; }
  return {version:1,policy:policy,own_work_units:own.work_units,cohort_work_units:entry.total,required_work:own.required_work,participants:entry.participants};
 },
};
