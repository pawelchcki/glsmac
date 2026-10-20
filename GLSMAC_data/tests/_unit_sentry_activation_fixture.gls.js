// Only display nodes and frontend event delivery are controlled. Preparation
// and activation execute production controls, validators and native handlers;
// automatic selection and W/Tab use the shared native selection controller.
const native_fixture = #include('./_unit_selection_fixture');
const mocks = #include('./_ui_mocks');
return (profile, setup) => {
	if (profile != 'stacked' || #typeof(setup) != 'Array' || #sizeof(setup) != 3) {
		throw Error('Sentry activation requires a stacked three-command setup');
	}
	for (command of setup) {
		if (command != 'sleep' && command != 'hold' && command != 'skip') { throw Error('Unknown preparation command'); }
	}
	const f = {}; f.native = native_fixture(profile); f.game = f.native.game; f.units = f.native.units;
	f.selected_id = f.native.selected_id;
	f.view = mocks.display(); f.events = mocks.events(); f.map = mocks.events(); f.state = {queued: [], delivered: 0, loads: []};
	f.events.get_um = () => { return f.game.um; }; f.events.get_bm = () => { return f.game.bm; };
	f.events.get_player = () => { return f.native.owner; }; f.events.get_turn = () => { return f.game.get_turn(); };
	f.events.is_started = f.game.is_started; f.events.is_turn_complete = f.game.is_turn_complete; f.events.get = f.game.get;
	f.events.validate_found_base = f.game.validate_found_base; f.events.validate_join_base = f.game.validate_join_base;
	f.events.select_unit = (unit) => {
		f.game.select_unit(unit); f.native.selection_focus(unit.id);
		const e = {}; e.unit = unit; f.events.emit('unit_select', e); f.map.emit('unit_preview', e);
	};
	f.events.select_tile = (tile) => {
		f.game.select_tile(tile);
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
			// Native frontend delivery advances ordinary orders, while explicit
			// activation retains its target even when that unit has no moves.
			if (request.name != 'unit_activate') {
				const next = f.native.selection_next(false);
				if (next != null) { f.events.select_unit(f.game.um.get_unit(next)); }
			}
			f.events.emit('event_result', {name: request.name, caller: f.native.owner.id, data: request.data, success: true});
		}
	};
	const p = {}; p.el = f.view.root; p.ui = f.view.ui; p.game = f.events; p.map = f.map;
	p.get_stats_str = (unit) => { return ''; };
	f.source = '#PICKUNIT\n#xs 400\n#caption Select unit to activate\n\n#END\n';
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
		if (action == 'wait' || action == 'tab') {
			// Execute the same production navigation completion as frontend W/Tab.
			// Only the rendering/event boundary callbacks are supplied here.
			f.native.selection_navigate(
				(id) => { f.events.select_unit(f.game.um.get_unit(id)); },
				() => { f.events.select_tile(f.native.base.get_tile()); }
			);
			return;
		}
		let code = '';
		if (action == 'open') { code = 'A'; }
		else if (action == 'sleep') { code = 'L'; }
		else if (action == 'hold') { code = 'H'; }
		else if (action == 'skip') { code = 'SPACE'; }
		if (code != '') { f.preview.frame.emit('keydown', {code: code, modifiers: {}}); }
		else if (action == 'up' || action == 'down' || action == 'enter' || action == 'escape') {
			f.popup.popups.unit_activation.el.emit('keydown', {code: #uppercase(action), modifiers: {}});
		} else { throw Error('Unknown Sentry activation action: ' + action); }
		f.flush();
	};
	f.events.select_unit(f.units[0]);
	for (command of setup) { f.action(command); }
	return f;
};
