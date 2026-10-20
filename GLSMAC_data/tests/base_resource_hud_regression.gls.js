// Bounded first/repeated-opening witnesses use public ui.base_resource_hud.v1.
// Native citizens, intake/consumption, joining, reconciliation and shipped
// resource/allocation labels execute. Display nodes, synchronous frontend
// delivery and resource icon cells are boundaries. Extra refresh/deficit cases
// below are GLSMAC application regressions, not additional original evidence.
const behavior = #include('./_behavior');
const make = #include('./_base_open_fixture');
const rules = #include('../default/resources');
const resources = #include('../default/ui/parts/game/popup/base_screen/resources');
const mocks = #include('./_ui_mocks');
const fixture = (joined) => {
	const f = make({profile: 'stacked', initial_base: {workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9}, setup: ['wait', 'wait']});
	rules.configure(f.game); f.colony_id = f.units[2].id + 0;
	if (joined) { f.action('join'); }
	f.action('open'); f.screen = f.popup.popup_defs.base_screen;
	const bodies = [];
	for (child of f.popup.popups.base_screen.el.children) {
		if (#is_defined(child.class) && child.class == 'game-popup-body') { bodies :+ child; }
	}
	test.assert(#sizeof(bodies) == 1);
	const p = {}; p.body = bodies[0]; p.ui = f.view.ui;
	resources.init(p); resources.total_cells = 0; f.screen.sections.resources = resources;
	f.refresh = () => { const data = {}; data.base = f.base; f.screen.set(data); };
	f.refresh();
	return f;
};
const assert_hud = (f, joined) => {
	test.assert(f.context() == {screen: 'base', title_matches_base: true});
	test.assert(f.base.get_size() == (joined ? 2 : 1) && f.base.get_worked_tiles() == []);
	const rows = f.screen.sections.resources.labels;
	test.assert(rows.nutrients.left.text == (joined ? '002 - 004' : '002 - 002'));
	test.assert(rows.nutrients.right.text == (joined ? '= -002' : '= +000'));
	test.assert(rows.minerals.left.text == '001 - 000' && rows.minerals.right.text == '= +001');
	test.assert(rows.energy.left.text == '002 - 000' && rows.energy.right.text == '= +002');
	test.assert(resources.status_label.text == (joined ? '= SHORTFALL' : '= SURPLUS'));
	const allocation = f.screen.sections.energy.labels;
	for (type of ['economy', 'labs']) {
		const labels = allocation[type];
		test.assert(labels.percentage.text == ' 50%' && labels.value.text == '  1');
		test.assert(labels.bonus.text == '  0' && labels.total.text == '  1');
	}
	test.assert(allocation.psych.percentage.text == '  0%' && allocation.psych.value.text == '  0');
	test.assert(allocation.psych.bonus.text == (joined ? '  4' : '  2'));
	test.assert(allocation.psych.total.text == (joined ? '  4' : '  2'));
};
for (joined of [false, true]) {
	behavior.scenario((joined ? 'joined two-Doctor' : 'control one-Doctor') + ' HUD agrees on first opening and reopening without earning income', () => {
		const f = fixture(joined); assert_hud(f, joined);
		const snapshot = f.native.snapshot(); const identities = f.native.next_ids(); const selected = f.selected_id();
		f.action('close'); test.assert(f.context().screen == 'map');
		f.action('open'); assert_hud(f, joined); f.action('close');
		test.assert(f.native.snapshot() == snapshot && f.native.next_ids() == identities);
		test.assert(f.base.get('accumulated_nutrients') == 0 && f.base.get_production().minerals == 9);
		test.assert(f.game.get_turn() == 1 && f.selected_id() == selected);
		if (joined) { test.assert(!f.game.um.has_unit(f.colony_id)); }
		f.view.root.remove();
	});
}
behavior.scenario('repeated production HUD refreshes preserve native stores citizens RNG IDs and notifications', () => {
	const f = fixture(true); const snapshot = f.native.snapshot(); const inspect = f.native.inspect(); const ids = f.native.next_ids(); const updates = f.native.update_count();
	for (let i = 0; i < 3; i++) { f.refresh(); assert_hud(f, true); }
	test.assert(f.native.snapshot() == snapshot && f.native.inspect() == inspect);
	test.assert(f.native.next_ids() == ids && f.native.update_count() == updates);
	f.view.root.remove();
});
behavior.scenario('visible native population updates refresh shortfall and Doctor bonus in both directions', () => {
	const f = fixture(false); const label = resources.status_label; let doctor = null;
	f.native.with_write(() => { doctor = f.base.create_pop({type: 'DOCTOR'}); });
	const event = {}; event.base = f.base; f.events.emit('update_base', event); assert_hud(f, true);
	test.assert(resources.status_label == label && !label.is_removed());
	f.native.with_write(() => { f.base.destroy_pop(doctor); });
	f.events.emit('update_base', event); assert_hud(f, false);
	test.assert(resources.status_label == label && f.base.get('accumulated_nutrients') == 0 && f.base.get_production().minerals == 9);
	f.view.root.remove();
});
const widget = () => {
	const view = mocks.display(); const p = {}; p.body = view.root; p.ui = view.ui;
	resources.init(p); return view;
};
const balanced = () => { return {nutrients: {profit: 2, loss: 2}, minerals: {profit: 1, loss: 0}, energy: {profit: 2, loss: 0}}; };
behavior.scenario('each resource deficit updates the retained status label and clears when balanced', () => {
	const view = widget(); const label = resources.status_label;
	for (type of ['nutrients', 'minerals', 'energy']) {
		const data = balanced(); data[type].profit = 0; data[type].loss = 3;
		resources.set(data);
		test.assert(resources.labels[type].left.text == '000 - 003' && resources.labels[type].right.text == '= -003');
		test.assert(label.text == '= SHORTFALL');
		resources.set(balanced());
		test.assert(label.text == '= SURPLUS' && label == resources.status_label);
	}
	view.root.remove();
});
behavior.scenario('zero and multi-digit net labels retain sign and three-digit padding while redraw removes old cells', () => {
	const view = widget(); resources.total_cells = 3;
	resources.set({nutrients: {profit: 12, loss: 2}, minerals: {profit: 100, loss: 100}, energy: {profit: 1, loss: 12}});
	test.assert(resources.labels.nutrients.left.text == '012 - 002' && resources.labels.nutrients.right.text == '= +010');
	test.assert(resources.labels.minerals.left.text == '100 - 100' && resources.labels.minerals.right.text == '= +000');
	test.assert(resources.labels.energy.left.text == '001 - 012' && resources.labels.energy.right.text == '= -011');
	const old = resources.cells.children; test.assert(#sizeof(old) == 9);
	resources.set(balanced());
	test.assert(#sizeof(resources.cells.children) == 9 && resources.status_label.text == '= SURPLUS');
	for (cell of old) { test.assert(cell.is_removed()); }
	view.root.remove();
});
