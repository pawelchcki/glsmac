// GLSMAC zero-price rendering policy, not original construction/UI parity.
// Actual production section and actual shared cell renderer execute. Display,
// a current base descriptor/state, and pending mineral income are controlled;
// native pricing/completion is covered independently by mineral_rule_production.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const production = #include('../default/ui/parts/game/popup/base_screen/bottom_bar/production');
const fixture = () => {
	const f = { geometry_writes: 0, progress: [], rows: [], pending: 3, size: 2 };
	f.view = mocks.display(); screen.p = {}; screen.p.ui = f.view.ui;
	f.state = { choice_id: 'PROJECT', minerals: 0, last_processed_turn: 1 };
	f.choices = [{ id: 'PROJECT', type: 'facility', name: 'Declared project', cost: 16, population_cost: 1 }];
	f.choice = f.choices[0];
	f.owner = { get_production_choices: () => { return f.choices; } };
	f.base = {
		get_production: () => { return f.state; },
		get_owner: () => { return f.owner; },
		get_size: () => { return f.size; },
	};
	const p = {}; p.body = f.view.root; p.ui = f.view.ui;
	p.game = { get: (name) => {
		test.assert(name == 'f_base_get_pending_production');
		return (base) => { test.assert(base == f.base); return f.pending; };
	} };
	p.utils = { show_production_selection: () => {}, set_cells: (width, height, columns, rows, filled, pending, cells, cls, label, format) => {
		f.rows :+ rows;
		screen.set_cells(width, height, columns, rows, filled, pending, cells, cls, label, (progress) => {
			f.progress :+ progress;
			return format(progress);
		});
	} };
	production.init(p);
	const style = f.view.ui.class('base-screen-bottombar-production-cell'); const original = style.set;
	style.set = (properties) => { f.geometry_writes = f.geometry_writes + 1; return original(properties); };
	f.render = () => { const data = {}; data.base = f.base; production.set(data); };
	return f;
};

behavior.scenario('actual mineral panel clears positive cells for zero rows and recovers positive geometry', () => {
	const f = fixture(); f.state.minerals = 7; f.render();
	test.assert(#sizeof(production.production_cells.children) == 16 && production.production_amount.text == '7 / 16 minerals');
	test.assert(production.production_label.text == '3 TURNS');
	const old = [] + production.production_cells.children; const writes = f.geometry_writes;
	f.choice.cost = 0; f.render();
	test.assert(f.rows == [2, 0] && #sizeof(production.production_cells.children) == 0);
	for (cell of old) { test.assert(cell.is_removed()); }
	test.assert(f.geometry_writes == writes, 'Zero rows never divide or write substitute cell geometry');
	test.assert(f.progress[#sizeof(f.progress) - 1] == 0 && production.production_label.text == '1 TURN');
	test.assert(production.production_amount.text == '7 / 0 minerals' && production.production_pending.text == '+3 minerals / turn');
	f.choice.cost = 24; f.render();
	test.assert(#sizeof(production.production_cells.children) == 24 && production.production_amount.text == '7 / 24 minerals');
	test.assert(production.production_label.text == '6 TURNS' && f.geometry_writes == writes + 1);
	test.assert(production.production_cells.children[0].class == 'base-screen-bottombar-production-cell-full');
	test.assert(production.production_cells.children[7].class == 'base-screen-bottombar-production-cell-pending');
	test.assert(production.production_cells.children[23].class == 'base-screen-bottombar-production-cell-empty');
	f.view.root.remove();
});

behavior.scenario('zero-row unit mineral panel preserves population holding and the original label formatter', () => {
	const f = fixture(); f.choice.type = 'unit'; f.choice.cost = 0; f.state.minerals = 7; f.size = 1;
	for (pending of [3, 0]) {
		f.pending = pending; f.render();
		test.assert(#sizeof(production.production_cells.children) == 0 && f.geometry_writes == 0);
		test.assert(production.production_label.text == 'NEEDS POPULATION');
		test.assert(f.progress[#sizeof(f.progress) - 1] == 0 && f.state.minerals == 7 && f.size == 1);
	}
	f.size = 2; f.pending = 0; f.render();
	test.assert(production.production_label.text == '1 TURN' && #sizeof(production.production_cells.children) == 0);
	f.pending = 3; f.render();
	test.assert(production.production_label.text == '1 TURN' && f.progress[#sizeof(f.progress) - 1] == 0);
	f.choice.cost = 16; f.render();
	test.assert(#sizeof(production.production_cells.children) == 16 && production.production_label.text == '3 TURNS');
	f.view.root.remove();
});

behavior.scenario('zero-row facility mineral panel shows next-turn completion without income and retains exact state', () => {
	const f = fixture(); f.render(); const old = [] + production.production_cells.children;
	f.choice.cost = 0; f.pending = 0; f.render();
	test.assert(#sizeof(production.production_cells.children) == 0 && production.production_label.text == '1 TURN');
	for (cell of old) { test.assert(cell.is_removed()); }
	test.assert(production.production_title.text == 'Declared project' && production.production_amount.text == '0 / 0 minerals');
	test.assert(f.state == { choice_id: 'PROJECT', minerals: 0, last_processed_turn: 1 });
	f.view.root.remove();
});

behavior.scenario('affordable projects show one turn before no-surplus while population blocking takes precedence', () => {
	const f = fixture(); f.pending = 0;
	for (type of ['facility', 'unit']) {
		f.choice.type = type; f.size = 2;
		for (cost of [16, 0]) {
			f.choice.cost = cost; f.state.minerals = cost; f.render();
			test.assert(production.production_label.text == '1 TURN', 'Funded positive and free projects complete on the next processed turn');
			test.assert(f.state.minerals == cost && f.state.choice_id == 'PROJECT');
			f.state.minerals = cost + 7; f.render();
			test.assert(production.production_label.text == '1 TURN', 'Stored overflow does not require new income');
		}
		f.choice.cost = 16; f.state.minerals = 15; f.render();
		test.assert(production.production_label.text == 'NO SURPLUS', 'An unfunded project with no income remains stalled');
	}
	f.choice.type = 'unit'; f.size = 1;
	for (cost of [16, 0]) {
		f.choice.cost = cost; f.state.minerals = cost; f.render();
		test.assert(production.production_label.text == 'NEEDS POPULATION', 'An affordable pod cannot consume the final citizen');
	}
	f.choice.cost = 16; f.state.minerals = 15; f.render();
	test.assert(production.production_label.text == 'NO SURPLUS', 'An unfunded size-one pod first needs minerals');
	f.view.root.remove();
});
