// Bounded integration checks. Original observations are replayed separately;
// this fixture reads actual native enums and never implements reference policy.
const behavior = #include('./_behavior');
const fixture = #include('./_unit_sentry_activation_fixture');
const selected = (f, index) => {
	const id = index == null ? null : f.units[index].id;
	test.assert(f.selected_id() == id && f.preview.selected_unit_id == id);
};
const orders = (f, expected, movements) => {
	for (i of [0, 1, 2]) {
		const unit = f.units[i];
		test.assert(unit.get_order() == expected[i] && unit.movement == movements[i]);
		test.assert(unit.owner == f.native.owner.id && unit.health == 1.0 && unit.get_tile() == f.native.base.get_tile());
	}
	test.assert(f.game.get_turn() == 1 && f.native.check_unit_readiness());
};
const picker = (f, index) => {
	test.assert(f.popup.is_shown() && f.picker.active);
	test.assert(f.picker.header.text == 'Select unit to activate');
	test.assert(f.picker.choices == [f.units[2].id, f.units[0].id, f.units[1].id] && f.picker.selected == index);
	for (i of [0, 1, 2]) {
		const id = f.picker.choices[i];
		test.assert(f.picker.rows[i].text == f.game.um.get_unit(id).get_def().name);
		test.assert(f.picker.frames[i].border == (i == index ? 'rgb(120,164,212),2' : 'rgb(35,59,34),1'));
	}
};

behavior.scenario('three real L commands leave a Sentry stack unchanged through picker clamping and Escape', () => {
	const f = fixture('stacked', ['sleep', 'sleep', 'sleep']);
	selected(f, null); orders(f, ['SENTRY', 'SENTRY', 'SENTRY'], [1.0, 1.0, 1.0]);
	for (i of [0, 1, 2]) { test.assert(f.state.queued[i].name == 'unit_sentry' && f.state.queued[i].data.unit_id == f.units[i].id); }
	const before = f.native.snapshot(); const inspected = f.native.inspect(); const count = #sizeof(f.state.queued);
	f.action('open'); picker(f, 0); selected(f, null);
	f.action('up'); picker(f, 0); selected(f, null);
	f.action('escape');
	test.assert(!f.popup.is_shown() && !f.picker.active && f.native.snapshot() == before && f.native.inspect() == inspected);
	test.assert(#sizeof(f.state.queued) == count && f.state.loads == [['xscript.txt', 'dialogs']]);
	selected(f, null); orders(f, ['SENTRY', 'SENTRY', 'SENTRY'], [1.0, 1.0, 1.0]);
	f.view.root.remove();
});

behavior.scenario('picker confirmation wakes the native Scout and W Tab keep the only ready unit focused', () => {
	const f = fixture('stacked', ['sleep', 'sleep', 'sleep']); const before = f.native.snapshot();
	f.action('open'); f.action('down'); picker(f, 1);
	test.assert(f.native.snapshot() == before && #sizeof(f.state.queued) == 3);
	f.action('enter');
	test.assert(!f.popup.is_shown() && f.state.queued[3].name == 'unit_activate' && f.state.queued[3].data.unit_id == f.units[0].id);
	selected(f, 0); orders(f, ['NO_ORDERS', 'SENTRY', 'SENTRY'], [1.0, 1.0, 1.0]);
	test.assert(f.units[0].needs_orders() && !f.units[1].needs_orders() && !f.units[2].needs_orders());
	const activated = f.native.snapshot();
	let unit_notifications = 0; let tile_notifications = 0;
	f.events.on('unit_select', (e) => { unit_notifications++; });
	f.events.on('tile_select', (e) => { tile_notifications++; });
	for (action of ['wait', 'tab']) {
		f.action(action); selected(f, 0); test.assert(f.native.snapshot() == activated && #sizeof(f.state.queued) == 4);
	}
	test.assert(unit_notifications == 2 && tile_notifications == 0);
	f.view.root.remove();
});

behavior.scenario('Sentry Skip Skip permits exhausted Colony focus without a movement refund and W Tab clear it', () => {
	const f = fixture('stacked', ['sleep', 'skip', 'skip']);
	selected(f, null); orders(f, ['SENTRY', 'NO_ORDERS', 'NO_ORDERS'], [1.0, 0.0, 0.0]);
	test.assert(f.state.queued[0].name == 'unit_sentry' && f.state.queued[1].name == 'unit_skip_turn' && f.state.queued[2].name == 'unit_skip_turn');
	const before = f.native.snapshot();
	f.action('open'); picker(f, 0); selected(f, null); test.assert(f.native.snapshot() == before);
	f.action('enter');
	test.assert(!f.popup.is_shown() && f.state.queued[3].name == 'unit_activate' && f.state.queued[3].data.unit_id == f.units[2].id);
	selected(f, 2); orders(f, ['SENTRY', 'NO_ORDERS', 'NO_ORDERS'], [1.0, 0.0, 0.0]);
	test.assert(f.native.snapshot() == before && !f.units[2].needs_orders() && !f.game.um.has_ready_unit(f.native.owner.id));
	let tile_notifications = 0; let unit_notifications = 0;
	f.events.on('tile_select', (e) => {
		tile_notifications++; test.assert(e.tile == f.units[2].get_tile());
	});
	f.events.on('unit_select', (e) => { unit_notifications++; });
	for (action of ['wait', 'tab']) {
		f.action(action); selected(f, null); test.assert(f.native.snapshot() == before && #sizeof(f.state.queued) == 4);
		orders(f, ['SENTRY', 'NO_ORDERS', 'NO_ORDERS'], [1.0, 0.0, 0.0]);
		test.assert(tile_notifications == 1 && unit_notifications == 0 && f.preview.order_focus_id == f.units[2].id);
	}
	// Application lifecycle check beyond the frozen original trace: navigation
	// keeps the actual stack focus available for a later activation picker.
	f.action('open'); picker(f, 0); selected(f, null);
	f.action('escape'); test.assert(f.native.snapshot() == before && tile_notifications == 1);
	f.view.root.remove();
});

behavior.scenario('mixed Sentry Hold Hold activates only the highlighted Former and retains native W Tab focus', () => {
	const f = fixture('stacked', ['sleep', 'hold', 'hold']);
	selected(f, null); orders(f, ['SENTRY', 'HOLD', 'HOLD'], [1.0, 1.0, 1.0]);
	test.assert(f.state.queued[0].name == 'unit_sentry' && f.state.queued[1].name == 'unit_hold' && f.state.queued[2].name == 'unit_hold');
	const before = f.native.snapshot();
	f.action('open'); picker(f, 0);
	f.action('down'); picker(f, 1);
	f.action('down'); picker(f, 2); selected(f, null);
	test.assert(f.native.snapshot() == before && #sizeof(f.state.queued) == 3);
	f.action('enter');
	test.assert(!f.popup.is_shown() && f.state.queued[3].name == 'unit_activate' && f.state.queued[3].data.unit_id == f.units[1].id);
	selected(f, 1); orders(f, ['SENTRY', 'NO_ORDERS', 'HOLD'], [1.0, 1.0, 1.0]);
	test.assert(!f.units[0].needs_orders() && f.units[1].needs_orders() && !f.units[2].needs_orders());
	const activated = f.native.snapshot();
	for (action of ['wait', 'tab']) {
		f.action(action); selected(f, 1); test.assert(f.native.snapshot() == activated && #sizeof(f.state.queued) == 4);
	}
	f.view.root.remove();
});
