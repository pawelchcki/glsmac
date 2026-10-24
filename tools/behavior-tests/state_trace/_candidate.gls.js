// Read-only native observations. Full-map enumeration deliberately has no fog,
// viewport, selected-player or expected-roster filter. Input is declared setup.
const observer_api = #include('./_state_trace_observer');
const make_observer = observer_api.make; const player_id = observer_api.player_id;
const emit = (checkpoint, state) => {
 #print('TRACE_CHECK|' + checkpoint.id + '|' + checkpoint.after_action + '|' + #to_string(state.turn) + '|' + #to_string(state.width) + '|' + #to_string(state.height));
 for (p of state.players) { #print('TRACE_PLAYER|' + p.id + '|' + p.faction + '|' + #to_string(p.raw_id)); }
 for (u of state.units) { #print('TRACE_UNIT|' + u.id + '|' + u.owner + '|' + #to_string(u.x) + '|' + #to_string(u.y) + '|' + u.prototype + '|' + #to_string(u.raw_id) + '|' + #to_string(u.movement) + '|' + u.order); if (#is_defined(u.health)) { #print('TRACE_UNITDETAIL|' + u.id + '|' + #to_string(u.health) + '|' + #to_string(u.morale)); } }
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
 let declared_bindings = [];
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
 } else if (input.fixture.kind == 'explicit-world') {
  // Declared seven-player initial world over the same production configure as
  // the full natural profile. Installed text sources are required; prepare()
  // rejects asset-free runs before this script executes.
  f = test.natural_startup_fixture(input.fixture.width, input.fixture.height, input.fixture.terrain);
  if (#sizeof(trace_sources) == 0) { #print('TRACE_UNSUPPORTED|explicit-world requires installed text sources'); throw Error('explicit-world requires installed text sources'); }
  const explicit_sources = {}; for (source_entry of trace_sources) { explicit_sources[source_entry.filename] = source_entry.contents; }
  const explicit_load = (name, format) => {
   if (!#is_defined(explicit_sources[name])) { throw Error('Missing declared installed text source: ' + name); }
   return test.parse_smac_text(explicit_sources[name], format);
  };
  #include('../default/factions').configure({add: (id, data) => { f.fm.add(id, data); }, import_colors: (name) => { return f.colors; }, import_base_names: (name) => { return {land: ['Trace City'], water: ['Trace Port']}; }}, {load_smac_text: explicit_load});
  const explicit_glsmac = #include('./_ui_mocks').events(); explicit_glsmac.config = {worldscript: 'default'}; explicit_glsmac.load_smac_text = explicit_load;
  explicit_glsmac.game = {register_event: (name, handler) => {
   if (name == 'define_animation') { f.game.register_event(name, {validate: handler.validate, apply: (e) => { return {}; }, rollback: (e) => {}}); }
   else { f.game.register_event(name, handler); }
  }};
  #include('../default/game/game')(explicit_glsmac); const explicit_configured = {}; explicit_configured.game = f.game; explicit_glsmac.emit('configure_game', explicit_configured);
  const declared_factions = {GAIANS: 'GAIANS', HIVE: 'HIVE', UNIV: 'UNIVERSITY', MORGAN: 'MORGANITES', SPARTANS: 'SPARTANS', BELIEVE: 'BELIEVERS', PEACE: 'PEACEKEEPERS'};
  const declared_natives = [];
  for (fixture_player of input.fixture.players) {
   const native_faction = declared_factions[fixture_player.faction];
   if (!#is_defined(native_faction)) { throw Error('Unsupported explicit-world faction: ' + fixture_player.faction); }
   declared_natives :+ native_faction;
  }
  f.initialize_declared_players(declared_natives, input.fixture.difficulty);
  // Actual native configure and start; no create_world, FirstTurn or income.
  f.configure_declared_world();
  // The ordinary world initializes definitions in create_world. This fixture
  // omits placement, so execute that same source-backed initialization event
  // before assigning the declared initial ownership (never synthesize rows).
  const technology_plan = #include('../default/game/technology_rules').plan(f.game.get('technology_rules'), f.game.get_players());
  f.game.event('initialize_technologies', {rows: technology_plan});
  f.process_events();
  test.assert(f.game.get('technologies_initialized') == true, 'Installed technology definitions initialize before declared ownership');
  test.assert(f.game.get_settings().global.rules.get_blind_research(), 'Declared standard rules retain actual native Blind Research');
  #print('TRACE_CONFIG|blind_research|' + #to_string(f.game.get_settings().global.rules.get_blind_research()));
  // Colony Pod recipe values come from the actual configured source rules.
  const starting_rules = f.game.get('starting_unit_rules');
  let colony_choice = null; let colony_cost = 0; let colony_rows = 0; let colony_population = 0;
  for (rule of starting_rules) {
   if (rule.id == 'ColonyPod') { colony_choice = rule.choice; colony_cost = rule.rows * 10; colony_rows = rule.rows; colony_population = rule.population; }
  }
  if (colony_choice == null) { throw Error('Declared Colony Pod project has no source recipe'); }
  f.with_write(() => {
   let slot = 0;
   for (fixture_player of input.fixture.players) {
    const owner = f.game.get_player(slot);
    owner.add_production_choice(colony_choice, {type: 'unit', id: 'ColonyPod', cost: colony_cost, cost_rows: colony_rows, population_cost: colony_population});
    const declared_base = input.fixture.bases[slot];
    const tile = f.game.tm.get_tile(declared_base.x, declared_base.y);
    const base = f.game.bm.spawn_base(owner, tile, {name: declared_base.id, facilities: ['HEADQUARTERS']});
    // Uppercase DOCTOR is the production pop definition; the fixture
    // shorthand 'Doctor' would not resolve.
    base.create_pop({type: 'DOCTOR'});
    base.restore_production({choice_id: colony_choice, minerals: declared_base.resources.minerals, last_processed_turn: 1}, '');
    base.set('accumulated_nutrients', declared_base.raw_nutrients);
    const declared_unit = input.fixture.units[slot];
    const scout = f.game.um.spawn_unit({owner: owner, tile: tile, def: 'ScoutPatrol', health: 1.0, morale: 2});
    declared_bindings :+ {kind: 'base', native: base.id, logical: declared_base.id};
    declared_bindings :+ {kind: 'unit', native: scout.id, logical: declared_unit.id};
    slot = slot + 1;
   }
  });
  // Declared research is assigned after configure/start, before the snapshot.
  let research_slot = 0;
  for (fixture_player of input.fixture.players) {
   const research = fixture_player.research;
   f.set_declared_research(research_slot, research.owned_tech_ids, research.target_id, research.accumulated);
   research_slot = research_slot + 1;
  }
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
 const game = f.game; const observer = make_observer(game, input.fixture.profile, input.fixture.kind);
 // Declared bindings pin authored identities before the first read; a bound
 // handle persists through movement and never re-keys per checkpoint.
 for (binding of declared_bindings) { observer.bind(binding.kind, binding.native, binding.logical); }
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
   const target = observer_api.destination(unit, args.direction + '');
   const request = {}; request.unit = unit; request.tile = target;
   game.event('move_unit', request); f.process_events();
   test.assert(!failed, 'Authoritative movement command accepted before animation completion');
   f.finish_unit_move(unit.id); f.process_events();
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
