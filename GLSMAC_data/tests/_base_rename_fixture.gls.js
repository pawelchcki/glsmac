// Native Rename probe fixture. All management sections are shipped components.
// Native city/unit storage, resource callbacks and command validation execute.
// Scene geometry/art/audio and synchronous frontend transport are explicit mocks.
// No renamed name, dialog result or title refresh is assigned by this fixture.
// Raw keys drive the same native InputState as the real rendered Input.
const join_fixture = #include('./_colony_join_fixture');
const configure_bases = #include('../default/game/bases');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const bottom_bar = #include('../default/ui/parts/game/popup/base_screen/bottom_bar');
const strip = #include('../default/ui/parts/game/popup/base_screen/bottom_bar/middle_area');
return (input) => {
	const declared = {profile: input.profile, setup: ['wait', 'wait']};
	declared.initial_base_name = input.initial_base.name;
	declared.fixture_map_size = 16;
	declared.initial_base = {workers: input.initial_base.workers, doctors: input.initial_base.doctors, worked_tiles: input.initial_base.worked_tiles, nutrients: input.initial_base.nutrients, minerals: input.initial_base.minerals};
	const f = join_fixture(declared);
	f.view.native_input_factory = (props) => {
		const length = #is_defined(props.max_length) ? props.max_length : 0;
		return test.input_state(props.value, length);
	};
	f.events.select_unit(f.units[0]);
	const resources = #include('../default/resources'); resources.configure(f.game);
	f.p.glsmac = {load_smac_text: (name, format) => {
		for (source of input.sources) { if (source.name == name) { return test.parse_smac_text(source.source, format); } }
		throw Error('Undeclared installed Rename source: ' + name);
	}};
	const rules = {}; const callbacks = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get_turn = () => { return f.game.get_turn(); };
	rules.is_master = () => { return f.game.is_master(); };
	rules.trigger = (name, data) => { return f.game.trigger(name, data); };
	rules.get_player = (id) => { return f.game.get_player(id); };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { callbacks[name] = callback; };
	rules.event = (name, data) => {
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		if (#is_defined(input.process_turns) && input.process_turns) { f.game.event(name, data); }
		else { throw Error('Unexpected base initialization event: ' + name); }
	};
	configure_bases(rules); callbacks.start({});
	if (#is_defined(input.process_turns) && input.process_turns) { f.game.on('turn', callbacks.turn); }
	// Resource yields execute the production callback configured above.
	f.events.get_tm = () => { return f.game.tm; };
	f.events.get_year = () => { return f.game.get_year(); };
	f.events.select_base = (base) => {
		f.game.select_base(base);
		const e = {}; e.base = base; f.events.emit('base_select', e); f.map.emit('base_preview', e);
	};
	f.game.on('update_base', (e) => { f.events.emit('update_base', e); });
	// Synchronous local transport is explicit. Reconciliation itself uses the
	// shipped event and native authority/transaction, with no selection policy.
	f.management_requests = []; f.management_delivered = 0; f.defer_management = false;
	f.management_receipts = [];
	const submit = f.events.event;
	f.events.event = (name, data) => {
		if (name == 'reconcile_base_citizens') { f.management_requests :+ data; }
		else { submit(name, data); }
	};
	f.deliver_management = (index, accepted) => {
		const data = f.management_requests[index];
		const handler = #include('../default/game/event/reconcile_base_citizens');
		const e = {caller: f.native.owner.id}; e.game = f.game; e.data = data;
		let success = accepted;
		if (success) {
			const error = handler.validate(e);
			if (#is_defined(error)) { success = false; }
			else { f.native.with_write(() => { e.applied = handler.apply(e); }); f.management_receipts :+ e; }
		}
		const result = {name: 'reconcile_base_citizens', caller: f.native.owner.id, success: success}; result.data = data;
		f.events.emit('event_result', result);
	};
	const flush_commands = f.flush;
	f.flush = () => {
		flush_commands();
		if (!f.defer_management) {
			while (f.management_delivered < #sizeof(f.management_requests)) {
				const index = f.management_delivered; f.management_delivered = f.management_delivered + 1; f.deliver_management(index, true);
			}
		}
	};
	f.view.ui.get_width = () => { return 1024; };
	f.p.modules.menu = {close_all: () => {}};
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.no_sliding = true;
	if (#is_defined(input.extra_popup)) { f.popup.available_popups :+ input.extra_popup; }
	f.p.modules.popup = f.popup;
	f.popup.init(f.p);
	f.p.sections = {}; f.p.sections.object_preview = f.preview;
	f.list = #include('../default/ui/parts/game/bottom_bar/objects_list'); f.list.init(f.p);
	// Deliver the current real native selection to the newly mounted list.
	const selected = f.selected_id();
	if (selected == null) { throw Error('Missing prepared native selection'); }
	f.events.select_unit(f.game.um.get_unit(selected));
	const command = f.action;
	f.action = (action) => {
		if (action == 'open') {
			if (f.popup.is_shown()) { throw Error('Base already open'); }
			if (!f.list.frame.emit('keydown', {code: 'ENTER', modifiers: {}})) { throw Error('Production Enter handler did not consume open'); }
			// Only the owned zero-delay selection delivery is advanced. The
			// preview's repeating refresh timer is outside command completion.
			for (timer of f.view.timers) { if (timer.interval == 0 && timer.running) { timer.tick(); } }
			f.flush();
		} else if (action == 'close') {
			if (!f.popup.is_shown()) { throw Error('Base already closed'); }
			f.popup.popups.base_screen.el.emit('keydown', {code: 'ESCAPE', modifiers: {}});
		} else {
			command(action);
		}
	};
	f.context = () => {
		const window = f.popup.popups.base_screen.el;
		const visible = f.popup.is_shown() && window.is_visible() && screen.is_open && bottom_bar.frame.is_visible();
		if (visible) {
			if (f.popup.popup.id != 'base_screen' || screen.base != f.base || strip.base_id != f.base.id || strip.basename.is_removed() || !strip.basename.is_visible()) {
				throw Error('Base popup context/identity disagree');
			}
			if (#typeof(strip.basename.text) != 'String') { throw Error('Production base title missing'); }
			return {screen: 'base', title_matches_base: strip.basename.text == f.base.name};
		}
		if (f.popup.is_shown() || window.is_visible() || screen.is_open || bottom_bar.frame.is_visible()) { throw Error('Base popup visibility disagrees'); }
		return {screen: 'map', title_matches_base: false};
	};

	f.management = screen;
	f.title_node = strip.basename;
	f.actual_title = () => {
		if (strip.basename.is_removed() || !strip.basename.is_visible() || #typeof(strip.basename.text) != 'String') { throw Error('Actual management title unavailable'); }
		return strip.basename.text;
	};
	f.require_hud = () => {
		for (section of screen.available_sections) {
			if (!#is_defined(screen.sections[section])) { throw Error('Missing actual management section: ' + section); }
		}
		for (type of ['nutrients', 'minerals', 'energy']) {
			const labels = screen.sections.resources.labels[type];
			if (#typeof(labels.left.text) != 'String' || #typeof(labels.right.text) != 'String' || labels.left.text == '' || labels.right.text == '') { throw Error('Incomplete actual resource HUD'); }
		}
		for (type of ['economy', 'labs', 'psych']) {
			const labels = screen.sections.energy.labels[type];
			if (#typeof(labels.percentage.text) != 'String' || #typeof(labels.total.text) != 'String') { throw Error('Incomplete actual energy HUD'); }
		}
	};
	f.require_map_label = () => {
		const selected = f.selected_id();
		if (selected != null) {
			const unit = f.game.um.get_unit(selected); const labels = f.preview.lines.children;
			if (f.preview.rendered_unit_id != selected || #sizeof(labels) == 0 || labels[0].is_removed() || labels[0].text != unit.get_def().name) { throw Error('Actual selected unit label is missing'); }
		}
	};
	f.rename_requests = []; f.rename_receipts = []; f.rename_delivered = 0; f.defer_rename = false;
	const send = f.events.event;
	f.events.event = (name, data) => {
		if (name == 'rename_base') { f.rename_requests :+ data; }
		else { send(name, data); }
	};
	f.deliver_rename = (index, caller, accepted) => {
		const data = f.rename_requests[index]; const handler = #include('../default/game/event/rename_base');
		const e = {caller: caller}; e.game = f.game; e.data = data;
		const error = handler.validate(e); const success = accepted && !#is_defined(error);
		f.last_rename_error = error;
		if (success) { f.native.with_write(() => { e.applied = handler.apply(e); }); f.rename_receipts :+ e; }
		f.events.emit('event_result', {name: 'rename_base', caller: caller, data: data, success: success});
	};
	const commands = f.flush;
	f.flush = () => {
		commands();
		if (!f.defer_rename) {
			while (f.rename_delivered < #sizeof(f.rename_requests)) {
				const index = f.rename_delivered; f.rename_delivered = index + 1; f.deliver_rename(index, f.native.owner.id, true);
			}
		}
	};
	return f;
};
