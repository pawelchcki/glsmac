// The actual frontend calls this same native consumer before ordinary input.
// These asset-free checks cover the dispatcher/real native tile boundary;
// actual map pointer routing is a separate browser acceptance gate.
return (behavior) => {
 behavior.scenario('native pointer target dispatch requires dedicated Bool ownership and preserves every participant graph', () => {
  const f = test.natural_startup_fixture(16, 16, 'flat-arid'); const game = f.game;
  #include('./_natural_startup_mechanics')(f);
  f.initialize_single_player('GAIANS', 'Citizen'); f.start_world();
  test.assert(#sizeof(game.get_players()) == 7 && #sizeof(game.get_bm().get_bases()) == 7);
  let base = null;
  for (candidate of game.get_bm().get_bases()) { if (candidate.get_owner().id == game.get_player().id) { base = candidate; } }
  let empty = null;
  for (let y = 0; y < 16; y++) {
   for (let x = y % 2; x < 16; x = x + 2) {
    const tile = game.get_tm().get_tile(x, y);
    if (empty == null && tile.get_base() == null && #sizeof(tile.get_units()) == 0) { empty = tile; }
   }
  }
  test.assert(base != null && empty != null);
  const occupied = base.get_tile(); const before = f.audit_snapshot(); const bookkeeping = f.audit_inspect();
  const state = {diagnostic_calls: 0, calls: [], consume: false};
  const diagnostic = game.on('*', (e) => { state.diagnostic_calls = state.diagnostic_calls + 1; });
  test.assert(!f.dispatch_tile_target(empty.x, empty.y, 'object') && state.diagnostic_calls == 0,
   'An absent dedicated handler leaves ordinary pointer input untouched even with catch-all diagnostics');
  const handler = game.on('tile_target', (e) => {
   test.assert(#classof(e.tile) == 'Tile');
   state.calls :+ {x: e.tile.x + 0, y: e.tile.y + 0, has_base: e.tile.get_base() != null};
   return state.consume;
  });
  test.assert(!f.dispatch_tile_target(empty.x, empty.y, 'unit') && !f.dispatch_tile_target(occupied.x, occupied.y, 'tile'));
  test.assert(#sizeof(state.calls) == 0, 'Programmatic tile selection and ordinary unit navigation are not pointer targets');
  test.assert(!f.dispatch_tile_target(empty.x, empty.y, 'object') && #sizeof(state.calls) == 1);
  state.consume = true;
  test.assert(f.dispatch_tile_target(empty.x, empty.y, 'object') && f.dispatch_tile_target(occupied.x, occupied.y, 'object'));
  test.assert(state.calls[1] == {x: empty.x + 0, y: empty.y + 0, has_base: false});
  test.assert(state.calls[2] == {x: occupied.x + 0, y: occupied.y + 0, has_base: true});
  game.off('tile_target', handler);
  test.assert(!f.dispatch_tile_target(occupied.x, occupied.y, 'object') && #sizeof(state.calls) == 3,
   'Removed target ownership cannot consume later map/city selections');
  const malformed = game.on('tile_target', (e) => { return 'yes'; }); let rejected = false;
  try { f.dispatch_tile_target(empty.x, empty.y, 'object'); } catch { : (e) => { rejected = true; } }
  test.assert(rejected, 'Truthy strings are not an input-consumption Bool'); game.off('tile_target', malformed);
  game.off('*', diagnostic);
  test.assert(f.audit_snapshot() == before && f.audit_inspect() == bookkeeping,
   'Target dispatch itself cannot mutate any of seven owners, units, bases, research, treasury, terrain or queues');
 });
};
