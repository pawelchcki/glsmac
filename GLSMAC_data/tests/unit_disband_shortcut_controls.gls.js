// Application keyboard authority/lifetime regressions. The recorded shortcut
// cases separately establish the bounded source/modal/native behavior transfer.
const behavior = #include('./_behavior'); const prepare = #include('./_unit_disband_shortcut_fixture');
const declared = #include('./_unit_disband_regression_input');
const fixture = () => {
	const f = prepare(declared); f.action('tab'); f.requests = []; f.defer = false;
	const send = f.preview.disband.p.game.event;
	f.preview.disband.p.game.event = (name, data) => {
		if (name == 'unit_disband') { const request = {name: name}; request.data = data; f.requests :+ request; if (f.defer) { return; } }
		send(name, data);
	};
	f.deliver = () => { const request = f.requests[0]; send(request.name, request.data); f.flush(); };
	return f;
};
behavior.scenario('only exact Shift D opens the shared modal while MENU remains closed', () => {
	const f = fixture(); const before = f.native.snapshot();
	for (mods of [{}, {ctrl: true}, {alt: true}, {ctrl: true, shift: true}]) { test.assert(!f.key('D', mods) && f.dialog() == null); }
	test.assert(f.key('D', {shift: true}) && f.dialog() != null && f.dialog().selected == 0);
	test.assert(!f.menu.menus.left_menu.is_open && f.native.snapshot() == before && #sizeof(f.requests) == 0);
	f.action('cancel'); f.view.root.remove();
});
behavior.scenario('modal routing consumes duplicate shortcut and Escape releases keyboard draft', () => {
	const f = fixture(); const before = f.native.snapshot(); f.action('disband-shortcut'); const dialog = f.dialog();
	f.action('down'); f.action('disband-shortcut');
	test.assert(f.dialog().frame == dialog.frame && f.dialog().selected == 1 && #sizeof(f.requests) == 0);
	f.action('cancel'); test.assert(f.dialog() == null && f.preview.order_pending == null && f.native.snapshot() == before);
	f.action('disband-shortcut'); test.assert(f.dialog().selected == 0); f.action('confirm');
	test.assert(f.dialog() == null && f.native.snapshot() == before && !f.menu.menus.left_menu.is_open); f.view.root.remove();
});
behavior.scenario('shortcut respects pending command popup and inactive turn authority', () => {
	const f = fixture(); const before = f.native.snapshot();
	f.preview.order_pending = {name: 'unit_terraform', unit_id: f.units[1].id, action: 'farm'};
	test.assert(!f.key('D', {shift: true}) && f.dialog() == null); f.preview.order_pending = null;
	f.preview.is_turn_active = false; test.assert(!f.key('D', {shift: true}) && f.dialog() == null); f.preview.is_turn_active = true;
	f.popup.no_sliding = true; f.popup.show('please_dont_go', () => {});
	f.key('D', {shift: true}); test.assert(f.popup.is_shown() && f.preview.disband.dialog == null);
	test.assert(f.native.snapshot() == before && #sizeof(f.requests) == 0); f.view.root.remove();
});
behavior.scenario('shortcut cannot acquire absent foreign or spent selected units', () => {
	const f = fixture(); f.events.select_tile(f.base.get_tile()); const before = f.native.snapshot();
	test.assert(!f.key('D', {shift: true}) && f.dialog() == null && f.native.snapshot() == before);
	let foreign = null; f.native.with_write(() => { const data = {def: 'Formers', health: 1.0, morale: 2}; data.owner = f.game.get_player(0); data.tile = f.units[1].get_tile(); foreign = f.game.um.spawn_unit(data); });
	f.events.select_unit(foreign); const other = f.native.snapshot();
	test.assert(!f.key('D', {shift: true}) && f.dialog() == null && f.native.snapshot() == other);
	f.events.select_unit(f.units[1]); f.native.configure_unit(f.units[1].id, 'no_moves'); const spent = f.native.snapshot();
	test.assert(!f.key('D', {shift: true}) && f.dialog() == null && f.native.snapshot() == spent && #sizeof(f.requests) == 0); f.view.root.remove();
});
behavior.scenario('keyboard draft invalidates after focus change and removed panel stays inert', () => {
	const f = fixture(); f.action('disband-shortcut'); const modal = f.dialog().frame; f.action('down');
	f.events.select_unit(f.units[0]); const before = f.native.snapshot(); modal.emit('keydown', {code: 'ENTER', modifiers: {}}); f.flush();
	test.assert(f.dialog() == null && f.native.snapshot() == before && #sizeof(f.requests) == 0);
	f.events.select_unit(f.units[1]); const saved = f.preview.frame.get_handlers(); f.view.root.remove();
	for (entry of saved) { if (entry.name == 'keydown') { entry.callback({code: 'D', modifiers: {shift: true}}); } }
	test.assert(f.dialog() == null && #sizeof(f.requests) == 0 && f.view.running_timers() == 0);
});
behavior.scenario('keyboard confirmation shares pending authority and native successor selection', () => {
	const f = fixture(); const former = f.units[1].id + 0; const colony = f.units[2].id + 0;
	f.defer = true; const before = f.native.snapshot(); f.action('disband-shortcut'); f.action('down'); f.action('confirm');
	test.assert(#sizeof(f.requests) == 1 && f.preview.order_pending != null && f.dialog() == null && f.native.snapshot() == before);
	test.assert(!f.key('D', {shift: true}) && #sizeof(f.requests) == 1);
	f.deliver(); test.assert(!f.game.um.has_unit(former) && f.native.selected_id() == colony);
	test.assert(f.preview.order_pending == null && !f.menu.menus.left_menu.is_open && f.dialog() == null); f.view.root.remove();
});
