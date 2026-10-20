// Only rendering and frontend event delivery are controlled. Orders execute
// shipped validators/apply handlers; selection uses the native shared controller.
const native_fixture = #include('./_unit_selection_fixture');
const mocks = #include('./_ui_mocks');
return (profile) => {
	const f = {}; f.native = native_fixture('stacked'); f.game = f.native.game; f.units = f.native.units;
	f.selected_id = f.native.selected_id;
	f.view = mocks.display(); f.events = mocks.events(); f.map = mocks.events(); f.state = {queued: [], delivered: 0, loads: []};
	f.events.get_um = () => { return f.game.um; }; f.events.get_bm = () => { return f.game.bm; };
	f.events.get_player = () => { return f.native.owner; }; f.events.get_turn = () => { return f.game.get_turn(); };
	f.events.is_started = f.game.is_started; f.events.is_turn_complete = f.game.is_turn_complete; f.events.get = f.game.get;
	f.events.validate_found_base = f.game.validate_found_base;
	f.events.select_unit = (unit) => {
		f.game.select_unit(unit); f.native.selection_focus(unit.id);
		const e = {}; e.unit = unit; f.events.emit('unit_select', e); f.map.emit('unit_preview', e);
	};
	f.events.select_tile = (tile) => {
		f.game.select_tile(tile); f.native.selection_reset();
		const e = {}; e.tile = tile; f.events.emit('tile_select', e); f.map.emit('tile_preview', e);
	};
	f.events.event = (name, data) => { const request = {name: name}; request.data = data; f.state.queued :+ request; };
	f.flush = () => {
		while (f.state.delivered < #sizeof(f.state.queued)) {
			const request = f.state.queued[f.state.delivered]; f.state.delivered = f.state.delivered + 1;
			const handler = #include('../default/game/event/' + request.name);
			const e = {caller: f.native.owner.id}; e.game = f.game; e.data = request.data;
			const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
			f.native.with_write(() => { e.applied = handler.apply(e); });
			// Match real frontend completion: ordinary orders seek the next ready
			// unit; explicit activation focuses without requiring readiness.
			if (request.name != 'unit_activate') {
				const next = f.native.selection_next(false);
				if (next != null) { f.events.select_unit(f.game.um.get_unit(next)); }
			}
			f.events.emit('event_result', {name: request.name, caller: f.native.owner.id, data: request.data, success: true});
		}
	};
	const p = {}; p.el = f.view.root; p.ui = f.view.ui; p.game = f.events; p.map = f.map;
	p.get_stats_str = (unit) => { return ''; };
	f.source = '#PICKUNIT\n#xs 400\n#caption ' + (profile == 'edited-caption' ? 'Activate an owned unit' : 'Select unit to activate') + '\n\n#END\n';
	p.glsmac = {load_smac_text: (path, mode) => {
		f.state.loads :+ [path, mode]; return test.parse_smac_text(f.source, mode);
	}};
	p.modules = {bottom_bar: {height: 256}, menu: {close_all: () => {}}};
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.available_popups = ['unit_activation']; f.popup.no_sliding = true;
	p.modules.popup = f.popup; f.popup.init(p); f.picker = f.popup.popup_defs.unit_activation;
	f.preview = #include('../default/ui/parts/game/bottom_bar/object_preview'); f.preview.init(p);
	f.preview.moralesets.NATIVE = f.game.um.get_moraleset('SYNTHETIC');
	f.p = p;
	f.action = (action) => {
		if (action == 'open') { f.preview.frame.emit('keydown', {code: 'A', modifiers: {}}); }
		else if (action == 'ok') { f.picker.ok.emit('click', {}); }
		else if (action == 'cancel') { f.picker.cancel.emit('click', {}); }
		else if (action == 'click0' || action == 'click1' || action == 'click2') {
			const index = action == 'click0' ? 0 : (action == 'click1' ? 1 : 2); f.picker.rows[index].emit('click', {});
		} else if (action == 'hold') { f.preview.frame.emit('keydown', {code: 'H', modifiers: {}}); }
		else { f.popup.popups.unit_activation.el.emit('keydown', {code: #uppercase(action), modifiers: {}}); }
		f.flush();
	};
	f.events.select_unit(f.units[0]);
	for (unit of f.units) { f.action('hold'); }
	return f;
};
