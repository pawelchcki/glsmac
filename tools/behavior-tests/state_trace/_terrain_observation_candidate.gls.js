// Candidate-only declared observation-capability world, never original gold.
const behavior = #include('./_behavior');
const encode = #include('./_trace_json');
const movement = #include('../default/game/event/move_unit');
behavior.scenario('complete seven-owner terrain observations and actual movement retain native read purity', () => {
 const f = test.natural_startup_fixture(16, 16, 'flat-arid'); const game = f.game;
 #include('./_natural_startup_mechanics')(f);
 game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
 f.initialize_single_player('GAIANS', 'Citizen'); f.start_world(); f.enable_movement();
 let base = null; let scout = null;
 for (candidate of game.get_bm().get_bases()) { if (candidate.get_owner().id == game.get_player().id) { base = candidate; } }
 for (unit of base.get_tile().get_units()) { if (unit.get_def().id == 'ScoutPatrol') { scout = unit; } }
 test.assert(base != null && scout != null);
 const actors = []; const conventional = {id: 'conventional'}; conventional.unit = scout;
 f.with_write(() => {
  for (entry of [['former', 'Formers'], ['native', 'MindWorms']]) {
   const data = {def: entry[1] + '', health: 1.0, morale: 2}; data.owner = game.get_player(); data.tile = base.get_tile();
   const actor = {id: entry[0] + ''}; actor.unit = game.get_um().spawn_unit(data); actors :+ actor;
  }
 });
 actors :+ conventional;
 const observer = #include('./_terrain_trace_observer')(game);
 for (actor of actors) { observer.bind('unit', actor.unit.id, actor.id); }
 const capture = (stage) => {
  const native = f.audit_snapshot(); const bookkeeping = f.audit_inspect();
  const snapshot = observer.read(); const seen = {};
  test.assert(#sizeof(snapshot.players) == 7 && #sizeof(snapshot.bases) == 7 && #sizeof(snapshot.units) == #sizeof(bookkeeping.unit_ids));
  for (row of snapshot.units) { const key = #to_string(row.raw_id); test.assert(!#is_defined(seen[key])); seen[key] = true; }
  for (id of bookkeeping.unit_ids) { const key = #to_string(id); test.assert(#is_defined(seen[key])); }
  test.assert(snapshot.terrain_trace.policy == {version: 1, ignore_technologies: true});
  test.assert(f.audit_snapshot() == native && f.audit_inspect() == bookkeeping, 'All-map/player/resource/cost observations preserve RNG, actual graph and pending bookkeeping');
  #print('TERRAIN_NATIVE|' + stage + '|' + encode(bookkeeping));
  // Keep each encoded value bounded. A growing monolithic GSE JSON string
  // exhausted the 2GB WASM heap on the first complete-map capture.
  const trace = snapshot.terrain_trace;
  const header = {turn: snapshot.turn, width: snapshot.width, height: snapshot.height,
   players: snapshot.players, units: snapshot.units, bases: snapshot.bases, research: snapshot.research,
   terrain_trace: {schema: trace.schema, elevation_units: trace.elevation_units, terrain_units: trace.terrain_units,
    ui: trace.ui, coverage: trace.coverage, policy: trace.policy}};
  #print('TERRAIN_STAGE_BEGIN|' + stage + '|' + encode(header));
  const counts = {tiles: 0, unit_details: 0, base_details: 0, player_details: 0};
  for (domain of ['tiles', 'unit_details', 'base_details', 'player_details']) {
   for (key in trace[domain]) {
    const row = {domain: domain + '', key: key + ''}; row.value = trace[domain][key];
    #print('TERRAIN_STAGE_ROW|' + stage + '|' + encode(row)); counts[domain] = counts[domain] + 1;
   }
  }
  #print('TERRAIN_STAGE_END|' + stage + '|' + encode(counts));
  return snapshot;
 };
 capture('initial');
 for (actor of actors) {
  let destination = null; const terrain = game.get_tm().get_terrain_state(actor.unit.get_tile().x, actor.unit.get_tile().y);
  for (direction in terrain.neighbors) {
   const point = terrain.neighbors[direction];
   if (destination == null && point != null) {
    const tile = game.get_tm().get_tile(point.x, point.y); const quote = observer.quote(actor.unit, tile);
    if (quote.allowed_now) { destination = tile; }
   }
  }
  test.assert(destination != null, 'Declared healthy actor has an actual passable neighbor');
  const before = capture(actor.id + '-before'); const before_mp = actor.unit.movement; const source = actor.unit.get_tile();
  const quoted = observer.quote(actor.unit, destination);
  const event = {caller: actor.unit.owner + 0}; event.game = game; event.data = {};
  event.data.unit = actor.unit; event.data.tile = destination;
  test.assert(!#is_defined(movement.validate(event)));
  f.with_write(() => { event.resolved = movement.resolve(event); event.applied = movement.apply(event); });
  capture(actor.id + '-during');
  if (event.resolved.is_movement_successful) { f.finish_unit_move(actor.unit.id); }
  const after = capture(actor.id + '-after');
  const result = {unit_id: actor.id, source: {x: source.x + 0, y: source.y + 0},
   destination: {x: destination.x + 0, y: destination.y + 0},
   movement_before: before_mp, movement_after: actor.unit.movement,
   actual_debit_mp: before_mp - actor.unit.movement, movement_successful: event.resolved.is_movement_successful,
   actual_step_count: event.resolved.is_movement_successful ? 1 : 0,
   before_checkpoint: actor.id + '-before', after_checkpoint: actor.id + '-after'};
  result.quote = quoted;
  #print('TERRAIN_MOVEMENT|' + encode(result));
 }
 #print('TERRAIN_OBSERVATION_COMPLETE');
});
