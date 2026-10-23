// Native application invariants; original parity is only the two public traces.
const behavior = #include('./_behavior');
const prepare = #include('./_colony_near_fixture');
const declared = #include('./_colony_near_regression_input');
const fixture = () => {
	const f = prepare(declared); f.action('tab'); f.action('tab');
	f.message_node = null;
	for (node of f.view.live('text')) { if (#is_defined(node.left) && node.left == 228 && #is_defined(node.top) && node.top == 10) { f.message_node = node; } }
	if (f.message_node == null) { throw Error('Missing mounted native HUD'); }
	f.invoke = (handlers) => { for (entry of handlers) { if (entry.name == 'click') { entry.callback({button: 'left'}); } } };
	f.open = () => { f.open_action(); f.flush(); return f.source_control(0); };
	return f;
};
const unchanged = (f, before) => {
	test.assert(f.native.snapshot() == before, 'Warning must preserve the complete native world');
	test.assert(#sizeof(f.pending.requests) == 0 && f.preview.founding.dialog == null && f.preview.founding_pending_id == null);
};
behavior.scenario('source warning closes only the actual Action child and rejects a duplicate saved click', () => {
	const f = fixture(); const before = f.native.snapshot(); const row = f.open(); const saved = row.el.get_handlers();
	f.action({row_source: 0}); const text = f.message_node.text; const timer_count = #sizeof(f.view.timers);
	test.assert(text == #include('../default/game/colony_site_warning')(f.glsmac));
	test.assert(f.menu.menus.left_menu.is_open && !f.menu.menus.left_menu_action.is_open && f.native.selected_id() == f.units[2].id);
	f.invoke(saved); f.flush(); test.assert(#sizeof(f.view.timers) == timer_count && f.message_node.text == text); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('actual B and FOUND controls share the source warning without command submission', () => {
	const f = fixture(); const before = f.native.snapshot();
	test.assert(f.preview.frame.emit('keydown', {code: 'B', modifiers: {}})); f.flush();
	const warning = f.message_node.text; test.assert(warning != '');
	f.preview.found_button.emit('click', {button: 'left'}); f.flush(); test.assert(f.message_node.text == warning); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('retained Action callbacks recheck changed selection and native readiness', () => {
	const f = fixture(); const saved = f.open().el.get_handlers();
	f.events.select_unit(f.units[0]); const before = f.native.snapshot(); f.invoke(saved); f.flush();
	test.assert(f.message_node.text == ''); unchanged(f, before);
	f.events.select_unit(f.units[2]); f.native.configure_unit(f.units[2].id, 'no_moves'); const spent = f.native.snapshot();
	f.invoke(saved); f.flush(); test.assert(f.message_node.text == ''); unchanged(f, spent); f.view.root.remove();
});
behavior.scenario('popup pending work and inactive turn prevent a near warning from stale controls', () => {
	const f = fixture(); const saved = f.open().el.get_handlers(); const before = f.native.snapshot();
	f.popup.no_sliding = true; f.popup.show('turn_confirmation', () => {}); f.invoke(saved); f.flush(); test.assert(f.message_node.text == ''); f.popup.hide('turn_confirmation'); f.flush();
	f.open(); f.preview.order_pending = {name: 'unit_terraform', unit_id: f.units[2].id, action: 'farm'}; f.invoke(saved); f.flush(); test.assert(f.message_node.text == ''); f.preview.order_pending = null;
	f.open(); f.preview.is_turn_active = false; f.invoke(saved); f.flush(); test.assert(f.message_node.text == ''); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('switching or removing the menu invalidates a retained near warning callback', () => {
	const f = fixture(); const saved = f.open().el.get_handlers(); const before = f.native.snapshot();
	f.menu.menus.left_menu.items[5].el.emit('click', {button: 'left'}); f.flush(); f.invoke(saved); test.assert(f.message_node.text == ''); unchanged(f, before);
	f.view.root.remove(); f.invoke(saved); test.assert(f.message_node.text == ''); unchanged(f, before);
});
behavior.scenario('a saved row recomputes the actual Pod site after native movement', () => {
	const f = fixture(); const saved = f.open().el.get_handlers();
	f.native.enable_movement();
	f.native.with_write(() => { f.units[2].move_to_tile(f.game.tm.get_tile(0, 4), () => {}); });
	f.native.finish_unit_move(f.units[2].id);
	f.events.select_unit(f.units[2]); const before = f.native.snapshot(); f.invoke(saved); f.flush();
	test.assert(f.preview.founding.dialog != null && f.message_node.text == '');
	test.assert(f.native.snapshot() == before && #sizeof(f.pending.requests) == 0); f.view.root.remove();
});
behavior.scenario('the existing message fade replaces older timers and owner removal stops delivery', () => {
	const f = fixture(); const before = f.native.snapshot(); f.preview.start_colony_action(); f.flush();
	let first = null; for (timer of f.view.timers) { if (timer.interval == 5000 && timer.running) { first = timer; } }
	test.assert(first != null); f.preview.start_colony_action(); f.flush();
	let second = null; for (timer of f.view.timers) { if (timer.interval == 5000 && timer.running) { second = timer; } }
	test.assert(second != null && second != first && !first.running); first.tick(); test.assert(f.message_node.text != '');
	second.tick(); test.assert(f.message_node.text == ''); f.preview.start_colony_action(); f.flush();
	f.view.root.remove(); test.assert(f.view.running_timers() == 0); unchanged(f, before);
});
