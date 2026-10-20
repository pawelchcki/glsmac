const behavior = #include('./_behavior');
const fixture = #include('./_unit_activation_fixture');
const consumer = #include('../default/game/unit_activation_dialog');
const held = (f) => {
	test.assert(f.selected_id() == null);
	for (unit of f.units) { test.assert(unit.get_order() == 'HOLD' && unit.movement == 1.0); }
};

behavior.scenario('opening the production picker defers native activation and cancelling preserves every held unit', () => {
	const f = fixture('default'); held(f); const before = f.native.snapshot();
	f.action('open'); held(f);
	test.assert(f.popup.is_shown() && f.state.queued[#sizeof(f.state.queued) - 1].name == 'unit_hold');
	test.assert(f.picker.header.text == 'Select unit to activate');
	test.assert(f.picker.choices == [f.units[2].id, f.units[0].id, f.units[1].id] && f.picker.selected == 0);
	test.assert(f.picker.rows[0].text == f.units[2].get_def().name);
	f.action('escape'); held(f); test.assert(!f.popup.is_shown() && f.native.snapshot() == before);
	f.view.root.remove();
});
behavior.scenario('clamped arrows draft a native identity while Home End and text clicks remain inert', () => {
	const f = fixture('default'); f.action('open');
	for (step of [['up', 0], ['down', 1], ['down', 2], ['down', 2], ['up', 1], ['home', 1], ['end', 1], ['click0', 1], ['click2', 1]]) {
		f.action(step[0]); test.assert(f.picker.selected == step[1]); held(f);
	}
	f.action('enter');
	test.assert(!f.popup.is_shown() && f.selected_id() == f.units[0].id);
	for (index of [0, 1, 2]) { test.assert(f.units[index].get_order() == (index == 0 ? 'NO_ORDERS' : 'HOLD') && f.units[index].movement == 1.0); }
	f.view.root.remove();
});
behavior.scenario('actual OK commits the highlighted native unit and actual Cancel keeps all orders held', () => {
	for (action of ['ok', 'cancel']) {
		const f = fixture('default'); f.action('open'); f.action(action); test.assert(!f.popup.is_shown());
		if (action == 'ok') {
			test.assert(f.selected_id() == f.units[2].id && f.units[2].get_order() == 'NO_ORDERS');
			test.assert(f.units[0].get_order() == 'HOLD' && f.units[1].get_order() == 'HOLD');
		} else { held(f); }
		f.view.root.remove();
	}
});
behavior.scenario('installed caption profile flows through the real native text parser and production consumer', () => {
	const f = fixture('edited-caption'); f.action('open');
	test.assert(f.picker.header.text == 'Activate an owned unit');
	test.assert(f.state.loads == [['xscript.txt', 'dialogs']]);
	f.action('cancel'); held(f); f.view.root.remove();
});
behavior.scenario('stale removed controls and repeated confirms cannot activate a later picker', () => {
	const f = fixture('default'); f.action('open'); const old = f.picker.ok;
	f.action('cancel'); f.action('open'); old.emit('click', {}); held(f); test.assert(f.popup.is_shown());
	const confirm = f.picker.ok; f.action('ok'); const count = #sizeof(f.state.queued);
	confirm.emit('click', {}); f.flush(); test.assert(#sizeof(f.state.queued) == count);
	f.view.root.remove();
});
behavior.scenario('despawn and changed native movement invalidate the draft without dereferencing stale units', () => {
	for (change of ['despawn', 'movement']) {
		const f = fixture('default'); f.action('open'); const count = #sizeof(f.state.queued);
		f.native.with_write(() => {
			if (change == 'despawn') { f.game.um.despawn_unit(f.units[2].id); }
			else { f.units[2].movement = 0.0; }
		});
		f.action('ok'); test.assert(!f.popup.is_shown() && #sizeof(f.state.queued) == count && f.selected_id() == null);
		f.view.root.remove();
	}
});
behavior.scenario('modal state blocks preview commands and panel removal cancels pending picker callbacks', () => {
	const f = fixture('default'); f.action('open'); const count = #sizeof(f.state.queued);
	for (code of ['A', 'H', 'SPACE', 'L']) { f.preview.frame.emit('keydown', {code: code, modifiers: {}}); }
	f.preview.activate_button.emit('click', {}); f.preview.hold_button.emit('click', {});
	test.assert(#sizeof(f.state.queued) == count); held(f);
	const ok = f.picker.ok; f.preview.frame.remove(); ok.emit('click', {}); f.flush();
	test.assert(!f.popup.is_shown() && #sizeof(f.state.queued) == count); held(f); f.view.root.remove();
});
behavior.scenario('changed owner context turn health and selected focus invalidate a pending activation', () => {
	for (change of ['owner', 'turn', 'health', 'selection', 'waiting']) {
		const f = fixture('default'); f.action('open'); const count = #sizeof(f.state.queued);
		if (change == 'owner') { f.events.get_player = () => { return f.game.get_player(); }; }
		if (change == 'turn') { f.native.set_turn(f.game.get_turn() + 1); }
		if (change == 'health') { f.native.with_write(() => { f.units[2].health = 0.0; }); }
		if (change == 'selection') { f.events.select_unit(f.units[0]); }
		if (change == 'waiting') { f.events.emit('turn_status', {status: 'please_wait'}); }
		f.action('ok'); test.assert(#sizeof(f.state.queued) == count && !f.popup.is_shown());
		for (unit of f.units) { test.assert(unit.get_order() == 'HOLD'); }
		f.view.root.remove();
	}
});
behavior.scenario('foreign and dead native tile members do not enter the activation choices', () => {
	const f = fixture('default'); let foreign = null;
	f.native.with_write(() => {
		const data = {def: 'ScoutPatrol', health: 1.0, morale: 2}; data.owner = f.game.get_player(); data.tile = f.native.base.get_tile();
		foreign = f.game.um.spawn_unit(data); f.units[1].health = 0.0;
	});
	f.action('open');
	test.assert(foreign.owner != f.native.owner.id && f.picker.choices == [f.units[2].id, f.units[0].id]);
	f.action('cancel'); test.assert(foreign.get_order() == 'NO_ORDERS'); held(f); f.view.root.remove();
});
behavior.scenario('retained callback after cancellation cannot activate its successor or removed panel', () => {
	const f = fixture('default'); f.action('open'); const callback = f.popup.popup_cb;
	f.action('cancel'); f.action('open'); callback(f.units[2].id); held(f); test.assert(f.popup.is_shown());
	const current = f.popup.popup_cb; f.preview.frame.remove(); current(f.units[2].id); f.flush(); held(f);
	test.assert(!f.popup.is_shown()); f.view.root.remove();
});

let index = 0;
for (source of ['#PICKUNIT\n#xs 400\n#END\n', '#PICKUNIT\n#caption \n#END\n',
	'#PICKUNIT\n#caption One\n#caption Two\n#END\n', '#PICKUNIT\n#caption $STR0\n#END\n',
	'#PICKUNIT\n#caption One\n#unknown 1\n#END\n', '#PICKUNIT\n#caption One\nUnmodeled body\n#END\n']) {
	behavior.scenario('malformed activation source is rejected before modal or native order changes ' + #to_string(index), () => {
		const f = fixture('default'); f.source = source; const before = f.native.snapshot(); const count = #sizeof(f.state.queued); let rejected = false;
		try { f.action('open'); } catch { : (e) => { rejected = true; } }
		test.assert(rejected && !f.popup.is_shown() && f.native.snapshot() == before && #sizeof(f.state.queued) == count); held(f);
		f.view.root.remove();
	}); index++;
}
