const behavior = #include('./_behavior');
const fixture = #include('./_technology_rules_fixture');
const consumer = #include('../default/game/technology_rules');
const rejects = (callback) => {
	let failed = false; try { callback(); } catch { : (error) => { failed = true; } }
	test.assert(failed, 'Invalid source must reject before native mutation');
};

behavior.scenario('installed technology rows retain source IDs tokens flags and reordered AI weights', () => {
	const rows = fixture.rows(); const document = test.parse_smac_text(fixture.source(rows), 'rules');
	const definitions = consumer.parse(document);
	test.assert(#sizeof(definitions) == 89 && definitions[0].id == 0 && definitions[88].id == 88);
	test.assert(definitions[0].token == 'Ecology' && definitions[0].name == 'Synthetic 0' && definitions[0].weights == [1, 2, 3, 4]);
	test.assert(definitions[3].prerequisites == [0, 1] && definitions[6].prerequisites == [(0 - 2), (0 - 1)]);
	test.assert(definitions[4].prerequisites == [5, (0 - 1)] && definitions[5].prerequisites == [4, (0 - 1)]);
	test.assert(definitions[7].token == 'Long=Token' && definitions[8].prerequisites == [7, (0 - 1)]);
	definitions[0].weights[0] = 99;
	const again = consumer.parse(document);
	test.assert(again[0].weights == [1, 2, 3, 4] && document.rows('TECHNOLOGY') == rows);
});

behavior.scenario('source numeric boundaries whitespace and signed AI preferences remain data', () => {
	const rows = fixture.rows(); rows[88] = ['  Altered  ', ' Tail ', '-32768', '32767', '-2', '0', ' None ', ' Disable ', '101010101'];
	const definitions = consumer.parse(test.parse_smac_text(fixture.source(rows), 'rules'));
	test.assert(definitions[88].name == 'Altered' && definitions[88].token == 'Tail' && definitions[88].flags == '101010101');
	test.assert(definitions[88].weights == [0, 32767, (0 - 2), (0 - 32768)] && definitions[88].prerequisites == [(0 - 1), (0 - 2)]);
});

for (bad of ['count', 'columns', 'empty-name', 'duplicate-token', 'reserved-token', 'unknown-prerequisite', 'late-weight', 'decimal-weight',
	'short-flags', 'long-flags', 'invalid-flags']) {
	const kind = bad;
	behavior.scenario('whole source rejects malformed ' + kind, () => {
		const rows = fixture.rows();
		if (kind == 'count') { rows :+ rows[0]; }
		if (kind == 'columns') { rows[88] :+ 'extra'; }
		if (kind == 'empty-name') { rows[88][0] = ' '; }
		if (kind == 'duplicate-token') { rows[88][1] = 'Ecology'; }
		if (kind == 'reserved-token') { rows[88][1] = 'None'; }
		if (kind == 'unknown-prerequisite') { rows[88][7] = 'Missing'; }
		if (kind == 'late-weight') { rows[88][5] = '32768'; }
		if (kind == 'decimal-weight') { rows[88][2] = '1.0'; }
		if (kind == 'short-flags') { rows[88][8] = '00000000'; }
		if (kind == 'long-flags') { rows[88][8] = '0000000000'; }
		if (kind == 'invalid-flags') { rows[88][8] = '00000000X'; }
		rejects(() => { consumer.parse(test.parse_smac_text(fixture.source(rows), 'rules')); });
	});
}

behavior.scenario('actual native table imports source definitions and independent faction ownership', () => {
	const f = test.rules_fixture(); const definitions = fixture.parse();
	const planned = consumer.plan(definitions, [fixture.player(0, ['Ecology', 'Ecology']), fixture.player(6, ['Physic', 'Ecology'])]);
	f.technologies.replace(planned);
	test.assert(f.game.technologies.has_tech(0, 1) && f.game.technologies.has_tech(0, 7) && !f.game.technologies.has_tech(0, 0));
	test.assert(!f.game.technologies.has_tech(1, 1) && f.game.technologies.has_tech(1, 7));
	test.assert(!f.game.technologies.available(3, 1, true) && f.game.technologies.available(3, 7, true));
	test.assert(f.game.technologies.category(0) == 3 && f.game.technologies.is_prerequisite(0, 3, 1));
	test.assert(!f.game.technologies.available(6, 7, true) && !f.game.technologies.available(4, 7, true));
	test.assert(f.technologies.get(0) == [[(0 - 1), (0 - 1)], 130, [1, 2, 3, 4]]);
	const detached = f.technologies.get(0); detached[1] = 0; detached[2][3] = 99; planned[0][1] = 0;
	const retained = f.technologies.get(0);
	test.assert(retained[1] == 130 && f.game.technologies.category(0) == 3);
	const receiving = test.rules_fixture(); receiving.restore(f.snapshot());
	test.assert(receiving.snapshot() == f.snapshot() && receiving.game.technologies.available(3, 7, true));
});

behavior.scenario('invalid player mapping and unknown initial technologies cannot modify native ownership', () => {
	const f = test.rules_fixture(); const before = f.snapshot(); const definitions = fixture.parse();
	for (players of [[fixture.player(7, [])], [fixture.player(true, [])], [fixture.player((0 - 1), [])],
		[fixture.player(0, []), fixture.player(0, [])], [fixture.player(0, ['Missing'])]]) {
		rejects(() => { f.technologies.replace(consumer.plan(definitions, players)); });
		test.assert(f.snapshot() == before);
	}
});

behavior.scenario('late malformed bulk input and read-only replacement preserve all native rows', () => {
	const f = test.rules_fixture(); const planned = consumer.plan(fixture.parse(), []);
	f.technologies.replace(planned); const before = f.snapshot();
	test.assert(f.game.technologies.validate_replacement(planned) && f.snapshot() == before);
	for (kind of ['count', 'row', 'prerequisite', 'owners', 'weights', 'read-only']) {
		const rows = #clone(planned);
		if (kind == 'count') { rows :+ rows[0]; }
		if (kind == 'row') { rows[88] = false; }
		if (kind == 'prerequisite') { rows[88][0][1] = 89; }
		if (kind == 'owners') { rows[88][1] = 256; }
		if (kind == 'weights') { rows[88][2][3] = true; }
		if (kind != 'read-only') { rejects(() => { f.game.technologies.validate_replacement(rows); }); }
		rejects(() => { if (kind == 'read-only') { f.game.technologies.replace(rows); } else { f.technologies.replace(rows); } });
		test.assert(f.snapshot() == before);
	}
});
