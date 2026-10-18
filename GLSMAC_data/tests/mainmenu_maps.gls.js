const start_game = #include('../default/ui/parts/mainmenu/steps/start_game');
const select_difficulty = #include('../default/ui/parts/mainmenu/steps/select_difficulty_level');
const select_rules = #include('../default/ui/parts/mainmenu/steps/select_rules');
const main_menu = #include('../default/ui/parts/mainmenu/steps/main');

// Capture the real menu callbacks without constructing a graphical UI.
const create_menu = () => {
	const state = { menu: null, randomized: 0, sizes: 0, notimpl: 0, started: 0, initialized: 0, deinitialized: 0 };
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
			select_difficulty_level: select_difficulty,
			select_rules: select_rules,
			select_mapsize: (current) => { state.sizes = state.sizes + 1; },
			notimpl: (current) => { state.notimpl = state.notimpl + 1; },
		},
	};
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
	test.assert(menu.state.started == 1);
	test.assert(menu.state.randomized == 0);
}

// Existing random, custom, and manual-file entries keep their original routes.
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
test.assert(file_menu.state.notimpl == 1);
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
