// Static candidate observation only. No movement, physical input or renderer replacement.
import {stackOrderWorld} from './unit-stack-order-browser-fixture.mjs';
export const bodyCensusWorld=stackOrderWorld;
export const bodyCensusMain=String.raw`#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const terrain_observer = #include('../tests/_terrain_trace_observer');
 glsmac.on('configure_game',(configured) => {
  const game = configured.game;
  game.on('start_ui',() => {
   if (!#is_defined(glsmac.get_unit_body_census) || #typeof(glsmac.get_unit_body_census) != 'Callable') { throw Error('Native cached-body census API unavailable'); }
   const proxy = {}; proxy.um = game.get_um(); proxy.bm = game.get_bm();
   for (field of ['get_um','get_bm','get_tm','get_players','get_player','get_turn','get_settings','get','is_started','is_turn_complete','get_research_state','get_research_science']) { proxy[field] = game[field]; }
   proxy.technologies = game.technologies;
   let a = null; let b = null; let city_id = null;
   for (unit of game.get_tm().get_tile(8,8).get_units()) {
    if (unit.owner == game.get_player().id && unit.def == 'ScoutPatrol') {
     if (unit.morale == 2) { if (a != null) { throw Error('Ambiguous static Scout A'); } a = unit.id + 0; }
     if (unit.morale == 1) { if (b != null) { throw Error('Ambiguous static Scout B'); } b = unit.id + 0; }
    }
   }
   for (base of game.get_bm().get_bases()) { if (base.get_owner().id == game.get_player().id) { if (city_id != null) { throw Error('Ambiguous readiness city'); } city_id = base.id + 0; } }
   if (a == null || b == null || a == b || city_id == null || game.get_tm().get_tile(8,8).get_base() != null) { throw Error('Missing base-free two-Scout census fixture'); }
   const read_ui = () => {
    let bound = null;
    if (#is_defined(preview.preview) && preview.preview != null) {
     const data = preview.preview.data;
     if (#is_defined(data.unit) && data.unit != null) { bound = data.unit.id + 0; }
    }
    return {bound_unit_id:bound,rendered_unit_id:preview.rendered_unit_id,selected_unit_id:preview.selected_unit_id};
   };
   const observer = terrain_observer(proxy,read_ui);
   let serial = 0; const events = []; let phase = 'ready'; let fence = 0; let selection_fence = null; let tile_event = null; let last_preview = null;
   const record = (kind,data) => {
    serial++; const row = {serial:serial,kind:kind}; row.data = data; events :+ row;
    #print('UB_EVENT|' + #json_text_exact(row));
   };
   game.on('tile_select',(e) => {
    const data = {x:e.tile.x + 0,y:e.tile.y + 0}; record('tile-select',data); tile_event = {serial:serial,x:data.x,y:data.y};
   });
   game.on('unit_select',(e) => { record('unit-select',{unit_id:e.unit.id + 0}); });
   game.get_map().on('unit_preview',(e) => {
    const id = e.unit == null ? null : e.unit.id + 0; record('native-unit-preview',{unit_id:id}); last_preview = {serial:serial,unit_id:id};
   });
   game.on('event_result',(e) => {
    if (#typeof(e.name) != 'String' || #typeof(e.event_id) != 'String' || #typeof(e.caller) != 'Int' || #typeof(e.success) != 'Bool') { throw Error('Unexpected native receipt types'); }
    record('native-event-result',{name:e.name + '',event_id:e.event_id + '',caller:e.caller + 0,success:e.success});
   });
   let failed = null; game.on('error',() => { failed = 'native-game-error'; });
   const ui_matches = () => {
    const ui = read_ui();
    return ui.bound_unit_id == a && ui.rendered_unit_id == a && ui.selected_unit_id == null;
   };
   const capture = (label) => {
    const state = {event_serial:serial,ui:read_ui()};
    state.last_preview = last_preview == null ? null : #clone(last_preview); state.last_tile = tile_event == null ? null : #clone(tile_event);
    const checkpoint = {label:label}; checkpoint.state = state; checkpoint.world = observer.read();
    const scalars = [];
    for (entry of checkpoint.world.units) {
     const unit = game.get_um().get_unit(entry.raw_id);
     scalars :+ {unit_id:unit.id + 0,owner_id:unit.owner + 0,id_type:#typeof(unit.id),owner_type:#typeof(unit.owner),
      health_type:#typeof(unit.health),health_bits:#float_bits(unit.health),movement_type:#typeof(unit.movement),movement_bits:#float_bits(unit.movement)};
    }
    checkpoint.native_unit_scalars = scalars;
    // Immediate serialization; no native world/FloatPtr survives this call.
    #print('UB_CHECKPOINT|' + #json_text_exact(checkpoint)); return state;
   };
   let attempts = 0; let ticks = 0;
   glsmac.ui.root.timer(100,() => {
    ticks++;
    if (failed != null || ticks >= 600) { #print('UB_UNSUPPORTED|' + (failed == null ? 'phase-timeout-' + phase : failed)); glsmac.exit(); return false; }
    if (phase == 'ready') {
     let ready = false; attempts++;
     try { glsmac.focus_owned_base(city_id); ready = true; }
     catch { : (e) => { if (attempts == 1) { #print('UB_READINESS_WAIT|' + e.reason); } } }
     if (ready) { phase = 'warm'; fence = serial; selection_fence = fence; #print('UB_REQUEST|native-tile-select'); game.select_tile(game.get_tm().get_tile(8,8)); }
    } else {
     if (phase == 'warm' && tile_event != null && tile_event.serial > fence && tile_event.x == 8 && tile_event.y == 8 &&
      last_preview != null && last_preview.serial > tile_event.serial && last_preview.unit_id == a && ui_matches()) {
      // One additional application timer turn follows the actual native preview;
      // it is a deferred idle setup barrier, not a native frame/timing receipt.
      phase = 'settled'; fence = serial;
     } else {
      if (phase == 'settled') {
       if (serial != fence || !ui_matches()) { throw Error('Static UI changed before census read boundary'); }
       const before = capture('before');
       for (ordinal of [1,2]) {
        const payload = glsmac.get_unit_body_census(game);
        if (#typeof(payload) != 'String') { throw Error('Census did not return Native String'); }
        const row = {ordinal:ordinal,event_serial:serial,payload:payload,ui:read_ui()};
        #print('UB_CENSUS|' + #json_text_exact(row));
       }
       const after = capture('after');
       if (serial != fence || !ui_matches()) { throw Error('Native callback/UI changed during synchronous census reads'); }
       const result = {schema:'application.unit-body-census-observation.v1',actors:{a:a,b:b,owner:game.get_player().id + 0},selection_fence:selection_fence,fence:fence,reads:2};
       result.events = events; result.before = before; result.after = after;
       #print('UB_RESULT|' + #json_text_exact(result)); glsmac.exit(); return false;
      }
     }
    }
    return true;
   });
   #print('UB_READY|' + #json_text_exact({a:a,b:b,owner:game.get_player().id + 0}));
  });
 }); glsmac.run();
});`;
