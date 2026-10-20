// Actual native entities and shipped object-list module; display/input delivery
// is explicit. No pixel, hit-test or original-game behavior claims.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const list = #include('../default/ui/parts/game/bottom_bar/objects_list');
const count_keys = (object) => { let count = 0; for (key in object) { count++; } return count; };
const f = {};
f.native = test.founding_fixture(); f.view = mocks.display(); f.game = mocks.events(); f.map = mocks.events();
f.state = { orders: [], hover: [], shown: [], hidden: [], close: null };
f.game.get_um = () => { return f.native.game.um; };
f.game.get_bm = () => { return f.native.game.bm; };
f.game.get_player = () => { return f.native.owner; };
f.game.get_turn = () => { return f.native.game.get_turn(); };
f.game.event = (name, data) => {
	const handler = #include('../default/game/event/' + name);
	const e = {caller: f.native.owner.id}; e.game = f.native.game; e.data = data;
	const error = handler.validate(e); test.assert(!#is_defined(error));
	f.native.with_write(() => { e.applied = handler.apply(e); });
	const result = {name: name, caller: f.native.owner.id, success: true}; result.data = data;
	f.game.emit('event_result', result);
};
f.game.select_unit = (unit) => { f.state.orders :+ ['unit', unit.id]; };
f.game.select_base = (base) => { f.state.orders :+ ['base', base.id]; };
f.game.select_tile = (tile) => { f.state.orders :+ ['tile', tile.x, tile.y]; };
const p = {};
p.el = f.view.root; p.ui = f.view.ui; p.game = f.game; p.map = f.map;
p.get_stats_str = (object) => { return 'Synthetic unit stats'; };
p.sections = { object_preview: { show: (object) => { f.state.hover :+ (object == null ? null : object.id); } } };
p.modules = { popup: {
	hide: (name) => { f.state.hidden :+ name; },
	is_shown: () => { return false; },
	set: (name, data) => { f.state.shown :+ data.base.id; },
	show: (name, cb) => { f.state.close = cb; },
} };
list.init(p);
const tick = () => { for (timer of f.view.timers) { if (timer.interval == 0) { timer.tick(); } } };
const tile_event = () => { const event = {}; event.tile = f.native.tile; f.map.emit('tile_preview', event); };
const initial_unit = f.native.game.um.get_unit(f.native.unit_id);
const selected = {}; selected.unit = initial_unit;
tile_event(); f.game.emit('unit_select', selected);
const initial_key = #to_string(f.native.unit_id);
const old_unit_item = list.units[initial_key].item;

behavior.scenario('same-tile founding removes the pod item and adds the new base', () => {
	f.native.with_write(() => { f.native.game.found_base(f.native.unit_id, 1, (base) => { return { type: 'DOCTOR' }; }); });
	tile_event();
	test.assert(count_keys(list.units) == 0, 'Same tile membership refresh removes a consumed unit');
	test.assert(count_keys(list.bases) == 1, 'Same tile refresh adds its newly founded base');
	test.assert(old_unit_item.is_removed(), 'The old unit input node is destroyed');
	const base = f.native.tile.get_base();
	const key = #to_string(base.id);
	list.bases[key].item.emit('mousedown', {});
	test.assert(f.state.orders == [['base', base.id]]);
});
behavior.scenario('unchanged membership does not replace live input nodes', () => {
	const base = f.native.tile.get_base(); const key = #to_string(base.id);
	const item = list.bases[key].item;
	tile_event();
	test.assert(list.bases[key].item == item && !item.is_removed());
});
behavior.scenario('deferred base opening resolves live IDs and survives a consumed previous selection', () => {
	const event = {}; event.base = f.native.tile.get_base();
	f.game.emit('base_select', event); tick();
	test.assert(f.state.shown == [event.base.id]);
	f.state.close(false);
	const last = #sizeof(f.state.orders) - 1;
	test.assert(f.state.orders[last] == ['tile', f.native.tile.x, f.native.tile.y]);
});
behavior.scenario('queued old base input re-resolves after native removal', () => {
	const base = f.native.tile.get_base(); const key = #to_string(base.id);
	const base_id = base.id;
	const item = list.bases[key].item;
	const event = {}; event.base = base;
	f.game.emit('base_select', event);
	f.native.with_write(() => { f.native.game.bm.despawn_base(base); });
	tick();
	test.assert(f.state.shown == [base_id], 'A removed base cannot open from the deferred callback');
	const count = #sizeof(f.state.orders);
	item.emit('mousedown', {}); item.emit('mouseover', {});
	const last = #sizeof(f.state.hover) - 1;
	test.assert(#sizeof(f.state.orders) == count && f.state.hover[last] == null);
	tile_event();
	test.assert(list.bases == {} && list.units == {} && item.is_removed());
});
behavior.scenario('panel removal cancels pending base-open callbacks and subscriptions', () => {
	const event = {}; event.base = f.native.base;
	f.game.emit('base_select', event);
	const before = #sizeof(f.state.shown);
	list.frame.remove(); tick();
	test.assert(#sizeof(f.state.shown) == before, 'Destroyed panel cannot deliver its queued base open');
	test.assert(f.map.count('tile_preview') == 0 && f.game.count('base_select') == 0);
	test.assert(f.view.running_timers() == 0);
});
