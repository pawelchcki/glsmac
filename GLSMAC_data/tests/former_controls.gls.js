const behavior = #include('./_behavior');
const native = #include('./_former_work_fixture');
const mocks = #include('./_ui_mocks');
const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
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
	return f;
};

behavior.scenario('visible Farm control queues one scalar command and labels the authoritative work state', () => {
	const f = fixture(); f.click('FARM'); f.key('F', {});
	test.assert(#sizeof(f.state.queued) == 1 && f.state.queued[0].name == 'unit_terraform');
	test.assert(f.state.queued[0].data == {unit_id: f.former.id, action: 'farm'} && f.former.get_order() == 'NO_ORDERS');
	f.deliver(0);
	test.assert(f.former.get_order() == 'TERRAFORM' && preview.order_label.text == 'Cultivate Farm' && preview.movement_label.text == 'ALREADY MOVED');
	f.key('A', {}); f.deliver(1);
	test.assert(f.former.movement == 1.0 && f.former.get_terraforming().work_units == 0 && preview.selected_unit_id == f.former.id);
	test.assert(preview.order_label.text == 'NO ORDERS' && preview.movement_label.text == 'Moves: 1');
	f.view.root.remove();
});

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
