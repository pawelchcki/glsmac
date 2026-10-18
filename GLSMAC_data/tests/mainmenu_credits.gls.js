const credits = #include('../default/ui/parts/mainmenu/steps/credits');
const main_menu = #include('../default/ui/parts/mainmenu/steps/main');

// Parse the shipped script and exercise its generator as well as its menu
// callback. Merely checking the Credits label misses errors in included code.
const state = { menu: null, popup: null, rows: [], back: 0, started: 0, initialized: 0, deinitialized: 0, notimpl: 0 };
const i = {
	glsmac: {
		deinit: () => { state.deinitialized = state.deinitialized + 1; },
		init: () => { state.initialized = state.initialized + 1; },
	},
	settings: { local: { game_mode: 'multi' } },
	sliding: { show: (data) => { state.menu = data; } },
	popup: {
		show: (data) => {
			state.popup = data;
			data.generator({
				text: (properties) => { state.rows :+ properties; },
			});
		},
		back: () => { state.back = state.back + 1; },
	},
	steps: {
		credits: credits,
		start_game: (current) => { state.started = state.started + 1; },
		notimpl: (current) => { state.notimpl = state.notimpl + 1; },
	},
};

main_menu(i);
test.assert(state.menu.entries[5][0] == 'View Credits');
const open_credits = state.menu.entries[5][1];
open_credits();
test.assert(state.popup.title == 'Credits');
test.assert(state.popup.width == 620);
test.assert(state.popup.height == 350);
test.assert(#sizeof(state.rows) >= 4);
test.assert(state.rows[0].text == 'GLSMAC');
let original_game = false;
let license = false;
for (row of state.rows) {
	test.assert(row.class == 'popup-text');
	test.assert(row.align == 'top center');
	test.assert(row.top >= 0 && row.top < 300);
	if (row.text == 'Original Sid Meier\'s Alpha Centauri') {
		original_game = true;
	}
	if (row.text == 'GLSMAC code: GNU AGPL version 3.') {
		license = true;
	}
}
test.assert(original_game);
test.assert(license);
test.assert(state.started == 0);
test.assert(state.notimpl == 0);
test.assert(#sizeof(state.popup.buttons) == 1);
test.assert(state.popup.buttons[0].style.text == 'OK');
test.assert(state.popup.buttons[0].style.is_ok);
test.assert(state.popup.buttons[0].style.is_cancel);
const close_credits = state.popup.buttons[0].onclick;
test.assert(close_credits({}));
test.assert(state.back == 1);

// The main-menu callback still routes into ordinary setup after dismissal.
main_menu(i);
const start_setup = state.menu.entries[0][1];
start_setup();
test.assert(state.started == 1);
test.assert(state.initialized == 1);
test.assert(i.settings.local.game_mode == 'single');
test.assert(state.notimpl == 0);
