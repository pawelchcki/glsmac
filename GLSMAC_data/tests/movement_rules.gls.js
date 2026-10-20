// Source consumption checks, separate from independently recorded movement.
const behavior = #include('./_behavior');
const consumer = #include('../default/game/movement_rules');
for (rate of [1, 2, 3, 4, 5, 6, 7, 8]) {
	behavior.scenario('installed road movement rate is consumed independently ' + #to_string(rate), () => {
		const source = '#RULES\n ' + #to_string(rate) + ', ; synthetic rate\n99,\n#END\n';
		const document = test.parse_smac_text(source, 'rules');
		const rules = consumer.parse(document); test.assert(rules == {road_rate: rate});
		rules.road_rate = 1; test.assert(consumer.parse(document).road_rate == rate);
	});
}
let index = 0;
for (value of ['0', '-1', '9', '03', '3.0', 'word', '', '999999999999999999999999999999']) {
	behavior.scenario('unsupported road rate is rejected ' + #to_string(index), () => {
		const rows = [[value]]; let caught = false;
		try { consumer.parse({rows: (block) => { return rows; }}); } catch { : (e) => { caught = true; } }
		test.assert(caught);
	}); index++;
}
for (rows of [[], [[]]]) {
	behavior.scenario('missing road rule rejects ' + #to_string(index), () => {
		let caught = false;
		try { consumer.parse({rows: (block) => { return rows; }}); } catch { : (e) => { caught = true; } }
		test.assert(caught);
	}); index++;
}
