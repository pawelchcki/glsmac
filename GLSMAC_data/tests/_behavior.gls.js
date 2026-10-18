// Counts actual native assertions and names scenarios without mocking game rules.
const state = { assertions: 0, scenarios: 0, names: [] };
const native_assert = test.assert;
test.assert = (condition, reason) => {
	state.assertions = state.assertions + 1;
	const message = #typeof(reason) == 'String' ? reason : '';
	native_assert(condition, message);
};

return {
	scenario: (name, callback) => {
		native_assert(#typeof(name) == 'String' && name != '', 'Scenario requires a name');
		for (previous of state.names) {
			native_assert(previous != name, 'Duplicate scenario: ' + name);
		}
		state.names :+ name;
		#print('BEHAVIOR_BEGIN ' + name);
		callback();
		state.scenarios = state.scenarios + 1;
		#print('BEHAVIOR_PASS ' + name);
	},
	finish: () => {
		// Older regression scripts contain assertions without named scenarios.
		const scenarios = state.scenarios > 0 ? state.scenarios : 1;
		#print('BEHAVIOR_SUMMARY ' + #to_string(scenarios) + ' ' + #to_string(state.assertions));
	},
};
