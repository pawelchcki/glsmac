// Declared native setup and explicit UI delivery only. No rejection, dialog,
// message, city, selection successor or command result is supplied here.
const mounted = #include('./_unit_menu_orders_fixture');
return (input) => {
	if (input.profile != 'spread') { throw Error('Adjacent candidate requires the declared spread layout'); }
	let names_document = null; let terrain_document = null;
	for (source of input.sources) {
		if (source.name == 'gaians.txt') { if (names_document != null) { throw Error('Duplicate native name input'); } names_document = test.parse_smac_text(source.source, 'dialogs'); }
		if (source.name == 'alphax.txt') { if (terrain_document != null) { throw Error('Duplicate native terrain input'); } terrain_document = test.parse_smac_text(source.source, 'rules'); }
	}
	if (names_document == null || terrain_document == null) { throw Error('Missing declared native source'); }
	const names = [];
	for (record of names_document.dialog('BASES').records) {
		if (record.kind == 'text') { names :+ record.text; }
		else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported native name input'); }
	}
	if (#sizeof(names) != 64) { throw Error('Expected declared 64-name input pool'); }
	const prepared = input + {land_names: names}; const f = mounted('synthetic', prepared);
	f.native.configure_unit(f.units[2].id, 'flat_arid_world');
	f.view.native_input_factory = (props) => { return test.input_state(props.value, #is_defined(props.max_length) ? props.max_length : 0); };
	f.game.set('terraforming_rules', #include('../default/game/terraforming_rules').parse(terrain_document));
	#include('../default/game/terraforming').configure(f.game); #include('../default/resources').configure(f.game);
	const rules = {}; const callbacks = {};
	rules.get_bm = () => { return f.game.bm; }; rules.get_tm = () => { return f.game.tm; };
	rules.get_turn = () => { return f.game.get_turn(); }; rules.is_master = () => { return f.game.is_master(); };
	rules.get_player = (id) => { return f.game.get_player(id); }; rules.trigger = (name, data) => { return f.game.trigger(name, data); };
	rules.get = (key) => { return f.game.get(key); }; rules.set = (key, value) => { f.game.set(key, value); };
	rules.on = (name, callback) => { callbacks[name] = callback; };
	rules.event = (name, data) => { if (name != 'define_base_pop' && name != 'define_base_facility') { throw Error('Unexpected setup event: ' + name); } };
	#include('../default/game/bases')(rules); callbacks.start({});
	// Forward the real native message event to the already mounted UI, without
	// creating or predicting any text. Component game objects are GSE copies.
	f.preview.p.game.message = (text) => { f.game.message(text); };
	f.game.on('message', (event) => { f.events.emit('message', event); });
	const origin = f.base.get_tile(); const pod_tile = f.units[2].get_tile();
	if (pod_tile.x != origin.x - 1 || pod_tile.y != origin.y + 1 || pod_tile.get_base() != null || !origin.is_adjactent_to(pod_tile)) {
		throw Error('Incorrect declared native adjacent Pod input');
	}
	if (f.native.selected_id() != f.units[0].id || f.native.inspect().names != [input.initial_base.name]) { throw Error('Incorrect initial native focus/name registry'); }
	for (let y = 0; y < 16; y++) {
		for (let x = y % 2; x < 16; x += 2) {
			const tile = f.game.tm.get_tile(x, y);
			if (!tile.is_land || tile.moisture != 1 || tile.rockiness != 1 || tile.features.xenofungus) { throw Error('Incorrect declared flat arid native grid'); }
		}
	}
	// Settle actual native commands/zero-delay deliveries. A checkpoint does
	// not fast-forward a newly created 5000ms message-fade timer.
	f.flush = () => {
		for (timer of f.view.timers) { if (timer.interval == 100) { timer.tick(); } }
		let pending = true; let ticks = 0;
		while (pending && ticks < 32) {
			pending = false;
			while (f.pending.delivered < #sizeof(f.pending.requests)) {
				const request = f.pending.requests[f.pending.delivered]; f.pending.delivered = f.pending.delivered + 1;
				const handler = #include('../default/game/event/' + request.name);
				const e = {caller: f.native.owner.id}; e.game = f.game; e.data = request.data;
				const error = handler.validate(e); if (#is_defined(error)) { throw Error('Actual command rejected: ' + error); }
				f.native.with_write(() => { e.applied = handler.apply(e); });
				if (!f.game.um.has_unit(request.data.unit_id)) {
					f.native.selection_removed(request.data.unit_id, (id) => { f.events.select_unit(f.game.um.get_unit(id)); }, () => { f.events.select_tile(f.base.get_tile()); });
				} else if (request.name != 'unit_activate') {
					const next = f.native.selection_next(false);
					if (next != null) { f.events.select_unit(f.game.um.get_unit(next)); } else { f.events.select_tile(f.base.get_tile()); }
				}
				const receipt = {name: request.name, caller: f.native.owner.id, success: true}; receipt.data = request.data; f.events.emit('event_result', receipt);
			}
			for (timer of f.view.timers) { if (timer.interval == 0 && timer.tick()) { pending = true; } }
			if (f.pending.delivered < #sizeof(f.pending.requests)) { pending = true; }
			ticks++;
		}
		if (pending) { throw Error('Adjacent candidate callbacks did not settle'); }
	};
	f.action = (action) => {
		if (action == 'tab') { f.tab(); }
		else if (action == 'menu') { f.view.find('button', 'text', 'MENU').emit('click', {button: 'left'}); }
		else if (#typeof(action) == 'Object' && #is_defined(action.header) && action.header == 4) {
			const root = f.menu.menus.left_menu;
			if (!root.is_open || root.el.is_removed() || !root.el.is_visible()) { throw Error('MENU is not open'); }
			root.items[4].el.emit('click', {button: 'left'});
		} else if (#typeof(action) == 'Object' && #is_defined(action.row_source) && action.row_source == 0) { f.click_source(0); }
		else { throw Error('Unknown adjacent-menu action'); }
		f.flush();
	};
	return f;
};
