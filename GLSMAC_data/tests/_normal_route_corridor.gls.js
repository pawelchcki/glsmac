// Author all terrain before the coordinate-only movement ACK seam is used.
// Each caller runs in a separate native WASM process, preserving render guards.
return (tube) => {
 const f = #include('./_normal_worker_route_fixture')(); const game = f.game; const tm = game.get_tm();
 let selected_y = 0;
 for (let y = 8; y < 72; y += 2) {
  let clear = true;
  for (point of [[8,y],[6,y],[5,y-1],[3,y-1],[2,y],[0,y],[38,y],[4,y]]) {
   const tile = tm.get_tile(point[0],point[1]); if (tile.get_base() != null || #sizeof(tile.get_units()) != 0) { clear = false; }
  }
  for (base of game.get_bm().get_bases()) {
   const tile = base.get_tile(); let dx = 38 - tile.x; if (dx < 0) { dx = 0 - dx; } if (dx > 20) { dx = 40 - dx; }
   let dy = y - tile.y; if (dy < 0) { dy = 0 - dy; } if (dx < 6 && dy < 4) { clear = false; }
  }
  if (clear && selected_y == 0) { selected_y = y; }
 }
 test.assert(selected_y > 0,'Declared setup finds a clear corridor without moving any original participant');
 const target = tm.get_tile(38,selected_y); let actor_id = 0;
 const path = [[8,selected_y],[6,selected_y],[5,selected_y-1],[3,selected_y-1],[2,selected_y],[0,selected_y],[38,selected_y]];
 f.with_write(() => {
  game.get_bm().spawn_base(f.owner,target,{facilities:[]});
  const patches = [];
  for (point of path) { const flags = tm.get_terraforming(point[0],point[1]); flags.road = true; flags.mag_tube = tube; patches :+ {x:point[0],y:point[1],terraforming:flags}; }
  patches :+ {x:4,y:selected_y,canonical:{elevation:(0-500),is_water:true}}; tm.apply_terrain(patches,[]);
  const declaration = {def:'Formers',health:1.0,morale:2}; declaration.owner = f.owner; declaration.tile = tm.get_tile(8,selected_y);
  actor_id = game.get_um().spawn_unit(declaration).id + 0;
 }); f.process_events();
 test.assert(tm.get_map_width() == 40 && tm.get_map_height() == 80);
 const result = {actor_id:actor_id,row:selected_y}; result.fixture = f; result.target = target;
 return result;
};
