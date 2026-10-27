// Versioned native terrain audit. Every tile/player/unit/base is enumerated;
// there is no viewport, fog, selected-player or expected-output filter.
const state_api = #include('./_state_trace_observer');
const movement = #include('../default/game/event/move_unit');
const kind = (unit) => { return unit.is_immovable ? 'immovable' : (unit.is_land ? 'land' : (unit.is_water ? 'sea' : 'air')); };
const point = (tile) => { return {x: tile.x + 0, y: tile.y + 0}; };
const quote = (game, unit, destination) => {
 const request = {caller: unit.owner + 0}; request.game = game; request.data = {};
 request.data.unit = unit; request.data.tile = destination;
 const reason = movement.validate(request); const values = movement.observe_cost(request);
 const per_turn = unit.get_def().movement_per_turn;
 const cost = values.road_rate > 0 ? 1.0 / #to_float(values.road_rate) : values.total_cost;
 const result = {source: point(unit.get_tile()), destination: point(destination), movement_kind: kind(unit),
  nominal_mp_per_turn: per_turn, allowed_now: !#is_defined(reason), reason: #is_defined(reason) ? reason : null,
  policy_quote_version: #is_defined(values.free) ? 2 : 1,
  quoted_step_cost_mp: cost, zero_cost_quote: cost == 0.0,
  quoted_tiles_per_turn: cost > 0.0 ? per_turn / cost : null};
 result.policy_quote = values;
 return result;
};
return (game, read_ui) => {
 if (#is_defined(read_ui) && read_ui != null && #typeof(read_ui) != 'Callable') { throw Error('UI observer must be callable or absent'); }
 const has_ui = #typeof(read_ui) == 'Callable';
 const world = state_api.make(game, 'economy-research-v1', 'explicit-world');
 const read = () => {
  const state = world.read(); const tm = game.get_tm(); const players = game.get_players();
  if (#sizeof(players) != 7) { throw Error('Terraform audit requires every one of seven native participants'); }
  const trace = {schema: 'game.terrain_observation.v2', elevation_units: 'native-engine-elevation',
   terrain_units: {rockiness: 'native-enum-0-none-1-flat-2-rolling-3-rocky', moisture: 'native-enum-0-none-1-arid-2-moist-3-rainy', original_raw_height_class: 'unsupported', original_raw_rockiness: 'unsupported'},
   tiles: {}, unit_details: {}, base_details: {}, player_details: {}, ui: null,
   coverage: {all_players: true, terrain_height: true, terrain_type: true, terrain_resources: true,
    traverse_quotes: true, canonical_height: true, energy_initialization: true, automation_context: true, automation_phase: true, home_identity: true, improvement_owners: true,
    ui: has_ui, animation_timing: false, audio: false, original_height_byte: false}};
  trace.policy = game.get_settings().global.rules.get_terraforming_policy();
  for (player of players) {
   const id = state_api.player_id(player);
   if (#is_defined(trace.player_details[id])) { throw Error('Duplicate native participant logical identity'); }
   trace.player_details[id] = {raw_id: player.id + 0, role: player.type + '', name: player.name + '', identity: #clone(player.get_faction().identity), energy: #clone(player.get_energy_state())};
   if (!#is_defined(trace.player_details[id].energy.initialized)) { trace.coverage.energy_initialization = false; }
  }
  for (let y = 0; y < state.height; y++) {
   for (let x = y % 2; x < state.width; x = x + 2) {
    const raw = tm.get_terrain_state(x, y); const tile = tm.get_tile(x, y); raw.resources = {}; raw.locked = tile.is_locked();
    if (!#is_defined(raw.canonical)) { trace.coverage.canonical_height = false; }
    if (!#is_defined(raw.terraforming_owners)) { trace.coverage.improvement_owners = false; }
    raw.native_type = {domain: raw.is_water ? 'sea' : 'land', rockiness: ['none', 'flat', 'rolling', 'rocky'][raw.rockiness] + '', moisture: ['none', 'arid', 'moist', 'rainy'][raw.moisture] + ''};
    for (player of players) { const id = state_api.player_id(player); raw.resources[id] = tile.get_resources(player); }
    const center = raw.elevation.center;
    raw.native_height_band = {below_coast: center < 0, below_ocean: center < (0 - 1000), below_trench: center < (0 - 2000)};
    const key = #to_string(x) + ',' + #to_string(y); trace.tiles[key] = raw;
   }
  }
  for (entry of state.units) {
   const unit = game.get_um().get_unit(entry.raw_id); const definition = unit.get_def();
   // Keep the native Float directly: adding 0.0 would erase signed zero.
   entry.movement = unit.movement; entry.health = unit.health;
   const detail = {definition_id: definition.id + '', morale_set: definition.morale + '', movement_kind: kind(unit), nominal_mp_per_turn: definition.movement_per_turn,
    can_terraform: definition.can_terraform, moved_this_turn: unit.moved_this_turn == true,
    work: #clone(unit.get_terraforming()), automation: null, home_base_id: null, quotes: {}};
   if (#typeof(unit.get_automation) == 'Callable') {
    detail.automation = #clone(unit.get_automation());
    if (detail.automation.version < 2) { trace.coverage.automation_phase = false; }
   } else { trace.coverage.automation_context = false; trace.coverage.automation_phase = false; }
   if (#typeof(unit.get_terraform_home) == 'Callable') { detail.home_base_id = unit.get_terraform_home(); }
   else { trace.coverage.home_identity = false; }
   detail.combat = #clone(definition.combat);
   const current = tm.get_terrain_state(entry.x, entry.y);
   for (direction in current.neighbors) {
    const destination = current.neighbors[direction];
    detail.quotes[direction] = destination == null ? null : quote(game, unit, tm.get_tile(destination.x, destination.y));
   }
   trace.unit_details[entry.id] = detail;
  }
  for (entry of state.bases) {
   let base = null; for (candidate of game.get_bm().get_bases()) { if (candidate.id == entry.raw_id) { base = candidate; } }
   if (base == null) { throw Error('Observed base retired during terrain audit'); }
   const nutrients = base.get('accumulated_nutrients');
   const detail = {name: base.name + '', production: #clone(base.get_production()),
    intake: #clone(base.get_intake()), consumption: #clone(base.get_consumption()),
    nutrients_present: #is_defined(nutrients), nutrients: #is_defined(nutrients) ? nutrients + 0 : null,
    citizens: [], worked_tiles: [], facilities: #clone(base.get_facilities())};
   for (citizen of base.get_pops()) {
    const row = {id: citizen.id + 0, type: citizen.get_type() + '', worked_tile: null};
    if (citizen.has('worked_tile')) { row.worked_tile = point(citizen.get('worked_tile')); }
    detail.citizens :+ row;
   }
   for (tile of base.get_worked_tiles()) { detail.worked_tiles :+ point(tile); }
   trace.base_details[entry.id] = detail;
  }
  if (has_ui) { trace.ui = #clone(read_ui()); }
  state.terrain_trace = trace;
  return state;
 };
 return {read: read, bind: world.bind, quote: (unit, destination) => { return quote(game, unit, destination); }};
};
