// Known failing GLSMAC UI invariant; run separately from the passing suites.
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
