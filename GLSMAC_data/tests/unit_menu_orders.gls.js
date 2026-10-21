// Native application regressions for source identity, authoritative commands
// and lifecycle. Guard/receipt cases beyond the six traces are not parity claims.
const behavior = #include('./_behavior');
const fixture = #include('./_unit_menu_orders_fixture');
const states = (f) => {
	const result = [];
	for (unit of f.units) { result :+ {order: unit.get_order(), movement: unit.movement + 0.0}; }
	return result;
};
const receipt = (f, name, caller, id, success) => {
	f.events.emit('event_result', {name: name, caller: caller, data: {unit_id: id}, success: success});
};

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

behavior.scenario('pending requests suppress repeated row submissions until the matching receipt', () => {
	const f = fixture('synthetic'); f.open_action(); f.click_source(26); f.click_source(29);
	test.assert(#sizeof(f.pending.requests) == 1 && f.units[0].get_order() == 'NO_ORDERS');
	const id = f.units[0].id + 0; const caller = f.native.owner.id + 0;
	for (event of [{name: 'unit_sentry', caller: caller}, {name: 'unit_sentry', caller: caller, data: 'bad', success: true},
		{name: 'unit_sentry', caller: caller, data: {}, success: true}, {name: 'unit_sentry', caller: caller, data: {unit_id: id}}]) {
		f.events.emit('event_result', event);
	}
	receipt(f, 'unit_hold', caller, id, true);
	receipt(f, 'unit_sentry', caller + 1, id, true);
	receipt(f, 'unit_sentry', caller, f.units[1].id, true);
	test.assert(f.menu.menus.left_menu_action.is_open && f.preview.order_pending != null && f.units[0].get_order() == 'NO_ORDERS');
	f.flush();
	test.assert(f.units[0].get_order() == 'SENTRY' && !f.menu.menus.left_menu_action.is_open && f.preview.order_pending == null);
	f.view.root.remove();
});

behavior.scenario('a failed receipt leaves native state and child intact and permits a later request', () => {
	const f = fixture('synthetic'); f.open_action(); const before = states(f); f.click_source(29);
	// Transport rejection: no backend apply occurs for this request.
	f.pending.delivered = 1; receipt(f, 'unit_hold', f.native.owner.id, f.units[0].id, false);
	test.assert(states(f) == before && f.native.selected_id() == f.units[0].id && f.menu.menus.left_menu_action.is_open && f.preview.order_pending == null);
	f.click_source(29); f.flush();
	test.assert(f.units[0].get_order() == 'HOLD' && f.native.selected_id() == f.units[1].id && f.unchanged_city());
	f.view.root.remove();
});

behavior.scenario('a refused submission keeps the actual source child open without creating a request', () => {
	const f = fixture('synthetic'); f.open_action(); const submit = f.preview.submit_unit_order;
	f.preview.submit_unit_order = (name) => { return false; };
	f.click_source(26);
	test.assert(#sizeof(f.pending.requests) == 0 && f.menu.menus.left_menu_action.is_open && f.units[0].get_order() == 'NO_ORDERS');
	f.preview.submit_unit_order = submit; f.click_source(26); f.flush();
	test.assert(f.units[0].get_order() == 'SENTRY' && !f.menu.menus.left_menu_action.is_open);
	f.view.root.remove();
});

behavior.scenario('popup ownership and missing selection prevent commands through retained source callbacks', () => {
	const f = fixture('synthetic'); f.open_action(); const before = states(f);
	f.popup.no_sliding = true; f.popup.show('please_dont_go', () => {});
	f.open_action(); f.click_source(26); f.click_source(30);
	test.assert(#sizeof(f.pending.requests) == 0 && states(f) == before && f.popup.is_shown());
	f.popup.hide('please_dont_go'); f.flush();
	f.native.selection_reset(); f.events.select_tile(f.base.get_tile()); f.open_action(); f.click_source(29); f.click_source(30);
	test.assert(#sizeof(f.pending.requests) == 0 && states(f) == before && f.unchanged_city());
	f.view.root.remove();
});

behavior.scenario('header switching before an acknowledgement preserves the new header and native order authority', () => {
	const f = fixture('synthetic'); f.open_action(); f.click_source(26);
	f.menu.menus.left_menu.items[8].el.emit('click', {button: 'left'}); f.flush();
	test.assert(f.units[0].get_order() == 'SENTRY' && f.native.selected_id() == f.units[1].id);
	test.assert(f.menu.menus.left_menu_help.is_open && f.menu.menus.left_menu.items[8].el.active && f.menu.menus.left_menu.is_open);
	f.view.root.remove();
});

behavior.scenario('closure and popup arrival before completion never reopen menus or dismiss the modal', () => {
	const f = fixture('synthetic'); f.open_action(); f.click_source(30);
	f.popup.no_sliding = true; f.popup.show('please_dont_go', () => {}); f.flush();
	test.assert(f.units[0].movement == 0.0 && f.units[0].get_order() == 'NO_ORDERS' && f.native.selected_id() == f.units[1].id);
	test.assert(f.popup.is_shown() && !f.menu.menus.left_menu.is_open && f.unchanged_city());
	f.view.root.remove();
});

behavior.scenario('removed nodes and saved old callbacks cannot command a replacement game', () => {
	const old = fixture('synthetic'); old.open_action(); const control = old.source_control(26);
	const saved = control.entry.open; const button = control.el; old.view.root.remove();
	const f = fixture('action-edited'); f.open_action(); const before = states(f);
	saved();
	test.assert(button.emit('click', {button: 'left'}) == false && #sizeof(f.pending.requests) == 0 && states(f) == before);
	test.assert(f.menu.menus.left_menu_action.is_open && f.native.selected_id() == f.units[0].id && f.unchanged_city());
	f.view.root.remove();
});

behavior.scenario('modified Tab retains menus and focus while unmodified Tab reaches native navigation', () => {
	const f = fixture('synthetic'); f.open_action(); f.click_source(29); f.flush();
	test.assert(f.tab({shift: true}) == false && f.menu.menus.left_menu.is_open && f.native.selected_id() == f.units[1].id);
	test.assert(f.tab() == false && !f.menu.menus.left_menu.is_open && f.native.selected_id() == f.units[2].id);
	f.view.root.remove();
});
