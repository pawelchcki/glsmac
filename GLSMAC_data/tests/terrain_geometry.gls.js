const behavior = #include('./_behavior');
const directions = ['W','NW','N','NE','E','SE','S','SW'];
const check = (tm,x,y) => {
 const raw = tm.get_terrain_state(x,y); const geometry = tm.get_terrain_geometry(x,y);
 test.assert(#typeof(geometry) == 'Array' && #sizeof(geometry) == 7 && geometry[0] == 1);
 for (index of [0,1,2,3,5]) { test.assert(#typeof(geometry[index]) == 'Int'); }
 test.assert(#typeof(geometry[4]) == 'Bool' && geometry[1] == raw.x && geometry[2] == raw.y && geometry[3] == raw.elevation.center && geometry[4] == raw.is_water);
 test.assert(geometry[5] == 4096 && #typeof(geometry[6]) == 'Array' && #sizeof(geometry[6]) == 8,'Metadata retains the unchanged actual native terrain patch limit');
 let index = 0;
 for (direction of directions) {
  const neighbor = raw.neighbors[direction]; const pair = geometry[6][index];
  if (neighbor == null) { test.assert(pair == null); }
  else { test.assert(#typeof(pair) == 'Array' && #sizeof(pair) == 2 && #typeof(pair[0]) == 'Int' && #typeof(pair[1]) == 'Int' && pair[0] == neighbor.x && pair[1] == neighbor.y); }
  index++;
 }
 return geometry;
};
behavior.scenario('compact native geometry preserves imported canonical and bound integer centers adjacency and detached values',() => {
 const f = test.founding_fixture(); f.enable_economy(); f.configure('imported_arid'); const tm = f.game.get_tm();
 const original = f.snapshot(); const terrain = f.terrain_snapshot(); const imported = check(tm,2,2);
 test.assert(imported[3] == 2467 && !imported[4]);
 for (y of [0,1,2,3]) { for (let x = y % 2; x < 4; x = x + 2) { check(tm,x,y); } }
 test.assert(f.snapshot() == original && f.terrain_snapshot() == terrain,'All geometry queries preserve native graph and RNG');
 for (height of [(0-3500),(0-1),0,1,3500]) {
  let receipt = 0;
  f.with_write(() => { receipt = tm.apply_terrain([{x:0,y:2,canonical:{elevation:height,is_water:height < 0}}],[]); });
  const before = f.snapshot(); const tiles = f.terrain_snapshot(); const actual = check(tm,0,2);
  test.assert(actual[3] == height && actual[4] == (height < 0) && f.snapshot() == before && f.terrain_snapshot() == tiles);
  actual[1] = 999; actual[6][0][0] = 999;
  const again = tm.get_terrain_geometry(0,2);
  test.assert(again[1] == 0 && again[6][0][0] != 999,'Returned arrays and every neighbor pair are detached native values');
  f.with_write(() => { tm.rollback_terrain(receipt); });
  test.assert(f.snapshot() == original && f.terrain_snapshot() == terrain);
 }
});
behavior.scenario('compact geometry retains native wrap poles duplicates coordinate validation and stale-manager rejection',() => {
 const f = test.natural_startup_fixture(8,8,'flat-arid');
 #include('./_natural_startup_mechanics')(f); f.initialize_declared_players(['GAIANS','HIVE','UNIVERSITY','MORGANITES','SPARTANS','BELIEVERS','PEACEKEEPERS'],'Citizen'); f.configure_declared_world();
 const tm = f.game.get_tm(); const before = f.audit_snapshot(); const inventory = f.audit_inspect();
 const north = check(tm,0,0); const south = check(tm,7,7);
 test.assert(north[6][0] == [6,0] && north[6][1] == [0,0] && north[6][2] == [0,0] && north[6][3] == [0,0]);
 test.assert(south[6][5] == [7,7] && south[6][6] == [7,7] && south[6][7] == [7,7]);
 for (point of [[(0-1),0],[0,(0-1)],[8,0],[0,8],[1,0]]) {
  let rejected = false; try { tm.get_terrain_geometry(point[0],point[1]); } catch { : (error) => { rejected = true; } }
  test.assert(rejected);
 }
 test.assert(f.audit_snapshot() == before && f.audit_inspect() == inventory);
 f.retire(); let rejected = false; try { tm.get_terrain_geometry(0,0); } catch { : (error) => { rejected = true; } }
 test.assert(rejected,'The same native manager lifetime fence protects the compact getter');
});
