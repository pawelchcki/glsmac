// Native context-order regressions run in a fresh worker: adding another full
// UI fixture to unit_menu_orders exceeded the cached WASM memory limit at exit.
const behavior = #include('./_behavior');
const fixture = #include('./_unit_menu_orders_fixture');
const states = (f) => {
	const result = [];
	for (unit of f.units) { result :+ {order: unit.get_order(), movement: unit.movement + 0.0}; }
	return result;
};

behavior.scenario('initial Tab to Former Hold preserves ready companions and restores retained context controls', () => {
	const f = fixture('synthetic'); f.tab(); f.open_action();
	const child = f.menu.menus.left_menu_action; const hold = f.source_control(29).el;
	test.assert(f.native.selected_id() == f.units[1].id && child.el.height == 20 * f.menu.item_height);
	f.click_source(29);
	test.assert(f.units[1].get_order() == 'NO_ORDERS' && f.units[1].movement == 1.0 && child.is_open);
	f.flush();
	test.assert(f.units[1].get_order() == 'HOLD' && f.units[1].movement == 1.0);
	test.assert(f.native.selected_id() == f.units[2].id && f.preview.selected_unit_id == f.units[2].id && f.menu.selected_unit_id == f.units[2].id);
	test.assert(f.menu.menus.left_menu.is_open && !child.is_open && !f.menu.menus.left_menu.items[4].el.active && !hold.is_removed());
	test.assert(f.units[0].get_order() == 'NO_ORDERS' && f.units[0].movement == 1.0 && f.units[2].get_order() == 'NO_ORDERS' && f.units[2].movement == 1.0);
	test.assert(f.tab() == false && f.native.selected_id() == f.units[0].id && !f.menu.menus.left_menu.is_open);
	// Reopening and explicit held-unit inspection are application lifecycle
	// checks beyond the six original Former/Hold checkpoints.
	f.open_action();
	test.assert(f.menu.menus.left_menu_action == child && child.el.height == 23 * f.menu.item_height && f.source_control(2).el.top == 0);
	f.events.select_unit(f.units[1]);
	test.assert(child.el.height == 20 * f.menu.item_height && f.source_control(29).el == hold && f.source_control(9).el.top == 0);
	f.menu.close('left_menu'); f.events.select_unit(f.units[2]); f.open_action();
	test.assert(child.el.height == 22 * f.menu.item_height && f.source_control(1).el.top == 0 && f.source_control(29).el == hold);
	test.assert(states(f) == [{order: 'NO_ORDERS', movement: 1.0}, {order: 'HOLD', movement: 1.0}, {order: 'NO_ORDERS', movement: 1.0}] && f.unchanged_city());
	f.view.root.remove();
});

