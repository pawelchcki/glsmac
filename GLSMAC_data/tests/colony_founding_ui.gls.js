// GLSMAC-only founding controls. Real production panel/actions and shared rule
// validation; explicit display/native-manager boundaries, no hit-test claims.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
const fixture = () => {
	const f = {};
	// Founding identity/turn/transport remain the declared PlainData UI boundary.
	// The newly mounted work preflight reads genuine matching native definition,
	// lifecycle and configured-rule metadata; it does not replace those decisions.
	f.native_metadata = test.founding_fixture();
	f.native_metadata.game.set('terraforming_rules', #include('../default/game/terraforming_rules').parse(test.parse_smac_text(#include('./_terraform_action_source'), 'rules')));
	#include('../default/units/defs').define({event: (name, data) => {
		if (name == 'define_moraleset' || (name == 'define_unit' && data.id == 'MindWorms')) {
			const handler = #include('../default/game/event/' + name);
			const e = {caller: 0}; e.game = f.native_metadata.game; e.data = data;
			const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
			f.native_metadata.with_write(() => { handler.apply(e); });
		}
	}});
	f.definition_units = {};
	f.definition_units.ColonyPod = f.native_metadata.unit_id + 0;
	f.native_metadata.with_write(() => {
		const data = {def: 'MindWorms', health: 1.0, morale: 2};
		data.owner = f.native_metadata.owner; data.tile = f.native_metadata.base.get_tile();
		f.definition_units.MindWorms = f.native_metadata.game.um.spawn_unit(data).id + 0;
	});
	const pod_definition = f.native_metadata.game.um.get_unit(f.definition_units.ColonyPod).get_def();
	const worm_definition = f.native_metadata.game.um.get_unit(f.definition_units.MindWorms).get_def();
	test.assert(pod_definition.id == 'ColonyPod' && !pod_definition.can_terraform, 'Native Pod metadata must remain a nonworker');
	test.assert(worm_definition.id == 'MindWorms' && !worm_definition.can_terraform, 'Shipped MindWorm metadata must not alias a Pod or grant work');
	f.view = mocks.display(); f.game = mocks.events(); f.map = mocks.events(); f.um = mocks.events();
	f.state = { units: {}, orders: [], modal: false, active: true, turn: 1, player: 0, native_error: null, validations: [] };
	f.um.has_unit = (id) => { const key = #to_string(id); return #is_defined(f.state.units[key]); };
	f.um.get_unit = (id) => { const key = #to_string(id); return f.state.units[key]; };
	f.game.get_um = () => { return f.um; };
	f.game.get_player = () => { return { id: f.state.player }; };
	f.game.get_turn = () => { return f.state.turn; };
	f.game.is_turn_complete = (id) => { return !f.state.active; };
	f.game.is_started = () => { return f.native_metadata.game.is_started(); };
	f.game.get = (key) => { return f.native_metadata.game.get(key); };
	f.game.get_settings = () => { return f.native_metadata.game.get_settings(); };
	f.game.get_players = () => { return f.native_metadata.game.get_players(); };
	// Validation is the actual native boundary shared by event and UI. Its
	// rule implementation is tested in the asset-free native fixture, not
	// reimplemented here. These outcomes exercise UI gating and fresh queries.
	f.game.validate_found_base = (id, caller) => {
		f.state.validations :+ [id, caller];
		if (f.state.native_error != null) { return f.state.native_error; }
		return #undefined;
	};
	f.game.event = (name, data) => { f.state.orders :+ { name: name, data: data }; };
	f.make_unit = (id, owner, def) => {
		const unit = {};
		unit.id = id; unit.owner = owner; unit.def = def;
		unit.movement = 1.0; unit.health = 1.0; unit.is_land = true; unit.is_water = false; unit.is_immovable = false;
		// Declared native readiness boundary, not founding rules. Actual native
		// order/turn behavior is checked by unit_orders_native/events suites.
		unit.needs_orders = () => { return unit.movement > 0.0; };
		unit.get_def = () => {
			const id = f.definition_units[unit.def];
			return f.native_metadata.game.um.get_unit(id).get_def();
		};
		unit.tile = { is_land: true, is_water: false, locked: false, base: null, units: [] };
		unit.tile.is_locked = () => { return unit.tile.locked; };
		unit.tile.get_base = () => { return unit.tile.base; };
		unit.tile.get_units = () => { return unit.tile.units; };
		unit.get_tile = () => { return unit.tile; };
		const key = #to_string(id); f.state.units[key] = unit;
		return unit;
	};
	f.pod = f.make_unit(1, 0, 'ColonyPod');
	f.other = f.make_unit(2, 0, 'ColonyPod');
	f.scout = f.make_unit(3, 0, 'MindWorms');
	f.foreign = f.make_unit(4, 1, 'ColonyPod');
	const p = {};
	p.el = f.view.root; p.ui = f.view.ui; p.game = f.game; p.map = f.map;
	p.modules = { popup: { is_shown: () => { return f.state.modal; } } };
	// Capture the real root-sibling hint created by the shipped panel init;
	// the surrounding display factory remains authoritative and is restored.
	const root_text = f.view.root.text; let hints = 0; f.target_hint = null;
	f.view.root.text = (properties) => {
		const node = root_text(properties); hints++; f.target_hint = node; return node;
	};
	preview.init(p);
	f.view.root.text = root_text;
	test.assert(hints == 1 && f.target_hint != null, 'Panel init must create exactly one actual root-owned target hint');
	// Artwork/preview text does not determine which selected unit gets an order.
	preview.show = (object) => {};
	f.select = (unit) => { f.game.emit('unit_select', { unit: unit }); };
	f.click = () => { return f.view.find('button', 'text', 'FOUND BASE').emit('click', {}); };
	f.key = (code, modifiers) => { return preview.frame.emit('keydown', { code: code, modifiers: modifiers }); };
	f.tick = () => { for (timer of f.view.timers) { timer.tick(); } };
	f.result = (name, id, success) => { f.game.emit('event_result', { name: name, event_id: 'synthetic-local', caller: 0, data: { unit_id: id }, success: success }); };
	return f;
};

const f = fixture();
behavior.scenario('FOUND BASE exists but selection never follows hover', () => {
	test.assert(f.view.find('button', 'text', 'FOUND BASE').class == 'unit-found-button-disabled');
	f.map.emit('unit_preview', { unit: f.pod }); f.click(); f.key('B', {});
	test.assert(f.state.orders == []);
	f.select(f.pod); f.map.emit('unit_preview', { unit: f.other }); f.click();
	test.assert(f.state.orders == [{ name: 'found_base', data: { unit_id: 1 } }]);
	test.assert(f.pod.movement == 1.0 && f.um.has_unit(1), 'UI queues scalar input without replacing backend behavior');
});
behavior.scenario('button and B share one pending action until an explicit result', () => {
	f.click(); f.key('B', {}); f.tick(); f.click();
	test.assert(#sizeof(f.state.orders) == 1);
	test.assert(f.view.find('button', 'text', 'FOUND BASE').class == 'unit-found-button-disabled');
	f.result('other_action', 1, false);
	f.click(); test.assert(#sizeof(f.state.orders) == 1);
	f.result('found_base', 1, false);
	test.assert(f.view.find('button', 'text', 'FOUND BASE').class == 'unit-found-button-enabled');
	test.assert(f.key('B', {}));
	test.assert(f.state.orders == [
		{ name: 'found_base', data: { unit_id: 1 } },
		{ name: 'found_base', data: { unit_id: 1 } },
	]);
});
behavior.scenario('a result for another unit cannot release the pending unit', () => {
	f.result('found_base', 2, false);
	f.click(); test.assert(#sizeof(f.state.orders) == 2);
	f.game.emit('event_result', { name: 'found_base', caller: 1, data: { unit_id: 1 }, success: false });
	f.click(); test.assert(#sizeof(f.state.orders) == 2, 'Another caller cannot release the pending action');
	f.result('found_base', 1, false);
});
behavior.scenario('modified B is ignored and modal input cannot found a base', () => {
	for (modifiers of [{ ctrl: true }, { shift: true }, { alt: true }, { ctrl: true, shift: true }]) {
		test.assert(!f.key('B', modifiers));
	}
	f.state.modal = true; f.tick(); f.click();
	test.assert(!f.key('B', {}));
	test.assert(#sizeof(f.state.orders) == 2);
	test.assert(f.view.find('button', 'text', 'FOUND BASE').class == 'unit-found-button-disabled');
	f.state.modal = false;
});
behavior.scenario('ownership prototype movement health tile and occupants are rechecked at submission', () => {
	for (unit of [f.scout, f.foreign]) { f.select(unit); f.click(); f.key('B', {}); }
	f.select(f.pod);
	f.pod.owner = 1; f.click(); f.pod.owner = 0;
	f.pod.def = 'MindWorms'; f.click(); f.pod.def = 'ColonyPod';
	for (reason of ['Out of moves', 'Unhealthy unit', 'Wrong unit domain', 'Tile locked', 'Water tile', 'Existing base', 'Foreign occupant']) {
		f.state.native_error = reason; f.click(); f.key('B', {});
	}
	f.state.native_error = null;
	test.assert(#sizeof(f.state.orders) == 2);
	f.tick(); test.assert(f.view.find('button', 'text', 'FOUND BASE').class == 'unit-found-button-enabled');
});
behavior.scenario('inactive complete and absent turns cannot submit', () => {
	f.state.native_error = 'Player completed turn'; f.click(); f.key('B', {});
	f.state.native_error = 'Turn not initialized'; f.click();
	f.state.native_error = null;
	f.game.emit('turn_status', { status: 'please_wait' }); f.click(); f.key('B', {});
	test.assert(#sizeof(f.state.orders) == 2);
	f.game.emit('turn_status', { status: 'active' });
});
behavior.scenario('deselection unit removal and id reuse cannot use an old wrapper', () => {
	for (event of ['tile_select', 'base_select', 'turn']) {
		f.select(f.pod); f.game.emit(event, {}); f.click(); f.key('B', {});
	}
	f.select(f.pod); f.state.units = {}; f.click(); f.key('B', {});
	test.assert(#sizeof(f.state.orders) == 2);
	const replaced = f.make_unit(1, 1, 'ColonyPod');
	f.select(f.pod); f.click();
	test.assert(#sizeof(f.state.orders) == 2, 'Selection id resolves the current foreign replacement, never the stale owned wrapper');
	f.state.units = {}; f.state.units['1'] = f.pod;
});
behavior.scenario('accepted founding removes the selected pod and keeps subsequent B harmless', () => {
	f.select(f.pod); f.click();
	test.assert(#sizeof(f.state.orders) == 3);
	f.state.units = {};
	f.result('found_base', 1, true);
	f.tick(); f.click(); f.key('B', {});
	test.assert(#sizeof(f.state.orders) == 3);
	test.assert(f.view.find('button', 'text', 'FOUND BASE').class == 'unit-found-button-disabled');
});
behavior.scenario('destroying the panel detaches keyboard input timers and result subscriptions', () => {
	preview.frame.remove();
	test.assert(preview.frame.handler_count('keydown') == 0);
	test.assert(f.game.count('event_result') == 0);
	// Root::Clear safety retires this exact sibling on its owned zero-delay
	// callback. No other leaked timer, including another zero-delay one, may run.
	test.assert(!f.target_hint.removed && #sizeof(f.target_hint.timers) == 1);
	const retirement = f.target_hint.timers[0];
	test.assert(retirement.interval == 0 && retirement.running && f.view.running_timers() == 1);
	retirement.tick();
	test.assert(f.target_hint.removed && !retirement.running);
	test.assert(f.view.running_timers() == 0);
	f.key('B', {}); test.assert(#sizeof(f.state.orders) == 3);
});
