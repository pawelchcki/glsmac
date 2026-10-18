// Known failing GLSMAC UI invariant; run separately from the passing suites.
// Real picker, error popup and manager execute against the display boundary.
const behavior = #include('./_behavior');
const mocks = #include('_ui_mocks');
const select_faction = #include('../default/ui/parts/mainmenu/steps/select_faction');

behavior.scenario('chosen faction survives native start failure and error dismissal', () => {
	const f = mocks.menu_popup();
	const attempts = [];
	f.m.popup = f.popup;
	f.m.glsmac.game = { get_fm: () => { return { list: () => { return [{ id: 'HIVE', name: 'Hive' }]; } }; } };
	f.m.glsmac.start_game = (faction) => {
		attempts :+ faction;
		throw GSEGameError('Faction is no longer available.');
	};
	select_faction(f.m);
	const initial_choices = f.view.live('choicelist');
	const selected = initial_choices[0];
	selected.value = 'HIVE';
	selected.emit('select', { value: 'HIVE' });
	f.view.find('button', 'text', 'Start').emit('click', {});
	test.assert(attempts == ['HIVE'], 'native start rejected the chosen faction');
	test.assert(f.view.find('text', 'text', 'Faction is no longer available.').text == 'Faction is no longer available.', 'native error displayed');
	f.view.find('button', 'text', 'OK').emit('click', {});
	const restored_choices = f.view.live('choicelist');
	test.assert(#sizeof(restored_choices) == 1, 'real error back navigation rebuilt faction picker');
	test.assert(restored_choices[0].value == 'HIVE', 'chosen faction must be retained after native start error');
});
