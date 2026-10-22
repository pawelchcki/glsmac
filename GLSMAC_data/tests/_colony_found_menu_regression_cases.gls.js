// Native application authority regressions, separate from recorded outcomes.
// Collect scenario closures without allocating worlds until the selected group.
const scenarios = [];
const behavior = {scenario: (name, run) => { const entry = {name: name}; entry.run = run; scenarios :+ entry; }};
const native_fixture = #include('./_colony_found_menu_fixture');
const declared = #include('./_colony_found_menu_regression_input');
const event_handler = #include('../default/game/event/found_base');
const fixture = () => {
	const f = native_fixture(declared); f.defer_found = false; f.founding_requests = [];
	// Mounted component parameters have their own GSE object projection. Hook
	// the actual controller's transport, not a later fixture-object copy.
	const send = f.preview.p.game.event;
	f.preview.p.game.event = (name, data) => {
		if (name == 'found_base') {
			const request = {name: name}; request.data = data; f.founding_requests :+ request;
			if (f.defer_found) { return; }
		}
		send(name, data);
	};
	f.open_action = () => {
		if (!f.menu.menus.left_menu.is_open) { f.action('menu'); }
		let clicks = 0;
		while ((!#is_defined(f.menu.menus.left_menu_action) || !f.menu.menus.left_menu_action.is_open) && clicks < 2) { f.action({header: 4}); clicks++; }
		if (!#is_defined(f.menu.menus.left_menu_action) || !f.menu.menus.left_menu_action.is_open) { throw Error('Actual Action header did not open'); }
	};
	f.open_found = () => {
		f.open_action(); f.action({row_source: 0});
		const dialog = f.dialog(); if (dialog == null) { throw Error('Actual source0 did not mount a native naming dialog'); }
		return dialog;
	};
	f.edit = (dialog, text) => {
		let clears = 0;
		while (dialog.input.input_state.get_value() != '' && clears < 256) { dialog.input.raw_key('BACKSPACE', '', 0, ''); clears++; }
		if (dialog.input.input_state.get_value() != '') { throw Error('Native field did not clear'); }
		// This regression's requested edit is the existing public first edit.
		if (text != declared.actions[3].edit) { throw Error('Undeclared regression edit'); }
		for (character of declared.actions[3].keys) { dialog.input.raw_key('NONE', character, 0, ''); }
	};
	f.invoke = (handlers, name) => { for (entry of handlers) { if (entry.name == name) { entry.callback({button: 'left'}); } } };
	return f;
};
const unchanged = (f, before) => {
	test.assert(f.native.snapshot() == before, 'Retained UI callback must preserve the actual native world');
	test.assert(#sizeof(f.founding_requests) == 0, 'Ineligible or cancelled drafts must not submit a founding event');
};

behavior.scenario('actual B and FOUND button share the free-tile interactive controller', () => {
	const f = fixture(); const before = f.native.snapshot();
	test.assert(f.preview.frame.emit('keydown', {code: 'B', modifiers: {}})); f.flush();
	test.assert(f.dialog() != null && #sizeof(f.founding_requests) == 0);
	f.action('cancel'); f.preview.found_button.emit('click', {button: 'left'}); f.flush();
	test.assert(f.dialog() != null); f.action('button-cancel'); unchanged(f, before); f.view.root.remove();
});

behavior.scenario('actual Action source0 opens a dialog without founding or joining early', () => {
	const f = fixture(); const before = f.native.snapshot(); f.open_action();
	const row = f.source_control(0); test.assert(row.entry.source_index == 0);
	f.open_found(); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('actual naming caption and field label come from declared common Script records', () => {
	const f = fixture(); const dialog = f.open_found(); let source = null;
	for (entry of declared.sources) { if (entry.name == 'script.txt') { source = test.parse_smac_text(entry.source, 'dialogs'); } }
	let caption = null; let label = null;
	for (record of source.dialog('NEWBASE').records) {
		if (record.kind == 'directive' && record.name == 'caption') { caption = record.argument; }
		if (record.kind == 'text') { if (label != null) { throw Error('Ambiguous declared NEWBASE label'); } label = record.text; }
	}
	test.assert(dialog.texts[0].text == caption && dialog.texts[1].text == label);
	test.assert(dialog.input.value == dialog.input.input_state.get_value(), 'Mounted editor must expose its actual native buffer');
	f.view.root.remove();
});
for (cancel_action of ['button-cancel', 'cancel']) {
	const action = cancel_action;
	behavior.scenario('actual ' + action + ' preserves native Pod city stores and registered names', () => {
		const f = fixture(); const before = f.native.snapshot(); const dialog = f.open_found();
		f.edit(dialog, declared.actions[3].edit); test.assert(dialog.input.input_state.get_value() == declared.actions[3].edit);
		f.action(action); test.assert(f.dialog() == null); unchanged(f, before); f.view.root.remove();
	});
}
behavior.scenario('cancelled and reopened naming fields own independent native buffers and stale callbacks', () => {
	const f = fixture(); const before = f.native.snapshot(); const first = f.open_found();
	const callbacks = first.buttons[0].get_handlers(); f.edit(first, declared.actions[3].edit); f.action('button-cancel');
	const second = f.open_found(); const draft = second.input.input_state.get_value();
	test.assert(first.input != second.input && first.input.input_state != second.input.input_state);
	first.input.raw_key('BACKSPACE', '', 0, ''); f.invoke(callbacks, 'click'); f.flush();
	test.assert(second.input.input_state.get_value() == draft && f.dialog().input == second.input);
	unchanged(f, before); f.view.root.remove();
});
behavior.scenario('retained source0 callbacks cannot act without a selected native unit', () => {
	const f = fixture(); f.open_action(); const callbacks = f.source_control(0).el.get_handlers();
	f.native.selection_reset(); f.events.select_tile(f.base.get_tile()); const before = f.native.snapshot();
	f.invoke(callbacks, 'click'); f.flush(); test.assert(f.dialog() == null); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('retained source0 callbacks cannot dispatch a foreign native Colony Pod', () => {
	const f = fixture(); f.open_action(); const callbacks = f.source_control(0).el.get_handlers(); let foreign = null;
	f.native.with_write(() => {
		const data = {def: 'ColonyPod', health: 1.0, morale: 2}; data.owner = f.game.get_player(0); data.tile = f.units[2].get_tile();
		foreign = f.game.um.spawn_unit(data);
	});
	f.events.select_unit(foreign); const before = f.native.snapshot(); f.invoke(callbacks, 'click'); f.flush();
	test.assert(f.dialog() == null); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('selection changing during a real draft invalidates its captured confirmation', () => {
	const f = fixture(); const dialog = f.open_found(); const callbacks = dialog.buttons[0].get_handlers();
	f.edit(dialog, declared.actions[3].edit); f.events.select_unit(f.units[0]); const before = f.native.snapshot();
	f.invoke(callbacks, 'click'); f.flush(); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('turn changing during a real draft invalidates its captured confirmation', () => {
	const f = fixture(); const dialog = f.open_found(); const callbacks = dialog.buttons[0].get_handlers();
	f.edit(dialog, declared.actions[3].edit); f.native.set_turn(f.game.get_turn() + 1); const before = f.native.snapshot();
	f.invoke(callbacks, 'click'); f.flush(); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('switching Action headers invalidates retained source0 callbacks', () => {
	const f = fixture(); f.open_action(); const callbacks = f.source_control(0).el.get_handlers(); const before = f.native.snapshot();
	f.menu.menus.left_menu.items[5].el.emit('click', {button: 'left'}); f.flush(); f.invoke(callbacks, 'click'); f.flush();
	test.assert(f.dialog() == null); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('removed mounted menu owners cannot open a dialog from retained source0 callbacks', () => {
	const f = fixture(); f.open_action(); const callbacks = f.source_control(0).el.get_handlers(); const before = f.native.snapshot();
	f.view.root.remove(); f.invoke(callbacks, 'click'); unchanged(f, before);
});
behavior.scenario('repeated actual confirmation waits for one authoritative native founding request', () => {
	const f = fixture(); const dialog = f.open_found(); f.edit(dialog, declared.actions[3].edit); const before = f.native.snapshot();
	const callbacks = dialog.buttons[0].get_handlers(); f.defer_found = true;
	f.invoke(callbacks, 'click'); f.invoke(callbacks, 'click'); f.flush();
	test.assert(#sizeof(f.founding_requests) == 1, 'Repeated actual callbacks must not allocate duplicate native commands');
	test.assert(f.founding_requests[0].data.unit_id == f.units[2].id && f.founding_requests[0].data.name == declared.actions[3].edit);
	test.assert(f.native.snapshot() == before, 'Deferred native authority must preserve the entire world'); f.view.root.remove();
});
behavior.scenario('wrong caller unit turn token or draft receipts cannot release the pending founding authority', () => {
	const f = fixture(); const dialog = f.open_found(); f.edit(dialog, declared.actions[3].edit); f.defer_found = true;
	dialog.buttons[0].emit('click', {button: 'left'}); const request = f.founding_requests[0]; const caller = f.native.owner.id + 0;
	test.assert(f.preview.founding_pending_id == f.units[2].id);
	for (field of ['unit_id', 'turn_id', 'request_token', 'name']) {
		test.assert(#is_defined(request.data[field]), 'Named founding request must carry its native authority identity');
		const data = #clone(request.data); data[field] = field == 'name' ? request.data[field] + 'x' : request.data[field] + 1;
		const receipt = {name: 'found_base', caller: caller, success: true}; receipt.data = data; f.events.emit('event_result', receipt);
		test.assert(f.preview.founding_pending_id == f.units[2].id, 'An unrelated receipt must leave the actual command pending');
	}
	const wrong_owner = {name: 'found_base', caller: caller + 1, success: true}; wrong_owner.data = request.data; f.events.emit('event_result', wrong_owner);
	test.assert(f.preview.founding_pending_id == f.units[2].id);
	const rejected = {name: 'found_base', caller: caller, success: false}; rejected.data = request.data; f.events.emit('event_result', rejected);
	test.assert(f.preview.founding_pending_id == null, 'Only the matching result may release native command authority'); f.view.root.remove();
});
behavior.scenario('actual captured named confirmation applies atomically and rolls back its native receipt', () => {
	const f = fixture(); const dialog = f.open_found(); f.edit(dialog, declared.actions[3].edit); f.defer_found = true;
	dialog.buttons[0].emit('click', {button: 'left'}); const request = f.founding_requests[0]; const before = f.native.snapshot();
	const e = {caller: f.native.owner.id}; e.game = f.game; e.data = request.data;
	test.assert(!#is_defined(event_handler.validate(e)));
	f.native.with_write(() => { e.applied = event_handler.apply(e); });
	let created = null; for (city of f.game.bm.get_bases()) { if (city != f.base) { if (created != null) { throw Error('Duplicate native founding result'); } created = city; } }
	test.assert(created != null && created.name == request.data.name && e.applied.base_name == created.name);
	test.assert(!f.game.um.has_unit(request.data.unit_id), 'The same atomic native transaction must consume its actual Pod');
	f.native.with_write(() => { event_handler.rollback(e); });
	test.assert(f.native.snapshot() == before, 'Receipt rollback restores actual citizen stores units names IDs and RNG'); f.view.root.remove();
});

return scenarios;
