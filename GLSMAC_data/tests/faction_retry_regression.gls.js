// Real picker, error popup and manager execute against the display boundary.
const behavior = #include('./_behavior');
const mocks = #include('_ui_mocks');
const select_faction = #include('../default/ui/parts/mainmenu/steps/select_faction');

behavior.scenario('chosen faction survives native start failure and error dismissal', () => {
	const f = mocks.menu_popup();
	const attempts = [];
	let reject_start = true;
	f.m.popup = f.popup;
	f.m.glsmac.game = { get_fm: () => { return { list: () => { return [{ id: 'HIVE', name: 'Hive' }]; } }; } };
	f.m.glsmac.start_game = (faction) => {
		attempts :+ faction;
		if (reject_start) {
			throw GSEGameError('Faction is no longer available.');
		}
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
	test.assert(f.view.find('text', 'text', 'Faction: Hive').text == 'Faction: Hive', 'restored label agrees with the selected faction');
	reject_start = false;
	f.view.find('button', 'text', 'Start').emit('click', {});
	test.assert(attempts == ['HIVE', 'HIVE'], 'retry starts the same chosen faction');
	f.view.find('button', 'text', 'Start').emit('click', {});
	test.assert(attempts == ['HIVE', 'HIVE'], 'successful retry still blocks duplicate starts');
});

behavior.scenario('a changed faction survives repeated failures and escape dismissal', () => {
	const f = mocks.menu_popup();
	const attempts = [];
	f.m.popup = f.popup;
	f.m.glsmac.game = { get_fm: () => { return { list: () => { return [{ id: 'HIVE', name: 'Hive' }, { id: 'GAIANS', name: 'Gaians' }]; } }; } };
	f.m.glsmac.start_game = (faction) => {
		attempts :+ faction;
		throw GSEGameError('Try again.');
	};
	select_faction(f.m);
	f.view.find('button', 'text', 'Start').emit('click', {});
	f.view.find('window', 'title', 'ERROR').emit('keydown', { code: 'ESCAPE', modifiers: [] });
	let choices = f.view.live('choicelist');
	test.assert(choices[0].value == 'RANDOM', 'default random faction survives escape dismissal');
	choices[0].value = 'GAIANS';
	choices[0].emit('select', { value: 'GAIANS' });
	f.view.find('button', 'text', 'Start').emit('click', {});
	f.view.find('button', 'text', 'OK').emit('click', {});
	choices = f.view.live('choicelist');
	test.assert(choices[0].value == 'GAIANS', 'changed faction survives another rejection');
	test.assert(f.view.find('text', 'text', 'Faction: Gaians').text == 'Faction: Gaians', 'restored label shows the changed choice');
	f.view.find('button', 'text', 'Start').emit('click', {});
	test.assert(attempts == ['RANDOM', 'GAIANS', 'GAIANS'], 'repeated retry uses the latest choice');
	f.view.find('button', 'text', 'OK').emit('click', {});
	f.view.find('button', 'text', 'Cancel').emit('click', {});
	test.assert(f.state.reset == 1, 'cancel still leaves the picker after failed retries');
	test.assert(#sizeof(f.view.live('choicelist')) == 0, 'cancel removes the restored picker');
});
