// Control only rendering and event delivery. Commands use production controls,
// authoritative handlers, native units, the shared selection controller and turns.
const native_fixture = #include('./_unit_selection_fixture');
const mocks = #include('./_ui_mocks');
return (profile) => {
	if (profile != 'stacked') { throw Error('Sentry fixture requires stacked units'); }
	const f = {}; f.native = native_fixture(profile); f.game = f.native.game; f.units = f.native.units;
	f.selected_id = f.native.selected_id;
	f.view = mocks.display(); f.events = mocks.events(); f.map = mocks.events(); f.state = {queued: [], delivered: 0};
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
			const next = f.native.selection_next(false);
			if (next != null) { f.events.select_unit(f.game.um.get_unit(next)); }
			f.events.emit('event_result', {name: request.name, caller: f.native.owner.id, data: request.data, success: true});
		}
	};
	const p = {}; p.el = f.view.root; p.ui = f.view.ui; p.game = f.events; p.map = f.map;
	p.get_stats_str = (unit) => { return ''; };
	p.modules = {bottom_bar: {height: 256}, popup: {is_shown: () => { return false; }}};
	f.preview = #include('../default/ui/parts/game/bottom_bar/object_preview'); f.preview.init(p);
	f.preview.moralesets.NATIVE = f.game.um.get_moraleset('SYNTHETIC');
	f.action = (action) => {
		if (action == 'wait' || action == 'tab' || action == 'advance') {
			f.native.action(action);
			if (action == 'advance') { f.events.emit('turn', {year: f.game.get_year()}); }
			const id = f.selected_id();
			if (id != null) { f.events.select_unit(f.game.um.get_unit(id)); }
			return;
		}
		let code = '';
		if (action == 'sleep') { code = 'L'; }
		else if (action == 'hold') { code = 'H'; }
		else if (action == 'skip') { code = 'SPACE'; }
		else { throw Error('Unknown Sentry action: ' + action); }
		f.preview.frame.emit('keydown', {code: code, modifiers: {}}); f.flush();
	};
	f.events.select_unit(f.units[0]);
	return f;
};
