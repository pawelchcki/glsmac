// Language flow regressions grounded in types.gls.js/functions.gls.js and the
// interpreter's return flag, not assumptions about JavaScript compatibility.
// Existing types.gls.js checks classic-for return only at a function's end;
// these distinguish a real return from an accidentally retained loop result.
const behavior = #include('./_behavior');

behavior.scenario('classic for return exits its function before the following statement', () => {
	const visits = [];
	const find = () => {
		for (let i = 0; i < 4; i++) {
			visits :+ i;
			if (i == 1) { return 'found'; }
		}
		visits :+ 'after';
		return 'fell through';
	};
	test.assert(find() == 'found');
	test.assert(visits == [0, 1]);
});

behavior.scenario('return does not run another classic for iterator or condition', () => {
	const state = { initialized: 0, conditions: 0, iterated: 0, bodies: 0, after: 0 };
	const init = () => { state.initialized = state.initialized + 1; return 0; };
	const check = (i) => { state.conditions = state.conditions + 1; return i < 3; };
	const step = (i) => { state.iterated = state.iterated + 1; return i + 1; };
	const run = () => {
		for (let i = init(); check(i); i = step(i)) {
			state.bodies = state.bodies + 1;
			return 73;
		}
		state.after = state.after + 1;
		return 99;
	};
	test.assert(run() == 73);
	test.assert(state == { initialized: 1, conditions: 1, iterated: 0, bodies: 1, after: 0 });
});

behavior.scenario('classic for returns false zero and null with their original value types', () => {
	for (value of [false, 0, null]) {
		const run = () => {
			for (let i = 0; i < 2; i++) { return value; }
			return 'fell through';
		};
		const actual = run();
		test.assert(actual == value && #typeof(actual) == #typeof(value));
	}
});

behavior.scenario('bare undefined return inside classic for still exits the function', () => {
	const visits = [];
	const run = () => {
		for (let i = 0; i < 3; i++) { visits :+ i; return; }
		visits :+ 'after';
		return 55;
	};
	test.assert(#typeof(run()) == 'Undefined');
	test.assert(visits == [0]);
});

behavior.scenario('explicit undefined return carries flow independently of its result value', () => {
	const visits = [];
	const run = () => {
		for (let i = 0; i < 3; i++) { visits :+ i; return #undefined; }
		visits :+ 'after';
		return 55;
	};
	test.assert(#typeof(run()) == 'Undefined');
	test.assert(visits == [0]);
});

behavior.scenario('nested classic loops propagate return through both loop bodies', () => {
	const visits = []; const after_inner = [];
	const find = () => {
		for (let outer = 0; outer < 3; outer++) {
			for (let inner = 0; inner < 3; inner++) {
				visits :+ [outer, inner];
				if (outer == 1 && inner == 1) { return 11; }
			}
			after_inner :+ outer;
		}
		return 99;
	};
	test.assert(find() == 11);
	test.assert(visits == [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]]);
	test.assert(after_inner == [0]);
});

behavior.scenario('return crosses mixed while classic and for-of loops without more work', () => {
	const visits = [];
	const find = () => {
		let pass = 0;
		while (pass < 2) {
			pass++;
			for (let index = 0; index < 2; index++) {
				for (value of [4, 5]) {
					visits :+ [pass, index, value];
					if (value == 5) { return 'found'; }
				}
				visits :+ 'after inner';
			}
			visits :+ 'after classic';
		}
		return 'fell through';
	};
	test.assert(find() == 'found');
	test.assert(visits == [[1, 0, 4], [1, 0, 5]]);
});

behavior.scenario('a nested function return does not terminate the calling classic loop', () => {
	const find = () => {
		for (let index = 0; index < 3; index++) { if (index == 1) { return index; } }
		return 99;
	};
	const run = () => {
		const result = [];
		for (let count = 0; count < 3; count++) { result :+ find(); }
		return result;
	};
	test.assert(run() == [1, 1, 1]);
});

behavior.scenario('classic break and continue retain their existing loop-local behavior', () => {
	const visits = []; const after_inner = [];
	const run = () => {
		for (let outer = 0; outer < 3; outer++) {
			for (let inner = 0; inner < 5; inner++) {
				if (inner == 1) { continue; }
				if (inner == 3) { break; }
				visits :+ [outer, inner];
			}
			after_inner :+ outer;
		}
		return 'after loops';
	};
	test.assert(run() == 'after loops');
	test.assert(visits == [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]);
	test.assert(after_inner == [0, 1, 2]);
});
