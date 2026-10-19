// Actual resource-panel diamond handlers and shipped weighted tile selection.
// Display, native entities and event delivery are explicit boundaries. These
// assertions describe requested commands, not population mutation or pixels.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const configure_bases = #include('../default/game/bases');
const resource = #include('../default/ui/parts/game/popup/base_screen/middle_area/resource');

const neighborhood = () => {
	const tiles = [];
	for (let i = 0; i <= 20; i++) {
		const tile = { x: i * 2, y: 0 }; const values = {};
		const yields = { NUTRIENTS: 0, MINERALS: 0, ENERGY: 0 }; tile.yields = yields;
		tile.get = (key) => { return values[key]; };
		tile.set = (key, value) => { values[key] = value; };
		tile.get_resources = (owner) => { return yields; };
		for (direction of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
			tile['get_' + direction] = () => { return tile; };
		}
		tiles :+ tile;
	}
	tiles[0].get_N = () => { return tiles[1]; };
	tiles[0].get_NE = () => { return tiles[2]; };
	tiles[0].get_E = () => { return tiles[3]; };
	tiles[0].get_SE = () => { return tiles[4]; };
	tiles[0].get_S = () => { return tiles[5]; };
	tiles[0].get_SW = () => { return tiles[6]; };
	tiles[0].get_W = () => { return tiles[7]; };
	tiles[0].get_NW = () => { return tiles[8]; };
	tiles[1].get_NW = () => { return tiles[9]; };
	tiles[1].get_NE = () => { return tiles[10]; };
	tiles[2].get_NE = () => { return tiles[11]; };
	tiles[3].get_NE = () => { return tiles[12]; };
	tiles[3].get_SE = () => { return tiles[13]; };
	tiles[4].get_SE = () => { return tiles[14]; };
	tiles[5].get_SE = () => { return tiles[15]; };
	tiles[5].get_SW = () => { return tiles[16]; };
	tiles[6].get_SW = () => { return tiles[17]; };
	tiles[7].get_SW = () => { return tiles[18]; };
	tiles[7].get_NW = () => { return tiles[19]; };
	tiles[8].get_NW = () => { return tiles[20]; };
	return tiles;
};

const fixture = () => {
	const f = {}; f.view = mocks.display(); f.requests = []; f.globals = {}; f.handlers = {};
	f.tiles = neighborhood();
	f.make_base = (id) => {
		const b = {}; const state = { pops: [], worked: [], workable: [] }; const base = { id: id };
		base.get_owner = () => { return { id: 1 }; };
		base.get_tile = () => { return f.tiles[0]; };
		base.get_pops = () => { return state.pops; };
		base.get_worked_tiles = () => { return state.worked; };
		base.get_workable_tiles = () => { return state.workable; };
		b.base = base; b.state = state;
		b.add_pop = (pop_id, type, tile) => {
			const pop = { id: pop_id }; const values = {};
			pop.get_type = () => { return type; };
			pop.get = (key) => { return values[key]; };
			if (#is_defined(tile)) {
				values.worked_tile = tile; tile.set('working_pop', pop); state.worked :+ tile;
			}
			state.pops :+ pop; return pop;
		};
		return b;
	};
	f.game = {};
	f.game.get_bm = () => { return { on: (name, callback) => {} }; };
	f.game.get_tm = () => { return { get_map_width: () => { return 20; }, get_map_height: () => { return 20; } }; };
	f.game.on = (name, callback) => { f.handlers[name] = callback; };
	f.game.get = (key) => { return f.globals[key]; };
	f.game.set = (key, value) => { f.globals[key] = value; };
	f.game.event = (name, data) => {
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		test.assert(name == 'work_base_tile' || name == 'unwork_base_tile', 'unexpected resource-panel command');
		f.requests :+ [name, data.base.id, data.tile.x, data.tile.y, #is_defined(data.pop) ? data.pop.id : 0];
	};
	configure_bases(f.game); f.handlers.start({});
	const p = {}; p.ui = f.view.ui; p.game = f.game;
	p.area = {};
	p.area.panel = (properties) => {
		const node = f.view.root.panel(properties); const events = mocks.events();
		const clear_children = node.clear; const remove_node = node.remove;
		node.on = events.on; node.emit = events.emit; node.handler_count = events.count;
		// Native Container::Clear triggers clear, clears its own handlers, then
		// removes children (src/ui/dom/Container.cpp). Keep this local because
		// the general display mock's clear() only removes children.
		node.clear = () => { events.emit('clear', {}); events.clear(); clear_children(); };
		node.remove = () => { events.clear(); remove_node(); };
		return node;
	};
	resource.init(p); f.panel = resource.el;
	f.show = (b) => { const data = {}; data.base = b.base; resource.set(data); };
	f.click = (x, y, button) => { return f.panel.emit('mousedown', { x: x, y: y, button: button }); };
	return f;
};

behavior.scenario('worked diamond requests unwork without mutating its worker in the UI', () => {
	const f = fixture(); const b = f.make_base(1); const pop = b.add_pop(11, 'WORKER', f.tiles[1]); f.show(b);
	test.assert(f.click(200, 50, 'left'));
	test.assert(f.requests == [['unwork_base_tile', 1, 2, 0, 0]]);
	test.assert(pop.get_type() == 'WORKER' && #sizeof(b.state.worked) == 1);
});

behavior.scenario('unworked diamond requests the first available Doctor', () => {
	const f = fixture(); const b = f.make_base(1);
	b.add_pop(11, 'WORKER', f.tiles[1]); b.add_pop(12, 'DOCTOR'); b.add_pop(13, 'DOCTOR'); f.show(b);
	f.click(300, 100, 'left');
	test.assert(f.requests == [['work_base_tile', 1, 6, 0, 12]]);
	test.assert(#sizeof(b.state.worked) == 1 && #sizeof(b.state.pops) == 3);
});

behavior.scenario('all-worker reassignment requests the actual lowest-score worker', () => {
	const f = fixture(); const b = f.make_base(1);
	f.tiles[1].yields.NUTRIENTS = 1; f.tiles[3].yields.MINERALS = 2;
	b.add_pop(11, 'WORKER', f.tiles[1]); b.add_pop(12, 'WORKER', f.tiles[3]); f.show(b);
	f.click(250, 125, 'left');
	test.assert(f.requests == [['work_base_tile', 1, 8, 0, 11]]);
	test.assert(#sizeof(b.state.worked) == 2);
});

behavior.scenario('empty population has no worker to assign', () => {
	const f = fixture(); const b = f.make_base(1); f.show(b); f.click(300, 100, 'left');
	test.assert(f.requests == []);
});

behavior.scenario('center automatically requests unwork then highest-score assignments in population order', () => {
	const f = fixture(); const b = f.make_base(1);
	b.add_pop(11, 'WORKER', f.tiles[1]); b.add_pop(12, 'WORKER', f.tiles[3]);
	f.tiles[1].yields.NUTRIENTS = 1; f.tiles[3].yields.MINERALS = 2; f.tiles[4].yields.NUTRIENTS = 2;
	// Resolve indexed values before array construction: GSE array literals can
	// retain an indexed ObjectRef instead of the tile object it refers to.
	const north = f.tiles[1]; const east = f.tiles[3]; const southeast = f.tiles[4];
	b.state.workable = [north, east, southeast]; f.show(b); f.click(200, 100, 'left');
	test.assert(f.requests == [
		['unwork_base_tile', 1, 2, 0, 0], ['unwork_base_tile', 1, 6, 0, 0],
		['work_base_tile', 1, 8, 0, 11], ['work_base_tile', 1, 6, 0, 12],
	]);
});

behavior.scenario('center automatic assignment stops when workable tiles are exhausted', () => {
	const f = fixture(); const b = f.make_base(1);
	b.add_pop(11, 'DOCTOR'); b.add_pop(12, 'DOCTOR');
	const east = f.tiles[3]; b.state.workable = [east];
	f.show(b); f.click(200, 100, 'left');
	test.assert(f.requests == [['work_base_tile', 1, 6, 0, 11]]);
});

behavior.scenario('right button and points outside the diamond union request nothing', () => {
	const f = fixture(); const b = f.make_base(1); b.add_pop(11, 'DOCTOR'); f.show(b);
	test.assert(f.click(200, 100, 'right')); test.assert(f.click(300, 100, 'right'));
	test.assert(f.click(399, 51, 'left')); test.assert(f.click((0 - 10), (0 - 10), 'left'));
	test.assert(f.requests == []);
});

behavior.scenario('outer diamond edge is included and the next pixel is excluded', () => {
	const f = fixture(); const b = f.make_base(1); b.add_pop(11, 'DOCTOR'); f.show(b);
	f.click(401, 75, 'left'); test.assert(f.requests == []);
	f.click(400, 75, 'left'); test.assert(f.requests == [['work_base_tile', 1, 24, 0, 11]]);
});

behavior.scenario('refresh replaces input handlers and removes old widgets before selecting a new base', () => {
	const f = fixture(); const first = f.make_base(1); first.add_pop(11, 'WORKER', f.tiles[1]); f.show(first);
	const old_children = f.panel.children;
	const second = f.make_base(2); second.add_pop(21, 'DOCTOR'); f.show(second); f.show(second);
	for (child of old_children) { test.assert(child.is_removed()); }
	test.assert(f.panel.handler_count('mousedown') == 1);
	f.click(200, 50, 'left'); test.assert(f.requests == [['work_base_tile', 2, 2, 0, 21]]);
});

behavior.scenario('removed resource panel cannot deliver later worker commands', () => {
	const f = fixture(); const b = f.make_base(1); b.add_pop(11, 'DOCTOR'); f.show(b);
	f.panel.remove(); f.click(300, 100, 'left');
	test.assert(f.panel.is_removed() && f.panel.handler_count('mousedown') == 0 && f.requests == []);
});
