// Original accepted accelerated witness: original rockiness_raw2→1 imports as
// native ROCKY3→ROLLING2. The repeated witness also proves original1→0
// (native2→1). Stock-rate and lifecycle cases remain application regressions.
const behavior = #include('./_behavior');
const fixture = #include('./_terraform_level_fixture');
const command = #include('../default/game/event/unit_terraform');
const terrain = (f) => {
	const result = [];
	for (let y = 0; y < 4; y++) {
		for (let x = y % 2; x < 4; x = x + 2) { result :+ #clone(f.game.get_tm().get_terrain_state(x,y)); }
	}
	return result;
};

behavior.scenario('rate1 Level reduces imported rocky category once while preserving every other native terrain field', () => {
	const f = fixture(1,3); const before = terrain(f); const energy = f.owner.get_energy_state();
	for (state of before) { if (state.x == 2 && state.y == 2) { state.rockiness = 2; state.terrain_epoch = state.terrain_epoch + 1; } }
	const e = f.command('level');
	test.assert(f.former.get_tile().rockiness == 2 && f.former.get_tile().rockiness - 1 == 1, 'Native3→2 projects to accepted original raw2→1');
	test.assert(terrain(f) == before, 'Only target rockiness and its persistent mutation epoch change; heights classes flags and neighbors remain exact');
	test.assert(f.owner.get_energy_state() == energy, 'Level does not charge an unobserved height fee');
	test.assert(f.former.get_order() == 'NO_ORDERS' && f.former.get_terraforming().work_units == 0);
	test.assert(f.former.movement == 0.0 && f.former.moved_this_turn && #round((1.0 - f.former.movement) * 3.0) == 3);
	test.assert(e.applied.terrain_receipt > 0);
});

behavior.scenario('Level completion receipt restores roughness work order and movement together', () => {
	const f = fixture(1,3); const before = f.snapshot(); const tiles = f.terrain_snapshot(); const state = f.former.get_terraforming();
	const e = f.command('level');
	f.with_write(() => { command.rollback(e); });
	test.assert(f.snapshot() == before && f.terrain_snapshot() == tiles && f.former.get_terraforming() == state);
});

behavior.scenario('changed work receipt rejects undo before touching terrain or any unit field', () => {
	const f = fixture(1,3); const e = f.command('level');
	f.with_write(() => { f.former.movement = 0.5; });
	const before = f.snapshot(); const tiles = f.terrain_snapshot(); let rejected = false;
	try { f.with_write(() => { command.rollback(e); }); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && f.snapshot() == before && f.terrain_snapshot() == tiles);
});

behavior.scenario('stock source work declaration remains progressive and changes terrain only at completion', () => {
	const f = fixture(8,3); f.command('level');
	test.assert(f.former.get_terraforming().required_work == 16 && f.former.get_terraforming().work_units == 2);
	for (let tick = 1; tick < 7; tick++) { f.advance(); test.assert(f.former.get_tile().rockiness == 3); }
	f.advance();
	test.assert(f.former.get_tile().rockiness == 2 && f.former.get_order() == 'NO_ORDERS');
});

behavior.scenario('flat terrain rejects Level without consuming movement or changing the native graph', () => {
	const f = fixture(1,1); const before = f.snapshot(); const tiles = f.terrain_snapshot(); let rejected = false;
	try { f.command('level'); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && f.snapshot() == before && f.terrain_snapshot() == tiles && f.former.movement == 1.0);
});

behavior.scenario('inherited work cancellation retains then refunds only its current application tick', () => {
	const f = fixture(8,3); f.command('level'); f.command('cancel_work');
	test.assert(f.former.movement == 0.0 && f.former.get_terraforming().work_units == 2 && f.former.get_tile().rockiness == 3);
	f.advance(); f.command('level'); f.command('cancel_work');
	test.assert(f.former.movement == 1.0 && f.former.get_terraforming().work_units == 2 && f.former.get_tile().rockiness == 3);
});

behavior.scenario('genuine next-turn Level reduces rolling to flat without height or treasury changes', () => {
	const f = fixture(1,3); f.command('level'); f.advance();
	const before = terrain(f); const energy = f.owner.get_energy_state();
	for (state of before) { if (state.x == 2 && state.y == 2) { state.rockiness = 1; state.terrain_epoch = state.terrain_epoch + 1; } }
	f.command('level');
	test.assert(f.former.get_tile().rockiness == 1 && terrain(f) == before);
	test.assert(f.owner.get_energy_state() == energy && f.former.get_order() == 'NO_ORDERS' && f.former.movement == 0.0);
});
