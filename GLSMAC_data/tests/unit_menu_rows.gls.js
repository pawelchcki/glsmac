// Native mounted Action-row presentation across real unit navigation.
const behavior = #include('./_behavior');
const fixture = #include('./_unit_menu_orders_fixture');
const states = (f) => {
	const result = [];
	for (unit of f.units) { result :+ {order: unit.get_order(), movement: unit.movement + 0.0}; }
	return result;
};

// The synthetic Former/Sentry pilot supplies the observed row property.
// Edited wording and live reselection are application lifecycle regressions.
for (profile of ['synthetic', 'action-edited']) {
	const source_profile = profile;
	behavior.scenario(source_profile + ' Former Action rows retain source identity and restore Scout presentation', () => {
		const f = fixture(source_profile); f.open_action();
		const child = f.menu.menus.left_menu_action;
		const scout_row = f.source_control(2).el;
		test.assert(child.el.height == 23 * f.menu.item_height && scout_row.is_visible());
		f.tab(); f.open_action();
		test.assert(f.native.selected_id() == f.units[1].id && f.menu.menus.left_menu_action == child);
		const expected = [9, null, 10, 11, 12, null, 15, 16, 17, 19, null, 20, 21, 23, null, 26, 27, 28, 29, 30];
		let index = 0;
		for (row of child.rows) {
			if (row.el.is_visible()) {
				test.assert(index < #sizeof(expected));
				if (expected[index] == null) { test.assert(row.entry.separator && row.el.handler_count('click') == 0); }
				else {
					test.assert(row.entry.source_index == expected[index] && row.el.text == row.entry.label);
					test.assert(f.color(row.el) == 'rgb(176, 212, 235)');
				}
				test.assert(row.el.top == index * f.menu.item_height + (expected[index] == null ? f.menu.item_height / 2 : 0));
				index++;
			}
		}
		test.assert(index == 20 && child.el.height == 20 * f.menu.item_height && !scout_row.is_visible());
		f.events.select_unit(f.units[0]);
		test.assert(scout_row.is_visible() && child.el.height == 23 * f.menu.item_height && f.source_control(2).el == scout_row);
		test.assert(states(f) == [{order: 'NO_ORDERS', movement: 1.0}, {order: 'NO_ORDERS', movement: 1.0}, {order: 'NO_ORDERS', movement: 1.0}] && f.unchanged_city());
		f.view.root.remove();
	});
}

// Only synthetic Colony/Sentry has original evidence. Edited text and live
// Colony/Former/Scout/tile restoration exercise application source/lifetime rules.
for (profile of ['synthetic', 'action-edited']) {
	const source_profile = profile;
	behavior.scenario(source_profile + ' Colony Action groups restore across native contexts and execute Sentry', () => {
		const f = fixture(source_profile); f.open_action();
		const child = f.menu.menus.left_menu_action; const scout_row = f.source_control(2).el;
		f.tab(); f.tab(); f.open_action();
		test.assert(f.native.selected_id() == f.units[2].id && f.menu.menus.left_menu_action == child);
		const colony_row = f.source_control(1).el;
		const expected = [1, null, 9, null, 10, 11, 12, null, 15, 16, 17, 19, null, 20, 21, 23, null, 26, 27, 28, 29, 30];
		let index = 0;
		for (row of child.rows) {
			if (row.el.is_visible()) {
				test.assert(index < #sizeof(expected));
				if (expected[index] == null) { test.assert(row.entry.separator && row.el.handler_count('click') == 0); }
				else {
					test.assert(row.entry.source_index == expected[index] && row.el.text == row.entry.label);
					test.assert(f.color(row.el) == 'rgb(176, 212, 235)');
				}
				test.assert(row.el.top == index * f.menu.item_height + (expected[index] == null ? f.menu.item_height / 2 : 0));
				index++;
			}
		}
		test.assert(index == 22 && child.el.height == 22 * f.menu.item_height && !scout_row.is_visible());
		f.events.select_unit(f.units[1]);
		test.assert(!colony_row.is_visible() && !scout_row.is_visible() && child.el.height == 20 * f.menu.item_height);
		test.assert(f.source_control(9).el.top == 0);
		f.events.select_unit(f.units[0]);
		test.assert(!colony_row.is_visible() && scout_row.is_visible() && child.el.height == 23 * f.menu.item_height);
		test.assert(f.source_control(2).el == scout_row && scout_row.top == 0);
		f.events.select_tile(f.base.get_tile());
		test.assert(!colony_row.is_visible() && child.el.height == 23 * f.menu.item_height && scout_row.top == 0);
		f.events.select_unit(f.units[2]);
		test.assert(colony_row.is_visible() && f.source_control(1).el == colony_row && child.el.height == 22 * f.menu.item_height);
		f.click_source(26); f.flush();
		test.assert(f.units[2].get_order() == 'SENTRY' && f.units[2].movement == 1.0 && f.native.selected_id() == f.units[0].id);
		test.assert(!child.is_open && f.menu.menus.left_menu.is_open && !f.menu.menus.left_menu.items[4].el.active);
		f.tab();
		test.assert(!f.menu.menus.left_menu.is_open && f.native.selected_id() == f.units[1].id);
		test.assert(f.units[0].get_order() == 'NO_ORDERS' && f.units[1].get_order() == 'NO_ORDERS' && f.unchanged_city());
		f.view.root.remove();
	});
}
