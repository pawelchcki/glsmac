// The first two controls reproduce the observed duplicate-Gaia text collision.
// Additional collision/length/codec controls are GLSMAC application invariants.
const behavior = #include('./_behavior');
const fixture = #include('./_duplicate_faction_identity_fixture');
const gaian = ['Deirdre', 'Gaia\'s Stepdaughters', 'Gaians', 'Gaian', 'Lady', 'beautiful'];
const ids = ['GAIANS', 'GAIANS', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
for (leader of ['Deirdre', 'Trace Commander']) {
	const name = leader;
	behavior.scenario('All seven participant identities retain observed duplicate-Gaia ' + name + ' control', () => {
		const authored = #clone(gaian); authored[0] = name;
		const f = fixture({human: authored}); const players = f.game.get_players();
		test.assert(#sizeof(players) == 7);
		for (let index = 0; index < 7; index++) {
			const expected = #clone(f.sources[ids[index]]);
			if (index == 0) { expected[0] = name; }
			if (index == 1) {
				expected[0] = name == 'Deirdre' ? 'Deirdre-2' : 'Deirdre';
				expected[1] = 'Gaia\'s Stepdaughters-2'; expected[2] = 'Gaians-2';
			}
			const actual = players[index].get_faction();
			test.assert(players[index].id == index && actual.id == ids[index]);
			test.assert(actual.identity == expected, 'Compare all six actual strings of every human/opponent');
			test.assert(actual.name == expected[1] && players[index].type == (index == 0 ? 'human' : 'computer'));
		}
		f.assert_catalog(); test.assert(f.participant_codec_invariant());
		test.assert(#sizeof(f.game.bm.get_bases()) == 0, 'Identity naming precedes world placement and economy');
	});
}

behavior.scenario('Each colliding text field is resolved independently of untouched human edits', () => {
	const authored = #clone(gaian); authored[0] = 'Aster'; authored[2] = 'Starfolk';
	const f = fixture({human: authored}); const players = f.game.get_players();
	test.assert(players[0].get_faction().identity == authored);
	const expected = #clone(gaian); expected[1] = gaian[1] + '-2';
	test.assert(players[1].get_faction().identity == expected);
	f.assert_catalog();
});

behavior.scenario('Seven same-faction participants get independent collision strings and preserve mechanics', () => {
	const roster = ['GAIANS', 'GAIANS', 'GAIANS', 'GAIANS', 'GAIANS', 'GAIANS', 'GAIANS'];
	const f = fixture({roster: roster}); const players = f.game.get_players();
	for (let index = 0; index < 7; index++) {
		const expected = #clone(gaian);
		if (index > 0) { for (field of [0, 1, 2]) { expected[field] = expected[field] + '-' + #to_string(index + 1); } }
		const faction = players[index].get_faction();
		test.assert(faction.identity == expected && faction.id == 'GAIANS');
		test.assert(faction.starting_technologies == ['Ecology'] && faction.social_ratings == {growth: 0, industry: 0});
	}
	f.assert_catalog(); test.assert(f.participant_codec_invariant());
});

behavior.scenario('An authored suffix reserves only its actual field value and generated names skip collisions', () => {
	const authored = #clone(gaian); authored[0] = 'Deirdre-2';
	const f = fixture({human: authored, roster: ['GAIANS', 'GAIANS', 'GAIANS', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS']});
	const players = f.game.get_players();
	test.assert(players[0].get_faction().identity[0] == 'Deirdre-2');
	test.assert(players[1].get_faction().identity[0] == 'Deirdre');
	test.assert(players[2].get_faction().identity[0] == 'Deirdre-3');
	test.assert(players[1].get_faction().identity[1] == gaian[1] + '-2' && players[2].get_faction().identity[1] == gaian[1] + '-3');
	f.assert_catalog();
});

behavior.scenario('Long valid input fields remain bounded when collision suffixes are appended', () => {
	const text = ['abcdefghijklmnopqrstuvw', 'abcdefghijklmnopqrstuvwxyzabcdefghijklm', 'ABCDEFGHIJKLMNOPQRSTUVW', 'Gaian', 'Lady', 'beautiful'];
	const overrides = {}; overrides.GAIANS = text;
	const f = fixture({identities: overrides, human: text}); const players = f.game.get_players();
	test.assert(players[0].get_faction().identity == text);
	const identity = players[1].get_faction().identity;
	test.assert(identity == ['abcdefghijklmnopqrstu-2', 'abcdefghijklmnopqrstuvwxyzabcdefghijk-2', 'ABCDEFGHIJKLMNOPQRSTU-2', 'Gaian', 'Lady', 'beautiful']);
	f.assert_catalog(); test.assert(f.participant_codec_invariant());
});

behavior.scenario('Empty editable names remain empty without invented collision strings', () => {
	const text = ['', 'Gaia\'s Stepdaughters', '', 'Gaian', 'Lady', 'beautiful'];
	const overrides = {}; overrides.GAIANS = text;
	const f = fixture({identities: overrides, human: text}); const players = f.game.get_players();
	test.assert(players[0].get_faction().identity == text);
	test.assert(players[1].get_faction().identity == ['', 'Gaia\'s Stepdaughters-2', '', 'Gaian', 'Lady', 'beautiful']);
	f.assert_catalog();
});

behavior.scenario('Byte-bounded collision fallback keeps complete UTF-8 names and does not alter source text', () => {
	const text = ['éééééééééééZ', 'Gaia\'s Stepdaughters', 'Gaians', 'Gaian', 'Lady', 'beautiful'];
	const overrides = {}; overrides.GAIANS = text;
	const f = fixture({identities: overrides, human: text}); const players = f.game.get_players();
	test.assert(players[0].get_faction().identity == text);
	test.assert(players[1].get_faction().identity[0] == 'éééééééééé-2');
	f.assert_catalog(); test.assert(f.participant_codec_invariant());
});

behavior.scenario('Distinct faction IDs still resolve actual colliding names without merging faction mechanics', () => {
	const overrides = {}; overrides.HIVE = gaian;
	const roster = ['GAIANS', 'HIVE', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
	const f = fixture({identities: overrides, roster: roster}); const players = f.game.get_players();
	const expected = #clone(gaian); for (field of [0, 1, 2]) { expected[field] = expected[field] + '-2'; }
	test.assert(players[1].get_faction().identity == expected && players[1].get_faction().id == 'HIVE');
	test.assert(players[1].get_faction().social_ratings == {growth: 1, industry: 1});
	test.assert(players[0].get_faction().identity == gaian && players[0].get_faction().social_ratings == {growth: 0, industry: 0});
	f.assert_catalog();
});
