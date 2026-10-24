const behavior = #include('./_behavior');
const parameters = {
	faction_id: 1, target_id: 5, difficulty: 0, turn: 1, map_area_sqrt: 40,
	saved_earned_techs: 0, research_ranking: 0, research_rating: 0,
	discovery_rate_percent: 100, faction_cost_percent: 100, stagnation: false,
};
const rejects = (callback) => {
	let rejected = false; try { callback(); } catch { : (error) => { rejected = true; } }
	test.assert(rejected);
};
behavior.scenario('native cost queries use explicit counters without granting or counting ownership', () => {
	const f = test.founding_fixture(); const table = f.game.technologies;
	const before = table.get(5); test.assert(table.human_research_cost(parameters) == 9);
	f.with_write(() => { table.set(5, [(0 - 1), (0 - 1)], 255, [0, 0, 0, 0]); });
	test.assert(table.human_research_cost(parameters) == 9);
	const increased = #clone(parameters); increased.saved_earned_techs = 4;
	test.assert(table.human_research_cost(increased) == 45 && table.has_tech(5, 1));
	const retained = table.get(5); test.assert(retained[1] == 255 && before[1] == 0);
});
behavior.scenario('native bindings retain integer-order and difficulty boundary observations', () => {
	const table = test.founding_fixture().game.technologies;
	const data = #clone(parameters); data.faction_id = 7; data.target_id = 78;
	data.difficulty = 3; data.turn = 9; data.map_area_sqrt = 27;
	data.saved_earned_techs = 7; data.research_ranking = 12; data.research_rating = (0 - 3);
	data.discovery_rate_percent = 125; data.faction_cost_percent = 65; data.stagnation = true;
	test.assert(table.human_research_cost(data) == 172);
	const difficulty = #clone(parameters); difficulty.map_area_sqrt = 56; difficulty.saved_earned_techs = 8;
	difficulty.difficulty = 5; test.assert(table.human_research_cost(difficulty) == 224);
	const disabled = #clone(parameters); disabled.discovery_rate_percent = 0;
	test.assert(table.human_research_cost(disabled) == 999999999);
});
behavior.scenario('cost query rejects missing fields foreign identities and noninteger values', () => {
	const table = test.founding_fixture().game.technologies;
	for (bad of [null, [], {}, parameters + {unexpected: 1}]) { rejects(() => { table.human_research_cost(bad); }); }
	for (key in parameters) {
		if (key != 'stagnation') {
			for (wrong of [true, 1.0, '1', null]) {
				const data = #clone(parameters); data[key] = wrong; rejects(() => { table.human_research_cost(data); });
			}
		}
	}
	const boolean = #clone(parameters); boolean.stagnation = 1; rejects(() => { table.human_research_cost(boolean); });
	for (identity of [['faction_id', 0], ['faction_id', 8], ['target_id', (0 - 1)], ['target_id', 89]]) {
		const data = #clone(parameters); data[identity[0]] = identity[1]; rejects(() => { table.human_research_cost(data); });
	}
});
behavior.scenario('cost query rejects wide integers before narrowing without mutating native state', () => {
	const f = test.founding_fixture(); const before = f.research_snapshot('current');
	test.assert(4294967296 == 2147483647 + 2147483647 + 2);
	for (key in parameters) {
		if (key != 'stagnation') {
			const data = #clone(parameters); data[key] = 4294967296;
			rejects(() => { f.game.technologies.human_research_cost(data); });
		}
	}
	test.assert(f.research_snapshot('current') == before);
});
