const faction_text = #include('./_faction_text_fixture');
const faction_profiles = {};
// Execute the shipped faction catalog; the display boundary does not supply
// guessed faction names or mechanics. Artwork and base-name reads are omitted.
const configured_factions = [];
#include('../default/factions').configure({
	add: (id, definition) => { configured_factions :+ {id: id, name: definition.name}; },
	import_colors: (filename) => { return {}; },
	import_base_names: (filename) => { return {}; },
});
const faction_keys = {ArrowUp: 'UP', ArrowDown: 'DOWN', Home: 'HOME', End: 'END', Enter: 'ENTER', Escape: 'ESCAPE'};
const class_has = (node, name) => {
	if (!#is_defined(node.class)) { return false; }
	for (part of #split(node.class, ' ')) { if (part == name) { return true; } }
	return false;
};
const of_class = (view, kind, name) => {
	const result = [];
	for (node of view.live(kind)) { if (class_has(node, name)) { result :+ node; } }
	return result;
};
const ordered = (nodes) => {
	// Native creation order controls focus; visual top order controls field order.
	let result = [];
	for (node of nodes) {
		let inserted = false; const next = [];
		for (previous of result) {
			if (!inserted && node.top < previous.top) { next :+ node; inserted = true; }
			next :+ previous;
		}
		if (!inserted) { next :+ node; }
		result = next;
	}
	return result;
};
let faction_count = 0; let identity_count = 0;
for (input of faction_inputs) {
	const f = fixture(); const native = test.production_fixture();
	f.i.settings = native.game.get_settings();
	f.i.settings.local.game_mode = 'single';
	if (!#is_defined(faction_profiles[input.profile])) { faction_profiles[input.profile] = faction_text(input.profile); }
	const data = faction_profiles[input.profile]; f.i.smac_data = data.bundle;
	#include('../default/game/world_sizes').apply(data.bundle.rules, f.i.settings.global.rules);
	f.i.glsmac.game = { get_fm: () => { return {list: () => { return configured_factions; }}; } };
	let starting = false; let start_identity = null;
	f.i.glsmac.start_game = (id, identity) => {
		starting = true;
		if (#typeof(identity) == 'Array' || #typeof(identity) == 'ArrayRef') {
			if (#is_defined(input.handoff) && input.handoff == 1) {
				const faction = native.apply_faction_identity(identity);
				start_identity = #clone(faction.identity);
				const codec = native.faction_identity_codec();
				test.assert(codec.received && codec.roundtrip && codec.independent, 'Actual native identity must survive its codec');
			} else { start_identity = #clone(identity); }
		}
	};
	const fields = () => { return ordered(f.view.live('input')); };
	const footer = () => { return of_class(f.view, 'button', 'popup-button'); };
	const rows = () => { return of_class(f.view, 'button', 'faction-row'); };
	const lists = () => { return f.view.live('choicelist'); };
	const emit = () => {
		let screen = 'factions'; let caption = ''; let selected = -1; let random = false;
		const windows = f.view.live('window'); const inputs = fields();
		if (starting) { screen = 'starting'; }
		else if (#sizeof(windows) == 0) { screen = 'menu'; const menu = f.active(); caption = menu.title; selected = f.selected(); }
		else {
			test.assert(#sizeof(windows) == 1, 'Exactly one actual popup is observed'); caption = windows[0].title;
			if (#sizeof(inputs) > 0) { screen = #sizeof(inputs) == 1 ? 'name' : 'customize'; }
			else if (#sizeof(lists()) == 1) {
				const list = lists(); const items = list[0].items; let index = 0;
				for (item of items) { if (list[0].value == item[0]) { selected = index; random = item[0] == 'RANDOM'; } index++; }
			} else {
				let index = 0;
				for (row of rows()) { if (class_has(row, 'faction-row-active')) { selected = index; } index++; }
				for (button of of_class(f.view, 'button', 'faction-mode-random')) { random = class_has(button, 'faction-mode-active'); }
			}
		}
		#print('FSET_STATE|' + screen + '|' + #to_string(selected) + '|' + #to_string(random));
		#print('FSET_CAPTION|' + #uppercase(caption));
		if (screen == 'menu') { const menu = f.active(); for (entry of menu.entries) { #print('FSET_ITEM|' + #uppercase(entry[0])); } }
		else if (screen == 'factions') {
			if (#sizeof(lists()) == 1) { const list = lists(); for (item of list[0].items) { #print('FSET_ITEM|' + item[1]); } }
			else {
				const roles = of_class(f.view, 'text', 'faction-role'); let index = 0;
				for (row of rows()) {
					const role = roles[index].text;
					#print('FSET_ITEM|' + row.text + (role == '' ? '' : '|(' + role + ')')); index++;
				}
			}
		} else if (screen == 'name' || screen == 'customize') {
			for (label of ordered(of_class(f.view, 'text', 'faction-editor-label'))) {
				const plain = #split(label.text, ':'); #print('FSET_LABEL|' + #uppercase(#trim(plain[0])));
			}
			test.assert(f.view.focused != null && !f.view.focused.removed, 'Actual focused input is required');
			#print('FSET_VALUE|' + f.view.focused.value);
		}
		if (screen != 'starting' && screen != 'menu') { for (button of footer()) { #print('FSET_BUTTON|' + #uppercase(button.text)); } }
		#print('FSET_END');
	};
	const click_footer = (position) => { const buttons = footer(); if (position >= 0 && position < #sizeof(buttons)) { buttons[position].emit('click', {}); } };
	const choose_slot = (index) => {
		const entries = rows();
		if (index < #sizeof(entries)) { entries[index].emit('click', {}); }
		else if (#sizeof(lists()) == 1) {
			const list = lists(); const items = list[0].items;
			if (index < #sizeof(items)) { list[0].value = items[index][0]; list[0].emit('select', {value: items[index][0]}); }
		}
	};
	steps.main(f.i); f.flush(); test.assert(f.choose('START GAME')); test.assert(f.choose('MAKE RANDOM MAP'));
	test.assert(f.choose('TINY PLANET')); test.assert(f.choose('CITIZEN')); test.assert(f.choose('PLAY WITH STANDARD RULES'));
	#print('FSET_CASE|' + input.id); emit();
	for (action of input.actions) {
		if (!starting) {
			if (#is_defined(action.key)) {
				const windows = f.view.live('window'); const code = faction_keys[action.key];
				if (#sizeof(windows) == 0) { f.key(code); }
				else {
					if (#sizeof(lists()) == 1 && #sizeof(rows()) == 0 && (code == 'UP' || code == 'DOWN')) {
						const list = lists(); let current = 0; let index = 0;
						for (item of list[0].items) { if (item[0] == list[0].value) { current = index; } index++; }
						if (code == 'UP' && current > 0) { current--; } if (code == 'DOWN' && current < index - 1) { current++; }
						choose_slot(current);
					} else if (code == 'ENTER') {
						const buttons = footer(); let delivered = false;
						for (button of buttons) { if (#is_defined(button.is_ok) && button.is_ok && !delivered) { button.emit('click', {}); delivered = true; } }
					} else { windows[0].emit('keydown', {code: code, modifiers: {}}); }
				}
			} else if (#is_defined(action.slot)) { choose_slot(action.slot); }
			else if (#is_defined(action.focus) || #is_defined(action.edit)) {
				let index = 0; if (#is_defined(action.focus)) { index = action.focus; } else { index = action.edit.field; }
				const inputs = fields();
				if (index < #sizeof(inputs)) {
					const field = inputs[index]; f.view.focus(field); field.emit('mousedown', {});
					if (#is_defined(action.edit)) {
						field.value = ''; field.emit('change', {value: ''});
						const text = action.edit.text;
						let character = 0; let finished = false;
						while (!finished) {
							const end = character + 1; const typed = (text + '')[character::end];
							if (typed == '') { finished = true; }
							else { field.value = field.value + typed; field.emit('change', {value: field.value}); character++; }
						}
					}
				}
			} else if (#is_defined(action.button)) {
				const count = #sizeof(footer()); const role = action.button;
				if (role == 'CANCEL') { click_footer(count - 1); }
				else if (role == 'OK') { click_footer(count - 2); }
				else if (role == 'CHANGE NAME' && #sizeof(fields()) == 0 && count >= 3) { click_footer(1); }
				else if ((role == 'RESTORE DEFAULTS' || role == 'CHANGE GENDER') && #sizeof(fields()) > 0 && count == 3) { click_footer(0); }
			} else if (#is_defined(action.preset) || #is_defined(action.mode)) {
				let class_name = '';
				if (#is_defined(action.preset)) { class_name = 'faction-preset-' + action.preset; }
				else { class_name = 'faction-mode-' + action.mode; }
				const buttons = of_class(f.view, 'button', class_name); if (#sizeof(buttons) == 1) { buttons[0].emit('click', {}); }
			} else if (#is_defined(action.roster)) {
				const arrows = of_class(f.view, 'button', 'faction-dropdown');
				if (action.roster.slot < #sizeof(arrows)) {
					arrows[action.roster.slot].emit('click', {}); f.flush();
					const list = lists();
					if (#sizeof(list) == 1 && action.roster.option < #sizeof(list[0].items)) {
						const item = list[0].items[action.roster.option]; list[0].value = item[0]; list[0].emit('select', {value: item[0]});
					}
				}
			}
			f.flush();
		}
		emit();
	}
	#print('FSET_DONE');
	if (#is_defined(input.handoff) && input.handoff == 1) {
		test.assert(!starting && #sizeof(fields()) == 1, 'The actual name editor must precede the start boundary');
		for (button of footer()) { if (#is_defined(button.is_ok) && button.is_ok) { button.emit('click', {}); } }
		test.assert(starting, 'Actual confirmation must request native startup');
		#print('IDENTITY_CASE|' + input.id);
		if (start_identity == null) { #print('IDENTITY_MISSING'); }
		else { for (value of start_identity) { #print('IDENTITY_VALUE|' + value); } }
		#print('IDENTITY_END');
		identity_count++;
	}
	f.view.root.remove(); faction_count++;
}
#print('FSET_COMPLETE|' + #to_string(faction_count));
if (identity_count > 0) { #print('IDENTITY_COMPLETE|' + #to_string(identity_count)); }
