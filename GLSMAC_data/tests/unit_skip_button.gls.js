// Native manager/unit/event envelope; display and delivery are controlled.
const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
const skip_event = #include('../default/game/event/unit_skip_turn');
const mocks = #include('./_ui_mocks');
const f = test.founding_fixture();
const state = { orders: [], popup: false, hovered: null, lookups: 0 };
const view = mocks.display(); const game = mocks.events(); const map = mocks.events();
const um = {};
um.has_unit = (id) => { return f.game.um.has_unit(id); };
um.get_unit = (id) => { state.lookups = state.lookups + 1; return f.game.um.get_unit(id); };
um.has_ready_unit = (owner) => { return f.game.um.has_ready_unit(owner); };
game.get_um = () => { return um; };
game.get_player = () => { return f.owner; };
game.validate_found_base = (id, caller) => { return f.game.validate_found_base(id, caller); };
game.event = (name, data) => { const request = { name: name }; request.data = data; state.orders :+ request; };
const p = {};
p.el = view.root; p.ui = view.ui; p.game = game; p.map = map;
p.modules = { popup: { is_shown: () => { return state.popup; } } };
preview.init(p);
// Choosing an order is independent of artwork/hover presentation.
preview.show = (object) => { state.hovered = object; };
const button = view.find('button', 'text', 'SKIP TURN');
const click = (e) => { return button.emit('click', e); };
const tick = () => { for (timer of view.timers) { timer.tick(); } return true; };
const select = (unit) => { const e = {}; e.unit = unit; game.emit('unit_select', e); };
const hover = (e) => { map.emit('unit_preview', e); };
const turn_status = (e) => { game.emit('turn_status', e); };
const owned = f.game.um.get_unit(f.unit_id);
f.with_write(() => { owned.movement = 2.0; owned.health = 1.0; });
let other = null;
f.with_write(() => {
	const data = { def: 'Scout', health: 1.0, morale: 2 }; data.owner = f.owner; data.tile = f.base.get_tile();
	other = f.game.um.spawn_unit(data);
});
const foreign_id = f.add_scout(0); const foreign = f.game.um.get_unit(foreign_id);

test.assert(button.class == 'unit-skip-button-disabled');
test.assert(click({})); test.assert(state.orders == []);
const e = {}; e.unit = owned; hover(e);
test.assert(tick()); test.assert(button.class == 'unit-skip-button-disabled');
test.assert(click({})); test.assert(state.orders == []);

// Hovering another unit cannot redirect a scalar order from actual selection.
select(owned); test.assert(button.class == 'unit-skip-button-enabled');
const hovered = {}; hovered.unit = other; hover(hovered);
test.assert(click({})); test.assert(#sizeof(state.orders) == 1);
test.assert(state.orders[0].name == 'unit_skip_turn');
test.assert(state.orders[0].data == { unit_id: owned.id });
test.assert(f.game.um.get_unit(owned.id).movement == 2.0);

// Actual handler execution can spend movement and roll back. Deliver rejection
// after rollback (the local predictive-rejection lifecycle), releasing pending
// without inventing a successful frontend selection transition.
const event = { caller: 1 }; event.game = f.game; event.data = state.orders[0].data;
test.assert(skip_event.validate(event) == #undefined);
f.with_write(() => { event.applied = skip_event.apply(event); });
test.assert(f.game.um.get_unit(owned.id).movement == 0.0); test.assert(tick());
test.assert(button.class == 'unit-skip-button-disabled');
test.assert(click({})); test.assert(#sizeof(state.orders) == 1);
f.with_write(() => { skip_event.rollback(event); });
game.emit('event_result', { name: 'unit_skip_turn', event_id: 'controlled-local', caller: 1, data: { unit_id: owned.id }, success: false });
test.assert(f.game.um.get_unit(owned.id).movement == 2.0); test.assert(tick());
test.assert(button.class == 'unit-skip-button-enabled');

// Temporary locks, dialogs, and inactive turns visibly disable the action.
f.configure('locked'); test.assert(tick());
test.assert(button.class == 'unit-skip-button-disabled'); test.assert(click({}));
// The native fixture intentionally exposes locking only. Use another genuine
// unlocked unit for the remaining independent control-availability checks.
select(other);
state.popup = true; test.assert(tick());
test.assert(button.class == 'unit-skip-button-disabled'); test.assert(click({}));
state.popup = false; turn_status({ status: 'please_wait' });
test.assert(button.class == 'unit-skip-button-disabled'); test.assert(click({}));
test.assert(#sizeof(state.orders) == 1);
turn_status({ status: 'active' }); test.assert(button.class == 'unit-skip-button-enabled');
select(foreign); test.assert(button.class == 'unit-skip-button-disabled'); test.assert(click({}));
let fixed = null;
f.with_write(() => {
	f.game.um.define_unit('Fixed', { name: 'Fixed', morale: 'SYNTHETIC', type: 'static', movement_type: 'immovable', movement_per_turn: 0,
		render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 } });
	const data = { def: 'Fixed', health: 1.0, morale: 2 }; data.owner = f.owner; data.tile = f.base.get_tile();
	fixed = f.game.um.spawn_unit(data);
});
select(fixed); test.assert(button.class == 'unit-skip-button-disabled'); test.assert(click({}));

for (name of ['tile_select', 'base_select', 'turn']) {
	select(other); test.assert(button.class == 'unit-skip-button-enabled');
	game.emit(name, {});
	test.assert(button.class == 'unit-skip-button-disabled'); test.assert(click({}));
}
test.assert(#sizeof(state.orders) == 1);

// A real despawn must be checked before any native lookup or retained wrapper.
select(other); const removed_id = other.id;
f.with_write(() => { f.game.um.despawn_unit(removed_id); });
const lookups = state.lookups;
test.assert(tick()); test.assert(state.lookups == lookups);
test.assert(button.class == 'unit-skip-button-disabled'); test.assert(click({}));
test.assert(#sizeof(state.orders) == 1);
view.root.remove();
