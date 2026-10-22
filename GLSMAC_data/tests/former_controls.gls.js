const behavior = #include('./_behavior');
const native = #include('./_former_work_fixture');
const mocks = #include('./_ui_mocks');
const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
const replacement_source = '#MIMIMI\n#xs 320\n#wave 5\n#caption Synthetic Ecologist\nReplace ($MINE0) after work completes.\nProceed with this change?\n\nKeep existing.\nProceed.\n#END\n';
const fixture = () => {
	const f = native('normal'); f.view = mocks.display(); f.ui_game = mocks.events(); f.map = mocks.events();
	f.state = {modal: false, queued: []};
	f.ui_game.get_um = () => { return f.game.um; }; f.ui_game.get_bm = () => { return f.game.bm; };
	f.ui_game.get_tm = () => { return f.game.tm; }; f.ui_game.get_player = () => { return f.owner; };
	f.ui_game.get_players = () => { return f.game.get_players(); }; f.ui_game.get_turn = () => { return f.game.get_turn(); };
	f.ui_game.is_started = () => { return f.game.is_started(); };
	f.ui_game.is_turn_complete = (id) => { return f.game.is_turn_complete(id); };
	f.ui_game.get = (key) => { return f.game.get(key); };
	f.ui_game.event = (name, data) => { const row = {name: name}; row.data = data; f.state.queued :+ row; };
	f.ui_game.select_unit = (unit) => {
		const e = {}; e.unit = unit; f.ui_game.emit('unit_select', e); f.map.emit('unit_preview', e);
	};
	f.ui_game.select_tile = (tile) => { const e = {}; e.tile = tile; f.ui_game.emit('tile_select', e); };
	const p = {modules: {popup: {is_shown: () => { return f.state.modal; }}}};
	p.el = f.view.root; p.ui = f.view.ui; p.game = f.ui_game; p.map = f.map;
	p.get_stats_str = (unit) => { return ''; };
	p.glsmac = {load_smac_text: (name, kind) => {
		test.assert(name == 'xscript.txt' && kind == 'dialogs');
		return test.parse_smac_text(replacement_source, 'dialogs');
	}};
	preview.init(p); f.ui_game.select_unit(f.former);
	f.key = (code, modifiers) => { return preview.frame.emit('keydown', {code: code, modifiers: modifiers}); };
	f.click = (text) => { return f.view.find('button', 'text', text).emit('click', {}); };
	f.deliver = (index) => {
		const row = f.state.queued[index]; const handler = #include('../default/game/event/' + row.name);
		const e = {caller: f.owner.id}; e.game = f.game; e.data = row.data;
		const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
		f.with_write(() => { handler.apply(e); });
		const result = {name: row.name, caller: f.owner.id, success: true}; result.data = row.data;
		f.ui_game.emit('event_result', result);
	};
	f.prepare_replacement = () => {
		f.with_write(() => { f.game.tm.set_terraforming(2, 2, {road: false, farm: true, mine: false, forest: false}); });
		const popup = #include('../default/ui/parts/game/popup/popup');
		popup.available_popups = ['terraforming_replacement']; popup.no_sliding = true;
		p.ui.get_height = () => { return 768; };
		p.modules.bottom_bar = {height: 256}; p.modules.menu = {close_all: () => {}};
		p.modules.popup = popup; popup.init(p); f.popup = popup;
		f.replacement = #include('../default/ui/parts/game/popup/terraforming_replacement');
	};
	return f;
};

behavior.scenario('visible Farm control queues one scalar command and labels the authoritative work state', () => {
	const f = fixture(); f.click('FARM'); f.key('F', {});
	test.assert(#sizeof(f.state.queued) == 1 && f.state.queued[0].name == 'unit_terraform');
	test.assert(f.state.queued[0].data == {unit_id: f.former.id, action: 'farm'} && f.former.get_order() == 'NO_ORDERS');
	f.deliver(0);
	test.assert(f.former.get_order() == 'TERRAFORM' && preview.order_label.text == 'Cultivate Farm' && preview.movement_label.text == 'ALREADY MOVED');
	f.key('A', {}); f.deliver(1);
	test.assert(f.former.movement == 0.0 && f.former.get_terraforming().work_units == 2 && preview.selected_unit_id == f.former.id);
	test.assert(preview.order_label.text == 'NO ORDERS' && preview.movement_label.text == 'ALREADY MOVED');
	f.view.root.remove();
});

for (remaining of [1.0 / 3.0, 2.0 / 3.0]) {
	behavior.scenario('work controls accept partial road movement and exhausted same-task resume ' + #to_string(remaining), () => {
		const f = fixture();
		f.with_write(() => { f.former.movement = remaining; f.former.moved_this_turn = true; });
		f.ui_game.select_unit(f.game.um.get_unit(f.former.id));
		f.key('F', {}); test.assert(#sizeof(f.state.queued) == 1);
		f.deliver(0); test.assert(f.game.um.get_unit(f.former.id).get_terraforming().work_units == 2);
		f.key('A', {}); f.deliver(1);
		const unit = f.game.um.get_unit(f.former.id);
		test.assert(unit.movement == 0.0 && unit.moved_this_turn && unit.get_order() == 'NO_ORDERS');
		f.key('F', {}); test.assert(#sizeof(f.state.queued) == 3); f.deliver(2);
		test.assert(f.game.um.get_unit(f.former.id).get_terraforming().work_units == 2);
		f.view.root.remove();
	});
}

for (entry of [{code: 'F', modifiers: {}, action: 'farm'}, {code: 'M', modifiers: {}, action: 'mine'},
	{code: 'R', modifiers: {}, action: 'road'}, {code: 'F', modifiers: {shift: true}, action: 'forest'}]) {
	behavior.scenario('shipped work shortcut dispatches ' + entry.action, () => {
		const f = fixture(); test.assert(f.key(entry.code, entry.modifiers));
		test.assert(#sizeof(f.state.queued) == 1 && f.state.queued[0].data.action == entry.action);
		f.deliver(0); test.assert(f.former.movement == 0.0);
		f.view.root.remove();
	});
}

behavior.scenario('modal windows waiting turns and unrelated modifiers cannot queue work', () => {
	const f = fixture(); f.state.modal = true; f.click('FARM'); f.key('F', {}); f.key('F', {shift: true});
	f.state.modal = false; f.ui_game.emit('turn_status', {status: 'please_wait'}); f.click('MINE'); f.key('M', {});
	f.ui_game.emit('turn_status', {status: 'active'});
	for (modifiers of [{ctrl: true}, {alt: true}, {shift: true, ctrl: true}]) { test.assert(!f.key('F', modifiers)); }
	test.assert(#sizeof(f.state.queued) == 0 && f.former.movement == 1.0);
	f.view.root.remove();
});

behavior.scenario('replacement prompt imports source caption body choices and requires explicit acceptance before queuing work', () => {
	const f = fixture(); f.prepare_replacement(); f.click('FOREST');
	test.assert(f.popup.is_shown() && #sizeof(f.state.queued) == 0 && f.former.movement == 1.0);
	test.assert(f.replacement.header.text == 'Synthetic Ecologist' && f.replacement.texts[0].text == 'Replace (Farm) after work completes.');
	test.assert(f.replacement.rows[0].text == 'Keep existing.' && f.replacement.rows[1].text == 'Proceed.');
	f.replacement.rows[1].emit('click', {});
	test.assert(#sizeof(f.state.queued) == 0 && f.game.tm.get_terraforming(2, 2).farm);
	f.replacement.ok.emit('click', {});
	test.assert(!f.popup.is_shown() && #sizeof(f.state.queued) == 1 && f.state.queued[0].data == {unit_id: f.former.id, action: 'forest', replace_existing: true});
	f.deliver(0);
	test.assert(f.former.get_order() == 'TERRAFORM' && f.game.tm.get_terraforming(2, 2).farm && preview.order_label.text == 'Plant Forest');
	f.view.root.remove();
});

behavior.scenario('default Cancel and repeated old callbacks leave native work and the successor prompt untouched', () => {
	const f = fixture(); f.prepare_replacement(); const before = f.snapshot(); const terrain = f.terrain_snapshot();
	f.click('FOREST'); const old_callback = f.popup.popup_cb; const old_ok = f.replacement.ok;
	old_ok.emit('click', {}); old_callback(true);
	test.assert(!f.popup.is_shown() && #sizeof(f.state.queued) == 0 && f.snapshot() == before && f.terrain_snapshot() == terrain);
	f.click('FOREST'); old_ok.emit('click', {}); old_callback(true);
	test.assert(f.popup.is_shown() && #sizeof(f.state.queued) == 0 && f.replacement.selected == 0);
	f.replacement.rows[1].emit('click', {}); f.replacement.ok.emit('click', {}); f.replacement.ok.emit('click', {});
	test.assert(#sizeof(f.state.queued) == 1);
	f.view.root.remove();
});

behavior.scenario('replacement window keyboard selects Continue while default Enter cancels', () => {
	const f = fixture(); f.prepare_replacement(); f.click('FOREST');
	const window = f.popup.popups.terraforming_replacement.el;
	window.emit('keydown', {code: 'ENTER', modifiers: {}});
	test.assert(!f.popup.is_shown() && #sizeof(f.state.queued) == 0);
	f.click('FOREST'); window.emit('keydown', {code: 'DOWN', modifiers: {}});
	test.assert(f.replacement.selected == 1 && #sizeof(f.state.queued) == 0);
	window.emit('keydown', {code: 'ENTER', modifiers: {}});
	test.assert(!f.popup.is_shown() && #sizeof(f.state.queued) == 1);
	f.view.root.remove();
});

for (kind of ['turn', 'movement', 'despawn', 'removed-panel']) {
	behavior.scenario('replacement confirmation cannot target changed authoritative state after ' + kind, () => {
		const f = fixture(); f.prepare_replacement(); f.click('FOREST'); const callback = f.popup.popup_cb;
		if (kind == 'turn') { f.advance(); }
		if (kind == 'movement') { f.with_write(() => { f.former.movement = 0.5; }); }
		if (kind == 'despawn') { f.with_write(() => { f.game.um.despawn_unit(f.former.id); }); }
		if (kind == 'removed-panel') { preview.frame.remove(); }
		f.replacement.rows[1].emit('click', {}); f.replacement.ok.emit('click', {}); callback(true);
		test.assert(#sizeof(f.state.queued) == 0 && f.game.tm.get_terraforming(2, 2).farm);
		f.view.root.remove();
	});
}

behavior.scenario('work receipt must match its action before releasing native command authority', () => {
	const f = fixture(); f.key('F', {});
	const id = f.former.id + 0; const caller = f.owner.id + 0; const before = f.snapshot();
	test.assert(#sizeof(f.state.queued) == 1 && preview.order_pending != null && f.former.get_order() == 'NO_ORDERS');
	for (data of [{unit_id: id, action: 'mine'}, {unit_id: id}, {unit_id: id, action: 42}]) {
		const result = {name: 'unit_terraform', caller: caller, success: true}; result.data = data;
		f.ui_game.emit('event_result', result);
		test.assert(preview.order_pending != null && preview.order_pending.unit_id == id,
			'A different or missing action cannot acknowledge the pending work request');
		test.assert(preview.selected_unit_id == id && f.snapshot() == before,
			'An unrelated work receipt cannot change selection or native work state');
	}
	// Reject the Farm request at the transport boundary without applying it.
	f.ui_game.emit('event_result', {name: 'unit_terraform', caller: caller, data: {unit_id: id, action: 'farm'}, success: false});
	test.assert(preview.order_pending == null && preview.selected_unit_id == id && f.snapshot() == before);
	f.key('M', {});
	test.assert(#sizeof(f.state.queued) == 2 && preview.order_pending != null);
	// A delayed Farm failure must not release the succeeding Mine request.
	f.ui_game.emit('event_result', {name: 'unit_terraform', caller: caller, data: {unit_id: id, action: 'farm'}, success: false});
	test.assert(preview.order_pending != null && preview.selected_unit_id == id && f.snapshot() == before);
	f.deliver(1); const work = f.former.get_terraforming();
	test.assert(preview.order_pending == null && f.former.get_order() == 'TERRAFORM' && work.action == 'mine' && work.work_units == 2 && f.former.movement == 0.0);
	f.view.root.remove();
});
