// Observational candidate only: production game UI/control callbacks and native
// city/units. Display, explicit event delivery and class capture are boundaries.
// Source slots identify interaction targets only; production owns any effects.
// Only explicitly declared source text and transport are supplied here.
const mocks = #include('./_ui_mocks');
const native_fixture = #include('./_unit_selection_fixture');

const fixture = (input) => {
	const f = {};
	f.native = native_fixture(input.profile, undefined, input.initial_base.name, 16, #is_defined(input.land_names) ? input.land_names : undefined);
	f.game = f.native.game; f.base = f.native.base; f.units = f.native.units;
	f.native.with_write(() => {
		f.base.create_pop({type: 'DOCTOR'});
		f.base.set('accumulated_nutrients', input.initial_base.nutrients);
		f.base.restore_production({choice_id: '', minerals: input.initial_base.minerals, last_processed_turn: 0}, '');
	});
	f.view = mocks.display({width: 1024, height: 768}); f.map = mocks.events(); f.events = mocks.events(); f.glsmac = mocks.events();
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
	f.events.get_players = () => { return f.game.get_players(); };
	f.events.get = (key) => { return f.game.get(key); };
	f.events.is_started = f.game.is_started;
	f.events.is_turn_complete = f.game.is_turn_complete;
	f.events.validate_found_base = f.game.validate_found_base;
	f.events.validate_join_base = f.game.validate_join_base;
	f.events.preview_found_base = f.game.preview_found_base;
	f.events.validate_named_found_base = f.game.validate_named_found_base;
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
				if (!f.game.um.has_unit(request.data.unit_id)) {
					// Deliver the same native removal completion as the frontend.
					f.native.selection_removed(request.data.unit_id,
						(id) => { f.events.select_unit(f.game.um.get_unit(id)); },
						() => { f.events.select_tile(f.base.get_tile()); });
				} else if (request.name != 'unit_activate') {
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

// Additional GLSMAC lifecycle/guard regressions use explicitly synthetic text.
const source = (profile) => {
 let text = '';
 for (spec of [['GAME', 'Game', 13], ['HQ', 'HQ', 17], ['NETWORK', 'Network', 9], ['MAP', 'Map', 21],
  ['ACTION', profile == 'action-edited' ? 'Orders' : 'Action', 31], ['TERRAFORM', 'Terraform', 10],
  ['SCENARIO', 'Scenario', 28], ['EDITOR', 'Edit Map', 29], ['HELP', 'Help', 22]]) {
  text += '#' + spec[0] + '\n&' + spec[1] + '\n';
  for (let index = 0; index < spec[2]; index++) {
   let label = 'Fixture ' + spec[0] + ' row ' + #to_string(index);
   if (profile == 'action-edited' && spec[0] == 'ACTION') {
    if (index == 26) { label = 'Watch Here'; }
    if (index == 29) { label = 'Stay Here'; }
    if (index == 30) { label = 'Pause Now'; }
   }
   text += '&' + label + '|Odd+Key\n';
  }
 }
 return text + '#END\n';
};
return (profile, declared_input) => {
 let terrain = '#TERRAIN\n';
 for (let index = 0; index < 20; index++) { terrain += 'Land,None,Sea,None,4,Shape $STR0,q,Q\n'; }
 const input = #is_defined(declared_input) ? declared_input : {profile: 'stacked', initial_base: {name: 'Gaia\'s Landing', workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9},
  sources: [{name: 'menu.txt', source: source(profile)}, {name: 'alphax.txt', source: terrain + '#END\n'}]};
 const f = fixture(input);
 f.initial_year = f.game.get_year();
 f.open_action = () => {
  if (!f.menu.menus.left_menu.is_open) { f.view.find('button', 'text', 'MENU').emit('click', {button: 'left'}); }
  const child = f.menu.menus.left_menu_action;
  if (!#is_defined(child) || !child.is_open) { f.menu.menus.left_menu.items[4].el.emit('click', {button: 'left'}); }
 };
 f.source_control = (slot) => {
  const child = f.menu.menus.left_menu_action;
  if (!#is_defined(child) || !child.is_open) { throw Error('Missing mounted Action child'); }
  let found = null;
  for (control of child.items) {
   if (control.entry.source_index == slot) {
    if (found != null) { throw Error('Ambiguous source control'); } found = control;
   }
  }
  if (found == null || found.el.is_removed() || !found.el.is_visible()) { throw Error('Missing actual source control'); }
  return found;
 };
 f.click_source = (slot) => { return f.source_control(slot).el.emit('click', {button: 'left'}); };
 f.tab = (modifiers) => {
  const event = {code: 'TAB', modifiers: #is_defined(modifiers) ? modifiers : {}}; let handled = false;
  for (id in f.menu.menus) {
   const item = f.menu.menus[id];
   if (id != 'left_menu' && item.is_open && !handled) { handled = item.el.emit('keydown', event) == true; }
  }
  const root = f.menu.menus.left_menu;
  if (!handled && root.is_open) { handled = root.el.emit('keydown', event) == true; }
  if (!handled) { handled = f.preview.frame.emit('keydown', event) == true; }
  if (!handled) { handled = f.objects.frame.emit('keydown', event) == true; }
  if (!handled) { handled = f.view.root.emit('keydown', event) == true; }
  if (!handled && event.modifiers == {}) {
   f.native.selection_navigate((id) => { f.events.select_unit(f.game.um.get_unit(id)); }, () => { f.events.select_tile(f.base.get_tile()); });
  }
  f.flush(); return handled;
 };
 f.unchanged_city = () => {
	 const pops = f.base.get_pops();
  return f.game.get_year() == f.initial_year && #sizeof(f.game.bm.get_bases()) == 1 &&
   f.base.name == 'Gaia\'s Landing' && f.base.get_size() == 1 && pops[0].get_type() == 'DOCTOR' &&
   #sizeof(f.base.get_worked_tiles()) == 0 && f.base.get('accumulated_nutrients') == 0 && f.base.get_production().minerals == 9 &&
   #sizeof(f.native.inspect().unit_ids) == 3 && #sizeof(f.base.get_tile().get_units()) == 3;
 };
 return f;
};
