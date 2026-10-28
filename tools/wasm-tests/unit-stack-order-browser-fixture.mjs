// Independent candidate graphics observation. This never changes the Workshop
// acceptance freeze, unit priority policy, original observations or C++.
import assert from 'node:assert/strict';
import {workshopWorld} from './unit-workshop-browser-fixture.mjs';

const actor=" game.event('spawn_unit',{type:'Formers',owner:game.get_player(),tile:game.get_tm().get_tile(8,8),morale:2,health:1.0});";
assert.equal(workshopWorld.split(actor).length,2,'One declared actor input must be replaced, not arbitrary production code');
export const stackOrderWorld=workshopWorld.replace(actor,
  " game.event('spawn_unit',{type:'ScoutPatrol',owner:game.get_player(),tile:game.get_tm().get_tile(8,8),morale:2,health:1.0});\n"+
  " game.event('spawn_unit',{type:'ScoutPatrol',owner:game.get_player(),tile:game.get_tm().get_tile(8,8),morale:1,health:1.0});");

export const stackOrderMain=String.raw`#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const terrain_observer = #include('../tests/_terrain_trace_observer');
 glsmac.on('configure_game',(configured) => {
  const game = configured.game;
  game.on('start_ui',() => {
   const proxy = {}; proxy.um = game.get_um(); proxy.bm = game.get_bm();
   for (field of ['get_um','get_bm','get_tm','get_players','get_player','get_turn','get_settings','get','is_started','is_turn_complete','get_research_state','get_research_science']) { proxy[field] = game[field]; }
   proxy.technologies = game.technologies;
   let a = null; let b = null; let city_id = null;
   for (unit of game.get_tm().get_tile(8,8).get_units()) {
    if (unit.owner == game.get_player().id && unit.def == 'ScoutPatrol') {
     if (unit.morale == 2) { if (a != null) { throw Error('Ambiguous Scout A'); } a = unit.id + 0; }
     if (unit.morale == 1) { if (b != null) { throw Error('Ambiguous Scout B'); } b = unit.id + 0; }
    }
   }
   for (base of game.get_bm().get_bases()) { if (base.get_owner().id == game.get_player().id) { if (city_id != null) { throw Error('Ambiguous local readiness city'); } city_id = base.id + 0; } }
   if (a == null || b == null || a == b || city_id == null || game.get_tm().get_tile(8,8).get_base() != null) { throw Error('Missing base-free two-Scout graphics fixture'); }
   const read_ui = () => {
    let bound = null;
    if (#is_defined(preview.preview) && preview.preview != null) {
     const data = preview.preview.data;
     if (#is_defined(data.unit) && data.unit != null) { bound = data.unit.id + 0; }
    }
    return {bound_unit_id:bound,rendered_unit_id:preview.rendered_unit_id,selected_unit_id:preview.selected_unit_id,
     rendered_order:#is_defined(preview.rendered_order) ? preview.rendered_order + '' : null,
     order_focus_id:preview.order_focus_id};
   };
   const observer = terrain_observer(proxy,read_ui);
   let serial = 0; const events = []; let phase = 'ready'; let fence = 0; let tile_event = null; let last_preview = null; let hold_receipt = null;
   const record = (kind,data) => {
    serial++; const row = {serial:serial,kind:kind}; row.data = data; events :+ row;
    #print('UO_EVENT|' + #json_text_exact(row));
   };
   game.on('tile_select',(e) => {
    const data = {x:e.tile.x + 0,y:e.tile.y + 0}; record('tile-select',data);
    tile_event = {serial:serial,x:data.x,y:data.y};
   });
   game.on('unit_select',(e) => { record('unit-select',{unit_id:e.unit.id + 0}); });
   game.get_map().on('unit_preview',(e) => {
    const id = e.unit == null ? null : e.unit.id + 0; record('native-unit-preview',{unit_id:id});
    last_preview = {serial:serial,unit_id:id};
   });
   game.on('event_result',(e) => {
    if (e.name == 'unit_hold') {
     if (#typeof(e.event_id) != 'String' || #typeof(e.caller) != 'Int' || #typeof(e.success) != 'Bool' || #typeof(e.data.unit_id) != 'Int') { throw Error('Unexpected native Hold receipt identity types'); }
     const data = {name:e.name + '',event_id:e.event_id + '',caller:e.caller + 0,success:e.success,unit_id:e.data.unit_id + 0};
     record('native-hold-result',data); hold_receipt = data;
    }
   });
   let failed = null; game.on('error',() => { failed = 'native-game-error'; });
   let attempts = 0; let ticks = 0; let warm = null; let after_hold = null; let warm_tile = null; let refreshed_preview = null;
   const capture = (label) => {
    const state = {event_serial:serial,ui:read_ui()};
    state.last_preview = last_preview == null ? null : #clone(last_preview);
    state.last_tile = tile_event == null ? null : #clone(tile_event);
    // Serialize the complete world NOW. Do not retain native FloatPtr-backed
    // observation values across later actions and accidentally re-read them.
    const checkpoint = {label:label}; checkpoint.state = state; checkpoint.world = observer.read();
    #print('UO_CHECKPOINT|' + #json_text_exact(checkpoint)); return state;
   };
   glsmac.ui.root.timer(100,() => {
    ticks++;
    if (failed != null || ticks >= 600) { #print('UO_UNSUPPORTED|' + (failed == null ? 'phase-timeout-' + phase : failed)); glsmac.exit(); return false; }
    if (phase == 'ready') {
     let ready = false; attempts++;
     try { glsmac.focus_owned_base(city_id); ready = true; }
     catch { : (e) => { if (attempts == 1) { #print('UO_READINESS_WAIT|' + e.reason); } } }
     if (ready) {
      phase = 'warm'; fence = serial;
      #print('UO_REQUEST|warm-native-tile-select');
      game.select_tile(game.get_tm().get_tile(8,8));
     }
    } else {
     const ui = read_ui();
     if (phase == 'warm' && tile_event != null && tile_event.serial > fence && tile_event.x == 8 && tile_event.y == 8 &&
      last_preview != null && last_preview.serial > tile_event.serial && last_preview.unit_id == a &&
      ui.bound_unit_id == a && ui.rendered_unit_id == a && ui.selected_unit_id == null) {
      warm = capture('warm'); warm_tile = #clone(tile_event);
      const first = game.get_um().get_unit(a); const second = game.get_um().get_unit(b);
      if (first.get_order() != 'NO_ORDERS' || second.get_order() != 'NO_ORDERS' || first.health != 1.0 || second.health != 1.0 || first.movement != 1.0 || second.movement != 1.0) { throw Error('Uncontrolled live Scout state before Hold'); }
      phase = 'hold'; fence = serial;
      #print('UO_REQUEST|legitimate-native-hold'); game.event('unit_hold',{unit_id:a});
     } else {
      if (phase == 'hold' && hold_receipt != null && last_preview != null && last_preview.serial > fence &&
       hold_receipt.success && hold_receipt.unit_id == a && hold_receipt.caller == game.get_player().id) {
       // The NEW map preview comes from FR_UNIT_UPDATE -> Unit::Refresh ->
       // RenderTile -> UpdatePreviews, not the independent GSE label timer.
       refreshed_preview = #clone(last_preview); after_hold = capture('after_hold');
       phase = 'reselect'; fence = serial;
       #print('UO_REQUEST|reselect-native-tile'); game.select_tile(game.get_tm().get_tile(8,8));
      } else {
       if (phase == 'reselect' && tile_event != null && tile_event.serial > fence && tile_event.x == 8 && tile_event.y == 8 &&
        last_preview != null && last_preview.serial > tile_event.serial &&
        ui.bound_unit_id == last_preview.unit_id && ui.rendered_unit_id == last_preview.unit_id && ui.selected_unit_id == null) {
        const final = capture('final'); const owner = game.get_player().id + 0;
        const result = {schema:'application.unit-stack-order-observation.v1',actors:{a:a,b:b,owner:owner},
         warm_tile:warm_tile,refresh_preview:refreshed_preview,hold_receipt:hold_receipt};
        result.events = events; result.warm = warm; result.after_hold = after_hold; result.final = final;
        #print('UO_RESULT|' + #json_text_exact(result));
        // A stale result is still retained completely. The external evaluator
        // reports the mismatch; this fixture never substitutes the expected ID.
        glsmac.exit(); return false;
       }
      }
     }
    }
    return true;
   });
   #print('UO_READY|' + #json_text_exact({a:a,b:b,owner:game.get_player().id + 0}));
  });
 }); glsmac.run();
});`;
