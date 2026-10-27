// Native application regressions for the recorded flat/arid road scope.
// Only the base-road trace transfers game.road_network.v1 observations;
// edited flags, rejection and rollback are additional GLSMAC invariants.
const behavior = #include('./_behavior');
const fixture = #include('./_road_network_fixture');
const move = #include('../default/game/event/move_unit');

const assert_network = (f) => {
	const base_tile = f.game.tm.get_tile(0, 0);
	const road_tile = f.game.tm.get_tile(2, 0);
	test.assert(base_tile.get_base() != null && road_tile.get_base() == null);
	test.assert(!f.game.tm.get_terraforming(0, 0).road && f.game.tm.get_terraforming(2, 0).road);
};

const assert_checkpoint = (f, x, spent, moved) => {
	const unit = f.current_unit();
	test.assert(unit.get_tile().x == x && unit.get_tile().y == 0);
	test.assert(#round(unit.movement * 3.0) == 3 - spent && unit.moved_this_turn == moved);
	assert_network(f);
};

behavior.scenario('flat arid forest roads retain three native steps per turn', () => {
	const f = fixture('forest_roads'); let spent = 0;
	for (other of [true, false, true]) {
		f.move(other); spent++;
		const unit = f.current_unit(); const tile = unit.get_tile();
		test.assert(tile.x == (other ? 0 : 2) && tile.y == 2 && tile.get_base() == null);
		test.assert(#round(unit.movement * 3.0) == 3 - spent && unit.moved_this_turn);
		const flags = f.game.tm.get_terraforming(tile.x, tile.y);
		test.assert(flags.road && flags.forest);
	}
	f.advance();
	test.assert(f.current_unit().movement == 1.0 && !f.current_unit().moved_this_turn);
	f.move(false); test.assert(#round(f.current_unit().movement * 3.0) == 2);
});

behavior.scenario('recorded implicit base road connects both ways without adding a road flag', () => {
	const f = fixture('base_road'); const turn = f.game.get_turn();
	assert_checkpoint(f, 2, 0, false);
	f.move(true); assert_checkpoint(f, 0, 1, true);
	f.move(false); assert_checkpoint(f, 2, 2, true);
	f.move(true); assert_checkpoint(f, 0, 3, true);
	test.assert(f.game.get_turn() == turn);
	f.advance(); assert_checkpoint(f, 0, 0, false);
	test.assert(f.game.get_turn() == turn + 1);
	f.move(false); assert_checkpoint(f, 2, 1, true);
});

for (outbound of [false, true]) {
	behavior.scenario('a base requires a road on the nonbase endpoint ' + (outbound ? 'outbound' : 'inbound'), () => {
		const f = fixture('base_road');
		if (outbound) { f.move(true); f.advance(); }
		f.with_write(() => { f.game.tm.set_terraforming(2, 0, {road: false, farm: false, mine: false, forest: false}); });
		const e = f.move(!outbound);
		test.assert(e.resolved.is_movement_successful && f.current_unit().get_tile().x == (outbound ? 2 : 0));
		test.assert(f.current_unit().movement == 0.0 && f.current_unit().moved_this_turn);
		test.assert(!f.game.tm.get_terraforming(0, 0).road && !f.game.tm.get_terraforming(2, 0).road);
	});
}

behavior.scenario('live nonbase road removal and restoration change implicit base connectivity', () => {
	const f = fixture('base_road'); const held = f.current_unit().get_tile();
	f.with_write(() => { f.game.tm.set_terraforming(2, 0, {road: false, farm: false, mine: false, forest: false}); });
	f.move(true);
	test.assert(held.x == 2 && f.current_unit().movement == 0.0);
	f.advance();
	f.with_write(() => { f.game.tm.set_terraforming(2, 0, {road: true, farm: false, mine: false, forest: false}); });
	f.move(false); assert_checkpoint(f, 2, 1, true);
	f.move(true); assert_checkpoint(f, 0, 2, true);
});

for (outbound of [false, true]) {
	behavior.scenario('implicit base movement rollback restores exact native state ' + (outbound ? 'outbound with partial moves' : 'inbound with full moves'), () => {
		const f = fixture('base_road');
		if (outbound) { f.move(true); }
		const before = f.snapshot(); const e = f.move(!outbound);
		f.with_write(() => { move.rollback(e); }); f.finish_unit_move(f.former.id);
		test.assert(f.snapshot() == before);
		assert_checkpoint(f, outbound ? 0 : 2, outbound ? 1 : 0, outbound);
		test.assert(!f.game.tm.get_tile(0, 0).is_locked() && !f.game.tm.get_tile(2, 0).is_locked());
	});
}

behavior.scenario('exhausted implicit base road move is rejected unchanged and a real turn restores movement', () => {
	const f = fixture('base_road'); f.move(true); f.move(false); f.move(true);
	const before = f.snapshot(); let caught = false;
	try { f.move(false); } catch { : (error) => { caught = true; } }
	test.assert(caught && f.snapshot() == before);
	assert_checkpoint(f, 0, 3, true);
	f.advance(); assert_checkpoint(f, 0, 0, false);
	f.move(false); assert_checkpoint(f, 2, 1, true);
});

// Source-supported application policy from installed Manual p48. These cases
// do not claim measured original wet/rolling/rocky traversal agreement.
const terrain_road_fixture = (moisture, rockiness, uniform, roads) => {
 const f = fixture('forest_roads');
 f.with_write(() => {
  const patches = [];
  for (x of [0, 2]) {
   const flags = f.game.tm.get_terraforming(x, 2); flags.road = roads;
   patches :+ {x:x,y:2,moisture:(x == 0 || uniform) ? moisture : 1,
    rockiness:(x == 0 || uniform) ? rockiness : 1,terraforming:flags};
  }
  f.game.tm.apply_terrain(patches, []);
 });
 return f;
};
for (terrain of [['wet',3,1], ['rolling',1,2], ['rocky',1,3]]) {
 for (uniform of [false, true]) {
  behavior.scenario('source road throughput crosses ' + terrain[0] + (uniform ? ' endpoints' : ' and flat endpoints') + ' both ways with native undo', () => {
   const f = terrain_road_fixture(terrain[1], terrain[2], uniform, true);
   let spent = 0;
   for (outbound of [true, false, true]) {
    const e = {caller:f.owner.id}; e.game = f.game; e.data = {};
    e.data.unit = f.current_unit(); e.data.tile = f.game.tm.get_tile(outbound ? 0 : 2, 2);
    const before = f.snapshot(); const quote = move.observe_cost(e);
    #print('ROAD_TERRAIN_QUOTE|' + #json_text_exact({terrain:terrain[0],uniform:uniform,source:{x:e.data.unit.get_tile().x + 0,moisture:e.data.unit.get_tile().moisture + 0,rockiness:e.data.unit.get_tile().rockiness + 0},
     destination:{x:e.data.tile.x + 0,moisture:e.data.tile.moisture + 0,rockiness:e.data.tile.rockiness + 0},quote:quote,unchanged:f.snapshot() == before}));
    test.assert(quote.road_rate == 3 && f.snapshot() == before, 'Both connected land endpoints use the declared road rate without mutation');
    const actual = f.move(outbound);
    test.assert(actual.resolved.is_movement_successful && actual.applied.completed && !f.current_unit().get_tile().is_locked());
    test.assert(f.current_unit().get_tile().x == (outbound ? 0 : 2));
    if (spent == 0) {
     f.with_write(() => { move.rollback(actual); }); f.finish_unit_move(f.former.id);
     test.assert(f.snapshot() == before, 'Actual reverse movement ACK restores the complete native graph and RNG');
     f.move(outbound);
    }
    spent++;
    test.assert(#round(f.current_unit().movement * 3.0) == 3 - spent && f.current_unit().moved_this_turn);
   }
   test.assert(f.current_unit().movement == 0.0);
   const exhausted = {caller:f.owner.id}; exhausted.game = f.game; exhausted.data = {};
   exhausted.data.unit = f.current_unit(); exhausted.data.tile = f.game.tm.get_tile(2,2);
   const final_state = f.snapshot(); test.assert(#is_defined(move.validate(exhausted)) && f.snapshot() == final_state);
  });
 }
 behavior.scenario('unconnected ' + terrain[0] + ' land retains ordinary quote debit and native undo', () => {
  const f = terrain_road_fixture(terrain[1], terrain[2], false, false);
  const e = {caller:f.owner.id}; e.game = f.game; e.data = {};
  e.data.unit = f.current_unit(); e.data.tile = f.game.tm.get_tile(0,2);
  const before = f.snapshot(); const quote = move.observe_cost(e);
  test.assert(quote.road_rate == 0 && quote.total_cost == (terrain[2] == 3 ? 2.0 : 1.0) && f.snapshot() == before);
  const actual = f.move(true);
  test.assert(actual.resolved.is_movement_successful && actual.applied.completed && f.current_unit().movement == 0.0);
  f.with_write(() => { move.rollback(actual); }); f.finish_unit_move(f.former.id);
  test.assert(f.snapshot() == before);
 });
}
