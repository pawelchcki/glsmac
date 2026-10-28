// Application interaction coverage, not original Workshop/visual agreement.
const behavior = #include('./_behavior');
const fixture = #include('./_unit_workshop_fixture');
const definitions = #include('../default/units/defs');
const render = #include('../default/units/render');
const key = (dialog, code) => { return dialog.frame.emit('keydown', {code: code, modifiers: {}}); };
const pick = (dialog, id) => { dialog.choices.value = id; dialog.choices.emit('select', {value: id}); };

behavior.scenario('real WORKSHOP button browses only buildable unit designs and retains the production draft', () => {
	const f = fixture(); f.change(); f.pick('TANKS'); const dialog = f.workshop();
	test.assert(dialog != null && f.screen.workshop.session != null);
	test.assert(dialog.choices.items == [['COLONY_POD', 'Colony Pod'], ['FORMERS', 'Authored Worker'], ['SEA_FORMERS', 'Foil Worker']]);
	test.assert(f.screen.production_choices.value == 'TANKS' && f.state.events == []);
	test.assert(dialog.choices.value == 'COLONY_POD');
	test.assert(f.view.find('text', 'text', 'Cost: 30 minerals') != null);
	f.screen.workshop.cancel();
});

behavior.scenario('selected source design has the same guarded installed chassis as its actual unit definition', () => {
	const f = fixture(); f.change(); f.pick('FORMERS'); const before = #clone(f.rules); const dialog = f.workshop();
	test.assert(dialog.choices.value == 'FORMERS');
	test.assert(f.view.find('surface', 'background', 'VT.cvr:crop(0,0,99,74)') != null);
	test.assert(f.view.find('text', 'text', 'Cost: 27 minerals') != null);
	test.assert(f.view.find('text', 'text', 'Movement: 1 (land)') != null);
	test.assert(f.view.find('text', 'text', 'Offense: 0   Defense: 1') != null);
	test.assert(f.view.find('text', 'text', 'Reactor: 1') != null);
	test.assert(f.view.find('text', 'text', 'Terraforming module') != null);
	const actual = {};
	definitions.define({event: (name, data) => { if (name == 'define_unit') { actual[data.id] = #clone(data.data.render); } }}, {definitions: f.rules, sea_former: f.sea, native_morale: [], standard_morale: []});
	test.assert(actual.Formers == render(f.rules[1]) && f.rules == before && f.state.events == []);
	f.screen.workshop.cancel();
});

behavior.scenario('naval and unverified authored designs retain functional preview and source movement', () => {
	const f = fixture(); f.change(); const dialog = f.workshop(); pick(dialog, 'SEA_FORMERS');
	test.assert(f.view.find('surface', 'background', 'newicons.pcx:crop(79,501,116,548)') != null);
	test.assert(f.view.find('text', 'text', 'Movement: 4 (water)') != null);
	test.assert(f.view.find('text', 'text', 'Cost: 83 minerals') != null);
	f.screen.workshop.cancel(); f.rules[1].source_components.armor = 1;
	const authored = f.workshop(); pick(authored, 'FORMERS');
	test.assert(f.view.find('surface', 'background', 'newicons.pcx:crop(79,501,116,548)') != null);
	test.assert(f.state.events == []); f.screen.workshop.cancel();
});

behavior.scenario('keyboard navigation previews bounded designs and Enter transfers only the draft', () => {
	const f = fixture(); f.change(); f.pick('FORMERS'); const dialog = f.workshop();
	key(dialog, 'DOWN'); key(dialog, 'DOWN'); test.assert(dialog.choices.value == 'SEA_FORMERS');
	key(dialog, 'UP'); test.assert(dialog.choices.value == 'FORMERS'); key(dialog, 'ENTER');
	test.assert(f.screen.workshop.dialog == null && f.screen.production_selection != null);
	test.assert(f.screen.production_choices.value == 'FORMERS' && f.state.events == []);
	f.ok(); f.ok(); test.assert(f.state.events == [['set_base_production', 1, 'FORMERS']]);
});

behavior.scenario('Escape and pointer Cancel restore draft and preserve the base popup', () => {
	const f = fixture(); f.change(); f.pick('TANKS'); const dialog = f.workshop(); pick(dialog, 'FORMERS');
	key(dialog, 'ESCAPE'); test.assert(f.screen.production_choices.value == 'TANKS' && dialog.frame.removed);
	const again = f.workshop(); pick(again, 'SEA_FORMERS'); again.cancel.emit('click', {});
	test.assert(f.screen.workshop.dialog == null && f.screen.production_choices.value == 'TANKS');
	test.assert(f.popup.is_shown() && f.state.events == [] && f.state.closed == 0);
	f.screen.hide_production_selection();
});

behavior.scenario('base refresh destroys Workshop before any saved control can target the next base', () => {
	const f = fixture(); f.change(); const dialog = f.workshop(); pick(dialog, 'FORMERS');
	const old_session = f.screen.workshop.session;
	f.screen.set({base: f.other}); f.change();
	f.screen.workshop.choose(old_session); dialog.ok.emit('click', {});
	test.assert(dialog.frame.removed && f.screen.workshop.dialog == null && f.state.events == []);
	test.assert(f.screen.production_choices.value == 'TANKS'); f.screen.hide_production_selection();
});

behavior.scenario('stale session callbacks cannot close or change a newly opened Workshop', () => {
	const f = fixture(); f.change(); const old = f.workshop(); const old_session = f.screen.workshop.session;
	f.screen.workshop.cancel(); const current = f.workshop(); pick(current, 'SEA_FORMERS');
	f.screen.workshop.choose(old_session); f.screen.workshop.preview(old_session); old.cancel.emit('click', {});
	test.assert(f.screen.workshop.dialog == current && current.choices.value == 'SEA_FORMERS' && f.state.events == []);
	current.ok.emit('click', {}); test.assert(f.screen.production_choices.value == 'SEA_FORMERS'); f.screen.hide_production_selection();
});

behavior.scenario('ownership or turn changes invalidate open Workshop without a production command', () => {
	for (kind of ['owner', 'player', 'turn']) {
		const f = fixture(); f.change(); const dialog = f.workshop(); pick(dialog, 'FORMERS');
		if (kind == 'owner') { f.base.state.owner = 1; }
		if (kind == 'player') { f.state.player = 1; }
		if (kind == 'turn') { f.state.turn = 2; }
		dialog.ok.emit('click', {});
		test.assert(f.screen.workshop.dialog == null && f.screen.production_choices.value == 'TANKS' && f.state.events == []);
		f.screen.hide_production_selection();
	}
});

behavior.scenario('removed or repurposed production IDs cannot select a stale preview', () => {
	for (kind of ['remove', 'replace']) {
		const f = fixture(); f.change(); const dialog = f.workshop(); pick(dialog, 'FORMERS');
		if (kind == 'remove') { f.choices = [#clone(f.choices[0]), #clone(f.choices[1])]; }
		else { f.choices[2].unit_id = 'ScoutPatrol'; }
		dialog.ok.emit('click', {});
		test.assert(f.screen.workshop.dialog == null && f.screen.production_choices.value == 'TANKS' && f.state.events == []);
		f.screen.hide_production_selection();
	}
});

behavior.scenario('production OK cannot submit behind an active Workshop and hide removes its window', () => {
	const f = fixture(); f.change(); const dialog = f.workshop(); pick(dialog, 'FORMERS');
	f.ok(); test.assert(f.state.events == [] && f.screen.workshop.dialog == dialog);
	f.screen.p.hide(); test.assert(dialog.frame.removed && f.screen.workshop.dialog == null && !f.popup.is_shown());
	test.assert(f.state.events == []);
});

behavior.scenario('empty unit inventory is a cancellable Workshop without invented designs', () => {
	const f = fixture(); f.choices = [#clone(f.choices[0])]; f.change(); const dialog = f.workshop();
	test.assert(dialog.choices == null && f.view.find('text', 'text', 'No unit designs are available to build.') != null);
	dialog.ok.emit('click', {}); test.assert(f.screen.production_choices.value == 'TANKS' && f.state.events == []);
	f.screen.hide_production_selection();
});

behavior.scenario('a transferred design still passes the normal authoritative production guard', () => {
	const f = fixture(); f.base.state.production.choice_id = 'TANKS'; f.show(f.base); f.change();
	const dialog = f.workshop(); pick(dialog, 'FORMERS'); dialog.ok.emit('click', {});
	test.assert(f.view.find('text', 'text', 'Switch loss: 6 minerals') != null);
	f.base.state.unsupported = true; f.ok(); test.assert(f.state.events == [] && f.screen.production_selection == null);
});
