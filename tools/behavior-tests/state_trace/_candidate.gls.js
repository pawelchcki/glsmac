// Read-only native observations. Full-map enumeration deliberately has no fog,
// viewport, selected-player or expected-roster filter. Input is declared setup.
const observer_api = #include('./_state_trace_observer');
const make_observer = observer_api.make; const player_id = observer_api.player_id;
const emit = (checkpoint, state) => {
 #print('TRACE_CHECK|' + checkpoint.id + '|' + checkpoint.after_action + '|' + #to_string(state.turn) + '|' + #to_string(state.width) + '|' + #to_string(state.height));
 for (p of state.players) { #print('TRACE_PLAYER|' + p.id + '|' + p.faction + '|' + #to_string(p.raw_id)); }
 for (u of state.units) { #print('TRACE_UNIT|' + u.id + '|' + u.owner + '|' + #to_string(u.x) + '|' + #to_string(u.y) + '|' + u.prototype + '|' + #to_string(u.raw_id) + '|' + #to_string(u.movement) + '|' + u.order); }
 for (b of state.bases) { #print('TRACE_BASE|' + b.id + '|' + b.owner + '|' + #to_string(b.x) + '|' + #to_string(b.y) + '|' + #to_string(b.population) + '|' + #to_string(b.raw_id)); }
 if (#is_defined(state.research)) {
  for (b of state.bases) { #print('TRACE_BASEECONOMY|' + b.id + '|' + #to_string(b.resources.minerals) + '|' + b.project + '|' + #to_string(b.jobs.workers) + '|' + #to_string(b.jobs.doctors) + '|' + #to_string(b.nutrients_native)); }
  for (r of state.research) {
   let owned = ''; for (id of r.owned_tech_ids) { owned += (owned == '' ? '' : ',') + #to_string(id); }
   #print('TRACE_RESEARCH|' + r.player + '|' + #to_string(r.target_id) + '|' + #to_string(r.accumulated) + '|' + owned);
  }
 }
 #print('TRACE_END');
};
const behavior = #include('./_behavior');
behavior.scenario('actual native state trace', () => {
 const input = trace_input;
 let f = null;
 if (input.fixture.kind == 'natural-startup') {
  f = test.natural_startup_fixture(input.fixture.width, input.fixture.height, input.fixture.terrain);
  if (#sizeof(trace_sources) == 0) { #include('./_natural_startup_mechanics')(f); }
  else {
   const sources = {}; for (entry of trace_sources) { sources[entry.filename] = entry.contents; }
   const load = (name, format) => {
    if (!#is_defined(sources[name])) { throw Error('Missing declared installed text source: ' + name); }
    return test.parse_smac_text(sources[name], format);
   };
   #include('../default/factions').configure({add: (id, data) => { f.fm.add(id, data); }, import_colors: (name) => { return f.colors; }, import_base_names: (name) => { return {land: ['Trace City'], water: ['Trace Port']}; }}, {load_smac_text: load});
   const glsmac = #include('./_ui_mocks').events(); glsmac.config = {worldscript: 'default'}; glsmac.load_smac_text = load;
   glsmac.game = {register_event: (name, handler) => {
    if (name == 'define_animation') { f.game.register_event(name, {validate: handler.validate, apply: (e) => { return {}; }, rollback: (e) => {}}); }
    else { f.game.register_event(name, handler); }
   }};
   #include('../default/game/game')(glsmac); const configured = {}; configured.game = f.game; glsmac.emit('configure_game', configured);
  }
  const factions = {GAIANS: 'GAIANS', HIVE: 'HIVE', UNIV: 'UNIVERSITY', MORGAN: 'MORGANITES', SPARTANS: 'SPARTANS', BELIEVE: 'BELIEVERS', PEACE: 'PEACEKEEPERS'};
  f.initialize_single_player(factions[input.fixture.faction], input.fixture.difficulty);
  test.assert(f.game.get_settings().global.rules.get_blind_research(), 'Declared standard rules retain actual native Blind Research');
  f.start_world();
  #print('TRACE_CONFIG|blind_research|' + #to_string(f.game.get_settings().global.rules.get_blind_research()));
 } else {
  // Independent exporter invariant fixture: two REAL native player objects,
  // native production managers and synthetic, explicitly declared entities.
  f = test.selection_fixture('Trace Fixture', 16); f.enable_economy();
  f.with_write(() => {
   f.game.um.spawn_unit({owner: f.game.get_player(0), def: 'Scout', tile: f.game.tm.get_tile(10, 10), health: 1.0, morale: 1});
   f.game.um.spawn_unit({owner: f.game.get_player(1), def: 'Scout', tile: f.game.tm.get_tile(2, 2), health: 1.0, morale: 1});
   f.game.bm.spawn_base(f.game.get_player(0), f.game.tm.get_tile(10, 10), {name: 'Foreign Trace Base'});
  });
 }
 const game = f.game; const observer = make_observer(game, input.fixture.profile);
 observer.read(); // Establish initial identities even when no initial checkpoint is requested.
 for (a of input.actions) { if (a.kind == 'move-unit' || a.kind == 'fixture-move-unit') { f.enable_movement(); break; } }
 let failed = false;
 game.on('event_result', (e) => { if (!e.success) { failed = true; } });
 const checkpoints = (after) => {
  for (point of input.checkpoints) {
   if (point.after_action == after) {
    const first = observer.read(); const second = observer.read();
    test.assert(first == second, 'Repeated snapshots are detached, read-only equal values');
    emit(point, first);
   }
  }
 };
 checkpoints('initial');
 for (action of input.actions) {
  const args = action.args;
  if (action.kind == 'snapshot') {}
  else if (action.kind == 'hold-all-ready-human-units') {
   const state = observer.read();
   for (u of state.units) {
    if (u.owner == player_id(game.get_player()) && game.um.get_unit(u.raw_id).needs_orders()) { game.event('unit_hold', {unit_id: u.raw_id}); }
   }
   f.process_events();
  } else if (action.kind == 'hold-unit') {
   const unit = observer.find(args.unit); game.event('unit_hold', {unit_id: unit.id}); f.process_events();
  } else if (action.kind == 'end-turn') {
   game.event('complete_turn', {}); f.process_events();
  } else if (action.kind == 'move-unit') {
   const unit = observer.find(args.unit);
   game.event('move_unit', {unit: unit, tile: unit.get_tile()[args.direction]}); f.process_events(); f.finish_unit_move(unit.id); f.process_events();
  } else if (action.kind == 'fixture-move-unit') {
   const unit = observer.find(args.unit); f.with_write(() => { unit.move_to_tile(game.tm.get_tile(args.x, args.y), () => {}); }); f.finish_unit_move(unit.id);
  } else if (action.kind == 'fixture-remove-unit') {
   const unit = observer.find(args.unit); f.with_write(() => { game.um.despawn_unit(unit.id); });
  }
  test.assert(!failed, 'Every queued action succeeded');
  checkpoints(action.id);
 }
 #print('TRACE_COMPLETE');
});
behavior.finish();
