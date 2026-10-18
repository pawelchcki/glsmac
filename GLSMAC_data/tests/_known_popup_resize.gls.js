// Known failing GLSMAC UI invariant; run separately from the passing suites.
const behavior = #include('./_behavior');
const mocks = #include('_ui_mocks');

behavior.scenario('confirmed popup delivers its result when resize interrupts exit', () => {
	const f = mocks.game_popup(true);
	f.show('turn_confirmation');
	const enter = f.view.timers[0];
	for (let i = 0; i < 12; i++) { enter.tick(); }
	test.assert(!enter.running, 'entry animation finished');
	f.view.find('button', 'text', 'Yes, end the turn.').emit('click', {});
	test.assert(f.state.results == [] && f.view.running_timers() == 1, 'confirmed result awaits exit');
	f.view.ui.emit('resize', { height: 900 });
	test.assert(!f.module.is_shown() && f.view.running_timers() == 0, 'resize completed hide and stopped exit timer');
	test.assert(f.state.results == [true], 'confirmed result must be delivered despite resize');
});
