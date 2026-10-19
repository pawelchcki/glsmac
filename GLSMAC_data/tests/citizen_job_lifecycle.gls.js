// Native citizens and shipped portrait/chooser/base-screen/event code. Display,
// terrain and immediate command delivery are boundaries; no original claims
// about worker-square selection or broader specialist availability.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const configure = #include('../default/game/bases');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const strip = #include('../default/ui/parts/game/popup/base_screen/bottom_bar/middle_area');
const bottom = #include('../default/ui/parts/game/popup/base_screen/bottom_bar');
const chooser = #include('../default/ui/parts/game/popup/base_screen/citizen_job');

const fixture = () => {
	const f = test.founding_fixture(); f.enable_economy(); f.add_worker(0);
	const rules = {}; const callbacks = {};
	rules.get_bm = () => { return f.game.bm; }; rules.get_tm = () => { return f.game.tm; };
	rules.get = (key) => { return f.game.get(key); }; rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { callbacks[name] = callback; };
	rules.event = (name, data) => { test.assert(name == 'define_base_pop' || name == 'define_base_facility'); };
	configure(rules); callbacks.start({});
	f.game.tm.on('get_tile_resources', (e) => { return { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 }; });
	const pops = f.base.get_pops(); const pop = pops[0];
	f.with_write(() => { f.game.get('f_base_pop_work_tile')(f.base, pop, f.worker_tile); });
	f.view = mocks.display(); f.view.ui.get_width = () => { return 1024; };
	// Capture the actual registered callbacks so a test can deliver one already
	// snapshotted before native handler removal (Wrappable::Trigger copies them).
	const decorate = (node) => {
		node.captured = {};
		const register = node.on;
		node.on = (name, callback) => { node.captured[name] = callback; return register(name, callback); };
		for (kind of ['area', 'panel', 'window', 'surface', 'text', 'button', 'choicelist']) {
			const tag = kind; const create = node[tag];
			if (#typeof(create) != 'Callable') { continue; }
			node[tag] = (properties) => { const child = create(properties); decorate(child); return child; };
		}
	};
	decorate(f.view.root);
	f.ui_game = mocks.events(); f.state = { commands: [], local_owner: f.owner.id, updates: true };
	f.ui_game.get_player = () => { return { id: f.state.local_owner }; };
	f.ui_game.get_bm = () => { return f.game.bm; }; f.ui_game.get_tm = () => { return f.game.tm; };
	f.ui_game.get = (key) => { return f.game.get(key); };
	f.ui_game.get_year = () => { return f.game.get_year(); };
	f.ui_game.event = (name, data) => {
		test.assert(name == 'work_base_tile' || name == 'unwork_base_tile');
		const handler = #include('../default/game/event/' + name);
		const e = { caller: f.owner.id }; e.game = f.game; e.data = data;
		const error = handler.validate(e); test.assert(!#is_defined(error), #is_defined(error) ? error : '');
		f.state.commands :+ name;
		f.with_write(() => { e.applied = handler.apply(e); });
	};
	f.game.on('update_base', (e) => { if (f.state.updates) { f.ui_game.emit('update_base', e); } });
	const p = {}; p.ui = f.view.ui; p.game = f.ui_game;
	p.modules = { bottom_bar: { height: 256 }, menu: { close_all: () => {} } };
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.available_popups = ['base_screen']; f.popup.no_sliding = true;
	screen.available_sections = ['energy', 'bottom_bar']; bottom.available_parts = ['middle_area'];
	f.popup.init(p);
	for (name of ['nutrients', 'economy', 'game_state', 'facilities', 'resources', 'middle_area']) {
		screen.sections[name] = { set: (data) => {}, set_commerce: (data) => {}, set_energy_grid: (data) => {} };
	}
	bottom.parts.production = { set: (data) => {} }; bottom.parts.queue = { set: (data) => {} };
	f.show = () => { const data = {}; data.base = f.base; screen.set(data); f.popup.show('base_screen', (result) => {}); };
	f.show();
	f.open = (index) => {
		const portrait = strip.pops.children[index];
		portrait.emit('mousedown', { button: 'left', modifiers: {} });
		test.assert(chooser.window != null, 'actual citizen portrait opens the chooser');
	};
	f.pick = (id) => { chooser.choices.value = id; chooser.choices.emit('select', { value: id }); };
	f.key = (code) => { return chooser.window.emit('keydown', { code: code, modifiers: {} }); };
	return f;
};

behavior.scenario('portrait opens draft and cancel leaves actual native citizen and snapshot unchanged', () => {
	const f = fixture(); const before = f.snapshot(); f.open(0); f.pick('DOCTOR');
	test.assert(f.snapshot() == before && f.state.commands == []);
	test.assert(f.key('ESCAPE')); test.assert(chooser.window == null && screen.is_open);
	test.assert(f.snapshot() == before && f.state.commands == []);
});

behavior.scenario('recorded keyboard clamps and ignores Home End before committing one native change', () => {
	const f = fixture(); f.open(0); f.key('UP'); f.key('END');
	test.assert(chooser.choices.value == 'WORKER');
	f.key('DOWN'); f.key('DOWN'); f.key('HOME');
	test.assert(chooser.choices.value == 'DOCTOR' && f.state.commands == []);
	const old_ok = chooser.confirm_button; f.key('ENTER'); old_ok.emit('click', {});
	test.assert(chooser.window == null && f.state.commands == ['unwork_base_tile']);
	const pops = f.base.get_pops(); test.assert(pops[0].get_type() == 'DOCTOR' && f.base.get_worked_tiles() == []);
	f.open(0); test.assert(chooser.choices.value == 'DOCTOR'); f.pick('WORKER'); f.key('ENTER');
	test.assert(f.state.commands == ['unwork_base_tile', 'work_base_tile']);
	test.assert(pops[0].get_type() == 'WORKER' && #sizeof(f.base.get_worked_tiles()) == 1);
});

behavior.scenario('same job confirmation closes without submitting another command', () => {
	const f = fixture(); const before = f.snapshot(); f.open(0); f.key('ENTER');
	test.assert(chooser.window == null && f.state.commands == [] && f.snapshot() == before);
});

behavior.scenario('already queued callbacks from a canceled chooser cannot close its replacement', () => {
	const f = fixture(); f.open(0); f.pick('DOCTOR');
	const old_ok = chooser.confirm_button.captured.click;
	const old_select = chooser.choices.captured.select;
	f.key('ESCAPE'); f.open(0); f.pick('DOCTOR');
	const replacement = chooser.window; const token = chooser.session.token;
	old_ok({});
	test.assert(chooser.window == replacement && chooser.session.token == token, 'old OK must not cancel the replacement chooser');
	test.assert(chooser.choices.value == 'DOCTOR' && f.state.commands == []);
	old_select({ value: 'WORKER' });
	test.assert(chooser.window == replacement && chooser.session.token == token, 'old selection must not cancel the replacement chooser');
	test.assert(chooser.choices.value == 'DOCTOR' && f.state.commands == []);
	f.key('ESCAPE');
});

behavior.scenario('refresh and closing the base discard old dialog and portrait controls', () => {
	const f = fixture(); f.open(0); f.pick('DOCTOR');
	const old_ok = chooser.confirm_button; const old_portrait = strip.pops.children[0];
	const data = {}; data.base = f.base; screen.set(data);
	old_ok.emit('click', {}); old_portrait.emit('mousedown', { button: 'left', modifiers: {} });
	test.assert(chooser.window == null && f.state.commands == []);
	f.open(0); const second_ok = chooser.confirm_button; f.popup.hide('base_screen'); second_ok.emit('click', {});
	test.assert(chooser.window == null && !screen.is_open && f.state.commands == []);
});

behavior.scenario('changed owner and removed base invalidate draft before any stale native dereference', () => {
	const f = fixture(); f.open(0); f.pick('DOCTOR'); f.state.local_owner = f.owner.id + 1;
	chooser.confirm_button.emit('click', {}); test.assert(chooser.window == null && f.state.commands == []);
	f.state.local_owner = f.owner.id; f.open(0); f.pick('DOCTOR'); f.state.updates = false;
	f.with_write(() => { f.game.bm.despawn_base(f.base); });
	chooser.confirm_button.emit('click', {}); test.assert(chooser.window == null && f.state.commands == []);
});

behavior.scenario('produced pod consumes a drafted citizen and stale confirmation emits nothing', () => {
	const f = fixture(); f.add_worker(1);
	f.with_write(() => { f.owner.add_production_choice('COLONY_POD', { type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1 }); });
	f.open(1); f.pick('DOCTOR'); const old_ok = chooser.confirm_button; f.state.updates = false;
	f.with_write(() => { f.base.select_production('COLONY_POD'); }); f.set_turn(2);
	f.with_write(() => { f.base.process_production(2, 30); });
	test.assert(f.base.get_size() == 1);
	old_ok.emit('click', {}); test.assert(chooser.window == null && f.state.commands == []);
});

behavior.scenario('no available returning Worker square preserves Doctor and keeps Cancel usable', () => {
	const f = fixture(); f.open(0); f.pick('DOCTOR'); f.key('ENTER');
	f.game.bm.off('get_base_workable_tiles'); f.game.bm.on('get_base_workable_tiles', (e) => { return []; });
	f.open(0); f.pick('WORKER');
	test.assert(chooser.message.text == 'No unworked squares available' && !chooser.confirm_button.is_ok);
	const before = f.snapshot(); chooser.confirm_button.emit('click', {}); f.key('ENTER');
	test.assert(chooser.window != null && f.snapshot() == before && f.state.commands == ['unwork_base_tile']);
	f.key('ESCAPE'); test.assert(chooser.window == null && screen.is_open);
});

behavior.scenario('right portrait input is inert and root removal cancels owned dialog input', () => {
	const f = fixture(); const portrait = strip.pops.children[0];
	portrait.emit('mousedown', { button: 'right', modifiers: {} }); test.assert(chooser.window == null);
	f.open(0); f.pick('DOCTOR'); const old_ok = chooser.confirm_button;
	f.view.root.remove(); old_ok.emit('click', {}); test.assert(f.state.commands == []);
	// The display boundary does not synthesize native remove callbacks; explicit
	// base teardown exercises the component's owner hook independently.
	screen.on_hide(); test.assert(chooser.window == null);
});
