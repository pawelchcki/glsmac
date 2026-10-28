// Pure weighted graph search. Costs select a route; actual move_unit still
// resolves and debits every edge from its native current tile after unlock.
const tile_key = (tile) => { return #to_string(tile.y) + ':' + #to_string(tile.x); };
const earlier = (left, right) => {
 if (left.cost != right.cost) { return left.cost < right.cost; }
 if (left.hops != right.hops) { return left.hops < right.hops; }
 if (left.y != right.y) { return left.y < right.y; }
 return left.x < right.x;
};
// Binary heap uses a separate logical length; consumed slots contain only
// local numeric records and are never serialized as an obsolete route cache.
const heap = () => {
 const items = []; let length = 0;
 const put = (index, value) => { if (index == #sizeof(items)) { items :+ #clone(value); } else { items[index] = #clone(value); } };
 return {
  push:(value) => {
   let index = length; length++;
   while (index > 0) {
    const previous = (index - 1) / 2;
    if (!earlier(value,items[previous])) { break; }
    put(index,items[previous]); index = previous;
   }
   put(index,value);
  },
  take:() => {
   if (length == 0) { return null; }
   const value = #clone(items[0]); length--;
   if (length > 0) {
    const last = #clone(items[length]); let index = 0;
    while (index * 2 + 1 < length) {
     let child = index * 2 + 1;
     if (child + 1 < length && earlier(items[child + 1],items[child])) { child++; }
     if (!earlier(items[child],last)) { break; }
     put(index,items[child]); index = child;
    }
    put(index,last);
   }
   return value;
  },
 };
};
return (graph) => {
 const source = graph.source; const frontier = heap(); const visited = {}; const best = {};
 frontier.push({x:source.x + 0,y:source.y + 0,first_x:source.x + 0,first_y:source.y + 0,cost:0.0,hops:0});
 const source_key = tile_key(source); best[source_key] = {cost:0.0,hops:0};
 while (true) {
  const node = frontier.take(); if (node == null) { return null; }
  const tile = graph.at(node.x,node.y); const key = tile_key(tile);
  if (!#is_defined(visited[key])) {
   visited[key] = true;
   if (graph.accept(tile)) { return node; }
   const neighbors = graph.neighbors(tile);
   for (neighbor of neighbors) {
    const neighbor_key = tile_key(neighbor);
    if (!#is_defined(visited[neighbor_key])) {
     const edge = graph.cost(tile,neighbor);
     if (edge != null) {
      if (#typeof(edge) != 'Float' || edge < 0.0) { throw Error('Route edge cost must be a nonnegative float'); }
      const cost = node.cost + edge; const hops = node.hops + 1;
      let improve = true;
      if (#is_defined(best[neighbor_key])) { const previous = best[neighbor_key]; improve = cost < previous.cost || (cost == previous.cost && hops < previous.hops); }
      if (improve) {
       best[neighbor_key] = {cost:cost,hops:hops};
       const next_x = neighbor.x + 0; const next_y = neighbor.y + 0;
       let first_x = node.first_x; let first_y = node.first_y;
       if (tile == source) { first_x = next_x; first_y = next_y; }
       frontier.push({x:next_x,y:next_y,first_x:first_x,first_y:first_y,cost:cost,hops:hops});
      }
     }
    }
   }
  }
 }
};
