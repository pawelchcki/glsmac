const ui_mocks = #include('./_ui_mocks');
const dimension_text = #include('./_dimension_text_fixture');
const start_game = #include('../default/ui/parts/mainmenu/steps/start_game');
const select_difficulty = #include('../default/ui/parts/mainmenu/steps/select_difficulty_level');
const select_rules = #include('../default/ui/parts/mainmenu/steps/select_rules');
const main_menu = #include('../default/ui/parts/mainmenu/steps/main');
const scenario = #include('../default/ui/parts/mainmenu/steps/scenario');
const select_mapsize = #include('../default/ui/parts/mainmenu/steps/select_mapsize');
const customize_mapsize = #include('../default/ui/parts/mainmenu/steps/customize_mapsize');
const customize_ocean_coverage = #include('../default/ui/parts/mainmenu/steps/customize_ocean_coverage');
const customize_erosive_forces = #include('../default/ui/parts/mainmenu/steps/customize_erosive_forces');
const customize_native_lifeforms = #include('../default/ui/parts/mainmenu/steps/customize_native_lifeforms');
const customize_cloud_cover = #include('../default/ui/parts/mainmenu/steps/customize_cloud_cover');

// Exercise fresh compiled backend defaults through the production controls.
// Recorded navigation starts at medium ocean and Average for all other questions.
// Supplying mock preference ordinals here would hide startup-setting mismatches.
const defaults_state = { menu: null, complete: false };
const defaults_i = {
	settings: { global: { map: {} } },
	sliding: { show: (data) => { defaults_state.menu = data; } },
	set_customize_preview: (data) => {},
	customize_preview_defaults: {ocean_coverage_type: 3, erosive_forces_type: 0, native_lifeforms_type: 1, cloud_cover_type: 2},
	steps: {
		customize_erosive_forces: customize_erosive_forces,
		customize_native_lifeforms: customize_native_lifeforms,
		customize_cloud_cover: customize_cloud_cover,
		select_difficulty_level: (current) => { defaults_state.complete = true; },
	},
};
defaults_i.settings.global.map = test.default_map_settings();
customize_ocean_coverage(defaults_i);
for (expected of [
	['Select ocean coverage', '50-70% of surface'],
	['Adjust erosive forces', 'Average'],
	['Native life forms', 'Average'],
	['Select cloud cover', 'Average'],
]) {
	test.assert(defaults_state.menu.title == expected[0]);
	const selected = defaults_state.menu.selected;
	test.assert(defaults_state.menu.entries[selected][0] == expected[1]);
	const confirm = defaults_state.menu.entries[selected][1];
	confirm();
}
test.assert(defaults_state.complete);

// Capture the real menu callbacks without constructing a graphical UI.
const create_menu = () => {
	const state = { menu: null, randomized: 0, sizes: 0, files: 0, notimpl: 0, started: 0, factions: 0, initialized: 0, deinitialized: 0 };
	const i = {
		settings: {
			local: { game_mode: 'multi' },
			global: {
				map: { type: 'custom', filename: 'previous-map.GSM', size_x: 88, size_y: 44 },
				rules: { difficulty_levels: ['Citizen', 'Librarian', 'Transcend'] },
				difficulty_level: 'Transcend',
			},
		},
		sliding: { show: (data) => { state.menu = data; } },
		randomize_map: () => { state.randomized = state.randomized + 1; },
		glsmac: {
			start_game: () => { state.started = state.started + 1; },
			init: () => { state.initialized = state.initialized + 1; },
			deinit: () => { state.deinitialized = state.deinitialized + 1; },
		},
		steps: {
			scenario: scenario,
			select_difficulty_level: select_difficulty,
			select_rules: select_rules,
			select_faction: (current) => { state.factions = state.factions + 1; },
			select_map_file: (current) => { state.files = state.files + 1; },
			select_mapsize: (current) => { state.sizes = state.sizes + 1; },
			notimpl: (current) => { state.notimpl = state.notimpl + 1; },
		},
	};
	#include('./_world_size_fixture')(i.settings);
	start_game(i);
	// GSE object literals clone existing object-valued fields. Assign references
	// after construction so assertions inspect the state captured by callbacks.
	const result = {};
	result.i = i;
	result.state = state;
	return result;
};

for (choice of [[2, 'The Map of Planet', 'planet'], [3, 'Huge Map of Planet', 'huge_planet']]) {
	const menu = create_menu();
	test.assert(menu.state.menu.entries[choice[0]][0] == choice[1]);
	const choose_map = menu.state.menu.entries[choice[0]][1];
	choose_map();
	test.assert(menu.i.settings.global.map.type == choice[2]);
	test.assert(menu.i.settings.global.map.filename == 'previous-map.GSM');
	test.assert(menu.state.menu.title == 'Pick a difficulty level');
	test.assert(menu.state.randomized == 0);
	test.assert(menu.state.sizes == 0);
	test.assert(menu.state.notimpl == 0);
	test.assert(menu.state.started == 0);

	const choose_difficulty = menu.state.menu.entries[1][1];
	choose_difficulty();
	test.assert(menu.i.settings.global.difficulty_level == 'Librarian');
	test.assert(menu.state.menu.title == 'Game rules');
	test.assert(menu.state.started == 0);
	const standard_rules = menu.state.menu.entries[0][1];
	standard_rules();
	test.assert(menu.state.started == 0);
	test.assert(menu.state.factions == 1);
	test.assert(menu.state.randomized == 0);
}

// The recorded Scenario screen offers navigation before unsupported actions.
const scenario_menu = create_menu();
main_menu(scenario_menu.i);
const open_scenario = scenario_menu.state.menu.entries[2][1];
open_scenario();
test.assert(scenario_menu.state.menu.title == 'Scenario');
test.assert(scenario_menu.state.menu.entries[0][0] == 'Play Scenario');
test.assert(scenario_menu.state.menu.entries[1][0] == 'Create Scenario');
test.assert(scenario_menu.state.menu.entries[2][0] == 'Load Map File');
test.assert(scenario_menu.state.menu.entries[3][0] == 'Edit Scenario');
test.assert(scenario_menu.state.notimpl == 0);
const scenario_map = scenario_menu.state.menu.entries[2][1];
scenario_map();
test.assert(scenario_menu.state.files == 1);
test.assert(scenario_menu.state.initialized == 1);
test.assert(scenario_menu.i.settings.local.game_mode == 'single');

// Existing preset dimensions retain both random/custom routes. The added entry
// opens dimension controls without prematurely committing map settings.
for (map_type of ['random', 'custom']) {
	for (preset of [[0, 68, 34], [1, 88, 44], [2, 112, 56], [3, 140, 70], [4, 180, 90]]) {
		const menu = create_menu();
		let customized = 0;
		// Standard is the fresh backend default; create_menu otherwise carries
		// a previous Small setting, which the size menu correctly remembers.
		menu.i.settings.global.map = test.default_map_settings();
		menu.i.settings.global.map.type = map_type;
		menu.i.steps.customize_ocean_coverage = (current) => { customized++; };
		select_mapsize(menu.i);
		test.assert(menu.state.menu.selected == 2);
		test.assert(menu.state.menu.entries[5][0] == 'Custom Size');
		const choose = menu.state.menu.entries[preset[0]][1];
		choose();
		test.assert(menu.i.settings.global.map.size_x == preset[1]);
		test.assert(menu.i.settings.global.map.preset_level == preset[0]);
		test.assert(menu.i.settings.global.map.size_y == preset[2]);
		if (map_type == 'random') {
			test.assert(menu.state.menu.title == 'Pick a difficulty level');
			test.assert(customized == 0);
		} else {
			test.assert(customized == 1);
		}
	}
}

const custom_size_picker = (map_type) => {
	const state = { popup: null, inputs: [], error: null, events: '' };
	const i = {
		settings: {global: {map: {type: map_type, size_x: 112, size_y: 56}}},
		popup: {
			show: (data) => { state.popup = data; },
			back: () => { state.events = state.events + 'back;'; },
			complete: () => { state.events = state.events + 'back;'; },
		},
		steps: {
			select_difficulty_level: (current) => { state.events = state.events + 'difficulty;'; },
			customize_ocean_coverage: (current) => { state.events = state.events + 'ocean;'; },
		},
	};
	dimension_text.install(i);
	customize_mapsize(i);
	state.popup.generator({
		input: (props) => {
			const input = ui_mocks.events();
			input.value = props.value;
			state.inputs :+ input;
			return input;
		},
		text: (props) => {
			const label = {text: props.text};
			state.error = label;
			return label;
		},
	});
	const result = {};
	result.i = i;
	result.state = state;
	return result;
};

for (map_type of ['random', 'custom']) {
	const picker = custom_size_picker(map_type);
	test.assert(picker.state.inputs[0].value == '40');
	test.assert(picker.state.inputs[1].value == '80');
	picker.state.inputs[0].value = '60';
	picker.state.inputs[1].value = '80';
	const confirm = picker.state.popup.buttons[0].onclick;
	confirm({});
	test.assert(picker.i.settings.global.map.size_x == 120);
	test.assert(picker.i.settings.global.map.size_y == 80);
	test.assert(picker.state.events == (map_type == 'random' ? 'back;difficulty;' : 'back;ocean;'));
}

for (invalid of [['nonsense', '80'], ['60.5', '80'], ['120', '0'], ['2049', '80'], ['120junk', '80'], ['120', '2.5'], ['1', '80']]) {
	const picker = custom_size_picker('random');
	picker.state.inputs[0].value = invalid[0];
	picker.state.inputs[1].value = invalid[1];
	const confirm = picker.state.popup.buttons[0].onclick;
	confirm({});
	test.assert(picker.state.events == '');
	test.assert(picker.i.settings.global.map.size_x == 112);
	test.assert(picker.i.settings.global.map.size_y == 56);
	test.assert(picker.state.error.text == 'Use whole horizontal and even vertical sizes within the displayed ranges.');
}
const cancelled_size = custom_size_picker('custom');
cancelled_size.state.inputs[0].value = '120';
const cancel_size = cancelled_size.state.popup.buttons[1].onclick;
cancel_size({});
test.assert(cancelled_size.state.events == 'back;');
test.assert(cancelled_size.i.settings.global.map.size_x == 112);

// Random and custom retain their routes; Load Map File opens the map picker.
const random_menu = create_menu();
const choose_random = random_menu.state.menu.entries[0][1];
choose_random();
test.assert(random_menu.i.settings.global.map.type == 'random');
test.assert(random_menu.state.randomized == 1);
test.assert(random_menu.state.sizes == 1);
test.assert(random_menu.state.started == 0);

const custom_menu = create_menu();
const choose_custom = custom_menu.state.menu.entries[1][1];
choose_custom();
test.assert(custom_menu.i.settings.global.map.type == 'custom');
test.assert(custom_menu.state.randomized == 0);
test.assert(custom_menu.state.sizes == 1);

const file_menu = create_menu();
const choose_file = file_menu.state.menu.entries[4][1];
choose_file();
test.assert(file_menu.state.files == 1);
test.assert(file_menu.state.notimpl == 0);
test.assert(file_menu.i.settings.global.map.filename == 'previous-map.GSM');
test.assert(file_menu.state.randomized == 0);
test.assert(file_menu.state.sizes == 0);

// Quick Start must not reuse a built-in map selected in a previous menu visit.
for (previous_type of ['planet', 'huge_planet']) {
	const quick = create_menu();
	quick.i.settings.global.map.type = previous_type;
	main_menu(quick.i);
	test.assert(quick.state.deinitialized == 1);
	test.assert(quick.state.menu.entries[1][0] == 'Quick Start');
	const choose_quick = quick.state.menu.entries[1][1];
	choose_quick();
	test.assert(quick.i.settings.global.map.type == 'random');
	test.assert(quick.i.settings.local.game_mode == 'single');
	test.assert(quick.state.initialized == 1);
	test.assert(quick.state.randomized == 1);
	test.assert(quick.state.started == 1);
	test.assert(quick.state.sizes == 0);
}
