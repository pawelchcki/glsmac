// Populated Base snapshots use the real native codecs and a fresh receiving
// registry. WORKER is the definition ID; Worker is its display name. Synthetic
// render metadata and explicit variants avoid assets and uncontrolled draws.
const behavior = #include('./_behavior');

const inspect_pops = (base) => {
	const result = [];
	for (pop of base.get_pops()) {
		const pop_base = pop.get_base();
		result :+ { id: pop.id, type: pop.get_type(), variant: pop.variant, base_id: pop_base.id };
	}
	return result;
};

for (variant of [0, 1]) {
	behavior.scenario('populated Base snapshot restores WORKER ID variant ' + #to_string(variant) + ' and receiving parent', () => {
		const source = test.production_fixture();
		source.add_worker(variant);
		source.with_write(() => { source.base.select_production('RECYCLING_TANKS'); });
		source.set_turn(2);
		source.with_write(() => { source.base.process_production(2, 17); });
		const before = inspect_pops(source.base);
		test.assert(before == [{ id: 1, type: 'WORKER', variant: variant, base_id: 1 }]);
		const snapshot = source.snapshot();
		const target = test.production_fixture();
		target.restore(snapshot);
		test.assert(inspect_pops(target.base) == before);
		test.assert(target.base.get_production() == source.base.get_production());
		test.assert(target.snapshot() == snapshot);
		// The receiving Base must be the native parent: changing type under its
		// write scope must succeed while the source Game remains read-only.
		target.with_write(() => {
			target.game.bm.define_pop('DOCTOR', {
				name: 'Doctor', tile_worker: false,
				renders_human: [{ type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 }],
				renders_progenitor: [{ type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 }],
			});
			const pops = target.base.get_pops();
			pops[0].set_type('DOCTOR');
		});
		test.assert(inspect_pops(target.base) == [{ id: 1, type: 'DOCTOR', variant: variant, base_id: 1 }]);
		test.assert(inspect_pops(source.base) == before);
	});
}

behavior.scenario('populated completed Base snapshot survives source reset and retains next population ID', () => {
	const source = test.production_fixture();
	source.add_worker(1);
	source.with_write(() => { source.base.select_production('RECYCLING_TANKS'); });
	source.set_turn(2);
	source.with_write(() => { source.base.process_production(2, 35); });
	const snapshot = source.snapshot();
	const target = test.production_fixture();
	target.restore(snapshot);
	source.reset();
	test.assert(target.snapshot() == snapshot);
	test.assert(target.base.has_facility('RECYCLING_TANKS') && target.base.has_facility('HEADQUARTERS'));
	target.add_worker(0);
	test.assert(inspect_pops(target.base) == [
		{ id: 1, type: 'WORKER', variant: 1, base_id: 1 },
		{ id: 2, type: 'WORKER', variant: 0, base_id: 1 },
	]);
	test.assert(target.base.get_production() == { choice_id: '', minerals: 3, last_processed_turn: 2 });
});

behavior.scenario('unknown populated snapshot definition leaves the receiving Base untouched', () => {
	const source = test.production_fixture();
	source.add_worker(1);
	const target = test.production_fixture();
	target.add_worker(0);
	const before = target.snapshot();
	let rejected = false;
	try { target.restore(source.corrupt_snapshot('unknown_pop')); }
	catch { GSEInvalidCall: (e) => { rejected = true; } }
	test.assert(rejected && target.snapshot() == before);
	test.assert(inspect_pops(target.base) == [{ id: 1, type: 'WORKER', variant: 0, base_id: 1 }]);
});
