// SOURCE-ONLY controlled native health update; no combat/original/render oracle.
import {stackOrderWorld} from './unit-stack-order-browser-fixture.mjs';

export const stackHealthWorld=stackOrderWorld;
export const stackHealthMain=String.raw`#main((glsmac) => {
 #include('game/game')(glsmac); #include('ui/ui')(glsmac);
 const preview = #include('ui/parts/game/bottom_bar/object_preview');
 const terrain_observer = #include('../tests/_terrain_trace_observer');
 glsmac.on('configure_game',(configured) => {
  const game = configured.game;
  const control = #include('../tests/_unit_stack_health_control')(game);
  const command = control.command; const nonce = control.nonce;
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
   if (a == null || b == null || a == b || city_id == null || game.get_tm().get_tile(8,8).get_base() != null) { throw Error('Missing base-free two-Scout health fixture'); }
   control.bind_actor(a);
   const read_ui = () => {
    let bound = null;
    if (#is_defined(preview.preview) && preview.preview != null) {
     const data = preview.preview.data;
     if (#is_defined(data.unit) && data.unit != null) { bound = data.unit.id + 0; }
    }
    return {bound_unit_id:bound,rendered_unit_id:preview.rendered_unit_id,selected_unit_id:preview.selected_unit_id};
   };
   const observer = terrain_observer(proxy,read_ui);
   let serial = 0; const events = []; let phase = 'ready'; let fence = 0; let tile_event = null; let last_preview = null; let health_receipt = null;
   const record = (kind,data) => {
    serial++; const row = {serial:serial,kind:kind}; row.data = data; events :+ row;
    #print('UH_EVENT|' + #json_text_exact(row));
   };
   game.on('tile_select',(e) => {
    const data = {x:e.tile.x + 0,y:e.tile.y + 0}; record('tile-select',data); tile_event = {serial:serial,x:data.x,y:data.y};
   });
   game.on('unit_select',(e) => { record('unit-select',{unit_id:e.unit.id + 0}); });
   game.get_map().on('unit_preview',(e) => {
    const id = e.unit == null ? null : e.unit.id + 0; record('native-unit-preview',{unit_id:id}); last_preview = {serial:serial,unit_id:id};
   });
   game.on('event_result',(e) => {
    if (e.name == command) {
     if (#typeof(e.name) != 'String' || #typeof(e.event_id) != 'String' || #typeof(e.caller) != 'Int' || #typeof(e.success) != 'Bool' ||
      #typeof(e.data.unit_id) != 'Int' || #typeof(e.data.owner_id) != 'Int' || #typeof(e.data.turn) != 'Int' || #typeof(e.data.previous_health_bits) != 'Int' || #typeof(e.data.health) != 'Float' || #typeof(e.data.nonce) != 'String') { throw Error('Unexpected native health receipt identity types'); }
     const data = {name:e.name + '',event_id:e.event_id + '',caller:e.caller + 0,success:e.success,
      unit_id:e.data.unit_id + 0,owner_id:e.data.owner_id + 0,turn:e.data.turn + 0,previous_health_bits:e.data.previous_health_bits + 0,
      health_type:#typeof(e.data.health),health_bits:#float_bits(e.data.health),nonce:e.data.nonce + ''};
     record('native-health-result',data); health_receipt = data;
    }
   });
   let failed = null; game.on('error',() => { failed = 'native-game-error'; });
   let attempts = 0; let ticks = 0; let warm = null; let after_health = null; let warm_tile = null; let refreshed_preview = null;
   const capture = (label) => {
    const counts = control.counts();
    const state = {event_serial:serial,ui:read_ui(),applied_count:counts.applied,rollback_count:counts.rolled_back};
    state.last_preview = last_preview == null ? null : #clone(last_preview); state.last_tile = tile_event == null ? null : #clone(tile_event);
    const checkpoint = {label:label}; checkpoint.state = state; checkpoint.world = observer.read();
    const scalars = [];
    for (entry of checkpoint.world.units) {
     const unit = game.get_um().get_unit(entry.raw_id);
     scalars :+ {unit_id:unit.id + 0,owner_id:unit.owner + 0,id_type:#typeof(unit.id),owner_type:#typeof(unit.owner),
      health_type:#typeof(unit.health),health_bits:#float_bits(unit.health),movement_type:#typeof(unit.movement),movement_bits:#float_bits(unit.movement)};
    }
    checkpoint.native_unit_scalars = scalars;
    // Serialize NOW, while every FloatPtr refers to this boundary. No native
    // wrapper/FloatPtr observation is retained across the health action.
    #print('UH_CHECKPOINT|' + #json_text_exact(checkpoint)); return state;
   };
   glsmac.ui.root.timer(100,() => {
    ticks++;
    if (failed != null || ticks >= 600) { #print('UH_UNSUPPORTED|' + (failed == null ? 'phase-timeout-' + phase : failed)); glsmac.exit(); return false; }
    if (phase == 'ready') {
     let ready = false; attempts++;
     try { glsmac.focus_owned_base(city_id); ready = true; }
     catch { : (e) => { if (attempts == 1) { #print('UH_READINESS_WAIT|' + e.reason); } } }
     if (ready) { phase = 'warm'; fence = serial; #print('UH_REQUEST|warm-native-tile-select'); game.select_tile(game.get_tm().get_tile(8,8)); }
    } else {
     const ui = read_ui();
     if (phase == 'warm' && tile_event != null && tile_event.serial > fence && tile_event.x == 8 && tile_event.y == 8 &&
      last_preview != null && last_preview.serial > tile_event.serial && last_preview.unit_id == a && ui.bound_unit_id == a && ui.rendered_unit_id == a && ui.selected_unit_id == null) {
      warm = capture('warm'); warm_tile = #clone(tile_event); phase = 'health'; fence = serial;
      const owner = game.get_player().id + 0; const turn = game.get_turn() + 0;
      #print('UH_REQUEST|declared-native-health-fixture-event');
      game.event(command,{unit_id:a,owner_id:owner,turn:turn,previous_health_bits:1065353216,health:0.5,nonce:nonce});
     } else {
      if (phase == 'health' && health_receipt != null && last_preview != null && last_preview.serial > fence &&
       health_receipt.success && health_receipt.unit_id == a && health_receipt.caller == game.get_player().id) {
       refreshed_preview = #clone(last_preview); after_health = capture('after_health'); phase = 'reselect'; fence = serial;
       #print('UH_REQUEST|reselect-native-tile'); game.select_tile(game.get_tm().get_tile(8,8));
      } else {
       if (phase == 'reselect' && tile_event != null && tile_event.serial > fence && tile_event.x == 8 && tile_event.y == 8 &&
        last_preview != null && last_preview.serial > tile_event.serial && ui.bound_unit_id == last_preview.unit_id && ui.rendered_unit_id == last_preview.unit_id && ui.selected_unit_id == null) {
        const final = capture('final'); const owner = game.get_player().id + 0;
        const result = {schema:'application.unit-stack-health-observation.v1',actors:{a:a,b:b,owner:owner},
         warm_tile:warm_tile,refresh_preview:refreshed_preview,health_receipt:health_receipt};
        result.events = events; result.warm = warm; result.after_health = after_health; result.final = final;
        #print('UH_RESULT|' + #json_text_exact(result)); glsmac.exit(); return false;
       }
      }
     }
    }
    return true;
   });
   #print('UH_READY|' + #json_text_exact({a:a,b:b,owner:game.get_player().id + 0,command:command,nonce:nonce}));
  });
 }); glsmac.run();
});`;
