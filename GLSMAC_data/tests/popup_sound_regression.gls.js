// Popup-owned speech must stop exactly once across every dismissal path.
const behavior = #include('./_behavior');
const mocks = #include('_ui_mocks');

behavior.scenario('replacing quit popup stops its owned speech', () => {
	const f = mocks.game_popup(false);
	const speech = f.view.find('sound', 'sound', 'CPU please don\'t go.wav');
	f.show('please_dont_go');
	test.assert(speech.play_count() == 1, 'quit on_show started speech');
	f.show('turn_confirmation');
	test.assert(f.module.popup.id == 'turn_confirmation', 'replacement popup active');
	test.assert(speech.stop_count() == 1, 'replacing popup must run its on_hide speech cleanup');
});

behavior.scenario('clearing quit popup during entry releases speech and timer once', () => {
	const f = mocks.game_popup(true);
	const speech = f.view.find('sound', 'sound', 'CPU please don\'t go.wav');
	f.show('please_dont_go');
	const enter = f.view.timers[0];
	enter.tick();
	f.module.clear();
	f.module.clear();
	test.assert(speech.stop_count() == 1, 'clear releases speech exactly once');
	test.assert(!enter.tick() && f.view.running_timers() == 0, 'cleared entry cannot resume');
	test.assert(f.state.results == [], 'clearing without a decision emits no result');
});

behavior.scenario('replacement during quit exit cannot repeat cleanup or leak the old result', () => {
	const f = mocks.game_popup(true);
	const speech = f.view.find('sound', 'sound', 'CPU please don\'t go.wav');
	f.show('please_dont_go');
	const enter = f.view.timers[0];
	for (let i = 0; i < 12; i++) { enter.tick(); }
	f.view.find('button', 'text', 'Oops, no, wait!').emit('click', {});
	const exit = f.view.timers[1];
	test.assert(speech.stop_count() == 1, 'exit stops speech immediately');
	f.show('turn_confirmation');
	test.assert(speech.stop_count() == 1 && !exit.tick(), 'replacement does not repeat cleanup or resume old exit');
	f.view.ui.emit('resize', { height: 900 });
	test.assert(f.module.is_shown() && f.module.popup.id == 'turn_confirmation', 'old result cannot hide the new popup on resize');
	test.assert(f.state.results == [], 'replacement discards old callback and result together');
	f.view.find('button', 'text', 'Yes, end the turn.').emit('click', {});
	f.view.ui.emit('resize', { height: 768 });
	test.assert(f.state.results == [true], 'only the new popup delivers a result');
});
