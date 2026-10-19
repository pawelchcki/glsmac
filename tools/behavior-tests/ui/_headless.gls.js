// Only native display objects, audio and clock delivery are replaced. The
// shipped menu steps, sliding widget, selection and back-stack execute normally.
const create_display = #include('./_headless_display');
const step_names = ['main', 'start_game', 'scenario', 'select_mapsize', 'customize_mapsize', 'select_difficulty_level', 'select_rules', 'select_faction', 'select_map_file', 'credits', 'notimpl', 'customize_ocean_coverage', 'customize_erosive_forces', 'customize_native_lifeforms', 'customize_cloud_cover'];
const steps = {};
for (name of step_names) {
	steps[name] = #include('../default/ui/parts/mainmenu/steps/' + name);
}

const fixture = () => {
	const view = create_display();
	const state = { completed: false, canceled: false };
	const m = {};
	m.root = view.root;
	m.ui = view.ui;
	m.glsmac = {
		config: {},
		init: () => {}, deinit: () => {}, reset: () => {}, exit: () => { state.canceled = true; },
		list_maps: () => { return []; },
		game: { get_fm: () => { return { list: () => { return []; } }; } },
	};
	m.glsmac.ui = view.ui;
	const sliding = #include('../default/ui/parts/mainmenu/sliding')(m);
	const popup = #include('../default/ui/parts/mainmenu/popup')(m);
	const manager = #include('../default/ui/parts/mainmenu/manager')('sliding', sliding);
	manager.register('popup', popup);
	manager.data_stack = [];
	const i = {
		settings: {
			local: { game_mode: 'single' },
			global: {
				map: { type: 'custom', size_x: 112, size_y: 56, ocean_coverage: 0.6, erosive_forces: 0.75, native_lifeforms: 0.5, cloud_cover: 0.5 },
				rules: { difficulty_levels: ['Citizen', 'Specialist', 'Talent', 'Librarian', 'Thinker', 'Transcend'] },
				difficulty_level: 'Citizen',
			},
		},
		customize_preview_defaults: { ocean_coverage_type: 3, erosive_forces_type: 0, native_lifeforms_type: 1, cloud_cover_type: 2 },
		set_customize_preview: (data) => {}, unset_customize_preview: () => {},
		randomize_map: () => {},
	};
	i.glsmac = m.glsmac;
	i.sliding = sliding;
	i.popup = popup;
	i.steps = steps;
	const flush = () => {
		let tick = 0;
		while (view.running_timers() > 0 && tick < 32) {
			for (timer of view.timers) { timer.tick(); }
			tick++;
		}
		if (view.running_timers() > 0) { throw Error('Menu timers did not settle'); }
	};

	const current = () => {
		if (#sizeof(manager.data_stack) == 0) { throw Error('Menu stack is empty'); }
		return manager.data_stack[#sizeof(manager.data_stack) - 1];
	};
	const active = () => {
		const data = current();
		if (data.type != 'sliding') { throw Error('Visible popup: ' + data.data.title); }
		return data.data;
	};
	const selected = () => {
		const data = active();
		let found = -1;
		let index = 0;
		for (entry of data.entries) {
			for (button of view.live('button')) {
				if (button.text == entry[0] && button.class == 'menublock-item-active') {
					if (found != -1) { throw Error('Multiple highlighted entries'); }
					found = index;
				}
			}
			index++;
		}
		if (found == -1) { throw Error('No highlighted entry'); }
		return found;
	};
	const choose = (label) => {
		const data = active();
		for (entry of data.entries) {
			if (#uppercase(entry[0]) == label) {
				view.find('button', 'text', entry[0]).emit('mousedown', {});
				flush();
				return true;
			}
		}
		return false;
	};
	const key = (code) => {
		const areas = view.live('area');
		for (area of areas) {
			if (area.class == 'menublock-items') {
				area.emit('keydown', { code: code, modifiers: {} });
				flush();
				return true;
			}
		}
		throw Error('No menu input target');
	};
	const result = {};
	result.i = i;
	result.view = view;
	result.state = state;
	result.manager = manager;
	result.active = active;
	result.selected = selected;
	result.choose = choose;
	result.key = key;
	result.flush = flush;
	return result;
};

const emit_menu = (f) => {
	const data = f.active();
	const caption = #is_defined(data.title) ? #uppercase(data.title) : '';
	const selected = f.selected();
	#print('HUI_SCREEN|' + caption);
	let index = 0;
	for (entry of data.entries) {
		#print('HUI_ENTRY|' + #to_string(index) + '|' + #to_string(index == selected) + '|' + #uppercase(entry[0]));
		index++;
	}
	#print('HUI_SCREEN_END');
};

const keys = { Escape: 'ESCAPE', Enter: 'ENTER', ArrowUp: 'UP', ArrowDown: 'DOWN', Home: 'HOME', End: 'END' };
const parameter_names = ['ocean_coverage', 'erosive_forces', 'native_lifeforms', 'cloud_cover'];
const parameter_values = [[0.4, 0.6, 0.8], [0.5, 0.75, 1.0], [0.25, 0.5, 0.75], [0.25, 0.5, 0.75]];
const screens = [['Select ocean coverage', 'ocean'], ['Adjust erosive forces', 'erosion'], ['Native life forms', 'life'], ['Select cloud cover', 'clouds']];
const screen_name = (title) => {
	for (screen of screens) { if (screen[0] == title) { return screen[1]; } }
	throw Error('Unknown custom-map question: ' + title);
};

const run_custom = (f, input) => {
	// The original contract ends when custom setup returns to its caller.
	// The next difficulty menu is outside that bounded controller.
	const custom_steps = {};
	for (name of step_names) { custom_steps[name] = steps[name]; }
	custom_steps.select_difficulty_level = (i) => { f.state.completed = true; };
	f.i.steps = custom_steps;
	for (index in parameter_names) {
		const field = parameter_names[index];
		const values = parameter_values[index];
		const preference = input.preferences[index];
		f.i.settings.global.map[field] = values[preference];
	}
	steps.select_mapsize(f.i);
	f.flush();
	if (!f.choose('STANDARD PLANET')) { throw Error('Cannot prepare custom-map caller'); }
	let consumed = 0;
	let status = 'waiting';
	let finished = false;
	while (!finished) {
		if (f.state.completed) {
			status = 'confirmed';
			finished = true;
		} else {
			const data = f.active();
			if (data.title == 'Select size of planet') {
				status = 'canceled';
				finished = true;
			} else {
				#print('HUI_CUSTOM_MENU|' + screen_name(data.title) + '|' + #to_string(f.selected()));
				if (consumed == #sizeof(input.choices)) {
					finished = true;
				} else {
					const choice = input.choices[consumed];
					if (choice == -1) {
						f.key('ESCAPE');
					} else {
						const entry = data.entries[choice];
						if (!f.choose(#uppercase(entry[0]))) { throw Error('Custom-map choice missing'); }
					}
					consumed++;
				}
			}
		}
	}
	let parameters = '';
	if (status == 'confirmed') {
		for (index in parameter_names) {
			const field = parameter_names[index];
			let ordinal = -1;
			const values = parameter_values[index];
			for (position in values) {
				if (f.i.settings.global.map[field] == values[position]) { ordinal = position; }
			}
			if (ordinal == -1) { throw Error('Unknown production parameter value'); }
			if (parameters != '') { parameters += ','; }
			parameters += #to_string(ordinal);
		}
	}
	#print('HUI_CUSTOM_DONE|' + status + '|' + #to_string(consumed) + '|' + parameters);
};

const run_input = (input) => {
	#print('HUI_CASE|' + input.id);
	try {
		const f = fixture();
		if (input.algorithm == 'ui.custom_planet.v1') {
			run_custom(f, input);
			f.view.root.remove();
			return true;
		}
		steps.main(f.i);
		f.flush();
		let completed = true;
		let step = 0;
		emit_menu(f);
		for (action of input.actions) {
			if (#is_defined(action.key)) {
				f.key(keys[action.key]);
			} else if (!f.choose(action.choose)) {
				#print('HUI_MISSING|' + #to_string(step) + '|' + action.choose);
				completed = false;
				break;
			}
			emit_menu(f);
			step++;
		}
		#print('HUI_DONE|' + #to_string(completed));
		f.view.root.remove();
	} catch { : (e) => {
		#print('HUI_ERROR|' + e.type + '|' + e.reason);
	} }
};
for (input of headless_inputs) { run_input(input); }
