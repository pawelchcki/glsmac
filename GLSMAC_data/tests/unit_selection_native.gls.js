const behavior = #include('./_behavior');
const fixture = #include('./_unit_selection_fixture');
const selected = (f, role) => { test.assert(f.selected_id() == (role == null ? null : f.units[role].id)); };
behavior.scenario('native Wait preserves units and transfers the recorded stacked selection history', () => {
	const f = fixture('stacked'); const before = f.snapshot(); selected(f, 0);
	for (role of [1, 2, 0, 1, 0, 2]) { f.action('wait'); selected(f, role); test.assert(f.snapshot() == before); }
});
behavior.scenario('native Tab and Wait share deferred selection history', () => {
	const f = fixture('stacked');
	for (step of [['tab', 1], ['tab', 2], ['tab', 0], ['tab', 1], ['wait', 0], ['tab', 2]]) { f.action(step[0]); selected(f, step[1]); }
});
behavior.scenario('native automatic Hold excludes all held units and tolerates idle navigation', () => {
	const f = fixture('stacked');
	for (role of [1, 2, null]) { f.action('hold'); selected(f, role); }
	f.action('wait'); f.action('tab'); selected(f, null);
	for (unit of f.units) { test.assert(unit.get_order() == 'HOLD' && unit.movement == 1.0); }
});
behavior.scenario('native Skip exhausts each unit and real AdvanceTurn restarts selection', () => {
	const f = fixture('stacked');
	for (role of [1, 2, null]) { f.action('skip'); selected(f, role); }
	for (unit of f.units) { test.assert(unit.movement == 0.0); }
	f.action('advance'); selected(f, 0);
	for (unit of f.units) { test.assert(unit.movement == 1.0); }
	f.action('wait'); selected(f, 1); f.action('tab'); selected(f, 2);
});
behavior.scenario('spread positions use real native map identity and automatic readiness', () => {
	const f = fixture('spread');
	test.assert(f.base.get_tile().x == 2 && f.base.get_tile().y == 2);
	for (step of [['wait', 1], ['hold', 2], ['wait', 0], ['skip', 2], ['wait', 2], ['tab', 2]]) { f.action(step[0]); selected(f, step[1]); }
});
behavior.scenario('manual exhausted focus survives until navigation and does not restore moves', () => {
	const f = fixture('stacked'); f.action('skip'); selected(f, 1);
	f.selection_focus(f.units[0].id); selected(f, 0); test.assert(f.units[0].movement == 0.0);
	f.action('tab'); test.assert(f.selected_id() != f.units[0].id && f.units[0].movement == 0.0);
});
behavior.scenario('selection uses actual ownership health readiness and removed unit membership', () => {
	const f = fixture('stacked');
	f.with_write(() => { f.units[1].health = 0.0; f.units[2].set_order('HOLD'); });
	let foreign = null; f.with_write(() => { const data = {def: 'ScoutPatrol', health: 1.0, morale: 2}; data.owner = f.game.get_player(); data.tile = f.base.get_tile(); foreign = f.game.um.spawn_unit(data); });
	test.assert(foreign.owner != f.owner.id);
	for (action of ['wait', 'tab', 'wait']) { f.action(action); selected(f, 0); }
	const removed = f.units[0].id; f.with_write(() => { f.game.um.despawn_unit(removed); });
	f.selection_next(false); selected(f, null); test.assert(!f.is_deferred(removed));
	test.assert(foreign.needs_orders());
});
behavior.scenario('controller reset releases deferred history and another world owns independent state', () => {
	const f = fixture('stacked'); f.action('wait'); const other = fixture('stacked'); selected(other, 0);
	f.selection_reset(); test.assert(f.selected_id() == null);
	for (unit of f.units) { test.assert(!f.is_deferred(unit.id)); }
	f.selection_next(false); selected(f, 0); selected(other, 0);
});

behavior.scenario('arbitrary nonconsecutive IDs retain pass history rather than ID arithmetic', () => {
	const f = fixture('stacked', [9001, 12203, 20107]);
	test.assert(f.units[0].id == 9001 && f.units[1].id == 12203 && f.units[2].id == 20107);
	for (role of [1, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1]) { f.action('wait'); selected(f, role); }
});
behavior.scenario('frozen long Wait and Tab checkpoints retain actual deferred state', () => {
	for (action of ['wait', 'tab']) {
		const f = fixture('stacked');
		for (step of [[1, true, false, false], [2, true, true, false], [0, false, false, true], [1, true, false, true], [0, false, true, false], [2, true, true, false], [0, false, false, true], [1, true, false, true], [0, false, true, false], [2, true, true, false], [0, false, false, true], [1, true, false, true]]) {
			f.action(action); selected(f, step[0]);
			for (i of [0, 1, 2]) { test.assert(f.is_deferred(f.units[i].id) == step[i + 1]); }
		}
	}
});
behavior.scenario('retiring a native world releases selection history and retained adapter callbacks address the receiving world', () => {
	const f = fixture('stacked'); const selected_id = f.selected_id; const deferred = f.is_deferred;
	const old_id = f.units[0].id; f.action('wait'); test.assert(deferred(old_id));
	f.reset(); test.assert(selected_id() == null && !deferred(old_id));
	test.assert(f.game.get_turn() == 1 && f.base.get_tile().x == 2 && f.base.get_tile().y == 2);
});
