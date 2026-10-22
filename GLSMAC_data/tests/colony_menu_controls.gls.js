// Application authority/lifecycle probes, independent of original observations.
const behavior = #include('./_behavior');
const mounted = #include('./_unit_menu_orders_fixture');
const make = (profile) => {
	const f = mounted(#is_defined(profile) ? profile : 'synthetic');
	f.tab(); f.tab(); f.open_action();
	f.click = () => { return f.click_source(1); };
	return f;
};
const city = (f, size) => {
	test.assert(f.base.get_size() == size && #sizeof(f.game.bm.get_bases()) == 1 &&
		f.base.get_worked_tiles() == [] && f.base.get('accumulated_nutrients') == 0 && f.base.get_production().minerals == 9);
};
const receipt = (f, caller, id, base, success) => {
	f.events.emit('event_result', {name: 'join_base', caller: caller, data: {unit_id: id, base_id: base}, success: success});
};
for (profile of ['synthetic', 'action-edited']) {
	behavior.scenario('Action source identity joins native Pod once with ' + profile + ' labels', () => {
		const f = make(profile); const pod_id = f.units[2].id + 0; const pops = f.base.get_pops(); const doctor = pops[0];
		const before = [];
		for (i of [0, 1]) { before :+ [f.units[i].id, f.units[i].get_tile(), f.units[i].get_order(), f.units[i].movement]; }
		f.click(); f.click();
		test.assert(#sizeof(f.pending.requests) == 1, 'Duplicate menu clicks must queue one join');
		test.assert(f.pending.requests[0].name == 'join_base' && f.pending.requests[0].data == {unit_id: pod_id, base_id: f.base.id});
		city(f, 1); test.assert(f.game.um.has_unit(pod_id));
		f.flush(); city(f, 2);
		test.assert(!f.game.um.has_unit(pod_id) && f.native.selected_id() == f.units[0].id && f.preview.selected_unit_id == f.units[0].id);
		test.assert(f.menu.menus.left_menu.is_open && !f.menu.menus.left_menu_action.is_open);
		const joined = f.base.get_pops();
		test.assert(joined[0] == doctor && doctor.get_type() == 'DOCTOR' && joined[1].get_type() == 'WORKER' && !joined[1].has('worked_tile'));
		for (i of [0, 1]) { test.assert([f.units[i].id, f.units[i].get_tile(), f.units[i].get_order(), f.units[i].movement] == before[i]); }
		f.tab(); test.assert(f.native.selected_id() == f.units[1].id && !f.menu.menus.left_menu.is_open);
		f.view.root.remove();
	});
}
behavior.scenario('Join row rechecks absent or non-Colony focus then accepts a restored native Pod', () => {
	const f = make(); const saved = f.source_control(1).entry.open;
	f.events.select_unit(f.units[0]); saved();
	f.native.selection_reset(); f.events.select_tile(f.base.get_tile()); saved();
	test.assert(#sizeof(f.pending.requests) == 0); city(f, 1);
	f.events.select_unit(f.units[2]); saved();
	test.assert(#sizeof(f.pending.requests) == 1); f.flush(); city(f, 2); f.view.root.remove();
});
for (kind of ['no_moves', 'dead', 'locked', 'completed', 'inactive']) {
	behavior.scenario('Mounted join row rejects native ' + kind + ' eligibility', () => {
		const f = make(); const id = f.units[2].id + 0;
		f.native.configure_unit(id, kind); const before = f.native.snapshot();
		f.click(); test.assert(#sizeof(f.pending.requests) == 0 && f.native.snapshot() == before); city(f, 1);
		f.view.root.remove();
	});
}
behavior.scenario('Popup and pending keyboard join block retained menu callbacks', () => {
	const f = make(); const saved = f.source_control(1).entry.open;
	f.popup.no_sliding = true; f.popup.show('please_dont_go', () => {}); f.open_action(); saved();
	test.assert(f.popup.is_shown() && #sizeof(f.pending.requests) == 0);
	f.popup.hide('please_dont_go'); f.flush(); f.open_action();
	f.preview.frame.emit('keydown', {code: 'B', modifiers: {}}); saved();
	test.assert(#sizeof(f.pending.requests) == 1 && f.preview.founding_pending_id == f.units[2].id);
	f.flush(); city(f, 2); f.view.root.remove();
});
behavior.scenario('Wrong join base receipt cannot release shared controller or menu authority', () => {
	const f = make(); const id = f.units[2].id + 0; const owner = f.native.owner.id + 0; f.click();
	test.assert(#sizeof(f.pending.requests) == 1);
	receipt(f, owner + 1, id, f.base.id, true); receipt(f, owner, f.units[0].id, f.base.id, true);
	receipt(f, owner, id, f.base.id + 1, true);
	test.assert(f.preview.founding_pending_id == id && f.menu.menus.left_menu_action.is_open, 'Wrong city receipt must retain the actual pending join');
	f.preview.frame.emit('keydown', {code: 'B', modifiers: {}}); f.click();
	test.assert(#sizeof(f.pending.requests) == 1); city(f, 1);
	f.pending.delivered = 1; receipt(f, owner, id, f.base.id, false); f.click();
	test.assert(#sizeof(f.pending.requests) == 2, 'Matching rejection should permit a real retry');
	f.flush(); city(f, 2); f.view.root.remove();
});
behavior.scenario('Header switch and stale row callback preserve successor presentation after native join', () => {
	const f = make(); const saved = f.source_control(1).entry.open; f.click();
	test.assert(#sizeof(f.pending.requests) == 1);
	f.menu.menus.left_menu.items[8].el.emit('click', {button: 'left'}); saved(); f.flush(); city(f, 2);
	test.assert(#sizeof(f.pending.requests) == 1 && f.menu.menus.left_menu_help.is_open && f.menu.menus.left_menu.items[8].el.active);
	f.view.root.remove();
});
behavior.scenario('Closing pending join menus retains native consumption and does not reopen UI', () => {
	const f = make(); f.click(); test.assert(#sizeof(f.pending.requests) == 1);
	f.menu.close_all(); f.flush(); city(f, 2);
	test.assert(!f.menu.menus.left_menu.is_open && !f.menu.menus.left_menu_action.is_open); f.view.root.remove();
});
behavior.scenario('Removed row and saved callback cannot join in a replacement game', () => {
	const old = make(); const control = old.source_control(1); const saved = control.entry.open;
	test.assert(#typeof(saved) == 'Callable'); old.view.root.remove();
	const f = make(); const before = f.native.snapshot(); saved();
	test.assert(!control.el.emit('click', {button: 'left'}) && #sizeof(old.pending.requests) == 0 && #sizeof(f.pending.requests) == 0);
	test.assert(f.native.snapshot() == before && f.menu.menus.left_menu_action.is_open); city(f, 1); f.view.root.remove();
});
behavior.scenario('Join-only menu source does not found a city on an eligible empty tile', () => {
	const f = make(); const saved = f.source_control(1).entry.open; const pod = f.units[2];
	// Save the real mounted owned-city Join callback, then establish the empty
	// tile input through native movement and its normal display acknowledgement.
	// The free-tile menu has its own Found row; no visible Join row is fabricated.
	f.native.enable_movement();
	f.native.with_write(() => { pod.move_to_tile(f.game.tm.get_tile(1, 3), () => {}); });
	f.native.finish_unit_move(pod.id); f.events.select_unit(pod); f.flush();
	const before = f.native.snapshot();
	test.assert(f.preview.get_found_unit() != null && pod.get_tile().get_base() == null);
	saved(); f.flush();
	test.assert(#sizeof(f.pending.requests) == 0 && f.native.snapshot() == before); city(f, 1); f.view.root.remove();
});
behavior.scenario('Foreign stack invalidation is re-read before a join menu submission', () => {
	const f = make(); let foreign = null;
	f.native.with_write(() => {
		const data = {def: 'ScoutPatrol', health: 1.0, morale: 2}; data.owner = f.game.get_player(0); data.tile = f.base.get_tile();
		foreign = f.game.um.spawn_unit(data).id;
	});
	const before = f.native.snapshot(); f.click();
	test.assert(#sizeof(f.pending.requests) == 0 && f.native.snapshot() == before && f.game.um.has_unit(foreign)); city(f, 1); f.view.root.remove();
});
behavior.scenario('Saved join callback requires its current live open Action child', () => {
	const f = make(); const saved = f.source_control(1).entry.open;
	f.menu.menus.left_menu.items[8].el.emit('click', {button: 'left'}); saved();
	test.assert(#sizeof(f.pending.requests) == 0 && f.menu.menus.left_menu_help.is_open); city(f, 1);
	f.open_action(); saved(); test.assert(#sizeof(f.pending.requests) == 1);
	f.flush(); city(f, 2); f.view.root.remove();
});
