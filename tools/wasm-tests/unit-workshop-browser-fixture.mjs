// Synthetic inputs and read-only observation. No original-game oracle, copied
// artwork, production callback replacement or hand-authored layout coordinates.
export const workshopWorld=String.raw`return (game) => {
 const rules = game.get('starting_unit_rules');
 let initial = null;
 for (rule of rules) { if (rule.id == 'ScoutPatrol') { initial = rule.choice + ''; } }
 if (initial == null) { throw Error('Workshop fixture needs the actual source Scout recipe'); }
 game.get_bm().on('base_spawn',(e) => { if (e.base.get_size() == 0) { e.base.create_pop({type:'DOCTOR'}); } });
 let index = 0;
 for (player of game.get_players()) {
  const tile = game.get_tm().get_tile(index * 2,2);
  const credits = game.get('energy_rules').starting_credits + player.get_faction().economy_bonuses.starting_energy;
  game.event('initialize_energy',{player_id:player.id + 0,credits:credits});
  // Explicit fixture inventory: registered source recipes; no technology,
  // component, price or prototype arithmetic is replaced by the test.
  for (rule of rules) {
   game.event('add_production_choice',{player:player,id:rule.choice,
    data:{type:'unit',id:rule.id,cost:rule.rows * 10,cost_rows:rule.rows,population_cost:rule.population}});
  }
  const sea = game.get('sea_former_rule');
  if (sea != null) { game.event('add_production_choice',{player:player,id:sea.choice,
   data:{type:'unit',id:sea.id,cost:sea.rows * 10,cost_rows:sea.rows,population_cost:sea.population}}); }
  game.event('spawn_base',{owner:player,tile:tile,facilities:['HEADQUARTERS'],production_choice:initial});
  game.event('spawn_unit',{type:'ScoutPatrol',owner:player,tile:tile,morale:2,health:1.0}); index++;
 }
 if (index != 7) { throw Error('Workshop browser fixture requires seven native owners'); }
 game.event('spawn_unit',{type:'Formers',owner:game.get_player(),tile:game.get_tm().get_tile(8,8),morale:2,health:1.0});
};`;

export const workshopMain=String.raw`#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const screen = #include('ui/parts/game/popup/base_screen');
 const popup = #include('ui/parts/game/popup/popup');
 const terrain_observer = #include('../tests/_terrain_trace_observer');
 const source_reader = #include('../tests/_unit_workshop_reader');
 glsmac.on('configure_game',(configured) => {
  const game = configured.game; const receipts = [];
  game.on('event_result',(e) => {
   if (#typeof(e.name) != 'String' || #typeof(e.event_id) != 'String' || #typeof(e.caller) != 'Int' || #typeof(e.success) != 'Bool') {
    throw Error('Unexpected native event receipt scalar types');
   }
   if (#sizeof(receipts) == 0) { #print('WS_RECEIPT_TYPES|' + #json_text_exact({name:#typeof(e.name),event_id:#typeof(e.event_id),caller:#typeof(e.caller),success:#typeof(e.success)})); }
   // Opaque native transaction token, distinct from Int entity handles and
   // source definition/production String IDs. Preserve the complete token.
   const row = {name:e.name + '',event_id:e.event_id + '',caller:e.caller + 0,success:e.success == true};
   receipts :+ row; #print('WS_RECEIPT|' + #json_text_exact(row));
   if (!e.success) { #print('WS_ERROR|event-rejected'); }
  });
  game.on('error',() => { #print('WS_ERROR|native-game'); });
  game.on('start_ui',() => {
   const proxy = {}; proxy.um = game.get_um(); proxy.bm = game.get_bm();
   for (field of ['get_um','get_bm','get_tm','get_players','get_player','get_turn','get_settings','get','is_started','is_turn_complete','get_research_state','get_research_science']) { proxy[field] = game[field]; }
   proxy.technologies = game.technologies;
   glsmac.ui.presentation_trace_start(); glsmac.ui.presentation_trace_inputs_start();
   // A separate declared pixel control loads the same installed component
   // through the normal asset loader. It never supplies an input target or
   // replaces any Workshop widget, model, renderer or palette.
   const pixel_control = glsmac.ui.root.panel({align:'top right',right:8,top:8,width:100,height:75,background:'black',zindex:0.99});
   const pixel_surface = pixel_control.surface({left:0,top:0,width:100,height:75,background:'VT.cvr'});
   pixel_surface.presentation_role('workshop-pixel-control','VT.cvr');
   let base_id = null;
   for (base of game.get_bm().get_bases()) { if (base.get_owner().id == game.get_player().id) { if (base_id != null) { throw Error('Expected exactly one local browser city'); } base_id = base.id + 0; } }
   if (base_id == null) { throw Error('Missing local browser city'); }
   const find_base = () => { for (base of game.get_bm().get_bases()) { if (base.id == base_id) { return base; } } throw Error('Browser city retired'); };
   // Normal installed-source loader, identical API/domain as game setup.
   // Weapon table positions belong to this input, not a compact test fixture.
   const document = glsmac.load_smac_text('alphax.txt','rules');
   let former_weapon_source = null;
   for (rule of game.get('starting_unit_rules')) {
    if (rule.id == 'Formers') {
     if (former_weapon_source != null) { throw Error('Ambiguous source Former rule'); }
     former_weapon_source = source_reader.weapon_profile(rule,document.rows('UNITS'),document.rows('WEAPONS'));
    }
   }
   if (former_weapon_source == null) { throw Error('Missing source Former rule'); }
   let tagged_base_frame = null; let tagged_base_owner = null; let tagged_base_id = null; let base_bar_session = 0; let base_bar_source = null;
   const read_ui = () => {
    const result = {base_open:screen.is_open,base_id:screen.base_id,production_open:screen.production_selection != null,
     popup_sliding:popup.sliding_timer != null,popup_hiding:popup.popup_hiding,
     draft:screen.production_choices == null ? null : screen.production_choices.value + '',
     workshop_open:screen.workshop != null && screen.workshop.dialog != null,workshop_selected:null,workshop_token:null,
     viewport:{width:glsmac.ui.get_width(),height:glsmac.ui.get_height()},receipts:#sizeof(receipts),choices:[],rules:[],native_quotes:{},quote_ids:[],former_weapon_source:#clone(former_weapon_source),
     base_bar_scope:{base_id:tagged_base_id,session:base_bar_session,source:base_bar_source}};
    if (result.workshop_open) {
     const dialog = screen.workshop.dialog;
     result.workshop_selected = dialog.choices == null ? null : dialog.choices.value + '';
     result.workshop_token = screen.workshop.session.token + 0;
    }
    const base = find_base(); const owner = base.get_owner();
    for (choice of owner.get_production_choices()) {
     if (choice.type == 'unit') {
      result.choices :+ {id:choice.id + '',unit_id:choice.unit_id + '',name:choice.name + '',cost:choice.cost + 0};
     }
    }
    // Global owner inventory is retained. A native per-city rejection is
    // observed separately, including its reason, without filtering any row.
    const quotes = source_reader.quote_choices(base,result.choices);
    result.native_quotes = quotes.by_id; result.quote_ids = quotes.ids;
    for (rule of game.get('starting_unit_rules')) { result.rules :+ #clone(rule); }
    const sea = game.get('sea_former_rule'); if (sea != null) { result.rules :+ #clone(sea); }
    return result;
   };
   const observer = terrain_observer(proxy,read_ui);
   const query_queue = #include('../tests/_unit_workshop_query')(); let pending_query_frame = null; let exit_requested = false; let refresh_armed = false; let refresh_wait = 0;
   let watched_base = null; let watched_workshop = null; let watched_production = null; let tagged_production = null; let watch_serial = 0;
   const watch = (frame,scope) => {
    watch_serial++; const token = watch_serial;
    const kind = scope == 'production' ? 'WS_PANE' : 'WS_WINDOW';
    const source = scope == 'production' ? 'production:' + #to_string(token) : '';
    if (scope == 'production') {
     frame.presentation_role('workshop-observer-pane',source);
     popup.popups.base_screen.el.presentation_part(frame,'workshop-observer-pane');
    }
    #print(kind + '|' + #json_text_exact({kind:'attached',scope:scope,token:token,source:source}));
    // The actual base Window, production pane and Workshop Window handlers
    // already return true unconditionally. Native child-first dispatch stops at
    // the consumer; all ordered callbacks on that same node still run. Append
    // this listener and preserve its true result for every ordinary key.
    frame.on('keydown',(e) => {
     if (e.modifiers == {ctrl:true,alt:true}) {
      if (e.code == 'P') {
       const current_base_id = screen.base_id + 0; const owner_session = base_bar_session;
       if (query_queue.request({scope:scope,token:token,base_id:current_base_id,owner_session:owner_session,source:source})) { pending_query_frame = frame; }
      }
      if (e.code == 'J') { refresh_armed = true; #print('WS_ARMED|' + #to_string(token)); }
      if (e.code == 'Q') { exit_requested = true; }
     }
     return true;
    });
    frame.on('remove',() => {
     #print(kind + '|' + #json_text_exact({kind:'removed',scope:scope,token:token,source:source}));
     if (scope == 'base' && watched_base == frame) { watched_base = null; }
     if (scope == 'workshop' && watched_workshop == frame) { watched_workshop = null; }
     if (scope == 'production' && watched_production == frame) { watched_production = null; }
    });
   };
   let focused = false; let focus_attempts = 0; let serial = 0; let last_ui = '';
   glsmac.ui.root.timer(100,() => {
    if (!focused) {
     focus_attempts++;
     try { const point = glsmac.focus_owned_base(base_id); focused = true; #print('WS_BASE_POINT|' + #json_text_exact(point)); }
     catch { : (e) => { if (focus_attempts == 1) { #print('WS_FOCUS_WAIT|' + e.reason); } } }
     if (!focused && focus_attempts >= 600) { throw Error('Rendered city never became focusable within startup budget'); }
    }
    // The real base production queue belongs to a root-level area, a
    // sibling of the Window. Observe that exact owned native scope separately.
    if (screen.is_open) {
     if (screen.sections.bottom_bar.frame != tagged_base_frame || screen.base_id != tagged_base_id || popup.popups.base_screen.el != tagged_base_owner) {
      tagged_base_frame = screen.sections.bottom_bar.frame; tagged_base_owner = popup.popups.base_screen.el; tagged_base_id = screen.base_id + 0;
      base_bar_session++; base_bar_source = 'game.popup.base_screen:' + #to_string(tagged_base_id) + ':' + #to_string(base_bar_session);
      tagged_base_frame.presentation_role('workshop-base-bar',base_bar_source);
      tagged_base_owner.presentation_part(tagged_base_frame,'workshop-base-bar');
     }
    } else { tagged_base_frame = null; tagged_base_owner = null; tagged_base_id = null; base_bar_source = null; }
    if (screen.is_open && popup.popups.base_screen.el != watched_base) {
     watched_base = popup.popups.base_screen.el; watch(watched_base,'base');
    }
    if (screen.production_selection != null && screen.production_selection != watched_production) {
     watched_production = screen.production_selection; watch(watched_production,'production');
    }
    const workshop = screen.workshop == null ? null : screen.workshop.dialog;
    if (workshop != null && workshop.frame != watched_workshop) {
     watched_workshop = workshop.frame; watch(watched_workshop,'workshop');
     if (workshop.choices != null) { workshop.choices.presentation_role('workshop-list','designs'); }
    }
    if (screen.production_choices != null && screen.production_choices != tagged_production) {
     tagged_production = screen.production_choices; tagged_production.presentation_role('workshop-list','production');
    }
    const ui = read_ui(); const ui_text = #json_text_exact(ui);
    if (ui_text != last_ui) { serial++; last_ui = ui_text; #print('WS_STATE|' + #json_text_exact({serial:serial,ui:ui})); }
    const requested = query_queue.take();
    if (requested != null) {
     const observed_frame = pending_query_frame; pending_query_frame = null;
     const expected_scope = ui.workshop_open ? 'workshop' : (ui.production_open ? 'production' : 'base');
     if (!ui.base_open || requested.base_id != ui.base_id || requested.owner_session != base_bar_session || requested.scope != expected_scope) { throw Error('Queued Workshop query context changed before capture'); }
     if ((requested.scope == 'base' && observed_frame != watched_base) ||
      (requested.scope == 'production' && (observed_frame != watched_production || observed_frame != screen.production_selection)) ||
      (requested.scope == 'workshop' && (observed_frame != watched_workshop || workshop == null || observed_frame != workshop.frame))) { throw Error('Queued Workshop query Native frame retired before capture'); }
     // This owned timer executes after dispatch. Native handles were kept out
     // of the scalar queue; one native ingress is correlated by the browser.
     #print('WS_NATIVE|' + #json_text_exact({query:requested.query,query_observer:requested,serial:serial,ui:ui,world:observer.read()}));
    }
    if (refresh_armed && workshop != null) {
     refresh_wait++;
     if (refresh_wait >= 3) {
      refresh_armed = false; refresh_wait = 0;
      #print('WS_CONTEXT|' + #json_text_exact({kind:'native-select-same-base',base_id:base_id}));
      // Declared fixture invalidation through the actual native frontend path;
      // do not call screen.set(), hide(), choose() or any production callback.
      game.select_base(find_base());
     }
    }
    #print('WS_TRACE|' + #json_text_exact(glsmac.ui.presentation_trace_drain()));
    if (exit_requested) { #print('WS_EXIT_REQUEST'); glsmac.exit(); return false; }
    return true;
   });
   #print('WS_READY');
  });
 }); glsmac.run();
});`;
