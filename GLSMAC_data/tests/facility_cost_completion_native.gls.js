const behavior = #include('./_behavior');
const fixture = #include('./_facility_cost_fixture');

for (entry of [[1, 36], [2, 40], [3, 40], [4, 40], [0, 32]]) {
	behavior.scenario('native completion and rollback agree with explicit preset cost ' + #to_string(entry[0]), () => {
		const f = fixture(entry[0]);
		f.with_write(() => { f.base.select_production('OBSERVED_TANKS'); });
		f.set_turn(2);
		f.with_write(() => { f.base.process_production(2, entry[1] - 1); });
		test.assert(!f.base.has_facility('OBSERVED_TANKS'), 'A facility cannot complete below the observed preset threshold');
		test.assert(f.base.get_production() == { choice_id: 'OBSERVED_TANKS', minerals: entry[1] - 1, last_processed_turn: 2 });
		const before = f.snapshot();
		f.set_turn(3);
		let receipt = null;
		f.with_write(() => { receipt = f.base.process_production(3, 6); });
		test.assert(f.base.has_facility('OBSERVED_TANKS') && f.base.get_production() == { choice_id: '', minerals: 5, last_processed_turn: 3 });
		f.with_write(() => { f.base.restore_production(receipt.previous, receipt.added_facility); });
		f.set_turn(2);
		test.assert(!f.base.has_facility('OBSERVED_TANKS') && f.snapshot() == before);
	});
}
