// Candidate-only, asset-free citizen-job observation. The production base
// screen, energy section, citizen strip and chooser callbacks all execute.
// Display/art/timers, terrain yields, current-local-owner selection and
// synchronous command delivery are boundaries. Native Base/Pop identities,
// write guards and shipped event validation/application are not replaced; no
// specialist bonus is supplied here. Raw energy is zero so allocation and
// rounding remain outside this citizen-job contract.
const mocks = #include('./_ui_mocks');
const configure_bases = #include('../default/game/bases');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const strip = #include('../default/ui/parts/game/popup/base_screen/bottom_bar/middle_area');
const bottom_bar = #include('../default/ui/parts/game/popup/base_screen/bottom_bar');
const energy = #include('../default/ui/parts/game/popup/base_screen/energy');
const work_event = #include('../default/game/event/work_base_tile');

const fixture = () => {
	const f = test.founding_fixture();
	f.enable_economy();
	f.add_worker(0);
	const rules = {}; const callbacks = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { callbacks[name] = callback; };
	rules.event = (name, data) => {
		// The native fixture already declares Worker/Doctor and facilities.
		if (name != 'define_base_pop' && name != 'define_base_facility') {
			throw Error('Unexpected initialization event: ' + name);
		}
	};
	configure_bases(rules);
	callbacks.start({});
	f.game.tm.on('get_tile_resources', (e) => {
		return { NUTRIENTS: 2, MINERALS: 1, ENERGY: 0 };
	});
	const pops = f.base.get_pops(); const pop = pops[0];
	const initial = { caller: f.owner.id };
	initial.game = f.game; initial.data = {};
	initial.data.base = f.base; initial.data.pop = pop;
	initial.data.tile = f.worker_tile;
	const initial_error = work_event.validate(initial);
	if (#is_defined(initial_error)) { throw Error('Native worker fixture rejected: ' + initial_error); }
	f.with_write(() => { work_event.apply(initial); });

	f.view = mocks.display();
	f.view.ui.get_width = () => { return 1024; };
	f.ui_game = mocks.events();
	f.ui_game.get_player = () => { return f.owner; };
	f.ui_game.get_bm = () => { return f.game.bm; };
	f.ui_game.get_tm = () => { return f.game.tm; };
	f.ui_game.get_turn = () => { return f.game.get_turn(); };
	f.ui_game.get_year = () => { return f.game.get_year(); };
	f.ui_game.get = (key) => { return f.game.get(key); };
	f.ui_game.is_turn_complete = (caller) => { return f.game.is_turn_complete(caller); };
	f.ui_game.event = (name, data) => {
		if (name != 'work_base_tile' && name != 'unwork_base_tile') {
			throw Error('Unexpected citizen UI command: ' + name);
		}
		const handler = #include('../default/game/event/' + name);
		const e = { caller: f.owner.id }; e.game = f.game; e.data = data;
		const error = handler.validate(e);
		if (#is_defined(error)) { throw Error('Citizen UI command rejected: ' + error); }
		f.with_write(() => { e.applied = handler.apply(e); });
		const outcome = { name: name, caller: f.owner.id, event_id: 'headless-local', success: true };
		outcome.data = data;
		f.ui_game.emit('event_result', outcome);
	};
	// Native with_write() flushes real base updates after the actual mutation.
	f.game.on('update_base', (e) => { f.ui_game.emit('update_base', e); });
	const p = {};
	p.ui = f.view.ui; p.game = f.ui_game;
	p.modules = { bottom_bar: { height: 256 }, menu: { close_all: () => {} } };
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.available_popups = ['base_screen']; f.popup.no_sliding = true;
	screen.available_sections = ['energy', 'bottom_bar'];
	bottom_bar.available_parts = ['middle_area'];
	f.popup.init(p);
	// These panels lie outside this contract. Keep the actual enclosing set()
	// path, actual citizen portrait rendering and actual energy calculation.
	for (name of ['nutrients', 'economy', 'game_state', 'facilities', 'resources', 'middle_area']) {
		screen.sections[name] = {
			set: (data) => {}, set_commerce: (data) => {}, set_energy_grid: (data) => {},
		};
	}
	bottom_bar.parts.production = { set: (data) => {} };
	bottom_bar.parts.queue = { set: (data) => {} };
	const data = {}; data.base = f.base;
	screen.set(data);
	f.popup.show('base_screen', (result) => {});
	return f;
};

const one_node = (f, kind, cls, required) => {
	let found = null;
	for (node of f.view.live(kind)) {
		if (node.class == cls && node.visible) {
			if (found != null) { throw Error('Ambiguous citizen control: ' + cls); }
			found = node;
		}
	}
	if (required && found == null) { throw Error('Missing citizen control: ' + cls); }
	return found;
};

const dialog = (f, required) => { return one_node(f, 'window', 'base-screen-citizen-job', required); };
const choices = (f) => { return one_node(f, 'choicelist', 'base-screen-citizen-job-choices', true); };
const flush = (f) => {
	let ticks = 0;
	while (f.view.running_timers() > 0 && ticks < 32) {
		for (timer of f.view.timers) { timer.tick(); }
		ticks += 1;
	}
	if (f.view.running_timers() > 0) { throw Error('Citizen UI timers did not settle'); }
};

const emit_screen = (f) => {
	const active = dialog(f, false);
	const bonus = energy.labels.psych.bonus.text;
	if (#typeof(bonus) != 'String') { throw Error('Psych bonus was not rendered'); }
	if (active == null) {
		#print('CJOB_SCREEN|base|' + bonus);
	} else {
		#print('CJOB_SCREEN|job|' + bonus);
		const list = choices(f);
		if (!#is_defined(list.items) || !#is_defined(list.value)) { throw Error('Citizen choices were not rendered'); }
		let index = 0;
		for (item of list.items) {
			#print('CJOB_JOB|' + #to_string(index) + '|' + #uppercase(item[1]) + '|' + #to_string(item[0] == list.value));
			index += 1;
		}
		const effect = one_node(f, 'text', 'base-screen-citizen-job-doctor-effect', true);
		#print('CJOB_EFFECT|' + #uppercase(effect.text));
	}
	#print('CJOB_SCREEN_END');
};

const keys = { ArrowDown: 'DOWN', ArrowUp: 'UP', Home: 'HOME', End: 'END', Enter: 'ENTER', Escape: 'ESCAPE' };
const act = (f, action) => {
	if (action == 'open') {
		if (dialog(f, false) != null) { throw Error('Citizen chooser already open'); }
		if (#sizeof(strip.pops.children) != 1) { throw Error('Expected one actual citizen portrait'); }
		const portrait = strip.pops.children[0];
		if (portrait.handler_count('mousedown') == 0) { throw Error('Citizen portrait has no mousedown handler'); }
		portrait.emit('mousedown', { button: 'left', modifiers: {} });
		flush(f); dialog(f, true);
	} else if (action == 'WORKER' || action == 'DOCTOR') {
		dialog(f, true);
		const list = choices(f); let selected = false;
		for (item of list.items) {
			if (#uppercase(item[1]) == action) {
				if (selected) { throw Error('Ambiguous citizen job label'); }
				list.value = item[0];
				list.emit('select', { value: item[0] });
				selected = true;
			}
		}
		if (!selected) { throw Error('Missing citizen job label: ' + action); }
	} else if (action == 'confirm' || action == 'cancel') {
		dialog(f, true);
		const button = one_node(f, 'button', 'base-screen-citizen-job-' + action, true);
		if (button.handler_count('click') == 0) { throw Error('Citizen button has no click handler'); }
		button.emit('click', {});
	} else {
		const window = dialog(f, true);
		if (window.handler_count('keydown') == 0) { throw Error('Citizen chooser has no key handler'); }
		window.emit('keydown', { code: keys[action], modifiers: {} });
	}
	flush(f);
};

const run_input = (input) => {
	#print('CJOB_CASE|' + input.id);
	let f = null;
	try {
		f = fixture();
		flush(f); emit_screen(f);
		for (action of input.actions) { act(f, action); emit_screen(f); }
		#print('CJOB_DONE');
	} catch { : (error) => {
		#print('CJOB_ERROR|' + error.type + '|' + error.reason);
	} }
	if (f != null) { f.view.root.remove(); }
};
for (input of citizen_job_inputs) { run_input(input); }
