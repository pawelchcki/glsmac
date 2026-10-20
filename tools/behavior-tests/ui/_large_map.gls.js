const warning_text = #include('./_large_map_text_fixture');
const warning_worlds = #include('../default/game/world_sizes');
const warning_profiles = {};
const warning_codes = {ArrowDown: 'DOWN', ArrowUp: 'UP', Home: 'HOME', End: 'END', Enter: 'ENTER', Escape: 'ESCAPE'};
let warning_count = 0;
for (input of warning_inputs) {
	const f = fixture(); const native = test.production_fixture();
	f.i.settings.global = native.game.get_settings().global;
	if (!#is_defined(warning_profiles[input.text_profile])) { warning_profiles[input.text_profile] = warning_text(input.text_profile); }
	const data = warning_profiles[input.text_profile]; f.i.smac_data = data.bundle;
	warning_worlds.apply(data.bundle.rules, f.i.settings.global.rules);
	f.i.settings.global.rules.select_world_size(f.i.settings.global.map, 2);
	const has_class = (node, name) => {
		for (part of #split(node.class, ' ')) { if (part == name) { return true; } }
		return false;
	};
	const choices = () => {
		const result = [];
		for (button of f.view.live('button')) {
			if (has_class(button, 'popup-choice') || has_class(button, 'popup-choice-active')) { result :+ button; }
		}
		return result;
	};
	const confirmations = () => {
		const result = [];
		for (button of f.view.live('button')) { if (button.class == 'popup-button') { result :+ button; } }
		return result;
	};
	const is_warning = () => {
		return #sizeof(f.view.live('window')) == 1 && #sizeof(f.view.live('input')) == 0 && #sizeof(choices()) == 2;
	};
	const emit = (stage, available) => {
		#print('WARN_BEGIN|' + input.id + '|' + stage + '|' + #to_string(f.i.settings.global.map.preset_level) + '|' + #to_string(available));
		const windows = f.view.live('window'); const fields = f.view.live('input');
		if (#sizeof(windows) == 1 && #sizeof(fields) == 2) {
			#print('WARN_DIMENSION|' + #uppercase(windows[0].title) + '|' + fields[0].value + '|' + fields[1].value);
		} else if (is_warning()) {
			#print('WARN_WARNING|' + #uppercase(windows[0].title));
			const entries = choices(); let index = 0;
			for (entry of entries) {
				const selected = has_class(entry, 'popup-choice-active');
				#print('WARN_ENTRY|' + #to_string(index) + '|' + #to_string(selected) + '|' + #uppercase(entry.text));
				index++;
			}
			index = 0;
			for (button of confirmations()) {
				#print('WARN_BUTTON|' + #to_string(index) + '|' + #uppercase(button.text)); index++;
			}
		} else {
			test.assert(#sizeof(windows) == 0, 'Unrecognized actual popup cannot be treated as a warning');
			const menu = f.active(); const selected = f.selected();
			#print('WARN_MENU|' + (#is_defined(menu.title) ? #uppercase(menu.title) : ''));
			let index = 0;
			for (entry of menu.entries) {
				#print('WARN_ENTRY|' + #to_string(index) + '|' + #to_string(index == selected) + '|' + #uppercase(entry[0])); index++;
			}
		}
		#print('WARN_END');
	};
	steps.main(f.i); f.flush(); test.assert(f.choose('START GAME'));
	test.assert(f.choose(input.route == 'random' ? 'MAKE RANDOM MAP' : 'CUSTOMIZE RANDOM MAP'));
	test.assert(f.choose('CUSTOM SIZE'));
	const fields = f.view.live('input'); test.assert(#sizeof(fields) == 2);
	fields[0].value = input.horizontal; fields[1].value = input.vertical;
	emit('edited', true);
	if (input.submit == 'Enter') { fields[1].emit('input', {}); }
	else { f.view.find('button', 'text', 'OK').emit('click', {}); }
	f.flush(); emit('submit', true);
	let action_index = 0;
	for (action of input.actions) {
		const available = is_warning();
		if (available) {
			if (action == 'ClickFirst' || action == 'ClickSecond') {
				const entries = choices(); const index = action == 'ClickFirst' ? 0 : 1;
				entries[index].emit('click', {});
			} else if (action == 'OK') {
				const buttons = confirmations(); test.assert(#sizeof(buttons) == 1); buttons[0].emit('click', {});
			} else {
				const windows = f.view.live('window'); windows[0].emit('keydown', {code: warning_codes[action], modifiers: {}});
			}
			f.flush();
		}
		emit('action-' + #to_string(action_index), available); action_index++;
	}
	#print('WARN_DONE|' + input.id); f.view.root.remove(); warning_count++;
}
#print('WARN_COMPLETE|' + #to_string(warning_count));
