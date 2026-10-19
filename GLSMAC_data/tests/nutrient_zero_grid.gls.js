// Application rendering policy, not original zero-factor UI parity. Execute
// shipped cell creation and the actual nutrient formatter; only display nodes
// are controlled. Zero is an explicit supported factor, never a fallback one.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const nutrients = #include('../default/ui/parts/game/popup/base_screen/nutrients');

const fixture = () => {
	const f = { progress: [], geometry_writes: 0, columns: [] };
	f.view = mocks.display();
	screen.p = {}; screen.p.ui = f.view.ui;
	f.watch_geometry = (name) => {
		const style = f.view.ui.class(name); const original = style.set;
		style.set = (properties) => {
			f.geometry_writes = f.geometry_writes + 1;
			return original(properties);
		};
	};
	f.cells = f.view.root.area({}); f.label = f.view.root.text({});
	f.render = (columns, rows, filled, pending) => {
		screen.set_cells(80, 40, columns, rows, filled, pending, f.cells, 'zero-grid-cell', f.label, (progress) => {
			f.progress :+ progress;
			return 'Progress ' + #to_string(progress);
		});
	};
	return f;
};

behavior.scenario('positive to zero grid removes actual cells calls formatter with zero and recovers', () => {
	const f = fixture(); f.watch_geometry('zero-grid-cell');
	f.render(4, 2, 1, 3);
	test.assert(#sizeof(f.cells.children) == 8 && f.label.text == 'Progress 3');
	const old = [] + f.cells.children; const writes = f.geometry_writes;
	// Existing stored food can exceed a newly zero grid. It must not produce
	// negative progress or create substitute columns/cells.
	f.render(0, 2, 7, 3);
	test.assert(#sizeof(f.cells.children) == 0);
	for (cell of old) { test.assert(cell.is_removed()); }
	test.assert(f.geometry_writes == writes, 'Zero columns must not calculate/write cell geometry');
	test.assert(f.progress == [3, 0] && f.label.text == 'Progress 0');
	f.render(3, 2, 1, 2);
	test.assert(#sizeof(f.cells.children) == 6 && f.label.text == 'Progress 3');
	test.assert(f.cells.children[0].class == 'zero-grid-cell-full');
	test.assert(f.cells.children[1].class == 'zero-grid-cell-pending');
	test.assert(f.cells.children[5].class == 'zero-grid-cell-empty');
	for (cell of f.cells.children) { test.assert(!cell.is_removed()); }
	f.view.root.remove();
});

behavior.scenario('zero columns always forward zero progress for positive stagnant and negative pending', () => {
	const f = fixture(); f.watch_geometry('zero-grid-cell');
	for (pending of [3, 0, (0 - 2)]) {
		f.render(2, 2, 1, 1);
		const old = [] + f.cells.children; const writes = f.geometry_writes;
		f.render(0, 2, 7, pending);
		test.assert(#sizeof(f.cells.children) == 0 && f.geometry_writes == writes);
		for (cell of old) { test.assert(cell.is_removed()); }
		test.assert(f.progress[#sizeof(f.progress) - 1] == 0 && f.label.text == 'Progress 0');
	}
	f.view.root.remove();
});

behavior.scenario('actual nutrient section keeps zero columns and its existing label policies', () => {
	const f = fixture();
	const p = {}; p.body = f.view.root; p.ui = f.view.ui;
	p.utils = { set_cells: (width, height, columns, rows, filled, pending, cells, cls, label, format) => {
		f.columns :+ columns;
		screen.set_cells(width, height, columns, rows, filled, pending, cells, cls, label, (progress) => {
			f.progress :+ progress;
			return format(progress);
		});
	} };
	nutrients.init(p);
	f.watch_geometry('base-screen-nutrients-cell');
	nutrients.set({ columns: 4, rows: 2, filled: 1, pending: 3 });
	test.assert(#sizeof(nutrients.growth_cells.children) == 8 && nutrients.growth_label.text == 'Growth: 3 turns');
	const old = [] + nutrients.growth_cells.children;
	for (pending of [3, 0, (0 - 2)]) {
		const writes = f.geometry_writes;
		const data = { columns: 0, rows: 2, filled: 7, pending: pending };
		nutrients.set(data);
		test.assert(data.columns == 0 && f.columns[#sizeof(f.columns) - 1] == 0, 'Exact zero reaches actual set_cells');
		test.assert(#sizeof(nutrients.growth_cells.children) == 0 && f.geometry_writes == writes);
		test.assert(f.progress[#sizeof(f.progress) - 1] == 0);
		const expected = pending > 0 ? 'Growth: 0 turns' : (pending < 0 ? 'Hunger!' : 'Growth: -stagnant-');
		test.assert(nutrients.growth_label.text == expected, 'The caller retains its positive/zero/negative pending label policy');
	}
	for (cell of old) { test.assert(cell.is_removed()); }
	nutrients.set({ columns: 2, rows: 3, filled: 1, pending: 0 });
	test.assert(#sizeof(nutrients.growth_cells.children) == 6 && nutrients.growth_label.text == 'Growth: -stagnant-');
	f.view.root.remove();
});
