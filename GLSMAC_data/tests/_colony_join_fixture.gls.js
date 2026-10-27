// Declared synthetic initial city, display nodes and frontend delivery only.
// Every command uses production controls/handlers and native units/base state.
// W/Tab run the shared native selection/navigation controller; no join answers.
const native_fixture = #include('./_unit_selection_fixture');
const mocks = #include('./_ui_mocks');
return (input) => {
	if (input.profile != 'stacked' || #typeof(input.setup) != 'Array' || #sizeof(input.setup) != 2) {
		throw Error('Colony join requires stacked units and two preparation commands');
	}
	for (command of input.setup) {
		if (command != 'wait' && command != 'sleep' && command != 'hold' && command != 'skip') { throw Error('Unknown preparation command'); }
	}
	const initial = input.initial_base;
	if (initial != {workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9}) { throw Error('Unsupported declared initial city'); }
	const f = {}; f.native = native_fixture(input.profile, undefined, input.initial_base_name, input.fixture_map_size); f.game = f.native.game; f.units = f.native.units; f.base = f.native.base;
	// This is an input condition, deliberately separate from ordinary startup.
	f.native.with_write(() => {
		f.base.create_pop({type: 'DOCTOR'});
		f.base.set('accumulated_nutrients', initial.nutrients);
		f.base.restore_production({choice_id: '', minerals: initial.minerals, last_processed_turn: 0}, '');
	});
	f.selected_id = f.native.selected_id;
	f.view = mocks.display(); f.events = mocks.events(); f.map = mocks.events(); f.state = {queued: [], delivered: 0, loads: []};
	f.events.get_um = () => { return f.game.um; }; f.events.get_bm = () => { return f.game.bm; };
	f.events.get_player = () => { return f.native.owner; }; f.events.get_turn = () => { return f.game.get_turn(); };
	f.events.get_settings = () => { return f.game.get_settings(); };
	f.events.get_tm = () => { return f.game.get_tm(); };
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
			if (!f.game.um.has_unit(request.data.unit_id)) {
				// Mirror the actual despawn packet using shared native removal
				// completion; this fixture supplies no surviving-selection policy.
				f.native.selection_removed(request.data.unit_id,
					(id) => { f.events.select_unit(f.game.um.get_unit(id)); },
					() => { f.events.select_tile(f.base.get_tile()); }
				);
			} else {
				const next = f.native.selection_next(false);
				if (next != null) { f.events.select_unit(f.game.um.get_unit(next)); }
			}
			f.events.emit('event_result', {name: request.name, caller: f.native.owner.id, data: request.data, success: true});
		}
	};
	const p = {}; p.el = f.view.root; p.ui = f.view.ui; p.game = f.events; p.map = f.map;
	p.get_stats_str = (unit) => { return ''; };
	p.modules = {bottom_bar: {height: 256}, popup: {is_shown: () => { return false; }}};
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
		if (action == 'join') { code = 'B'; }
		else if (action == 'sleep') { code = 'L'; }
		else if (action == 'hold') { code = 'H'; }
		else if (action == 'skip') { code = 'SPACE'; }
		if (code != '') { f.preview.frame.emit('keydown', {code: code, modifiers: {}}); }
		else { throw Error('Unknown Colony join action: ' + action); }
		f.flush();
	};
	f.events.select_unit(f.units[0]);
	for (command of input.setup) { f.action(command); }
	return f;
};
