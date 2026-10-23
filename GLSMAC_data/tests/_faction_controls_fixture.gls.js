// Native display, start requests and artwork loading form this boundary.
// Popup ownership, manager navigation, faction scripts and source parser run.
const mocks = #include('./_ui_mocks');
const make_text = #include('./_faction_text_fixture');
const select_faction = #include('../default/ui/parts/mainmenu/steps/select_faction');
let installed = null;
const create = () => {
	if (installed == null) { installed = make_text('default'); }
	const f = mocks.menu_popup(); const state = f.state;
	state.attempts = []; state.reject = false; state.available = [];
	#include('../default/factions').configure({
		add: (id, definition) => { state.available :+ {id: id, name: definition.name}; },
		import_colors: (filename) => { return {}; }, import_base_names: (filename) => { return {}; },
	});
	f.m.popup = f.popup; f.m.settings = {local: {player_name: 'Unconfirmed'}};
	// Retain the native owner while production rule controls use its settings.
	f.native = test.founding_fixture();
	f.m.settings.global = f.native.game.get_settings().global;
	f.m.smac_data = installed.bundle;
	f.m.glsmac.game = {get_fm: () => { return {list: () => { return state.available; }}; }};
	f.m.glsmac.start_game = (id) => {
		// Match the native boundary's string copies; later GSE assignment must
		// not mutate the already-observed request through a scalar alias.
		state.attempts :+ [id + '', f.m.settings.local.player_name + ''];
		if (state.reject) { throw GSEGameError('Try again.'); }
	};
	return f;
};
const click = (f, name, ordinal) => {
	let index = 0;
	for (button of f.view.live('button')) {
		for (part of #split(button.class, ' ')) {
			if (part == name) {
				if (index == ordinal) { return button.emit('click', {}); }
				index++;
			}
		}
	}
	throw Error('Missing actual faction control: ' + name);
};
const name = (f, value) => {
	const fields = f.view.live('input'); test.assert(#sizeof(fields) == 1);
	fields[0].value = value; fields[0].emit('change', {value: value}); return fields[0];
};
return {create: create, show: select_faction, click: click, name: name};
