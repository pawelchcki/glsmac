const select_map_file = #include('../default/ui/parts/mainmenu/steps/select_map_file');

const create_picker = (maps) => {
	const state = { popup: null, error: '', events: '', listed: 0, choice: null, selection: null, on_select: null };
	const i = {
		settings: { global: { map: { type: 'planet', filename: 'previous.MP', size_x: 80, size_y: 80 } } },
		glsmac: {
			list_maps: () => {
				state.listed = state.listed + 1;
				return maps;
			},
		},
		popup: {
			show: (data) => { state.popup = data; },
			error: (text) => { state.error = text; },
			back: () => { state.events = state.events + 'back;'; },
		},
		steps: { select_difficulty_level: (current) => { state.events = state.events + 'difficulty;'; } },
	};
	select_map_file(i);
	if (state.popup != null) {
		const body = {
			text: (style) => {
				const text = { text: style.text };
				state.selection = text;
				return text;
			},
			scrollview: (style) => {
				return {
					choicelist: (props) => {
						const choice = { value: '', items: props.items, keyboard: props.keyboard };
						choice.on = (event, cb) => { state.on_select = cb; };
						state.choice = choice;
						return choice;
					},
				};
			},
		};
		state.popup.generator(body);
	}
	const result = {};
	result.i = i;
	result.state = state;
	return result;
};

const files = [
	{ name: 'Planet.MP', filename: '/smac/Maps/Planet.MP' },
	{ name: 'Custom.GSM', filename: '/smac/Maps/Custom.GSM' },
];

const cancelled = create_picker(files);
test.assert(cancelled.state.listed == 1);
test.assert(cancelled.state.popup.title == 'Load Map File');
test.assert(cancelled.state.choice.keyboard);
test.assert(cancelled.state.choice.value == '/smac/Maps/Planet.MP');
test.assert(cancelled.state.choice.items[1][0] == '/smac/Maps/Custom.GSM');
test.assert(cancelled.state.choice.items[1][1] == 'Custom.GSM');
const cancel = cancelled.state.popup.buttons[1].onclick;
cancel({});
test.assert(cancelled.state.events == 'back;');
test.assert(cancelled.i.settings.global.map.type == 'planet');
test.assert(cancelled.i.settings.global.map.filename == 'previous.MP');

const selected = create_picker(files);
selected.state.choice.value = '/smac/Maps/Custom.GSM';
const on_select = selected.state.on_select;
on_select({ value: '/smac/Maps/Custom.GSM' });
test.assert(selected.state.selection.text == 'Custom.GSM');
const confirm = selected.state.popup.buttons[0].onclick;
confirm({});
test.assert(selected.state.events == 'back;difficulty;');
test.assert(selected.i.settings.global.map.type == 'mapfile');
test.assert(selected.i.settings.global.map.filename == '/smac/Maps/Custom.GSM');
test.assert(selected.i.settings.global.map.size_x == 80);
test.assert(selected.i.settings.global.map.size_y == 80);

const empty = create_picker([]);
test.assert(empty.state.listed == 1);
test.assert(empty.state.popup == null);
test.assert(empty.state.error != '');
test.assert(empty.state.events == '');
test.assert(empty.i.settings.global.map.type == 'planet');
test.assert(empty.i.settings.global.map.filename == 'previous.MP');
