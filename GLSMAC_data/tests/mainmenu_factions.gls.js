const behavior = #include('./_behavior');
const fixture = #include('./_faction_controls_fixture');
const select_rules = #include('../default/ui/parts/mainmenu/steps/select_rules');

for (index of [0, 1]) {
	behavior.scenario('rules action ' + #to_string(index) + ' opens faction setup before any start request', () => {
		const f = fixture.create(); const state = f.state;
		f.m.sliding = {show: (data) => { state.rules = data; }};
		f.m.steps = {select_faction: fixture.show};
		select_rules(f.m); const choose = state.rules.entries[index][1]; choose();
		test.assert(#sizeof(f.view.live('window')) == 1 && #sizeof(f.view.live('input')) == 0);
		test.assert(#sizeof(state.attempts) == 0 && f.m.settings.local.player_name == 'Unconfirmed');
	});
}
behavior.scenario('actual name input normalizes its value before the start boundary and blocks duplicate requests', () => {
	const f = fixture.create(); fixture.show(f.m);
	fixture.click(f, 'faction-preset-base', 0); fixture.click(f, 'faction-row', 1);
	f.view.find('button', 'text', 'OK').emit('click', {});
	test.assert(#sizeof(f.state.attempts) == 0);
	const field = fixture.name(f, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
	test.assert(field.value == 'ABCDEFGHIJKLMNOPQRSTUVW');
	field.emit('input', {});
	test.assert(f.state.attempts == [['HIVE', 'ABCDEFGHIJKLMNOPQRSTUVW']]);
	f.view.find('button', 'text', 'OK').emit('click', {}); field.emit('input', {});
	test.assert(f.state.attempts == [['HIVE', 'ABCDEFGHIJKLMNOPQRSTUVW']]);
});
behavior.scenario('canceling an edited name releases its input handlers and leaves native settings untouched', () => {
	const f = fixture.create(); fixture.show(f.m);
	f.view.find('button', 'text', 'OK').emit('click', {});
	const field = fixture.name(f, '  Unconfirmed Pilot  ');
	f.view.find('button', 'text', 'Cancel').emit('click', {});
	test.assert(field.removed && #sizeof(f.view.live('input')) == 0);
	test.assert(!field.emit('input', {}));
	test.assert(f.m.settings.local.player_name == 'Unconfirmed' && f.state.attempts == []);
	f.view.find('button', 'text', 'OK').emit('click', {});
	const restored = f.view.live('input'); test.assert(restored[0].value == 'Aki Zeta-5');
});
behavior.scenario('a native faction removed after name entry is rejected before starting', () => {
	const f = fixture.create(); fixture.show(f.m);
	f.view.find('button', 'text', 'OK').emit('click', {});
	fixture.name(f, 'Retained Pilot'); f.state.available = [];
	f.view.find('button', 'text', 'OK').emit('click', {});
	test.assert(f.state.attempts == [] && f.m.settings.local.player_name == 'Unconfirmed');
	test.assert(f.view.find('text', 'text', 'Choose an available faction.').text == 'Choose an available faction.');
});
behavior.scenario('malformed faction sources fail before allocating a popup or changing settings', () => {
	const f = fixture.create(); const make = #include('./_faction_text_fixture'); const data = make('default');
	data.sources['cyborg.txt'] = undefined; f.m.smac_data = data.bundle; let failed = false;
	try { fixture.show(f.m); } catch { : (e) => { failed = true; } }
	test.assert(failed && #sizeof(f.view.live('window')) == 0 && #sizeof(f.manager.data_stack) == 0);
	test.assert(f.m.settings.local.player_name == 'Unconfirmed' && f.state.attempts == []);
});
