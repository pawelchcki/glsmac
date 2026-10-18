const navigation = #include('../default/ui/parts/game/popup/base_screen/bottom_bar/middle_area');
const state = { bases: [], selected: [], clicks: {}, player: 0 };
const make_base = (id, owner) => {
	const base = {};
	base.id = id;
	base.name = 'Base ' + #to_string(id);
	base.owner = owner;
	base.get_owner = () => { return { id: base.owner }; };
	return base;
};
// Declare shared mocks before callbacks capture their names: GSE callbacks
// inside an initializer cannot see the variable being initialized.
const styles = {};
styles.set = (properties) => { return styles; };
styles.extend = (name) => { return styles; };
const node = {};
node.panel = (properties) => { return node; };
node.clear = () => {};
node.text = (properties) => { return {}; };
node.button = (properties) => {
	const name = properties.class;
	return { on: (event, callback) => {
		test.assert(event == 'click');
		state.clicks[name] = callback;
	} };
};
const p = {
	body: node,
	ui: { class: (name) => { return styles; } },
	game: {
		get_player: () => { return { id: state.player }; },
		get_bm: () => { return {
			get_bases: () => { return state.bases; },
			get_pop_renders: (owner) => { return {}; },
		}; },
		select_base: (base) => { state.selected :+ base.id; },
	},
};
navigation.init(p);
const previous = state.clicks['base-screen-bottombar-arrow-left'];
const next = state.clicks['base-screen-bottombar-arrow-right'];
test.assert(previous({}));
test.assert(next({}));
test.assert(state.selected == []);

const first = make_base(10, 0);
const middle = make_base(30, 0);
const last = make_base(50, 0);
const foreign = make_base(20, 1);
// Native get_bases() returns an unordered map. Foreign IDs may be interleaved.
state.bases = [last, foreign, first, middle];
const show_base = (base) => {
	navigation.set({ base: base, name: base.name, owner: base.get_owner(), pops: [] });
};
show_base(first);
test.assert(next({}));
test.assert(next({}));
test.assert(next({}));
test.assert(previous({}));
test.assert(previous({}));
test.assert(state.selected == [30, 50, 10, 50, 30]);

// An external base selection resets the navigation anchor.
show_base(first);
test.assert(previous({}));
test.assert(state.selected == [30, 50, 10, 50, 30, 50]);

// Reordering the native collection cannot change which adjacent ID is chosen.
state.bases = [middle, first, last, foreign];
show_base(first);
test.assert(next({}));
test.assert(state.selected == [30, 50, 10, 50, 30, 50, 30]);

// A foreign, removed, or no-longer-owned current base cannot navigate.
state.selected = [];
show_base(foreign);
test.assert(next({}));
test.assert(previous({}));
show_base(last);
state.bases = [first, middle, foreign];
test.assert(next({}));
test.assert(previous({}));
show_base(middle);
middle.owner = 1;
test.assert(next({}));
test.assert(previous({}));
test.assert(state.selected == []);

// A single owned base and an empty empire both remain a harmless no-op.
state.bases = [foreign, first];
show_base(first);
test.assert(next({}));
test.assert(previous({}));
state.bases = [];
test.assert(next({}));
test.assert(previous({}));
test.assert(state.selected == []);
