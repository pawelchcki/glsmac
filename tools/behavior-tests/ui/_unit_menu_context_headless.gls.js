// Observational candidate only: production game UI/control callbacks and native
// city/units. Display, explicit event delivery and class capture are boundaries.
// Initial Tab and source slots identify requested controls only; production owns any effects.
// No fixture supplies headers, rows, tones, transitions or action effects.
const mocks = #include('./_ui_mocks');
const native_fixture = #include('./_unit_selection_fixture');

const fixture = (input) => {
	const f = {};
	f.native = native_fixture(input.profile, undefined, input.initial_base.name, 16);
	f.game = f.native.game; f.base = f.native.base; f.units = f.native.units;
	f.native.with_write(() => {
		f.base.create_pop({type: 'DOCTOR'});
		f.base.set('accumulated_nutrients', input.initial_base.nutrients);
		f.base.restore_production({choice_id: '', minerals: input.initial_base.minerals, last_processed_turn: 0}, '');
	});
	f.view = mocks.display(); f.map = mocks.events(); f.events = mocks.events(); f.glsmac = mocks.events();
	const decorate = (node) => {
		if (!#is_defined(node.width)) { node.width = 1024; }
		if (!#is_defined(node.height)) { node.height = 768; }
		for (kind of ['area', 'panel', 'window', 'surface', 'text', 'input', 'button', 'scrollview', 'listview', 'choicelist', 'widget', 'sound']) {
			const tag = kind; const create = node[tag];
			if (#typeof(create) == 'Callable') { node[tag] = (props) => { const child = create(props); decorate(child); return child; }; }
		}
	};
	decorate(f.view.root);
	f.view.ui.get_width = () => { return 1024; };
	// Observe real production class declarations, which the shared display mock
	// otherwise discards. This records presentation; it does not enable controls.
	f.styles = {};
	f.view.ui.class = (name) => {
		if (!#is_defined(f.styles[name])) {
			const style = {properties: {}, parent_name: null};
			style.set = (props) => { for (key in props) { style.properties[key] = props[key]; } return style; };
			style.extend = (parent_name) => { style.parent_name = parent_name; return style; };
			f.styles[name] = style;
		}
		return f.styles[name];
	};
	const style_properties = (name, depth) => {
		if (depth > 16 || !#is_defined(f.styles[name])) { throw Error('Unknown or cyclic actual menu style: ' + name); }
		const style = f.styles[name]; let result = {};
		if (style.parent_name != null) { result = style_properties(style.parent_name, depth + 1); }
		for (key in style.properties) { result[key] = style.properties[key]; }
		return result;
	};
	f.color = (node) => {
		let properties = {};
		if (#is_defined(node.class)) {
			for (name of #split(node.class, ' ')) {
				if (name == '') { continue; }
				const style = style_properties(name, 0);
				for (key in style) { properties[key] = style[key]; }
			}
		}
		if (node.active && #is_defined(properties._active)) {
			for (key in properties._active) { properties[key] = properties._active[key]; }
		}
		if (#is_defined(node.color)) { properties.color = node.color; }
		if (!#is_defined(properties.color) || #typeof(properties.color) != 'String') { throw Error('Missing actual menu text color'); }
		return properties.color;
	};
	f.glsmac.ui = f.view.ui;
	f.glsmac.load_smac_text = (name, format) => {
		for (source of input.sources) { if (source.name == name) { return test.parse_smac_text(source.source, format); } }
		throw Error('Undeclared installed in-game menu source: ' + name);
	};
	f.glsmac.exit = () => { throw Error('Unexpected application exit in menu-only trace'); };
	f.glsmac.reset = () => { throw Error('Unexpected application reset in menu-only trace'); };
	f.events.get_map = () => { return f.map; };
	f.events.get_um = () => { return f.game.um; };
	f.events.get_bm = () => { return f.game.bm; };
	f.events.get_tm = () => { return f.game.tm; };
	f.events.get_year = () => { return f.game.get_year(); };
	f.events.get_turn = () => { return f.game.get_turn(); };
	f.events.get_player = () => { return f.native.owner; };
	f.events.get = (key) => { return f.game.get(key); };
	f.events.is_started = f.game.is_started;
	f.events.is_turn_complete = f.game.is_turn_complete;
	f.events.validate_found_base = f.game.validate_found_base;
	f.events.validate_join_base = f.game.validate_join_base;
	// Queue only commands emitted by mounted production controls. No source
	// slot or input action is translated to a native command by this probe.
	f.pending = {requests: [], delivered: 0};
	f.events.event = (name, data) => {
		const request = {name: name}; request.data = data; f.pending.requests :+ request;
	};
	f.events.select_unit = (unit) => {
		f.game.select_unit(unit); f.native.selection_focus(unit.id);
		const e = {}; e.unit = unit; f.events.emit('unit_select', e); f.map.emit('unit_preview', e);
	};
	f.events.select_tile = (tile) => {
		f.game.select_tile(tile);
		const e = {}; e.tile = tile; f.events.emit('tile_select', e); f.map.emit('tile_preview', e);
	};
	f.flush = () => {
		// Same command/selection delivery boundary as the existing candidate
		// unit-order fixtures. Native state and shared selection own results.
		for (timer of f.view.timers) { if (timer.interval > 0) { timer.tick(); } }
		let pending = true; let ticks = 0;
		while (pending && ticks < 32) {
			pending = false;
			while (f.pending.delivered < #sizeof(f.pending.requests)) {
				const request = f.pending.requests[f.pending.delivered];
				f.pending.delivered = f.pending.delivered + 1;
				const handler = #include('../default/game/event/' + request.name);
				const e = {caller: f.native.owner.id}; e.game = f.game; e.data = request.data;
				const error = handler.validate(e);
				if (#is_defined(error)) { throw Error('Actual production command rejected: ' + error); }
				f.native.with_write(() => { e.applied = handler.apply(e); });
				if (request.name != 'unit_activate') {
					const next = f.native.selection_next(false);
					if (next != null) { f.events.select_unit(f.game.um.get_unit(next)); }
					else { f.events.select_tile(f.base.get_tile()); }
				}
				const receipt = {name: request.name, caller: f.native.owner.id, success: true};
				receipt.data = request.data; f.events.emit('event_result', receipt);
			}
			for (timer of f.view.timers) {
				if (timer.interval == 0 && timer.tick()) { pending = true; }
			}
			if (f.pending.delivered < #sizeof(f.pending.requests)) { pending = true; }
			ticks++;
		}
		if (pending) { throw Error('Actual unit-menu UI callbacks did not settle'); }
	};
	const m = {}; m.glsmac = f.glsmac; m.ui = f.view.ui; m.root = f.view.root;
	#include('../default/ui/parts/game/game')(m);
	const configured = {}; configured.game = f.events;
	f.glsmac.emit('configure_game', configured); f.events.emit('start_ui', {});
	f.menu = #include('../default/ui/parts/game/menu/menu');
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
	f.objects = #include('../default/ui/parts/game/bottom_bar/objects_list');
	f.preview.moralesets.NATIVE = f.game.um.get_moraleset('SYNTHETIC');
	f.events.select_unit(f.units[0]); f.flush();
	return f;
};

const mounted = (node) => {
	if (node.is_removed() || !node.is_visible()) { throw Error('Actual menu control is not mounted'); }
};
const buttons = (panel) => {
	mounted(panel); const result = [];
	for (node of panel.children) {
		if (node.kind == 'button' && !node.is_removed() && node.is_visible()) {
			if (#typeof(node.text) != 'String' || node.text == '') { throw Error('Actual menu button has no label'); }
			result :+ node;
		}
	}
	return result;
};

const run = (input) => {
	#print('IMENU_CASE|' + input.id); let f = null;
	try {
		f = fixture(input); const initial = f.game.get_year(); const base = f.base;
		const origin = base.get_tile(); const owner = base.get_owner().id; const base_id = base.id + 0;
		const pops = base.get_pops();
		if (#sizeof(pops) != 1) { throw Error('Expected one initial native Doctor'); }
		const doctor = pops[0]; const doctor_id = doctor.id + 0;
		const ids = {}; const definitions = {scout: 'ScoutPatrol', former: 'Formers', colony: 'ColonyPod'};
		for (let i = 0; i < 3; i++) { const role = ['scout', 'former', 'colony'][i]; ids[role] = f.units[i].id + 0; }
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (role of ['scout', 'former', 'colony']) { if (ids[role] == id) { return role; } }
			throw Error('Unknown native in-game menu selection');
		};
		const parent_menu = () => {
			if (!#is_defined(f.menu.menus.left_menu)) { throw Error('Missing actual production parent menu'); }
			const menu = f.menu.menus.left_menu;
			if (menu.is_open != menu.el.is_visible() || menu.el.is_removed()) { throw Error('Actual parent menu visibility disagrees'); }
			return menu;
		};
		const observe = (index) => {
			if (f.popup.is_shown()) { throw Error('Unexpected modal in menu-only trace'); }
			const root_menu = parent_menu(); const screen = root_menu.is_open ? 'menu' : 'map';
			#print('IMENU_STATE|' + #to_string(index) + '|' + screen + '|' + #to_string(f.game.get_year() - initial) + '|' + role_of(f.native.selected_id()));
			if (#sizeof(f.game.bm.get_bases()) != 1 || base.id != base_id || base.get_owner().id != owner || base.get_tile() != origin || origin.get_base() != base) { throw Error('Menu changed native city identity/ownership/position/membership'); }
			const current = base.get_pops();
			if (#sizeof(current) != 1 || current[0] != doctor || doctor.id != doctor_id || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile')) { throw Error('Menu changed native citizen identity/job'); }
			if (base.get('accumulated_nutrients') != input.initial_base.nutrients || base.get_production().minerals != input.initial_base.minerals) { throw Error('Menu changed stored city resources'); }
			let workers = 0; let doctors = 0;
			for (pop of current) {
				if (pop.get_type() == 'WORKER') { workers++; }
				else if (pop.get_type() == 'DOCTOR') { doctors++; }
				else { throw Error('Unknown actual menu citizen job'); }
			}
			#print('IMENU_NAME|' + base.name);
			#print('IMENU_BASE|' + #to_string(base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(base.get_worked_tiles())) + '|' + #to_string(#sizeof(f.game.bm.get_bases())));
			if (#sizeof(f.native.inspect().unit_ids) != 3 || #sizeof(origin.get_units()) != 3) { throw Error('Menu changed native global/stack unit membership'); }
			for (role of ['scout', 'former', 'colony']) {
				const unit = f.game.um.get_unit(ids[role]);
				if (unit.def != definitions[role] || unit.owner != owner || unit.health != 1.0 || unit.get_tile() != origin) { throw Error('Menu changed native unit identity/owner/health/position'); }
				let code = (0 - 1); const order = unit.get_order();
				if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
				if (code < 0) { throw Error('Unrecognized actual menu companion order'); }
				#print('IMENU_UNIT|' + role + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
			}
			const selected = f.native.selected_id();
			if (selected != null) {
				const unit = f.game.um.get_unit(selected); const labels = f.preview.lines.children;
				if (f.preview.selected_unit_id != selected || f.menu.selected_unit_id != selected ||
					f.objects.selected_type != 'Unit' || f.objects.selected_id != selected) { throw Error('Actual production selection disagrees with native focus'); }
				if (f.preview.rendered_unit_id != selected || #sizeof(labels) == 0 || labels[0].is_removed() || labels[0].text != unit.get_def().name) { throw Error('Actual selected-unit label is missing'); }
			} else if (f.preview.selected_unit_id != null || f.menu.selected_unit_id != null || f.objects.selected_type == 'Unit') {
				throw Error('Actual production selection retains a unit without native focus');
			}
			let child = null;
			for (id in f.menu.menus) {
				const menu = f.menu.menus[id];
				if (menu.is_open != menu.el.is_visible() || menu.el.is_removed()) { throw Error('Actual child menu visibility disagrees'); }
				if (id != 'left_menu' && menu.is_open) {
					if (id == 'right_menu' || child != null || !root_menu.is_open) { throw Error('Unexpected or ambiguous actual open child menu'); }
					child = menu;
				}
			}
			if (root_menu.is_open) {
				const headers = buttons(root_menu.el);
				if (#sizeof(headers) != 9) { throw Error('Missing nine actual mounted in-game menu headers; found ' + #to_string(#sizeof(headers))); }
				let active = (0 - 1); let header_index = 0;
				for (header of headers) {
					#print('IMENU_HEADER|' + #to_string(header_index) + '|' + #to_string(header.active) + '|' + header.text);
					if (header.active) { if (active >= 0) { throw Error('Ambiguous actual active header'); } active = header_index; }
					header_index++;
				}
				if (child != null) {
					if (active < 0) { throw Error('Open child has no actual active header'); }
					#print('IMENU_CHILD|' + #to_string(active));
					for (node of child.el.children) {
						if (node.is_removed() || !node.is_visible()) { continue; }
						if (node.kind == 'button') { mounted(node); #print('IMENU_ROW|' + f.color(node) + '|' + node.text); }
						else if (#is_defined(node.class) && node.class == 'game-menu-separator') { #print('IMENU_SEPARATOR'); }
						else if (!#is_defined(node.class) || (node.class != 'game-menu-top-border' && node.class != 'game-menu-bottom-border')) { throw Error('Unknown actual child menu control'); }
					}
				}
			}
			#print('IMENU_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) {
			if (action == 'menu') {
				let button = null;
				for (node of f.view.live('button')) {
					if (node.text == 'MENU' && node.is_visible()) { if (button != null) { throw Error('Ambiguous actual MENU button'); } button = node; }
				}
				if (button == null || !button.emit('click', {button: 'left'})) { throw Error('Missing actual MENU click control'); }
			} else if (#typeof(action) == 'Object' && #is_defined(action.header)) {
				const root_menu = parent_menu();
				if (!root_menu.is_open) { throw Error('Header click has no actual open parent'); }
				const headers = buttons(root_menu.el);
				if (action.header >= #sizeof(headers)) { throw Error('Missing actual displayed header index'); }
				const button = headers[action.header];
				if (!button.emit('click', {button: 'left'})) { throw Error('Actual header click was not consumed'); }
			} else if (#typeof(action) == 'Object' && #is_defined(action.row_source)) {
				const root_menu = parent_menu();
				if (!root_menu.is_open) { throw Error('Source-row click has no actual open parent'); }
				let child = null;
				for (id in f.menu.menus) {
					const menu = f.menu.menus[id];
					if (id != 'left_menu' && menu.is_open) {
						if (child != null || id != f.menu.headers[4].id) { throw Error('Source-row click has no unique actual Action child'); }
						child = menu;
					}
				}
				if (child == null || !#is_defined(child.items)) { throw Error('Missing actual mounted Action source rows'); }
				mounted(child.el); let button = null;
				for (control of child.items) {
					if (#is_defined(control.entry.source_index) && control.entry.source_index == action.row_source) {
						if (button != null) { throw Error('Ambiguous actual Action source-slot control'); }
						button = control.el;
					}
				}
				if (button == null) { throw Error('Missing actual Action source-slot control: ' + #to_string(action.row_source)); }
				mounted(button); let attached = false;
				for (node of child.el.children) { if (node == button) { attached = true; } }
				if (!attached || button.kind != 'button' || !button.emit('click', {button: 'left'})) { throw Error('Actual Action source-row click was not consumed'); }
			} else if (action == 'tab') {
				// Explicit DOM delivery precedes native frontend navigation. Native
				// selection_navigate is the production W/Tab completion, not a
				// source-slot/action effect supplied by this adapter.
				const event = {code: 'TAB', modifiers: {}}; let handled = false;
				for (id in f.menu.menus) {
					const menu = f.menu.menus[id];
					if (id != 'left_menu' && menu.is_open && !handled) { handled = menu.el.emit('keydown', event) == true; }
				}
				const root_menu = parent_menu();
				if (!handled && root_menu.is_open) { handled = root_menu.el.emit('keydown', event) == true; }
				if (!handled) { handled = f.preview.frame.emit('keydown', event) == true; }
				if (!handled) { handled = f.objects.frame.emit('keydown', event) == true; }
				if (!handled) { handled = f.view.root.emit('keydown', event) == true; }
				if (!handled) {
					f.native.selection_navigate(
						(id) => { f.events.select_unit(f.game.um.get_unit(id)); },
						() => { f.events.select_tile(f.base.get_tile()); }
					);
				}
			} else { throw Error('Unknown unit-menu input action'); }
			f.flush();
			observe(index); index++;
		}
		f.view.root.remove(); f = null; #print('IMENU_CASE_DONE');
	} catch { : (error) => {
		if (f != null) { f.view.root.remove(); }
		#print('IMENU_ERROR|' + #to_string(error));
	} }
};
for (input of unit_menu_context_inputs) { run(input); }
