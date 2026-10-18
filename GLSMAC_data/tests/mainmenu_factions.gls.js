const select_faction = #include('../default/ui/parts/mainmenu/steps/select_faction');
const select_rules = #include('../default/ui/parts/mainmenu/steps/select_rules');
const faction_definitions = #include('../default/factions');

// Use the shipped faction configuration, without reading original game assets.
const factions = [];
faction_definitions.configure({
	add: (id, definition) => { factions :+ { id: id, name: definition.name }; },
	import_colors: (filename) => { return {}; },
	import_base_names: (filename) => { return {}; },
});
test.assert(#sizeof(factions) == 14);

const create_menu = () => {
	const state = {
		popup: null, choices: null, scroll: null, label: null, select: null,
		started: [], back: 0, error: '', reject_start: false, notimpl: 0, menu: null,
	};
	const i = {
		glsmac: {
			game: { get_fm: () => { return { list: () => { return factions; } }; } },
			start_game: (faction) => {
				if (state.reject_start) {
					throw GSEGameError('Faction is no longer available.');
				}
				state.started :+ faction;
			},
		},
		popup: {
			show: (data) => {
				state.popup = data;
				data.generator({
					text: (properties) => {
						const label = {};
						label.text = properties.text;
						state.label = label;
						return label;
					},
					scrollview: (properties) => {
						state.scroll = properties;
						return {
							choicelist: (properties) => {
								const choices = {};
								choices.items = properties.items;
								choices.value = properties.value;
								choices.on = (event, callback) => {
									test.assert(event == 'select');
									state.select = callback;
								};
								state.choices = choices;
								return choices;
							},
						};
					},
				});
			},
			back: () => { state.back = state.back + 1; },
			error: (text) => { state.error = text; },
		},
		sliding: { show: (data) => { state.menu = data; } },
		steps: {
			select_faction: select_faction,
			notimpl: (current) => { state.notimpl = state.notimpl + 1; },
		},
	};
	const result = {};
	result.i = i;
	result.state = state;
	return result;
};

// Both existing rules choices must stop at faction selection, before launch.
for (index of [0, 1]) {
	const menu = create_menu();
	select_rules(menu.i);
	const choose_rules = menu.state.menu.entries[index][1];
	choose_rules();
	test.assert(menu.state.popup.title == 'Choose your faction');
	test.assert(#sizeof(menu.state.started) == 0);
}

const random = create_menu();
select_faction(random.i);
test.assert(random.state.popup.height == 340);
test.assert(random.state.scroll.has_hscroll == false);
test.assert(random.state.scroll.vscroll_class == 'default-scroll-v');
test.assert(random.state.choices.value == 'RANDOM');
test.assert(random.state.choices.items[0] == ['RANDOM', 'Random']);
test.assert(#sizeof(random.state.choices.items) == 15);
for (let index = 0; index < #sizeof(factions); index++) {
	test.assert(random.state.choices.items[index + 1] == [factions[index].id, factions[index].name]);
}
const start_random = random.state.popup.buttons[0].onclick;
test.assert(start_random({}));
test.assert(random.state.started == ['RANDOM']);
// Repeated clicks during game loading do not create another game.
test.assert(start_random({}));
test.assert(random.state.started == ['RANDOM']);

// An explicitly selected expansion faction reaches native start unchanged.
const chosen = create_menu();
select_faction(chosen.i);
chosen.state.choices.value = 'USURPERS';
const update_selection = chosen.state.select;
test.assert(update_selection({ value: 'USURPERS' }));
test.assert(chosen.state.label.text == 'Faction: Usurpers');
const start_chosen = chosen.state.popup.buttons[0].onclick;
test.assert(start_chosen({}));
test.assert(chosen.state.started == ['USURPERS']);

const canceled = create_menu();
select_faction(canceled.i);
canceled.state.choices.value = 'GAIANS';
const cancel = canceled.state.popup.buttons[1].onclick;
test.assert(cancel({}));
test.assert(canceled.state.back == 1);
test.assert(#sizeof(canceled.state.started) == 0);

// Invalid or stale UI values never launch; correcting the choice allows retry.
const invalid = create_menu();
select_faction(invalid.i);
invalid.state.choices.value = 'MISSING';
const start_invalid = invalid.state.popup.buttons[0].onclick;
test.assert(start_invalid({}));
test.assert(invalid.state.error == 'Choose an available faction.');
test.assert(#sizeof(invalid.state.started) == 0);
invalid.state.choices.value = 'GAIANS';
test.assert(start_invalid({}));
test.assert(invalid.state.started == ['GAIANS']);

// Native validation can also reject a stale faction without trapping the menu.
const rejected = create_menu();
select_faction(rejected.i);
rejected.state.reject_start = true;
const start_rejected = rejected.state.popup.buttons[0].onclick;
test.assert(start_rejected({}));
test.assert(rejected.state.error == 'Faction is no longer available.');
test.assert(#sizeof(rejected.state.started) == 0);
rejected.state.reject_start = false;
test.assert(start_rejected({}));
test.assert(rejected.state.started == ['RANDOM']);
