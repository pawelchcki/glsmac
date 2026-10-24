// Exporter invariants only: synthetic terrain and two actual native players.
// This does not claim original-game startup parity.
const behavior = #include('./_behavior');
const observer_api = #include('./_state_trace_observer');
behavior.scenario('full native graph snapshots retain foreign entities and stable detached identities', () => {
 const f = test.selection_fixture('Owned Trace Base', 16); f.enable_economy(); f.enable_movement();
 const game = f.game;
 let foreign = null;
 f.with_write(() => {
  foreign = game.um.spawn_unit({owner: game.get_player(0), def: 'Scout', tile: game.tm.get_tile(10, 10), health: 1.0, morale: 1});
  game.bm.spawn_base(game.get_player(0), game.tm.get_tile(10, 10), {name: 'Foreign Trace Base'});
 });
 const observer = observer_api.make(game);
 const bytes = f.snapshot(); const inspected = f.inspect();
 const before = observer.read(); const again = observer.read();
 test.assert(before == again && f.snapshot() == bytes && f.inspect() == inspected, 'Read-only snapshots preserve native codecs, IDs, RNG, events and updates');
 test.assert(#sizeof(before.players) == 2, 'Both actual native participants are exported');
 test.assert(#sizeof(before.units) == 2 && #sizeof(before.bases) == 2, 'All actual native units and bases are exported');
 let foreign_logical = ''; let owned_logical = '';
 for (u of before.units) {
  if (u.raw_id == foreign.id) { foreign_logical = u.id; test.assert(u.owner == 'native-player:0' && u.x == 10 && u.y == 10); }
  else { owned_logical = u.id; test.assert(u.owner == 'native-player:1'); }
 }
 test.assert(foreign_logical != '' && owned_logical != '', 'Foreign offscreen inventory has no owner/visibility filter');
 f.with_write(() => { foreign.move_to_tile(game.tm.get_tile(12, 10), () => {}); }); f.finish_unit_move(foreign.id);
 const moved = observer.read();
 let seen = false;
 for (u of moved.units) { if (u.raw_id == foreign.id) { seen = true; test.assert(u.id == foreign_logical && u.x == 12 && u.y == 10, 'Movement retains persistent logical identity'); } }
 test.assert(seen && before == again, 'Stored snapshots remain detached after native mutation');
 game.register_event('move_unit', #include('../default/game/event/move_unit'));
 const destination = observer_api.destination(foreign, 'E');
 const request = {}; request.unit = foreign; request.tile = destination;
 game.event('move_unit', request); f.process_events(); f.finish_unit_move(foreign.id);
 const commanded = observer.read();
 for (u of commanded.units) {
  if (u.raw_id == foreign.id) {
   test.assert(u.id == foreign_logical && u.x == 14 && u.y == 10 && u.movement == 0.0, 'Shared destination lookup executes a real directional command and movement cost');
  }
 }
 const foreign_id = foreign.id + 0;
 f.with_write(() => { game.um.despawn_unit(foreign_id); });
 const removed = observer.read();
 test.assert(#sizeof(removed.units) == 1 && removed.units[0].id == owned_logical, 'Removal is observable without rekeying survivors');
 f.with_write(() => { game.um.spawn_unit({id: foreign_id, owner: game.get_player(0), def: 'Scout', tile: game.tm.get_tile(10, 10), health: 1.0, morale: 1}); });
 const born = observer.read();
 test.assert(#sizeof(born.units) == 2, 'New native entity appears even when its raw handle is reused');
 for (u of born.units) { if (u.owner == 'native-player:0') { test.assert(u.id != foreign_logical && u.id == 'unit:native-player:0:scout-patrol:10:10:1', 'Delete/recreate at original position receives a new birth ordinal'); } }
});
