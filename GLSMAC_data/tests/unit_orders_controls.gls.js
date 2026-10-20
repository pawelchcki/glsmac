// Native units + shipped panel and command handlers. Display/event delivery are
// explicit boundaries; the fixture never computes order effects or readiness.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');

const fixture = () => {
	const f = {};
	f.native = test.founding_fixture();
	f.native.with_write(() => {
		f.native.game.um.despawn_unit(f.native.unit_id);
		const data = { def: 'Scout', health: 1.0, morale: 2 };
		data.owner = f.native.owner; data.tile = f.native.base.get_tile();
		f.unit = f.native.game.um.spawn_unit(data);
	});
	f.id = f.unit.id;
	f.view = mocks.display(); f.game = mocks.events(); f.map = mocks.events();
	f.state = { queued: [], selections: [], modal: false };
	f.game.get_um = () => { return f.native.game.um; };
	f.game.get_bm = () => { return f.native.game.bm; };
	f.game.get_player = () => { return f.native.owner; };
	f.game.get_turn = () => { return f.native.game.get_turn(); };
	f.game.event = (name, data) => {
		const request = { name: name }; request.data = data;
		f.state.queued :+ request;
	};
	f.game.select_unit = (unit) => {
		f.native.game.select_unit(unit);
		f.state.selections :+ ['unit', unit.id];
		const e = {}; e.unit = unit;
		f.game.emit('unit_select', e); f.map.emit('unit_preview', e);
	};
	f.game.select_tile = (tile) => {
		f.native.game.select_tile(tile);
		f.state.selections :+ ['tile', tile.x, tile.y];
		const e = {}; e.tile = tile;
		f.game.emit('tile_select', e); f.map.emit('tile_preview', e);
	};
	const p = {};
	p.el = f.view.root; p.ui = f.view.ui; p.game = f.game; p.map = f.map;
	p.get_stats_str = (unit) => { return ''; };
	p.modules = { popup: { is_shown: () => { return f.state.modal; } } };
	f.p = p;
	preview.init(p);
	preview.moralesets.NATIVE = f.native.game.um.get_moraleset('SYNTHETIC');
	f.game.select_unit(f.unit);
	f.key = (code, modifiers) => { return preview.frame.emit('keydown', { code: code, modifiers: modifiers }); };
	f.click = (label) => { return f.view.find('button', 'text', label).emit('click', {}); };
	f.result = (name, id, caller, success) => {
		f.game.emit('event_result', { name: name, event_id: 'controlled-local', caller: caller, data: { unit_id: id }, success: success });
	};
	f.deliver = (index) => {
		const request = f.state.queued[index];
		const handler = #include('../default/game/event/' + request.name);
		const e = { caller: f.native.owner.id }; e.game = f.native.game; e.data = request.data;
		const error = handler.validate(e);
		test.assert(!#is_defined(error), 'Actual command validation: ' + (#is_defined(error) ? error : 'accepted'));
		f.native.with_write(() => { e.applied = handler.apply(e); });
		if (request.name == 'reconcile_base_citizens') {
			const result = {name: request.name, caller: f.native.owner.id, success: true}; result.data = request.data;
			f.game.emit('event_result', result);
		} else { f.result(request.name, request.data.unit_id, f.native.owner.id, true); }
		return e;
	};
	return f;
};

behavior.scenario('real unit preview exposes Hold Activate and both visible text labels', () => {
	const f = fixture();
	test.assert(f.view.find('button', 'text', 'HOLD').text == 'HOLD');
	test.assert(f.view.find('button', 'text', 'ACTIVATE').text == 'ACTIVATE');
	test.assert(preview.movement_label.text == 'Moves: 1');
	test.assert(preview.order_label.text == 'NO ORDERS');
	f.view.root.remove();
});

behavior.scenario('Hold button and H queue one scalar command until the matching authoritative result', () => {
	const f = fixture(); f.click('HOLD'); f.key('H', {});
	test.assert(#sizeof(f.state.queued) == 1 && f.state.queued[0].name == 'unit_hold');
	test.assert(f.state.queued[0].data == { unit_id: f.id });
	test.assert(f.unit.get_order() == 'NO_ORDERS' && f.unit.movement == 1.0);
	f.result('unit_hold', f.id + 1, f.native.owner.id, false); f.key('H', {});
	f.result('unit_hold', f.id, 0, false); f.key('H', {});
	test.assert(#sizeof(f.state.queued) == 1);
	f.result('unit_hold', f.id, f.native.owner.id, false); f.key('H', {});
	test.assert(#sizeof(f.state.queued) == 2);
	f.deliver(1);
	test.assert(f.unit.get_order() == 'HOLD' && f.unit.movement == 1.0 && !f.unit.needs_orders());
	test.assert(preview.order_label.text == 'HOLD' && preview.movement_label.text == 'Moves: 1');
	test.assert(preview.selected_unit_id == null, 'Hold releases active command selection');
	test.assert(f.state.selections[#sizeof(f.state.selections) - 1][0] == 'tile');
	f.view.root.remove();
});

behavior.scenario('Activate reselects the remembered held unit without inventing movement', () => {
	const f = fixture(); f.key('H', {}); f.deliver(0);
	f.key('A', {}); test.assert(f.state.queued[1].name == 'unit_activate');
	f.deliver(1);
	test.assert(f.unit.get_order() == 'NO_ORDERS' && f.unit.movement == 1.0 && f.unit.needs_orders());
	test.assert(preview.selected_unit_id == f.id && preview.order_label.text == 'NO ORDERS');
	test.assert(f.state.selections[#sizeof(f.state.selections) - 1] == ['unit', f.id]);
	f.view.root.remove();
});

behavior.scenario('Skip then Activate permits manual exhausted-unit Hold without restoring moves', () => {
	const f = fixture(); f.key('SPACE', {}); f.deliver(0);
	test.assert(f.unit.movement == 0.0 && f.unit.get_order() == 'NO_ORDERS');
	test.assert(preview.movement_label.text == 'ALREADY MOVED');
	f.key('H', {}); test.assert(#sizeof(f.state.queued) == 1, 'No selected unit after Skip');
	f.key('A', {}); f.deliver(1);
	test.assert(f.unit.movement == 0.0 && preview.selected_unit_id == f.id);
	f.key('H', {}); f.deliver(2);
	test.assert(f.unit.get_order() == 'HOLD' && f.unit.movement == 0.0 && !f.unit.needs_orders());
	f.key('A', {}); f.deliver(3);
	test.assert(f.unit.get_order() == 'NO_ORDERS' && f.unit.movement == 0.0);
	test.assert(preview.movement_label.text == 'ALREADY MOVED');
	f.view.root.remove();
});

behavior.scenario('paused complete boundary permits activation while waiting and modal states block orders', () => {
	const f = fixture();
	f.game.emit('turn_status', { status: 'turn_complete' });
	f.key('H', {}); f.deliver(0); f.key('A', {}); f.deliver(1);
	test.assert(f.unit.get_order() == 'NO_ORDERS' && preview.selected_unit_id == f.id);
	for (status of ['please_wait', 'waiting_for_players']) {
		f.game.emit('turn_status', { status: status }); f.key('H', {}); f.key('A', {}); f.key('SPACE', {});
	}
	f.game.emit('turn_status', { status: 'active' }); f.state.modal = true;
	f.key('H', {}); f.key('A', {}); f.key('SPACE', {}); f.click('HOLD'); f.click('ACTIVATE');
	test.assert(#sizeof(f.state.queued) == 2 && f.unit.get_order() == 'NO_ORDERS' && f.unit.movement == 1.0);
	f.view.root.remove();
});

behavior.scenario('modified order shortcuts are ignored and hover never redirects command identity', () => {
	const f = fixture();
	for (modifiers of [{ ctrl: true }, { shift: true }, { alt: true }]) {
		for (key of ['H', 'A', 'SPACE']) { test.assert(!f.key(key, modifiers)); }
	}
	let other = null;
	f.native.with_write(() => {
		const data = { def: 'Scout', health: 1.0, morale: 2 };
		data.owner = f.native.owner; data.tile = f.native.base.get_tile();
		other = f.native.game.um.spawn_unit(data);
	});
	const e = {}; e.unit = other; f.map.emit('unit_preview', e);
	f.key('H', {});
	test.assert(f.state.queued[0].data == { unit_id: f.id });
	f.deliver(0);
	test.assert(f.unit.get_order() == 'HOLD' && other.get_order() == 'NO_ORDERS');
	f.view.root.remove();
});

behavior.scenario('a despawned focus is re-resolved instead of dereferencing a retained unit wrapper', () => {
	const f = fixture(); f.key('H', {}); f.deliver(0);
	f.native.with_write(() => { f.native.game.um.despawn_unit(f.id); });
	f.key('A', {}); f.click('ACTIVATE');
	test.assert(#sizeof(f.state.queued) == 1);
	f.view.root.remove();
});

behavior.scenario('removing the command panel detaches owned keyboard timers and result listeners', () => {
	const f = fixture(); f.key('H', {});
	preview.frame.remove();
	test.assert(preview.frame.handler_count('keydown') == 0 && f.game.count('event_result') == 0);
	test.assert(f.view.running_timers() == 0);
	f.key('A', {}); f.result('unit_hold', f.id, f.native.owner.id, false);
	test.assert(#sizeof(f.state.queued) == 1 && f.unit.get_order() == 'NO_ORDERS');
	f.view.root.remove();
});

behavior.scenario('closing the actual base selection restores only live owned same-tile command focus', () => {
	for (kind of ['held', 'removed', 'elsewhere']) {
		const f = fixture();
		const list = #include('../default/ui/parts/game/bottom_bar/objects_list');
		f.p.sections = {}; f.p.sections.object_preview = preview;
		// Popup-content/display delivery boundary. Actual list base selection,
		// deferred live lookup and close callback execute on native Base/Unit.
		f.p.modules.popup.hide = (name) => { f.state.modal = false; };
		f.p.modules.popup.set = (name, data) => { f.state.opened_base_id = data.base.id; };
		f.p.modules.popup.show = (name, callback) => { f.state.modal = true; f.state.close = callback; };
		list.init(f.p);
		f.game.select_unit(f.unit);
		if (kind == 'elsewhere') {
			let other = null;
			f.native.with_write(() => {
				const data = { def: 'Scout', health: 1.0, morale: 2 }; data.owner = f.native.owner; data.tile = f.native.tile;
				other = f.native.game.um.spawn_unit(data);
			});
			f.game.select_unit(other);
		}
		f.key('H', {}); f.deliver(0);
		const e = {}; e.base = f.native.base; f.game.emit('base_select', e);
		for (timer of f.view.timers) { if (timer.interval == 0) { timer.tick(); } }
		f.deliver(#sizeof(f.state.queued) - 1);
		test.assert(f.state.modal && f.state.opened_base_id == f.native.base.id);
		if (kind == 'removed') { f.native.with_write(() => { f.native.game.um.despawn_unit(f.id); }); }
		f.state.modal = false; f.state.close(false);
		const last = f.state.selections[#sizeof(f.state.selections) - 1];
		if (kind == 'held') {
			test.assert(last == ['unit', f.id] && preview.selected_unit_id == f.id);
			test.assert(f.unit.get_order() == 'HOLD' && preview.order_label.text == 'HOLD');
			test.assert(preview.movement_label.text == 'Moves: 1');
		} else {
			test.assert(last == ['tile', f.native.base.get_tile().x, f.native.base.get_tile().y]);
			test.assert(preview.selected_unit_id == null);
		}
		f.view.root.remove();
	}
});
