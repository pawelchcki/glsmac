// Native source-order regressions; all commands use mounted controls.
const behavior = #include('./_behavior');
const fixture = #include('./_unit_menu_orders_fixture');

for (profile of ['synthetic', 'action-edited']) {
	const source_profile = profile;
	for (spec of [[26, 'SENTRY', 1.0], [29, 'HOLD', 1.0], [30, 'NO_ORDERS', 0.0]]) {
		const expected = spec;
		behavior.scenario(source_profile + ' source slot ' + #to_string(expected[0]) + ' executes native order and Tab', () => {
			const f = fixture(source_profile); f.open_action();
			const child = f.menu.menus.left_menu_action; const row = f.source_control(expected[0]);
			test.assert(row.entry.source_index == expected[0] && row.el.handler_count('click') == 1);
			if (source_profile == 'action-edited') {
				test.assert(f.menu.headers[4].label == 'ORDERS');
				test.assert(row.el.text == (expected[0] == 26 ? 'Watch Here' : (expected[0] == 29 ? 'Stay Here' : 'Pause Now')));
			}
			test.assert(f.click_source(expected[0]));
			test.assert(f.units[0].get_order() == 'NO_ORDERS' && f.units[0].movement == 1.0 && child.is_open,
				'Before acknowledgement only the actual production request is queued');
			f.flush();
			test.assert(f.units[0].get_order() == expected[1] && f.units[0].movement == expected[2]);
			test.assert(f.units[1].get_order() == 'NO_ORDERS' && f.units[1].movement == 1.0 && f.units[2].get_order() == 'NO_ORDERS' && f.units[2].movement == 1.0);
			test.assert(f.native.selected_id() == f.units[1].id && f.preview.selected_unit_id == f.units[1].id && f.menu.selected_unit_id == f.units[1].id);
			test.assert(f.menu.menus.left_menu.is_open && !child.is_open && !f.menu.menus.left_menu.items[4].el.active);
			test.assert(f.view.find('button', 'text', 'MENU').active && f.unchanged_city());
			test.assert(f.tab() == false, 'Tab closes the root and falls through to the real native navigation controller');
			test.assert(!f.menu.menus.left_menu.is_open && !f.view.find('button', 'text', 'MENU').active && f.native.selected_id() == f.units[2].id);
			test.assert(f.units[0].get_order() == expected[1] && f.units[0].movement == expected[2] && f.unchanged_city());
			f.view.root.remove();
		});
	}
}

behavior.scenario('source commands use the currently selected unit on reopening', () => {
	const f = fixture('synthetic'); f.open_action(); f.click_source(26); f.flush();
	f.open_action(); f.click_source(29); f.flush();
	test.assert(f.units[0].get_order() == 'SENTRY' && f.units[1].get_order() == 'HOLD' && f.units[2].get_order() == 'NO_ORDERS');
	test.assert(f.native.selected_id() == f.units[2].id && f.unchanged_city());
	f.view.root.remove();
});
