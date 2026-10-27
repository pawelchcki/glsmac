// Pure graph algorithm contracts; synthetic zero weights do not assert an
// original mag-tube movement cost or actual native movement parity.
const behavior = #include('./_behavior');
const search = #include('../default/game/worker_routes');
const ring = (source) => {
 const nodes = []; for (let x = 0; x < 8; x += 2) { nodes :+ {x:x,y:0}; }
 const graph = {
  at:(x,y) => { return #clone(nodes[x / 2]); },
  neighbors:(tile) => { return [#clone(nodes[(tile.x + 2) % 8 / 2]),#clone(nodes[(tile.x + 6) % 8 / 2])]; },
  cost:(from,to) => { return 0.0; },
  accept:(tile) => { return tile.x == 0; },
 };
 graph.source = #clone(nodes[source / 2]); return graph;
};
behavior.scenario('zero-cost cyclic graph chooses a finite minimum-hop route and advances without oscillation',() => {
 let source = 4; const visited = {}; let steps = 0;
 while (source != 0) {
  const graph = ring(source); const result = search(graph);
  test.assert(result != null && result.cost == 0.0 && result.hops > 0);
  const key = #to_string(source); test.assert(!#is_defined(visited[key])); visited[key] = true;
  source = result.first_x; steps++; test.assert(steps <= 2);
 }
 test.assert(steps == 2);
});
behavior.scenario('weighted route selects an inexpensive detour, excludes blocked edges, and returns null when disconnected',() => {
 const nodes = [{x:0,y:0},{x:2,y:0},{x:4,y:0},{x:1,y:1}]; const graph = {
  at:(x,y) => { for (tile of nodes) { if (tile.x == x && tile.y == y) { return #clone(tile); } } return null; },
  neighbors:(tile) => {
   if (tile.x == 0) { return [#clone(nodes[1]),#clone(nodes[3])]; }
   if (tile.x == 2) { return [#clone(nodes[2])]; }
   if (tile.x == 1) { return [#clone(nodes[1])]; }
   return [];
  },
  cost:(from,to) => { return from.x == 0 && to.x == 2 ? 4.0 : 0.25; },
  accept:(tile) => { return tile.x == 4; },
 };
 graph.source = #clone(nodes[0]); const result = search(graph);
 test.assert(result.first_x == 1 && result.first_y == 1 && result.hops == 3 && result.cost == 0.75);
 const disconnected = {at:graph.at,neighbors:graph.neighbors,accept:graph.accept,cost:(from,to) => { return null; }}; disconnected.source = #clone(nodes[0]);
 test.assert(search(disconnected) == null);
});
behavior.scenario('normal-size parity grid handles horizontal wrap and a blocked wall using only scalar route records',() => {
 const width = 40; const height = 80; const tiles = {};
 const at = (x,y) => { const key = #to_string(y) + ':' + #to_string(x); return #clone(tiles[key]); };
 for (let y = 0; y < height; y++) {
  for (let x = y % 2; x < width; x += 2) { const key = #to_string(y) + ':' + #to_string(x); tiles[key] = {x:x,y:y}; }
 }
 const graph = {
  at:at,
  neighbors:(tile) => {
   const result = [];
   for (offset of [[(0 - 2),0],[2,0],[(0 - 1),(0 - 1)],[1,(0 - 1)],[(0 - 1),1],[1,1],[0,(0 - 2)],[0,2]]) {
    const y = tile.y + offset[1]; if (y >= 0 && y < height) { result :+ at((tile.x + offset[0] + width) % width,y); }
   }
   return result;
  },
  cost:(from,to) => { return to.x == 20 && to.y != 60 ? null : 1.0 / 3.0; },
  accept:(tile) => { return tile.x == 38 && tile.y == 40; },
 };
 graph.source = at(0,40); const result = search(graph);
 test.assert(result.first_x == 38 && result.first_y == 40 && result.hops == 1 && result.cost == 1.0 / 3.0);
 graph.accept = (tile) => { return tile.x == 24 && tile.y == 40; };
 const detour = search(graph); test.assert(detour != null && detour.hops > 1 && detour.hops <= 1600);
 test.assert(detour.first_x != 20,'Blocked wall is not crossed by a fabricated source edge');
});
behavior.scenario('invalid graph costs reject instead of creating negative-weight or type-coerced routes',() => {
 for (cost of [(0.0 - 1.0),1]) {
  const graph = ring(4); graph.cost = (from,to) => { return cost; }; let denied = false;
  try { search(graph); } catch { : (e) => { denied = true; } } test.assert(denied);
 }
});
