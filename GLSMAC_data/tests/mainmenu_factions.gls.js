const behavior = #include('./_behavior');
const fixture = #include('./_faction_controls_fixture');
const select_rules = #include('../default/ui/parts/mainmenu/steps/select_rules');

for (blind of [false, true]) {
	for (index of [0, 1]) {
		behavior.scenario('rules action ' + #to_string(index) + ' drafts faction setup with current Blind Research ' + #to_string(blind), () => {
			const f = fixture.create(); const state = f.state;
			f.native.game.get_settings().global.rules.set_blind_research(blind);
			f.m.sliding = {show: (data) => { state.rules = data; }};
			f.m.steps = {select_faction: fixture.show};
			select_rules(f.m); const choose = state.rules.entries[index][1]; choose();
			test.assert(#sizeof(f.view.live('window')) == 1 && #sizeof(f.view.live('input')) == 0);
			test.assert(#sizeof(state.attempts) == 0 && f.m.settings.local.player_name == 'Unconfirmed');
			test.assert(f.m.pending_research_blind == (index == 0 ? true : blind));
			test.assert(f.native.game.get_settings().global.rules.get_blind_research() == blind);
		});
	}
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
	test.assert(f.state.rosters == [{factions: ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'], human_slot: 1, random_human: false}], 'Native request keeps every displayed opponent and selected human row');
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

behavior.scenario('default expansion and edited opponent choices reach the native start request', () => {
	const f = fixture.create(); fixture.show(f.m);
	fixture.click(f, 'faction-dropdown', 2);
	const choices = f.view.live('choicelist'); test.assert(#sizeof(choices) == 1);
	choices[0].emit('select', {value: 'GAIANS'});
	fixture.click(f, 'faction-row', 0);
	f.view.find('button', 'text', 'OK').emit('click', {});
	const field = fixture.name(f, 'Aki'); field.emit('input', {});
	test.assert(f.state.rosters == [{factions: ['CONSCIOUSNESS', 'PIRATES', 'GAIANS', 'ANGELS', 'PLANETCULT', 'CARETAKERS', 'USURPERS'], human_slot: 0, random_human: false}], 'Editing an opponent survives returning to the human row');
});

behavior.scenario('Random human mode retains the displayed roster and uses its separate generic name prompt', () => {
	const f = fixture.create(); fixture.show(f.m);
	fixture.click(f, 'faction-preset-base', 0);
	fixture.click(f, 'faction-mode-random', 0);
	f.view.find('button', 'text', 'OK').emit('click', {});
	const fields = f.view.live('input');
	test.assert(f.state.attempts == [] && fields[0].value == '', 'Random uses the initially empty generic name editor');
	test.assert(f.view.find('text', 'text', 'Name:').text == 'Name:');
	const name = fixture.name(f, 'Chosen Pilot'); name.emit('input', {});
	test.assert(f.state.attempts == [['RANDOM', 'Chosen Pilot']]);
	test.assert(f.state.rosters == [{factions: ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'], human_slot: 0, random_human: true}]);
});

behavior.scenario('A selected RANDOM roster row starts directly and preserves the selected-row mode', () => {
	const f = fixture.create(); fixture.show(f.m); fixture.click(f, 'faction-preset-base', 0);
	fixture.click(f, 'faction-dropdown', 0);
	const choices = f.view.live('choicelist'); choices[0].emit('select', {value: 'RANDOM'});
	f.view.find('button', 'text', 'OK').emit('click', {});
	test.assert(f.state.attempts == [['RANDOM', 'Player']] && #sizeof(f.view.live('input')) == 0, 'RANDOM row does not borrow the Random human name popup');
	test.assert(f.state.rosters == [{factions: ['RANDOM', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'], human_slot: 0, random_human: false}]);
});

behavior.scenario('An impossible native map reports a recoverable setup error and retains the confirmed name', () => {
	const f = fixture.create(); const world = test.world_startup_fixture(4, 2);
	#include('../default/factions').configure({add: (id, data) => { world.fm.add(id, data); }, import_colors: (name) => { return world.colors; }, import_base_names: (name) => { return {land: [], water: []}; }});
	f.m.glsmac.start_game = (id, identity, ids) => { world.initialize_roster(id, ids); };
	const before = f.native.game.get_settings().global.rules.get_blind_research();
	f.m.pending_research_blind = !before;
	fixture.show(f.m); f.view.find('button', 'text', 'OK').emit('click', {});
	const field = fixture.name(f, 'Retained Pilot'); field.emit('input', {});
	test.assert(#sizeof(world.game.get_players()) == 0, 'Failed launch creates no partial participant roster');
	test.assert(f.native.game.get_settings().global.rules.get_blind_research() == before, 'Rejected launch restores the prior native research setting');
	test.assert(f.view.find('text', 'text', 'Choose a larger map: seven factions need starting tiles at least two steps apart').text != '');
	f.view.find('button', 'text', 'OK').emit('click', {});
	const restored = f.view.live('input'); test.assert(#sizeof(restored) == 1 && restored[0].value == 'Retained Pilot');
});
