// Native city/unit setup and command delivery reuse the frozen join fixture.
// ENTER executes the shipped object list, deferred base selection, popup and
// base-screen set/show paths; ESCAPE executes the shipped popup close callback.
// Display/art, frontend packet delivery and resource yields are boundaries.
// The existing native fixture is a synthetic 4x4 topology, not the original
// 40x80 terrain. No turn/income executes. Unrelated base panels listed below
// are display-only no-ops; native Base/Pop/resource getters remain production.
const join_fixture = #include('./_colony_join_fixture');
const configure_bases = #include('../default/game/bases');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const bottom_bar = #include('../default/ui/parts/game/popup/base_screen/bottom_bar');
const strip = #include('../default/ui/parts/game/popup/base_screen/bottom_bar/middle_area');
return (input) => {
	const f = join_fixture(input);
	const rules = {}; const callbacks = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get = (key) => { return f.game.get(key); };
	rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { callbacks[name] = callback; };
	rules.event = (name, data) => {
		if (name != 'define_base_pop' && name != 'define_base_facility') { throw Error('Unexpected base initialization event: ' + name); }
	};
	configure_bases(rules); callbacks.start({});
	f.game.tm.on('get_tile_resources', (e) => { return {NUTRIENTS: 0, MINERALS: 0, ENERGY: 0}; });
	f.events.get_tm = () => { return f.game.tm; };
	f.events.get_year = () => { return f.game.get_year(); };
	f.events.select_base = (base) => {
		f.game.select_base(base);
		const e = {}; e.base = base; f.events.emit('base_select', e); f.map.emit('base_preview', e);
	};
	f.game.on('update_base', (e) => { f.events.emit('update_base', e); });
	// Synchronous local transport is explicit. Reconciliation itself uses the
	// shipped event and native authority/transaction, with no selection policy.
	f.management_requests = []; f.management_delivered = 0; f.defer_management = false;
	f.management_receipts = [];
	const submit = f.events.event;
	f.events.event = (name, data) => {
		if (name == 'reconcile_base_citizens') { f.management_requests :+ data; }
		else { submit(name, data); }
	};
	f.deliver_management = (index, accepted) => {
		const data = f.management_requests[index];
		const handler = #include('../default/game/event/reconcile_base_citizens');
		const e = {caller: f.native.owner.id}; e.game = f.game; e.data = data;
		let success = accepted;
		if (success) {
			const error = handler.validate(e);
			if (#is_defined(error)) { success = false; }
			else { f.native.with_write(() => { e.applied = handler.apply(e); }); f.management_receipts :+ e; }
		}
		const result = {name: 'reconcile_base_citizens', caller: f.native.owner.id, success: success}; result.data = data;
		f.events.emit('event_result', result);
	};
	const flush_commands = f.flush;
	f.flush = () => {
		flush_commands();
		if (!f.defer_management) {
			while (f.management_delivered < #sizeof(f.management_requests)) {
				const index = f.management_delivered; f.management_delivered = f.management_delivered + 1; f.deliver_management(index, true);
			}
		}
	};
	f.view.ui.get_width = () => { return 1024; };
	f.p.modules.menu = {close_all: () => {}};
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.available_popups = ['base_screen', 'turn_confirmation']; f.popup.no_sliding = true;
	f.p.modules.popup = f.popup;
	screen.available_sections = ['energy', 'bottom_bar'];
	bottom_bar.available_parts = ['middle_area'];
	f.popup.init(f.p);
	for (name of ['nutrients', 'economy', 'game_state', 'facilities', 'resources', 'middle_area']) {
		screen.sections[name] = {set: (data) => {}, set_commerce: (data) => {}, set_energy_grid: (data) => {}};
	}
	bottom_bar.parts.production = {set: (data) => {}};
	bottom_bar.parts.queue = {set: (data) => {}};
	f.p.sections = {}; f.p.sections.object_preview = f.preview;
	f.list = #include('../default/ui/parts/game/bottom_bar/objects_list'); f.list.init(f.p);
	// Deliver the current real native selection to the newly mounted list.
	const selected = f.selected_id();
	if (selected == null) { throw Error('Missing prepared native selection'); }
	f.events.select_unit(f.game.um.get_unit(selected));
	const command = f.action;
	f.action = (action) => {
		if (action == 'open') {
			if (f.popup.is_shown()) { throw Error('Base already open'); }
			if (!f.list.frame.emit('keydown', {code: 'ENTER', modifiers: {}})) { throw Error('Production Enter handler did not consume open'); }
			// Only the owned zero-delay selection delivery is advanced. The
			// preview's repeating refresh timer is outside command completion.
			for (timer of f.view.timers) { if (timer.interval == 0 && timer.running) { timer.tick(); } }
			f.flush();
		} else if (action == 'close') {
			if (!f.popup.is_shown()) { throw Error('Base already closed'); }
			f.popup.popups.base_screen.el.emit('keydown', {code: 'ESCAPE', modifiers: {}});
		} else {
			command(action);
		}
	};
	f.context = () => {
		const window = f.popup.popups.base_screen.el;
		const visible = f.popup.is_shown() && window.is_visible() && screen.is_open && bottom_bar.frame.is_visible();
		if (visible) {
			if (f.popup.popup.id != 'base_screen' || screen.base != f.base || strip.base_id != f.base.id || strip.basename.is_removed() || !strip.basename.is_visible()) {
				throw Error('Base popup context/identity disagree');
			}
			if (#typeof(strip.basename.text) != 'String') { throw Error('Production base title missing'); }
			return {screen: 'base', title_matches_base: strip.basename.text == f.base.name};
		}
		if (f.popup.is_shown() || window.is_visible() || screen.is_open || bottom_bar.frame.is_visible()) { throw Error('Base popup visibility disagrees'); }
		return {screen: 'map', title_matches_base: false};
	};
	return f;
};
