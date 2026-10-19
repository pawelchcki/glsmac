// Candidate-only order-effect probe. Display/artwork/morale rendering, fixed
// initial selection, base-content population and synchronous delivery are
// boundaries. Subsequent selection follows only shipped selection requests.
// Actual native Unit/manager, shipped controls/events and unit_turn callbacks
// own every command effect. Only explicit advance actions deliver a new turn.
const mocks = #include('./_ui_mocks');
const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
const objects = #include('../default/ui/parts/game/bottom_bar/objects_list');
const base_screen = #include('../default/ui/parts/game/popup/base_screen');
const unit_turns = #include('../default/units/turns');
const advance_event = #include('../default/game/event/advance_turn');

const fixture = () => {
	const f = test.founding_fixture();
	// Remove the fixture's unrelated starting pod through its native manager.
	// Native spawn initializes the one owned Scout from its real one-move def.
	f.with_write(() => {
		f.game.um.despawn_unit(f.unit_id);
		const data = { def: 'Scout', health: 1.0, morale: 2 };
		data.owner = f.owner; data.tile = f.base.get_tile();
		f.scout = f.game.um.spawn_unit(data);
	});
	f.scout_id = f.scout.id;
	test.assert(f.scout.def == 'Scout' && f.scout.movement == 1.0 && !f.scout.moved_this_turn);
	test.assert(#sizeof(f.inspect().unit_ids) == 1);
	unit_turns.configure(f.game);
	f.initial_year = f.game.get_year();
	f.view = mocks.display();
	f.map = mocks.events(); f.ui_game = mocks.events();
	f.ui_game.get_player = () => { return f.owner; };
	f.ui_game.get_um = () => { return f.game.um; };
	f.ui_game.get_bm = () => { return f.game.bm; };
	f.ui_game.get_turn = () => { return f.game.get_turn(); };
	f.ui_game.get_year = () => { return f.game.get_year(); };
	f.ui_game.get = (key) => { return f.game.get(key); };
	f.ui_game.event = (name, data) => {
		const handler = #include('../default/game/event/' + name);
		const e = { caller: f.owner.id }; e.game = f.game; e.data = data;
		const error = handler.validate(e);
		if (#is_defined(error)) { throw Error('Unit command rejected: ' + error); }
		f.with_write(() => { e.applied = handler.apply(e); });
		const outcome = { name: name, event_id: 'headless-local', caller: f.owner.id, success: true };
		outcome.data = data; f.ui_game.emit('event_result', outcome);
	};
	f.ui_game.select_unit = (unit) => {
		f.game.select_unit(unit);
		const e = {}; e.unit = unit; f.ui_game.emit('unit_select', e); f.map.emit('unit_preview', e);
	};
	f.ui_game.select_base = (base) => {
		f.game.select_base(base);
		const e = {}; e.base = base; f.ui_game.emit('base_select', e); f.map.emit('base_preview', e);
	};
	f.ui_game.select_tile = (tile) => {
		f.game.select_tile(tile);
		const e = {}; e.tile = tile; f.ui_game.emit('tile_select', e); f.map.emit('tile_preview', e);
	};
	const p = {};
	p.el = f.view.root; p.ui = f.view.ui; p.map = f.map; p.game = f.ui_game;
	f.view.ui.get_width = () => { return 1024; };
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.available_popups = ['base_screen']; f.popup.no_sliding = true;
	p.modules = { bottom_bar: { height: 256 }, menu: { close_all: () => {} } }; p.modules.popup = f.popup;
	base_screen.available_sections = ['buttons'];
	f.popup.init(p);
	// Native plain founding fixtures deliberately have no economy managers.
	// Base contents are not observed: retain native identity while executing
	// the actual surrounding popup/base init, show/hide, modal keys and OK.
	base_screen.sections.bottom_bar = { frame: f.view.root.area({}) };
	base_screen.set = (data) => { base_screen.base = data.base; base_screen.base_id = data.base.id; };
	p.get_stats_str = (unit) => { return ''; }; // Combat statistics are not observed.
	p.sections = {}; p.sections.object_preview = preview;
	preview.init(p);
	objects.init(p);
	// Art/morale data are outside this contract; use the actual fixture morale
	// definition instead of requesting the application's unrelated NATIVE set.
	preview.moralesets.NATIVE = f.game.um.get_moraleset('SYNTHETIC');
	f.ui_game.select_unit(f.scout);
	f.advance = () => {
		// Paused-turn/transport boundary: acknowledge participants only when the
		// explicit input requests advance. This does not calculate order effects.
		f.with_write(() => {
			for (player of f.game.get_players()) {
				if (!f.game.is_turn_complete(player.id)) { f.game.complete_turn(player.id); }
			}
			const e = { caller: 0, data: { turn_id: f.game.get_turn() + 1 } }; e.game = f.game;
			const error = advance_event.validate(e);
			if (#is_defined(error)) { throw Error('Advance command rejected: ' + error); }
			advance_event.apply(e);
		});
		f.ui_game.emit('turn', { year: f.game.get_year() });
		f.ui_game.emit('turn_status', { status: 'active' });
	};
	return f;
};

const visible_label = (field, required) => {
	if (#is_defined(preview[field])) {
		const node = preview[field];
		if (node.kind != 'text' || node.removed || !node.visible || #typeof(node.text) != 'String' || node.text == '') {
			throw Error('Invalid visible unit label: ' + field);
		}
		return node.text;
	}
	// Observe the current shipped movement line even before the dedicated
	// text-node seam exists. Never construct a label from native movement.
	if (field == 'movement_label' && #is_defined(preview.lines)) {
		for (node of preview.lines.children) {
			if (node.kind == 'text' && !node.removed && node.visible && #typeof(node.text) == 'String') {
				const text = #uppercase(node.text);
				const parts = #split(text, ':');
				if (#sizeof(parts) > 1 && parts[0] == 'MOVES') { return node.text; }
			}
		}
	}
	if (required) { throw Error('Missing visible unit label: ' + field); }
};

const flush = (f) => {
	// Deliver pending zero-delay selection/popup callbacks, not an invented
	// unit selection heuristic. Periodic availability timers get one UI tick.
	for (timer of f.view.timers) { if (timer.interval > 0) { timer.tick(); } }
	let pending = true;
	let tick = 0;
	while (pending && tick < 32) {
		pending = false;
		for (timer of f.view.timers) {
			// tick() reports the actual callback's continuing state. A permanent
			// positive-interval availability timer is not pending selection work.
			if (timer.interval == 0 && timer.tick()) { pending = true; }
		}
		tick = tick + 1;
	}
	if (pending) { throw Error('Unit UI callbacks did not settle'); }
};

const observe = (f, index) => {
	const state = f.popup.is_shown() ? 'base' : 'world';
	#print('UORD_STATE|' + #to_string(index) + '|' + state + '|' + #to_string(f.game.get_year() - f.initial_year));
	if (state == 'world') {
		#print('UORD_MOVEMENT|' + #uppercase(visible_label('movement_label', true)));
		#print('UORD_ORDER|' + #uppercase(visible_label('order_label', true)));
	}
	#print('UORD_STATE_END');
};

const act = (f, action) => {
	const keys = { hold: 'H', activate: 'A', skip: 'SPACE', advance: 'ENTER' };
	if (action == 'close_base') {
		if (!f.popup.is_shown()) { throw Error('Base screen is not open'); }
		let found = false;
		for (button of base_screen.sections.buttons.buttons) {
			if (button.text == 'OK') { button.emit('click', {}); found = true; break; }
		}
		if (!found) { throw Error('Actual base OK control is missing'); }
		return;
	}
	const e = { code: keys[action], modifiers: {} };
	if (f.popup.is_shown()) {
		f.popup.popup.el.emit('keydown', e);
		return;
	}
	if (action == 'advance') { f.advance(); return; }
	let handled = preview.frame.emit('keydown', e);
	if (!handled) { handled = objects.frame.emit('keydown', e); }
	if (!handled) { throw Error('Missing actual unit key control: ' + keys[action]); }
};

const run_input = (input) => {
	#print('UORD_CASE|' + input.id);
	let f = null;
	try {
		f = fixture(); flush(f); observe(f, 0);
		let index = 1;
		for (action of input.actions) { act(f, action); flush(f); observe(f, index); index += 1; }
		#print('UORD_DONE');
	} catch { : (e) => {
		#print('UORD_ERROR|' + e.type + '|' + e.reason);
	} }
	if (f != null) { f.view.root.remove(); }
};
for (input of unit_order_inputs) { run_input(input); }
