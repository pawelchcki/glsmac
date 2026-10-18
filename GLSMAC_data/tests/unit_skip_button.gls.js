const preview = #include('../default/ui/parts/game/bottom_bar/object_preview');
const skip_event = #include('../default/game/event/unit_skip_turn');
const state = {
	units: {}, listeners: {}, previews: {}, orders: [], button: null,
	tick: null, popup: false, hovered: null, lookups: 0,
};
const styles = {};
styles.set = (properties) => { return styles; };
styles.extend = (name) => { return styles; };
const node = {};
node.panel = (properties) => { return node; };
node.button = (properties) => {
	const button = {};
	button.class = properties.class;
	button.on = (event, callback) => {
		test.assert(event == 'click');
		state.click = callback;
	};
	state.button = button;
	return button;
};
node.listen = (object, event, callback) => { state.listeners[event] = callback; };
node.timer = (interval, callback) => {
	test.assert(interval == 100);
	state.tick = callback;
};
const um = {
	has_unit: (id) => {
		const key = #to_string(id);
		return #is_defined(state.units[key]);
	},
	get_unit: (id) => {
		state.lookups = state.lookups + 1;
		const key = #to_string(id);
		return state.units[key];
	},
};
const p = {
	el: node,
	ui: { class: (name) => { return styles; } },
	map: { on: (event, callback) => { state.previews[event] = callback; } },
	modules: { popup: { is_shown: () => { return state.popup; } } },
	game: {
		get_um: () => { return um; },
		get_player: () => { return { id: 0 }; },
		event: (name, data) => {
			const order = { name: name };
			order.unit = data.unit;
			state.orders :+ order;
		},
	},
};
preview.init(p);
// Rendering previews is unrelated to choosing the unit that receives an order.
preview.show = (object) => { state.hovered = object; };
const click = state.click;
const tick = state.tick;
const select = state.listeners.unit_select;
const hover = state.previews.unit_preview;
const turn_status = state.listeners.turn_status;
const make_unit = (id, owner) => {
	const unit = {};
	unit.id = id;
	unit.owner = owner;
	unit.movement = 2.0;
	unit.is_immovable = false;
	unit.locked = false;
	unit.get_tile = () => { return { is_locked: () => { return unit.locked; } }; };
	const key = #to_string(id);
	state.units[key] = unit;
	return unit;
};
const owned = make_unit(1, 0);
const other = make_unit(2, 0);
const foreign = make_unit(3, 1);

test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
test.assert(state.orders == []);
hover({ unit: owned });
test.assert(tick());
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
test.assert(state.orders == []);

// Hovering another unit cannot redirect an order away from actual selection.
select({ unit: owned });
test.assert(state.button.class == 'unit-skip-button-enabled');
hover({ unit: other });
test.assert(click({}));
test.assert(#sizeof(state.orders) == 1);
test.assert(state.orders[0].name == 'unit_skip_turn');
test.assert(state.orders[0].unit.id == owned.id);
test.assert(owned.movement == 2.0);

// The shipped event, rather than the button, consumes movement and can roll back.
const event = { caller: 0, data: {} };
event.data.unit = state.orders[0].unit;
test.assert(skip_event.validate(event) == #undefined);
event.applied = skip_event.apply(event);
test.assert(owned.movement == 0.0);
test.assert(tick());
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
test.assert(#sizeof(state.orders) == 1);
skip_event.rollback(event);
test.assert(owned.movement == 2.0);
test.assert(tick());
test.assert(state.button.class == 'unit-skip-button-enabled');

// Temporary locks, dialogs, and inactive turns visibly disable the action.
owned.locked = true;
test.assert(tick());
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
owned.locked = false;
state.popup = true;
test.assert(tick());
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
state.popup = false;
turn_status({ status: 'please_wait' });
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
test.assert(#sizeof(state.orders) == 1);
turn_status({ status: 'active' });
test.assert(state.button.class == 'unit-skip-button-enabled');

select({ unit: foreign });
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
owned.is_immovable = true;
select({ unit: owned });
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
owned.is_immovable = false;

for (name of ['tile_select', 'base_select', 'turn']) {
	select({ unit: owned });
	test.assert(state.button.class == 'unit-skip-button-enabled');
	const deselect = state.listeners[name];
	deselect({});
	test.assert(state.button.class == 'unit-skip-button-disabled');
	test.assert(click({}));
}
test.assert(#sizeof(state.orders) == 1);

// Resolve IDs afresh: a despawned unit must not leave a stale native reference.
select({ unit: owned });
state.units['1'] = #undefined;
const lookups = state.lookups;
test.assert(tick());
test.assert(state.lookups == lookups);
test.assert(state.button.class == 'unit-skip-button-disabled');
test.assert(click({}));
test.assert(#sizeof(state.orders) == 1);
