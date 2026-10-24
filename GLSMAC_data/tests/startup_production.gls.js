// Application regressions use compact 32x16 worlds with the eight recorded
// source controls. Strict original projection separately uses declared 40x80.
const behavior = #include('./_behavior');
const fixture = #include('./_startup_production_fixture');
const rejects = (callback) => {
	let rejected = false; try { callback(); } catch { : (e) => { rejected = true; } }
	test.assert(rejected, 'Invalid initial production plan must reject');
};
behavior.scenario('unobserved generated-map startup retains its existing production epoch', () => {
	const f = fixture({faction: 'GAIANS', difficulty: 'CITIZEN', text_profile: 'stock', map_type: 'random'});
	test.assert(f.city.get_production() == {choice_id: 'FORMERS', minerals: 0, last_processed_turn: 1});
	f.retire();
});
behavior.scenario('active selections and later cities never receive creation credit', () => {
	const f = fixture({faction: 'GAIANS', difficulty: 'CITIZEN', text_profile: 'stock'});
	let tile = null;
	for (let y = 2; y < f.game.tm.get_map_height() - 2; y++) { for (let x = y % 2; x < f.game.tm.get_map_width(); x += 2) {
		const candidate = f.game.tm.get_tile(x, y); if (tile == null && candidate.get_base() == null) { tile = candidate; }
	} }
	const count = #sizeof(f.game.bm.get_bases());
	rejects(() => { f.with_write(() => { f.game.bm.spawn_base(f.human, tile, {facilities: [], initial_production: {choice_id: 'FORMERS', minerals: 8}}); }); });
	test.assert(#sizeof(f.game.bm.get_bases()) == count && tile.get_base() == null);
	let later = null; f.with_write(() => { later = f.game.bm.spawn_base(f.human, tile, {facilities: []}); later.select_production('FORMERS'); });
	test.assert(later.get_production() == {choice_id: 'FORMERS', minerals: 0, last_processed_turn: 1});
	const stock = f.city.get_production().minerals;
	f.with_write(() => { f.city.select_production('FORMERS'); });
	test.assert(f.city.get_production().minerals == stock, 'Reselecting the current project cannot recredit startup');
	f.retire();
});
behavior.scenario('malformed plans and existing-city reuse reject before allocation', () => {
	const f = test.founding_fixture(); const tile = f.base.get_tile().get_N();
	for (plan of [{choice_id: 'MISSING', minerals: 8}, {choice_id: 'RECYCLING_TANKS', minerals: 8},
		{choice_id: 'COLONY_POD', minerals: (0 - 1)}, {choice_id: 'COLONY_POD', minerals: 8, extra: true}]) {
		const before = f.snapshot();
		rejects(() => { f.with_write(() => { f.game.bm.spawn_base(f.owner, tile, {facilities: [], initial_production: plan}); }); });
		test.assert(f.snapshot() == before, 'Rejected plans cannot change native state');
	}
	const handler = #include('../default/game/event/spawn_base');
	test.assert(#is_defined(handler.validate({caller: 0, data: {initial_production: {}, production_choice: 'COLONY_POD'}})));
});
