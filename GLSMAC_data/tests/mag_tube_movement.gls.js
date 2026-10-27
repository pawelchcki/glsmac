// Installed manual p48 functionality. No original measured traversal pass.
const behavior = #include('./_behavior');
const move = #include('../default/game/event/move_unit');
const fixture = () => {
 const f = #include('./_former_work_fixture')('road'); f.enable_movement();
 f.with_write(() => {
  const patches = [];
  for (point of [[2,2],[0,2]]) {
   const flags = f.game.get_tm().get_terraforming(point[0],point[1]); flags.road = true; flags.mag_tube = true;
   patches :+ {x:point[0],y:point[1],terraforming:flags};
  }
  f.game.get_tm().apply_terrain(patches,[]);
 });
 f.move = (x,y) => {
  const event = {caller:f.owner.id + 0}; event.game = f.game; event.data = {}; event.data.unit = f.former;
  event.data.tile = f.game.get_tm().get_tile(x,y);
  const error = move.validate(event); if (#is_defined(error)) { throw Error(error); }
  f.with_write(() => { event.resolved = move.resolve(event); event.applied = move.apply(event); });
  if (event.resolved.is_movement_successful) { f.finish_unit_move(f.former.id); }
  return event;
 };
 return f;
};
behavior.scenario('connected native mag tubes move repeatedly with unchanged remaining MP and without random draws',() => {
 const f = fixture(); const initial = f.former.movement + 0.0;
 for (let index = 0; index < 10; index++) {
  const target = index % 2 == 0 ? 0 : 2;
  const e = {caller:f.owner.id + 0}; e.game = f.game; e.data = {}; e.data.unit = f.former; e.data.tile = f.game.get_tm().get_tile(target,2);
  const before = f.snapshot(); const quote = move.observe_cost(e);
  test.assert(quote == {road_rate:0,base_cost:0.0,after_cost:0.0,total_cost:0.0} && f.snapshot() == before);
  let resolved = null; f.with_write(() => { resolved = move.resolve(e); });
  test.assert(resolved.is_movement_successful && f.snapshot() == before,'Zero-cost resolve does not consume RNG');
  f.move(target,2); test.assert(f.former.movement == initial && f.former.moved_this_turn);
 }
});
behavior.scenario('zero-cost mag tube traversal still rejects exhausted units and disconnected endpoints use live ordinary policy',() => {
 const f = fixture(); const e = {caller:f.owner.id + 0}; e.game = f.game; e.data = {}; e.data.unit = f.former; e.data.tile = f.game.get_tm().get_tile(0,2);
 f.with_write(() => { f.former.movement = 0.0; }); const before = f.snapshot();
 test.assert(#is_defined(move.validate(e)) && move.observe_cost(e).total_cost == 0.0 && f.snapshot() == before);
 f.with_write(() => {
  f.former.movement = 1.0; const flags = f.game.get_tm().get_terraforming(0,2); flags.mag_tube = false;
  f.game.get_tm().apply_terrain([{x:0,y:2,terraforming:flags}],[]);
 });
 test.assert(move.observe_cost(e).road_rate == 3 && move.observe_cost(e).total_cost > 0.0);
 f.move(0,2); test.assert(f.former.movement < 1.0 && f.former.movement > 0.0);
});
behavior.scenario('actual mag tube movement rollback restores the complete native graph and rejects stale reuse',() => {
 const f = fixture(); const before = f.snapshot(); const e = f.move(0,2);
 f.with_write(() => { move.rollback(e); }); f.finish_unit_move(f.former.id);
 test.assert(f.snapshot() == before);
 let denied = false; try { f.with_write(() => { move.rollback(e); }); } catch { : (error) => { denied = true; } }
 test.assert(denied && f.snapshot() == before);
});
behavior.scenario('a failed actual partial-MP movement attempt restores its receipt without moving onto its current tile',() => {
 const f = #include('./_former_work_fixture')('arid'); f.enable_movement();
 f.with_write(() => { f.former.movement = 0.000001; });
 const e = {caller:f.owner.id + 0}; e.game = f.game; e.data = {}; e.data.unit = f.former;
 e.data.tile = f.game.get_tm().get_tile(0,2);
 test.assert(!#is_defined(move.validate(e)));
 f.with_write(() => { e.resolved = move.resolve(e); });
 test.assert(!e.resolved.is_movement_successful,'The declared seeded low-budget attempt fails through the actual resolver');
 const before = f.snapshot(); const work = f.former.get_terraforming(); const plan = f.former.get_automation();
 f.with_write(() => { e.applied = move.apply(e); });
 test.assert(e.applied.completed && !f.former.get_tile().is_locked() && f.former.movement == 0.0);
 f.with_write(() => { move.rollback(e); });
 test.assert(f.snapshot() == before && f.former.get_terraforming() == work && f.former.get_automation() == plan);
});
