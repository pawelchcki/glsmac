// Candidate-only sea read observation; actual production must settle first.
// Candidate-only read observation. The declared world, SDL inputs and normal
// controller provide every action/payment; this file never applies work.
#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const menu = #include('ui/parts/game/menu/menu');
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const popup = #include('ui/parts/game/popup/popup');
 const height = #include('ui/parts/game/popup/terraforming_height');
 const terrain_observer = #include('../tests/_terrain_trace_observer');
 glsmac.on('configure_game',(configured) => {
  const game = configured.game;
  let production_acks = 0; let growth_acks = 0; let resumption_ack = false;
  game.on('event_result',(e) => {
   if (#typeof(e.event_id) != 'String' || #typeof(e.caller) != 'Int' || #typeof(e.success) != 'Bool') { throw Error('Unexpected native receipt types'); }
   #print('TH_RECEIPT|' + #json_text_exact({name:e.name,event_id:e.event_id,caller:e.caller,success:e.success,data:e.data}));
   if (!e.success) { #print('TH_ERROR|event-rejected'); }
   if (e.name == 'process_base_production' && e.success && e.caller == 0 && e.data.turn_id == 1) { production_acks = production_acks + 1; }
   if (e.name == 'process_base_growth' && e.success && e.caller == 0 && e.data.turn_id == 1) { growth_acks = growth_acks + 1; }
   if (e.name == 'set_base_production' && e.success && e.caller == 0) {
    const setup = game.get('sea_browser_setup');
    if (e.data.choice_id == setup.resumed_choice) {
     if (production_acks != 1 || growth_acks != 7 || resumption_ack) { throw Error('Project resumption did not follow one eligible production and seven growth ACKs'); }
     resumption_ack = true;
    }
   }
  });
  game.on('error',() => { #print('TH_ERROR|native-game'); });
  game.on('start_ui',() => {
   const initialize = () => {
   const proxy = {}; proxy.um = game.get_um(); proxy.bm = game.get_bm();
   for (field of ['get_um','get_bm','get_tm','get_players','get_player','get_turn','get_settings','get','is_started','is_turn_complete','get_research_state','get_research_science']) { proxy[field] = game[field]; }
   proxy.technologies = game.technologies;
   let actor_id = null;
   for (unit of game.get_tm().get_tile(8,8).get_units()) {
    if (unit.owner == game.get_player().id && unit.get_def().can_terraform) {
     if (actor_id != null) { throw Error('Ambiguous declared worker'); } actor_id = unit.id + 0;
    }
   }
   if (actor_id == null) { throw Error('Missing declared native worker'); }
   const actor = () => { return game.get_um().get_unit(actor_id); };
   glsmac.ui.presentation_trace_start(); glsmac.ui.presentation_trace_inputs_start();
   let armed = false; let exit_requested = false; let session = 0; let watched = null;
   let query_serial = 0; let pending = null; let pending_frame = null; let state_serial = 0; let last_state = '';
   const read_ui = (full) => {
    const worker = actor(); const movement = worker.movement;
    const result = {actor:actor_id,owner:game.get_player().id + 0,turn:game.get_turn() + 0,selected:preview.selected_unit_id,
     viewport:{width:glsmac.ui.get_width(),height:glsmac.ui.get_height()},root:menu.menus.left_menu.is_open,
     modal:popup.is_shown(),popup_id:popup.popup == null ? null : popup.popup.id + '',
     sliding:popup.sliding_timer != null,hiding:popup.popup_hiding,session:session,
     order:worker.get_order(),movement:movement,movement_bits:#float_bits(movement),work:worker.get_terraforming(),
     pending:preview.order_pending == null ? null : #clone(preview.order_pending),
     native_pending:game.has_pending_actions(game.get_player().id),tile_locked:worker.get_tile().is_locked(),
     x:worker.get_tile().x + 0,y:worker.get_tile().y + 0,height_stage:preview.height_presentation == null ? null : preview.height_presentation.stage,
     dialog_generation:height.generation,choice:height.selected};
    if (full) {
     result.height_presentation = preview.height_presentation == null ? null : #clone(preview.height_presentation);
     result.dialog = popup.popup != null && popup.popup.id == 'terraforming_height' ? #clone(height.definition) : null;
     result.order_label = preview.order_label == null ? null : preview.order_label.text + '';
     result.movement_label = preview.movement_label == null ? null : preview.movement_label.text + '';
     result.work_progress = preview.work_progress_label == null ? null : preview.work_progress_label.text + '';
    }
    return result;
   };
   const observer = terrain_observer(proxy,() => { return read_ui(true); });
   const request_query = (scope,frame,token) => {
    if (pending != null) { throw Error('A height observation is already pending'); }
    query_serial++;
    pending = {query:query_serial,scope:scope,session:token,actor:actor_id,owner:game.get_player().id + 0,turn:game.get_turn() + 0,dialog_generation:height.generation};
    pending_frame = frame;
   };
   const watch = (frame) => {
    session++; const token = session; watched = frame;
    #print('TH_WINDOW|' + #json_text_exact({kind:'attached',session:token,source:'game.popup.terraforming_height'}));
    // This actual Window already returns true unconditionally. Height uses
    // ordinary Buttons, which do not consume modified P before the Window.
    // Preserve the existing final result for every unrelated key.
    frame.on('keydown',(e) => {
     if (e.modifiers == {ctrl:true,alt:true}) {
      if (e.code == 'P') { request_query('height',frame,token); }
      if (e.code == 'Q') { exit_requested = true; }
     }
     return true;
    });
    frame.on('remove',() => { if (watched == frame) { watched = null; } });
   };
   glsmac.ui.root.on('keydown',(e) => {
    if (e.modifiers != {ctrl:true,alt:true}) { return false; }
    if (e.code == 'K') { game.select_unit(actor()); armed = true; return true; }
    if (e.code == 'P') { request_query('root',glsmac.ui.root,session); return true; }
    if (e.code == 'Q') { exit_requested = true; return true; }
    return false;
   });
   let headers_logged = false; let tagged_generation = null; const tagged_rows = {};
   glsmac.ui.root.timer(100,() => {
    if (popup.is_shown() && popup.popup.id == 'terraforming_height') {
     const frame = popup.popup.el;
     if (watched != frame) { watch(frame); }
     if (height.generation != tagged_generation) {
      let index = 0;
      for (row of height.rows) { row.presentation_role('terraform-height-choice',#to_string(index)); index++; }
      height.ok.presentation_role('terraform-height-ok','confirm'); tagged_generation = height.generation;
     }
    }
    const root = menu.menus.left_menu;
    if (root.is_open && !headers_logged) {
     if (#sizeof(root.items) != #sizeof(menu.headers)) { throw Error('Source header inventory differs from native controls'); }
     const rows = []; let index = 0;
     for (definition of menu.headers) {
      const control = root.items[index];
      if (control.el.text != definition.label) { throw Error('Source/header label mismatch'); }
      control.el.presentation_role('terraform-header',definition.id);
      rows :+ {id:definition.id + '',label:definition.label + ''}; index++;
     }
     #print('TH_HEADERS|' + #json_text_exact(rows)); headers_logged = true;
    }
    const child = menu.menus.left_menu_terraform;
    if (#is_defined(child) && child.is_open) {
     const rows = [];
     for (row of child.items) {
      const entry = row.entry;
      if (#is_defined(entry.terraform_action)) {
       if (!#is_defined(tagged_rows[entry.terraform_action])) { row.el.presentation_role('terraform-row',entry.terraform_action); tagged_rows[entry.terraform_action] = true; }
       rows :+ {id:entry.terraform_action + '',label:row.el.text + '',enabled:row.el.color != 'black'};
      }
     }
     #print('TH_ROWS|' + #json_text_exact(rows));
    }
    if (armed) {
     const ui = read_ui(false); const text = #json_text_exact(ui);
     if (text != last_state) { state_serial++; last_state = text; #print('TH_STATE|' + #json_text_exact({serial:state_serial,ui:ui})); }
    }
    if (pending != null) {
     const requested = pending; const frame = pending_frame; pending = null; pending_frame = null;
     if (requested.actor != actor_id || requested.owner != game.get_player().id || requested.turn != game.get_turn() || requested.session != session || requested.dialog_generation != height.generation) { throw Error('Queued height observation context changed'); }
     if (requested.scope == 'height') {
      if (!popup.is_shown() || popup.popup.id != 'terraforming_height' || frame != popup.popup.el || frame != watched) { throw Error('Queued height observation Window retired'); }
     } else if (popup.is_shown() || frame != glsmac.ui.root) { throw Error('Queued root observation context changed'); }
     // Owned timer: dispatch has returned, and the snapshot contains all seven
     // players, every tile/unit/base and actual native movement/height policy.
     #print('TH_NATIVE|' + #json_text_exact({query:requested.query,query_owner:requested,ui:read_ui(true),world:observer.read()}));
    }
    #print('TH_TRACE|' + #json_text_exact(glsmac.ui.presentation_trace_drain()));
    if (exit_requested) { #print('TH_EXIT_REQUEST'); glsmac.exit(); return false; }
    return true;
   });
   const worker = actor(); const player = game.get_player();
   const setup = game.get('sea_browser_setup'); const home = game.get_tm().get_tile(10,8).get_base();
   if (!worker.is_water || worker.is_land || !worker.get_def().can_terraform || worker.get_def().id != setup.recipe.id || worker.get_terraform_home() != home.id) { throw Error('Produced sea worker definition/domain/home mismatch'); }
   if (home.get_production().choice_id != setup.resumed_choice || #sizeof(home.get_pops()) < 1) { throw Error('Sea producer did not settle its real project/population'); }
   const base_states = [];
   for (base of game.get_bm().get_bases()) {
    const state = base.get_production();
    if (state.last_processed_turn != 1 || state.choice_id != setup.resumed_choice || #sizeof(base.get_pops()) != 1) { throw Error('A native city has not reached its actual current-turn baseline'); }
    if (state.minerals != (base.id == home.id ? 4 : 0)) { throw Error('Unexpected native city mineral baseline'); }
    base_states :+ {base_id:base.id + 0,owner:base.get_owner().id + 0,population:#sizeof(base.get_pops()),production:state};
   }
   if (#sizeof(base_states) != 7) { throw Error('Seven native city states are required'); }
   const sea_movement = worker.movement;
   #print('TH_SEA_SETUP|' + #json_text_exact({base_states:base_states,declared:setup,home_id:home.id + 0,home_owner:home.get_owner().id + 0,
    home_population:#sizeof(home.get_pops()),production:home.get_production(),actor:actor_id,definition:worker.get_def().id,
    home:worker.get_terraform_home(),is_water:worker.is_water,is_land:worker.is_land,movement:sea_movement}));
   #print('TH_INPUTS|' + #json_text_exact({actor:actor_id,definition:worker.get_def().id,can_terraform:worker.get_def().can_terraform,
    policy:game.get_settings().global.rules.get_terraforming_policy(),starting_credits:game.get('energy_rules').starting_credits,
    faction_bonus:player.get_faction().economy_bonuses.starting_energy,energy:player.get_energy_state(),raise_rule:game.get('terraforming_rules').raise}));
   #print('TH_READY');
   };
   // Native start_ui can precede the first-turn production queue. Wait for its
   // actual native launch and normal project-selection ACK, never spawn a unit
   // or credit production from the presentation observer.
   glsmac.ui.root.timer(100,() => {
    const setup = game.get('sea_browser_setup');
    const home = game.get_tm().get_tile(10,8).get_base();
    if (!resumption_ack || production_acks != 1 || growth_acks != 7 || game.get_turn() != 1 || home == null || home.get_production().choice_id != setup.resumed_choice) { return true; }
    let ready = false;
    for (unit of game.get_tm().get_tile(8,8).get_units()) { if (unit.owner == game.get_player().id && unit.get_def().id == setup.recipe.id && unit.get_terraform_home() == home.id) { ready = true; } }
    if (!ready) { return true; }
    initialize(); return false;
   });
  });
 }); glsmac.run();
});
