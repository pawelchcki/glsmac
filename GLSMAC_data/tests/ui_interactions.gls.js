// GLSMAC regression/invariant tests. Production UI scripts own all transitions;
// _ui_mocks replaces only display objects, event sources and native commands.
// No original-game fidelity is claimed and no asset/browser/display is needed.
const mocks = #include('_ui_mocks');
const behavior = #include('./_behavior');
let case_name = '';
let cases = 0;
const expect = (condition, reason) => { test.assert(condition, case_name + ': ' + reason); };
const scenario = (name, callback) => {
	case_name = name;
	behavior.scenario(name, callback);
	cases++;
};
const key = (code) => { return { code: code, modifiers: {} }; };

const create_minimap = () => {
	const view = mocks.display();
	const game = mocks.events();
	game.get_year = () => { return 2101; };
	const state = { orders: [], confirmations: [], result: null };
	game.event = (name, data) => { state.orders :+ name; };
	const popup = {};
	popup.show = (name, callback) => {
		state.confirmations :+ name;
		state.result = callback;
	};
	const p = {};
	p.el = view.root;
	p.ui = view.ui;
	p.game = game;
	p.modules = {};
	p.modules.popup = popup;
	const module = #include('../default/ui/parts/game/bottom_bar/mini_map');
	module.init(p);
	const result = {};
	result.view = view;
	result.game = game;
	result.state = state;
	result.button = view.find('button', 'text', 'TURN COMPLETE');
	result.blinker = result.button.children[0];
	result.minimap = view.find('widget', 'type', 'minimap');
	result.sound = view.find('sound', 'sound', 'cpu turn complete.wav');
	return result;
};

scenario('active turn asks for confirmation without issuing an order', () => {
	const f = create_minimap();
	expect(f.button.emit('click', {}), 'click consumed');
	expect(f.state.confirmations == ['turn_confirmation'], 'confirmation requested');
	expect(f.state.orders == [], 'order waits for response');
});
scenario('canceling turn confirmation keeps active controls usable', () => {
	const f = create_minimap();
	f.button.emit('click', {});
	const respond = f.state.result;
	respond(false);
	expect(f.button.text == 'TURN COMPLETE', 'active label retained');
	expect(f.state.orders == [], 'cancel emits no order');
	f.button.emit('click', {});
	expect(#sizeof(f.state.confirmations) == 2, 'another confirmation is allowed');
});
scenario('accepting turn confirmation emits one complete and blocks repeat clicks', () => {
	const f = create_minimap();
	f.button.emit('click', {});
	const respond = f.state.result;
	respond(true);
	expect(f.button.text == 'PLEASE WAIT', 'wait label precedes next interaction');
	f.button.emit('click', {});
	f.button.emit('click', {});
	expect(f.state.orders == ['complete_turn'], 'one completion');
	expect(#sizeof(f.state.confirmations) == 1, 'no further dialog while waiting');
});
scenario('native please-wait status disables direct turn completion', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'please_wait' });
	expect(f.button.text == 'PLEASE WAIT', 'status reflected');
	f.button.emit('click', {});
	expect(f.state.orders == [] && f.state.confirmations == [], 'disabled click has no side effect');
});
scenario('native active status restores confirmation after waiting', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'please_wait' });
	f.game.emit('turn_status', { status: 'active' });
	f.button.emit('click', {});
	expect(f.button.text == 'TURN COMPLETE', 'active label restored');
	expect(f.state.confirmations == ['turn_confirmation'], 'confirmation restored');
});
scenario('all-units-moved state completes directly and ignores repeated clicks', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'turn_complete' });
	f.button.emit('click', {});
	f.button.emit('click', {});
	expect(f.state.orders == ['complete_turn'], 'one direct completion');
	expect(f.state.confirmations == [], 'no unnecessary confirmation');
	expect(f.button.text == 'PLEASE WAIT', 'waiting for native response');
});
scenario('waiting-for-players click emits one uncomplete request', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'waiting_for_players' });
	expect(f.button.text == 'WAITING FOR PLAYERS', 'waiting label');
	f.button.emit('click', {});
	f.button.emit('click', {});
	expect(f.state.orders == ['uncomplete_turn'], 'one uncomplete request');
	expect(f.state.confirmations == [], 'no confirmation for undo');
	expect(f.button.text == 'PLEASE WAIT', 'undo waits for native response');
});
scenario('duplicate turn-complete notifications do not duplicate blinking or audio', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'turn_complete' });
	f.game.emit('turn_status', { status: 'turn_complete' });
	expect(f.view.running_timers() == 1, 'one blink timer');
	expect(f.sound.play_count() == 1, 'one announcement');
});
scenario('leaving turn-complete stops blinking and clears its opacity', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'turn_complete' });
	const timer = f.view.timers[0];
	timer.tick();
	expect(f.blinker.opacity > 0.0, 'blink progressed');
	f.game.emit('turn_status', { status: 'active' });
	expect(!timer.running && f.blinker.opacity == 0.0, 'blink cleared');
	expect(!timer.tick(), 'stopped timer cannot reanimate');
});
scenario('turn-ready blinker stays within its opacity bounds', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'turn_complete' });
	const timer = f.view.timers[0];
	for (let i = 0; i < 120; i++) {
		expect(timer.tick(), 'blink timer repeats');
		expect(f.blinker.opacity >= 0.0 && f.blinker.opacity <= 1.0, 'bounded opacity');
	}
});
scenario('turn control hover and press release have stable visual states', () => {
	const f = create_minimap();
	expect(!f.button.emit('mouseover', {}), 'hover propagates');
	expect(f.blinker.opacity == 0.5, 'hover opacity');
	f.button.emit('mousedown', {});
	expect(f.blinker.opacity == 0.8, 'pressed opacity');
	f.button.emit('mouseup', {});
	expect(f.blinker.opacity == 0.5, 'release restores hover');
	f.button.emit('mouseout', {});
	expect(f.blinker.opacity == 0.0, 'leave restores idle');
});
scenario('please-wait clears hover and ignores disabled pointer effects', () => {
	const f = create_minimap();
	f.button.emit('mouseover', {});
	f.game.emit('turn_status', { status: 'please_wait' });
	f.button.emit('mouseover', {});
	f.button.emit('mousedown', {});
	f.button.emit('mouseup', {});
	expect(f.blinker.opacity == 0.0, 'disabled pointer is visually idle');
});
scenario('blink progress does not overwrite pointer feedback', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'turn_complete' });
	f.button.emit('mouseover', {});
	f.view.timers[0].tick();
	expect(f.blinker.opacity == 0.5, 'hover wins while timer advances');
	f.button.emit('mouseout', {});
	expect(f.blinker.opacity > 0.0 && f.blinker.opacity < 0.5, 'leave restores progressed blink');
});
scenario('mission year reflects native turn event', () => {
	const f = create_minimap();
	const year = f.view.find('text', 'text', 'Mission Year 2101');
	f.game.emit('turn', { year: 2159 });
	expect(year.text == 'Mission Year 2159', 'year updated');
});
scenario('minimap mode controls show and hide the same widget', () => {
	const f = create_minimap();
	expect(f.view.find('button', 'text', 'button2').emit('click', {}), 'hide consumed');
	expect(!f.minimap.is_visible(), 'minimap hidden');
	expect(f.view.find('button', 'text', 'button1').emit('click', {}), 'show consumed');
	expect(f.minimap.is_visible(), 'minimap visible');
});
scenario('removing minimap UI releases native listeners and blinking timer', () => {
	const f = create_minimap();
	f.game.emit('turn_status', { status: 'turn_complete' });
	expect(f.game.count('turn_status') == 1 && f.game.count('turn') == 1, 'owned registrations');
	f.view.root.remove();
	expect(f.game.count('turn_status') == 0 && f.game.count('turn') == 0, 'listeners detached');
	expect(f.view.running_timers() == 0, 'owned timer stopped');
	f.game.emit('turn_status', { status: 'active' });
	expect(f.sound.play_count() == 1, 'detached listener cannot replay sound');
});

const create_game_popup = mocks.game_popup;
scenario('game popup starts hidden and opens after closing menus', () => {
	const f = create_game_popup(false);
	expect(!f.module.is_shown(), 'initially hidden');
	f.show('turn_confirmation');
	expect(f.module.is_shown(), 'popup active');
	expect(f.state.closed_menus == 1, 'menus closed');
	expect(f.module.popup.el.is_visible(), 'window visible');
});
scenario('turn-confirmation OK delivers true and clears popup state', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	expect(f.view.find('button', 'text', 'Yes, end the turn.').emit('click', {}), 'OK consumed');
	expect(f.state.results == [true], 'confirmed');
	expect(!f.module.is_shown() && f.module.popup_cb == null, 'callback and active popup cleared');
});
scenario('turn-confirmation Cancel delivers false and hides window', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	const window = f.module.popup.el;
	expect(f.view.find('button', 'text', 'Cancel').emit('click', {}), 'cancel consumed');
	expect(f.state.results == [false] && !window.is_visible(), 'canceled and hidden');
});
scenario('game popup Escape is equivalent to Cancel', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	expect(f.module.popup.el.emit('keydown', key('ESCAPE')), 'Escape consumed');
	expect(f.state.results == [false] && !f.module.is_shown(), 'Escape canceled');
});
scenario('unrelated game popup key cannot close or complete it', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	f.module.popup.el.emit('keydown', key('A'));
	expect(f.module.is_shown() && f.state.results == [], 'popup retained');
});
scenario('repeated show of current popup retains original callback', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	let replacement = 0;
	f.module.show('turn_confirmation', (value) => { replacement++; });
	f.view.find('button', 'text', 'Cancel').emit('click', {});
	expect(f.state.closed_menus == 1, 'duplicate show is a no-op');
	expect(f.state.results == [false] && replacement == 0, 'first callback retained');
});
scenario('hiding a different popup leaves current popup and callback intact', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	f.module.hide('please_dont_go');
	expect(f.module.is_shown() && f.state.results == [], 'unrelated hide ignored');
	f.view.find('button', 'text', 'Cancel').emit('click', {});
	expect(f.state.results == [false], 'current callback still works');
});
scenario('changing game popup discards prior callback and hides prior window', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	const previous = f.module.popup.el;
	f.show('please_dont_go');
	expect(!previous.is_visible(), 'previous window hidden');
	f.view.find('button', 'text', 'Oops, no, wait!').emit('click', {});
	expect(f.state.results == [false], 'only replacement popup returns a result');
});
scenario('quit popup plays and stops its speech across Cancel', () => {
	const f = create_game_popup(false);
	const speech = f.view.find('sound', 'sound', 'CPU please don\'t go.wav');
	f.show('please_dont_go');
	expect(speech.play_count() == 1, 'speech starts on show');
	f.view.find('button', 'text', 'Oops, no, wait!').emit('click', {});
	expect(speech.stop_count() == 1 && f.state.results == [false], 'speech stops on cancel');
});
scenario('quit popup OK returns true and stops speech', () => {
	const f = create_game_popup(false);
	f.show('please_dont_go');
	f.view.find('button', 'text', 'Yes, that\'s an order mister!').emit('click', {});
	expect(f.state.results == [true], 'quit accepted');
	expect(f.view.find('sound', 'sound', 'CPU please don\'t go.wav').stop_count() == 1, 'speech stopped');
});
scenario('game popup can reopen after completed cancellation', () => {
	const f = create_game_popup(false);
	f.show('turn_confirmation');
	f.view.find('button', 'text', 'Cancel').emit('click', {});
	f.show('turn_confirmation');
	f.view.find('button', 'text', 'Yes, end the turn.').emit('click', {});
	expect(f.state.results == [false, true], 'fresh result on each visit');
});
scenario('sliding popup delays callback until exit animation completes', () => {
	const f = create_game_popup(true);
	f.show('turn_confirmation');
	const enter = f.view.timers[0];
	for (let i = 0; i < 12; i++) { enter.tick(); }
	expect(!enter.running, 'entry finishes');
	f.view.find('button', 'text', 'Yes, end the turn.').emit('click', {});
	expect(f.state.results == [], 'result waits for exit');
	const exit = f.view.timers[1];
	for (let j = 0; j < 12; j++) { exit.tick(); }
	expect(f.state.results == [true] && !f.module.is_shown(), 'result delivered after exit');
	expect(f.view.running_timers() == 0, 'animations stopped');
});
scenario('clearing a sliding popup stops its owned entry animation', () => {
	const f = create_game_popup(true);
	f.show('turn_confirmation');
	const timer = f.view.timers[0];
	timer.tick();
	f.module.clear();
	expect(!timer.running && !f.module.is_shown(), 'entry stopped and popup cleared');
	expect(!timer.tick() && f.state.results == [], 'stale timer cannot dispatch callback');
});

const create_menu_popup = mocks.menu_popup;
const create_sliding_menu = () => {
	const f = create_menu_popup();
	f.m.glsmac.ui = f.view.ui;
	f.sliding = #include('../default/ui/parts/mainmenu/sliding')(f.m);
	return f;
};
scenario('sliding menu uses its explicit default and Up wraps to its last entry', () => {
	const f = create_sliding_menu();
	f.sliding.show({ selected: 1, entries: [['First', () => {}], ['Second', () => {}], ['Third', () => {}]] });
	expect(f.view.find('button', 'text', 'Second').class == 'menublock-item-active', 'explicit default highlighted');
	const areas = f.view.live('area');
	areas[0].emit('keydown', key('UP'));
	areas[0].emit('keydown', key('UP'));
	expect(f.view.find('button', 'text', 'Third').class == 'menublock-item-active', 'Up from first wraps to last');
	expect(f.view.find('button', 'text', 'First').class != 'menublock-item-active', 'previous highlight cleared');
});
scenario('canceling grouped questions destroys each question and restores caller selection', () => {
	const f = create_sliding_menu();
	let destroyed = [];
	f.sliding.show({ entries: [['Tiny', () => {}], ['Standard', () => {}]], destructor: () => { destroyed :+ 'caller'; } });
	f.manager.select(1);
	f.sliding.show({ cancel_group: 'customize_map', entries: [['Ocean', () => {}]], destructor: () => { destroyed :+ 'ocean'; } });
	f.sliding.show({ cancel_group: 'customize_map', entries: [['Erosion', () => {}]], destructor: () => { destroyed :+ 'erosion'; } });
	f.sliding.back();
	expect(destroyed == ['erosion', 'ocean'], 'question cleanup follows reverse entry order');
	expect(f.view.find('button', 'text', 'Standard').class == 'menublock-item-active', 'size caller restored with its selection');
	expect(#sizeof(f.manager.data_stack) == 1, 'only caller remains on stack');
});
scenario('mainmenu popup Escape removes its window and resets empty stack', () => {
	const f = create_menu_popup();
	f.popup.show({ title: 'Test', width: 100, height: 100 });
	const window = f.view.find('window', 'title', 'Test');
	expect(window.emit('keydown', key('ESCAPE')), 'Escape consumed');
	expect(window.is_removed() && window.handler_count('keydown') == 0, 'window handlers released');
	expect(f.state.reset == 1 && f.state.exit == 0, 'empty popup stack resets');
});
scenario('mainmenu popup modified Escape and unrelated keys preserve window', () => {
	const f = create_menu_popup();
	f.popup.show({ title: 'Test', width: 100, height: 100 });
	const window = f.view.find('window', 'title', 'Test');
	expect(!window.emit('keydown', { code: 'ESCAPE', modifiers: { shift: true } }), 'modified Escape passes through');
	expect(!window.emit('keydown', key('A')), 'unrelated key passes through');
	expect(!window.is_removed() && f.state.reset == 0, 'window retained');
});
scenario('mainmenu popup back restores prior generator and invokes leaving destructor', () => {
	const f = create_menu_popup();
	let generations = 0;
	let destroyed = 0;
	f.popup.show({ title: 'First', width: 100, height: 100, generator: (body) => { generations++; } });
	const first = f.view.find('window', 'title', 'First');
	f.popup.show({ title: 'Second', width: 100, height: 100, destructor: () => { destroyed++; } });
	expect(first.is_removed(), 'covered window removed');
	f.popup.back();
	expect(generations == 2 && destroyed == 1, 'prior rebuilt, leaving state destroyed');
	expect(f.view.find('window', 'title', 'First').is_visible(), 'prior visible');
	expect(#sizeof(f.manager.data_stack) == 1 && f.state.reset == 0, 'stack retained');
});
scenario('hiding mainmenu popup destroys all stack entries exactly once', () => {
	const f = create_menu_popup();
	let destructors = 0;
	for (title of ['One', 'Two', 'Three']) {
		f.popup.show({ title: title, width: 100, height: 100, destructor: () => { destructors++; } });
	}
	f.popup.hide();
	f.popup.hide();
	expect(destructors == 3, 'each entry destroyed once');
	expect(#sizeof(f.manager.data_stack) == 0 && #sizeof(f.view.live('window')) == 0, 'all windows and stack removed');
	expect(f.state.exit == 0 && f.state.reset == 0, 'hide does not exit or reset');
});
scenario('mainmenu error OK invokes supplied recovery callback', () => {
	const f = create_menu_popup();
	let recovered = 0;
	f.popup.error('Recoverable failure', () => { recovered++; });
	expect(f.view.find('text', 'text', 'Recoverable failure').text == 'Recoverable failure', 'reason displayed');
	const ok = f.view.find('button', 'text', 'OK');
	expect(ok.is_ok && ok.is_cancel, 'native OK and Cancel routes configured');
	expect(ok.emit('click', {}), 'OK consumed');
	expect(recovered == 1 && f.state.exit == 0, 'recovery invoked');
	f.popup.hide();
});
scenario('mainmenu error OK returns to previous popup', () => {
	const f = create_menu_popup();
	f.popup.show({ title: 'Previous', width: 100, height: 100 });
	f.popup.error('Try again');
	f.view.find('button', 'text', 'OK').emit('click', {});
	expect(f.view.find('window', 'title', 'Previous').is_visible(), 'previous popup restored');
	expect(f.state.reset == 0 && #sizeof(f.manager.data_stack) == 1, 'previous stack entry retained');
});
for (mode of ['quickstart', 'host', 'join']) {
	const configured_mode = mode;
	scenario('mainmenu error exits automatic ' + mode + ' mode', () => {
		const f = create_menu_popup();
		f.m.glsmac.config[configured_mode] = true;
		f.popup.error('Automatic launch failed');
		f.view.find('button', 'text', 'OK').emit('click', {});
		expect(f.state.exit == 1 && f.state.reset == 0, 'automatic launch exits');
		f.popup.hide();
	});
}

const create_system_prompt = (parameters) => {
	const view = mocks.display();
	const system = #include('../default/ui/utils/system_popup');
	const result = {};
	result.view = view;
	result.popup = system.prompt(view.ui, parameters);
	return result;
};
scenario('system prompt OK receives current edited input value', () => {
	let submitted = '';
	const f = create_system_prompt({ text: 'Path', value: 'old', oktext: 'Use path', on_ok: (value) => { submitted = value; } });
	const input = f.view.find('input', 'value', 'old');
	input.value = '/new/path';
	const ok = f.view.find('button', 'text', 'Use path');
	expect(ok.is_ok && ok.emit('click', {}), 'OK route consumed');
	expect(submitted == '/new/path', 'edited value submitted');
});
scenario('system prompt Cancel calls only cancellation callback', () => {
	let accepted = 0;
	let canceled = 0;
	const f = create_system_prompt({ text: 'Path', value: '', oktext: 'OK', canceltext: 'Cancel', on_ok: (value) => { accepted++; }, on_cancel: () => { canceled++; } });
	const cancel = f.view.find('button', 'text', 'Cancel');
	expect(cancel.is_cancel && cancel.emit('click', {}), 'Cancel route consumed');
	expect(canceled == 1 && accepted == 0, 'only cancel called');
});
scenario('system prompt omits unrequested buttons', () => {
	const f = create_system_prompt({ text: 'Read only prompt', value: 'value' });
	expect(#sizeof(f.view.live('button')) == 0, 'no action requested');
	expect(#sizeof(f.view.live('input')) == 1, 'input retained');
});
scenario('system prompt permits callback-free OK and Cancel', () => {
	const f = create_system_prompt({ text: 'Optional callbacks', value: '', oktext: 'OK', canceltext: 'Cancel' });
	expect(f.view.find('button', 'text', 'OK').emit('click', {}), 'callback-free OK consumed');
	expect(f.view.find('button', 'text', 'Cancel').emit('click', {}), 'callback-free Cancel consumed');
});
scenario('system error OK invokes close and supports owner removal', () => {
	const view = mocks.display();
	const system = #include('../default/ui/utils/system_popup');
	let closed = 0;
	let popup = null;
	popup = system.error(view.ui, { texts: ['First line', 'Second line'], on_close: () => { closed++; popup.remove(); } });
	expect(view.find('text', 'text', 'Second line').top > view.find('text', 'text', 'First line').top, 'error lines ordered');
	const ok = view.find('button', 'text', 'OK');
	expect(ok.is_ok && ok.is_cancel && ok.emit('click', {}), 'OK/Cancel route consumed');
	expect(closed == 1 && popup.is_removed(), 'owner closes popup');
	expect(!ok.emit('click', {}) && closed == 1, 'removed button cannot repeat close');
});

const create_game_menu = () => {
	const view = mocks.display();
	const state = { quits: [], closed: [] };
	const p = {};
	p.ui = view.ui;
	p.glsmac = {};
	p.maybe_quit = (exit) => { state.quits :+ exit; };
	const module = #include('../default/ui/parts/game/menu/menu');
	module.init(p);
	module.on_close((id) => { state.closed :+ id; });
	const result = {};
	result.view = view;
	result.module = module;
	result.state = state;
	return result;
};
scenario('game menu opening and repeated closing notify exactly once', () => {
	const f = create_game_menu();
	f.module.open('left_menu', { left: 12, bottom: 200 });
	f.module.open('left_menu');
	expect(f.module.menus.left_menu.is_open && f.module.menus.left_menu.el.left == 12, 'open style applied');
	f.module.close('left_menu');
	f.module.close('left_menu');
	expect(!f.module.menus.left_menu.is_open && !f.module.menus.left_menu.el.is_visible(), 'menu closed');
	expect(f.state.closed == ['left_menu'], 'single close notification');
});
scenario('GAME item opens submenu and closing parent clears active item', () => {
	const f = create_game_menu();
	f.module.open('left_menu');
	const item = f.view.find('button', 'text', 'GAME');
	expect(item.emit('click', {}), 'item click consumed');
	expect(item.active && f.module.menus.left_menu_game.is_open, 'submenu active');
	f.module.close('left_menu');
	expect(!item.active && !f.module.menus.left_menu_game.is_open, 'submenu and item cleared');
	expect(f.state.closed == ['left_menu_game', 'left_menu'], 'child closes before parent');
});
scenario('game submenu forwards new-game and quit choices distinctly', () => {
	const f = create_game_menu();
	f.module.open('left_menu_game');
	f.view.find('button', 'text', 'Start New Game').emit('click', {});
	f.view.find('button', 'text', 'Quit').emit('click', {});
	expect(f.state.quits == [false, true], 'new-game and quit intent forwarded');
	expect(!f.view.find('button', 'text', 'Start New Game').active && f.view.find('button', 'text', 'Quit').active, 'only latest item active');
});
scenario('close-all releases every open game menu once', () => {
	const f = create_game_menu();
	f.module.open('left_menu');
	f.view.find('button', 'text', 'GAME').emit('click', {});
	f.module.open('right_menu');
	f.module.close_all();
	f.module.close_all();
	expect(!f.module.menus.left_menu.is_open && !f.module.menus.left_menu_game.is_open && !f.module.menus.right_menu.is_open, 'all menus closed');
	expect(#sizeof(f.state.closed) == 3, 'one notification per open menu');
});

const create_picker = () => {
	const f = create_menu_popup();
	f.state.started = [];
	f.state.attempts = 0;
	f.state.reject = false;
	f.state.difficulty = 0;
	f.state.maps = [
		{ filename: '/maps/Planet.MP', name: 'Planet' },
		{ filename: '/maps/Custom.GSM', name: 'Custom' },
	];
	f.m.glsmac.list_maps = () => { return f.state.maps; };
	f.m.glsmac.game = { get_fm: () => { return { list: () => { return [{ id: 'GAIANS', name: 'Gaians' }, { id: 'HIVE', name: 'Hive' }]; } }; } };
	f.m.glsmac.start_game = (faction) => {
		f.state.attempts = f.state.attempts + 1;
		if (f.state.reject) { throw GSEGameError('Faction is no longer available.'); }
		f.state.started :+ faction;
	};
	f.m.popup = f.popup;
	f.m.settings = { global: { map: { type: 'planet', filename: 'previous.MP', size_x: 80, size_y: 40 } } };
	f.m.steps = { select_difficulty_level: (i) => { f.state.difficulty = f.state.difficulty + 1; } };
	f.popup.show({ title: 'Prior menu', width: 100, height: 100 });
	return f;
};
const map_picker = #include('../default/ui/parts/mainmenu/steps/select_map_file');
const faction_picker = #include('../default/ui/parts/mainmenu/steps/select_faction');
scenario('map picker Escape restores prior menu and preserves map settings', () => {
	const f = create_picker();
	map_picker(f.m);
	const choices = f.view.live('choicelist');
	const choice = choices[0];
	choice.value = '/maps/Custom.GSM';
	choice.emit('select', { value: choice.value });
	f.view.find('window', 'title', 'Load Map File').emit('keydown', key('ESCAPE'));
	expect(f.m.settings.global.map == { type: 'planet', filename: 'previous.MP', size_x: 80, size_y: 40 }, 'Escape preserves settings');
	expect(choice.is_removed() && choice.handler_count('select') == 0, 'old choice handler released');
	expect(f.view.find('window', 'title', 'Prior menu').is_visible() && f.state.difficulty == 0, 'prior menu restored');
});
scenario('map picker Load transitions once and removed button cannot repeat', () => {
	const f = create_picker();
	map_picker(f.m);
	const choices = f.view.live('choicelist');
	const choice = choices[0];
	choice.value = '/maps/Custom.GSM';
	const load = f.view.find('button', 'text', 'Load Map');
	expect(load.emit('click', {}), 'load consumed');
	expect(f.m.settings.global.map.type == 'mapfile' && f.m.settings.global.map.filename == '/maps/Custom.GSM', 'selected filename applied');
	expect(f.m.settings.global.map.size_x == 80 && f.m.settings.global.map.size_y == 40, 'dimensions retained');
	expect(!load.emit('click', {}) && f.state.difficulty == 1, 'removed load cannot repeat route');
});
scenario('empty map inventory shows recoverable error without changing settings', () => {
	const f = create_picker();
	f.state.maps = [];
	map_picker(f.m);
	expect(f.view.find('window', 'title', 'ERROR').is_visible(), 'error shown');
	expect(#sizeof(f.view.live('choicelist')) == 0 && f.state.difficulty == 0, 'no picker or next step');
	f.view.find('button', 'text', 'OK').emit('click', {});
	expect(f.view.find('window', 'title', 'Prior menu').is_visible(), 'error returns to prior menu');
	expect(f.m.settings.global.map.filename == 'previous.MP', 'previous map preserved');
});
scenario('faction picker changes label and forwards choice only once', () => {
	const f = create_picker();
	faction_picker(f.m);
	const choices = f.view.live('choicelist');
	const choice = choices[0];
	choice.value = 'HIVE';
	expect(choice.emit('select', { value: 'HIVE' }), 'selection consumed');
	expect(f.view.find('text', 'text', 'Faction: Hive').text == 'Faction: Hive', 'selected faction named');
	const start = f.view.find('button', 'text', 'Start');
	start.emit('click', {});
	start.emit('click', {});
	expect(f.state.started == ['HIVE'] && f.state.attempts == 1, 'one native start');
});
scenario('faction picker Cancel restores prior menu and releases choice handlers', () => {
	const f = create_picker();
	faction_picker(f.m);
	const choices = f.view.live('choicelist');
	const choice = choices[0];
	choice.value = 'GAIANS';
	const cancel = f.view.find('button', 'text', 'Cancel');
	expect(cancel.emit('click', {}), 'cancel consumed');
	expect(choice.is_removed() && !choice.emit('select', { value: 'HIVE' }), 'removed choice cannot update label');
	expect(f.state.started == [] && f.state.attempts == 0, 'cancel never starts');
	expect(f.view.find('window', 'title', 'Prior menu').is_visible(), 'prior menu restored');
});
scenario('invalid faction selection shows error and permits corrected retry', () => {
	const f = create_picker();
	faction_picker(f.m);
	const choices = f.view.live('choicelist');
	const invalid = choices[0];
	invalid.value = 'MISSING';
	f.view.find('button', 'text', 'Start').emit('click', {});
	expect(f.state.attempts == 0, 'invalid faction never reaches native start');
	expect(f.view.find('text', 'text', 'Choose an available faction.').text == 'Choose an available faction.', 'validation reason shown');
	f.view.find('button', 'text', 'OK').emit('click', {});
	const new_choices = f.view.live('choicelist');
	const corrected = new_choices[0];
	corrected.value = 'GAIANS';
	corrected.emit('select', { value: 'GAIANS' });
	f.view.find('button', 'text', 'Start').emit('click', {});
	expect(f.state.started == ['GAIANS'], 'corrected retry starts');
});
scenario('native faction rejection is recoverable through real error back navigation', () => {
	const f = create_picker();
	faction_picker(f.m);
	f.state.reject = true;
	f.view.find('button', 'text', 'Start').emit('click', {});
	expect(f.state.attempts == 1 && f.state.started == [], 'native rejection caught');
	expect(f.view.find('text', 'text', 'Faction is no longer available.').text == 'Faction is no longer available.', 'native reason shown');
	f.view.find('button', 'text', 'OK').emit('click', {});
	f.state.reject = false;
	const choices = f.view.live('choicelist');
	const choice = choices[0];
	choice.value = 'HIVE';
	f.view.find('button', 'text', 'Start').emit('click', {});
	expect(f.state.attempts == 2 && f.state.started == ['HIVE'], 'retry uses fresh choice');
});

expect(cases == 56, 'all interaction scenarios executed');
