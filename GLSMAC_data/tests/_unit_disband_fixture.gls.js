// Declared native inputs and actual mounted input routing only. No Disband
// dialog, source precedence, draft choice, menu lifetime or effect is supplied.
const mounted = #include('./_unit_menu_orders_fixture');
return (input) => {
	if (input.profile != 'spread') { throw Error('Disband candidate requires the declared spread input'); }
	const f = mounted('synthetic', input);
	f.native.configure_unit(f.units[1].id, 'flat_arid_world');
	let terrain = null;
	for (source of input.sources) { if (source.name == 'alphax.txt') { if (terrain != null) { throw Error('Duplicate declared terrain source'); } terrain = test.parse_smac_text(source.source, 'rules'); } }
	if (terrain == null) { throw Error('Missing declared terrain source'); }
	f.game.set('terraforming_rules', #include('../default/game/terraforming_rules').parse(terrain));
	#include('../default/game/terraforming').configure(f.game);
	const origin = f.base.get_tile(); const former = f.units[1];
	if (former.get_tile().x != origin.x + 1 || former.get_tile().y != origin.y + 1 || former.get_tile().get_base() != null ||
		former.def != 'Formers' || former.movement != 1.0 || former.health != 1.0 || former.get_order() != 'NO_ORDERS' ||
		f.native.selected_id() != f.units[0].id) { throw Error('Incorrect declared native disband preparation'); }
	for (let y = 0; y < 16; y++) { for (let x = y % 2; x < 16; x += 2) {
		const tile = f.game.tm.get_tile(x, y);
		if (!tile.is_land || tile.moisture != 1 || tile.rockiness != 1 || tile.features.xenofungus) { throw Error('Incorrect declared flat arid disband grid'); }
	} }
	const contains = (node, target) => {
		if (node == target) { return true; }
		for (child of node.children) { if (!child.is_removed() && child.is_visible() && contains(child, target)) { return true; } }
		return false;
	};
	f.dialog = () => {
		let frame = null;
		for (node of f.view.live('window')) {
			if (node.is_visible()) { if (frame != null) { throw Error('Ambiguous actual Disband dialog'); } frame = node; }
		}
		if (frame == null) { return null; }
		const texts = []; const buttons = []; const lists = [];
		for (node of f.view.nodes) {
			if (!node.is_removed() && node.is_visible() && contains(frame, node)) {
				if (node.kind == 'text') { texts :+ node; }
				if (node.kind == 'button') { buttons :+ node; }
				if (node.kind == 'choicelist') { lists :+ node; }
			}
		}
		// Observe the two existing production choice representations. Both
		// require actual selected native/UI state; no default index is filled in.
		const choices = []; let selected = null; let ok = null;
		if (#sizeof(lists) == 1 && #sizeof(buttons) == 1) {
			const list = lists[0]; let index = 0;
			if (!#is_defined(list.items) || !#is_defined(list.value)) { throw Error('Missing actual Disband choice state'); }
			for (item of list.items) { choices :+ item[1]; if (item[0] == list.value) { if (selected != null) { throw Error('Ambiguous actual Disband selection'); } selected = index; } index++; }
			ok = buttons[0];
		} else if (#sizeof(lists) == 0 && #sizeof(buttons) == 4) {
			for (let index = 0; index < 3; index++) {
				const row = buttons[index]; choices :+ row.text;
				let active = row.active;
				if (#is_defined(row.class)) { for (name of #split(row.class, ' ')) { if (name == 'popup-choice-active') { active = true; } } }
				if (active) { if (selected != null) { throw Error('Ambiguous actual Disband choice highlight'); } selected = index; }
			}
			ok = buttons[3];
		} else { throw Error('Unsupported actual Disband controls'); }
		if (#sizeof(texts) != 2 || #sizeof(choices) != 3 || selected == null) { throw Error('Incomplete actual Disband dialog'); }
		const result = {caption: texts[0].text, body: texts[1].text, choices: choices, selected: selected};
		result.frame = frame; result.ok = ok; return result;
	};
	f.action = (action) => {
		if (action == 'tab') { f.tab(); }
		else if (action == 'menu') { f.view.find('button', 'text', 'MENU').emit('click', {button: 'left'}); }
		else if (#typeof(action) == 'Object' && #is_defined(action.header) && action.header == 4) {
			const root = f.menu.menus.left_menu;
			if (!root.is_open || !root.el.is_visible() || root.el.is_removed()) { throw Error('Actual Disband MENU is not open'); }
			root.items[4].el.emit('click', {button: 'left'});
		} else if (#typeof(action) == 'Object' && #is_defined(action.row_source) && action.row_source == 9) { f.click_source(9); }
		else {
			const dialog = f.dialog(); if (dialog == null) { throw Error('Missing actual production Disband dialog'); }
			if (action == 'button-ok') { dialog.ok.emit('click', {button: 'left'}); }
			else {
				let code = null;
				if (action == 'cancel') { code = 'ESCAPE'; } else if (action == 'confirm') { code = 'ENTER'; } else if (action == 'up') { code = 'UP'; } else if (action == 'down') { code = 'DOWN'; }
				if (code == null) { throw Error('Unknown declared Disband action'); }
				if (!dialog.frame.emit('keydown', {code: code, modifiers: {}})) { throw Error('Actual Disband dialog did not handle requested key'); }
			}
		}
		f.flush();
	};
	return f;
};
