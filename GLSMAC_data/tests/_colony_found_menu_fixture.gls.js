// Native declared setup, mounted production controls, raw native text editing.
// This fixture does not create a draft, dialog, city, or command result.
const mounted = #include('./_unit_menu_orders_fixture');
return (input) => {
	if (input.profile != 'spread-distant') { throw Error('Founding requires the declared distant layout'); }
	let document = null;
	for (source of input.sources) {
		if (source.name == 'gaians.txt') {
			if (document != null) { throw Error('Duplicate declared base-name source'); }
			document = test.parse_smac_text(source.source, 'dialogs');
		}
	}
	if (document == null) { throw Error('Missing declared native base-name source'); }
	const names = [];
	for (record of document.dialog('BASES').records) {
		if (record.kind == 'text') { names :+ record.text; }
		else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported base-name source record'); }
	}
	if (#sizeof(names) != 64) { throw Error('Founding requires the declared 64-name pool'); }
	const prepared = input + {land_names: names};
	const f = mounted('synthetic', prepared);
	f.native.configure_unit(f.units[2].id, 'flat_arid_world');
	f.view.native_input_factory = (props) => { return test.input_state(props.value, #is_defined(props.max_length) ? props.max_length : 0); };
	let terrain = null;
	for (source of input.sources) { if (source.name == 'alphax.txt') { terrain = test.parse_smac_text(source.source, 'rules'); } }
	if (terrain == null) { throw Error('Missing declared native TERRAIN input'); }
	f.game.set('terraforming_rules', #include('../default/game/terraforming_rules').parse(terrain));
	#include('../default/game/terraforming').configure(f.game);
	// Install the shipped tile-yield and city-choice policies. Definition events
	// already supplied by the native fixture are the only skipped startup work.
	#include('../default/resources').configure(f.game);
	const rules = {}; const callbacks = {};
	rules.get_bm = () => { return f.game.bm; }; rules.get_tm = () => { return f.game.tm; };
	rules.get_turn = () => { return f.game.get_turn(); }; rules.is_master = () => { return f.game.is_master(); };
	rules.get_player = (id) => { return f.game.get_player(id); };
	rules.trigger = (name, data) => { return f.game.trigger(name, data); };
	rules.get = (key) => { return f.game.get(key); }; rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { callbacks[name] = callback; };
	rules.event = (name, data) => {
		if (name != 'define_base_pop' && name != 'define_base_facility') { throw Error('Unexpected founding setup event: ' + name); }
	};
	#include('../default/game/bases')(rules); callbacks.start({});
	for (index of [0, 1]) {
		if (f.native.selected_id() != f.units[index].id) { throw Error('Native Hold preparation selected a different companion'); }
		if (!f.preview.hold_button.emit('click', {button: 'left'})) { throw Error('Mounted companion Hold did not consume click'); }
		f.flush();
		if (f.units[index].get_order() != 'HOLD') { throw Error('Native companion Hold did not apply'); }
	}
	if (f.native.selected_id() != f.units[2].id || f.units[2].movement != 1.0 || f.units[2].get_order() != 'NO_ORDERS') {
		throw Error('Declared preparation did not reach the ready native Colony Pod');
	}
	if (f.base.name != input.initial_base.name || f.native.inspect().names != [input.initial_base.name]) { throw Error('Initial city/name registry does not match the declared raw city'); }
	const origin = f.base.get_tile(); const colony_tile = f.units[2].get_tile();
	if (colony_tile.x != origin.x - 2 || colony_tile.y != origin.y + 2 || colony_tile.get_base() != null) { throw Error('Incorrect declared distant founding tile'); }
	for (let y = 0; y < 16; y++) {
		for (let x = y % 2; x < 16; x += 2) {
			const tile = f.game.tm.get_tile(x, y);
			if (!tile.is_land || tile.moisture != 1 || tile.rockiness != 1 || tile.features.xenofungus) { throw Error('Incorrect declared native flat arid grid'); }
		}
	}
	f.dialog = () => {
		const contains = (node, target) => {
			if (node == target) { return true; }
			for (child of node.children) { if (!child.is_removed() && contains(child, target)) { return true; } }
			return false;
		};
		let field = null;
		for (node of f.view.live('input')) {
			if (node.is_visible()) { if (field != null) { throw Error('Ambiguous actual founding text input'); } field = node; }
		}
		if (field == null) { return null; }
		let frame = null;
		for (node of f.view.live('window')) {
			if (node.is_visible() && contains(node, field)) { if (frame != null) { throw Error('Ambiguous actual founding window'); } frame = node; }
		}
		if (frame == null || !#is_defined(field.input_state) || !#is_defined(field.raw_key)) { throw Error('Missing mounted native founding editor'); }
		const texts = []; const buttons = [];
		const collect = (node) => {
			for (child of node.children) {
				if (!child.is_removed() && child.is_visible()) {
					if (child.kind == 'text') { texts :+ child; }
					else if (child.kind == 'button') { buttons :+ child; }
					else if (child.kind != 'input') { collect(child); }
				}
			}
		};
		collect(frame);
		if (#sizeof(texts) != 2 || #sizeof(buttons) != 2 || field.value != field.input_state.get_value()) { throw Error('Incomplete actual founding dialog or divergent editor'); }
		const dialog = {}; dialog.frame = frame; dialog.input = field; dialog.texts = texts; dialog.buttons = buttons; return dialog;
	};
	f.action = (action) => {
		if (action == 'menu') { f.view.find('button', 'text', 'MENU').emit('click', {button: 'left'}); }
		else if (#typeof(action) == 'Object' && #is_defined(action.header) && action.header == 4) {
			const root = f.menu.menus.left_menu;
			if (!root.is_open || root.el.is_removed() || !root.el.is_visible()) { throw Error('MENU is not open'); }
			root.items[4].el.emit('click', {button: 'left'});
		} else if (#typeof(action) == 'Object' && #is_defined(action.row_source) && action.row_source == 0) {
			f.click_source(0);
		} else {
			const dialog = f.dialog(); if (dialog == null) { throw Error('Missing actual production founding dialog'); }
			if (#typeof(action) == 'Object' && #is_defined(action.edit)) {
				let clears = 0;
				while (dialog.input.input_state.get_value() != '' && clears < 256) { dialog.input.raw_key('BACKSPACE', '', 0, ''); clears++; }
				if (dialog.input.input_state.get_value() != '') { throw Error('Native founding field did not clear'); }
				for (character of action.keys) { dialog.input.raw_key('NONE', character, 0, ''); }
			} else if (action == 'button-ok' || action == 'button-cancel') {
				const index = action == 'button-ok' ? 0 : 1; dialog.buttons[index].emit('click', {button: 'left'});
			} else if (action == 'confirm') { dialog.input.raw_key('ENTER', '', 0, ''); }
			else if (action == 'cancel') { dialog.frame.emit('keydown', {code: 'ESCAPE', modifiers: {}}); }
			else { throw Error('Unknown founding action'); }
		}
		f.flush();
	};
	return f;
};
