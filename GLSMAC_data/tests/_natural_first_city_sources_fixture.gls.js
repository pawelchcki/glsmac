// Normalized stock bonus INPUT tokens. The native production consumers decide
// which tokens they support; this fixture supplies no city or resource answers.
const make = #include('./_faction_ratings_fixture');
const pairs = {
	GAIANS: 'TECH,Ecology,SOCIAL,-MORALE,SOCIAL,-POLICE,SOCIAL,++EFFIC,SOCIAL,+PLANET,FUNGNUTRIENT,1',
	HIVE: 'TECH,DocLoy,FACILITY,4,SOCIAL,+GROWTH,SOCIAL,+INDUSTRY,SOCIAL,--ECONOMY,IMMUNITY,EFFIC',
	UNIV: 'TECH,InfNet,TECH,1,SOCIAL,++RESEARCH,SOCIAL,--PROBE,DRONE,4,FACILITY,8',
	MORGAN: 'TECH,Indust,ENERGY,100,SOCIAL,+ECONOMY,POPULATION,3,COMMERCE,1,SOCIAL,-SUPPORT',
	SPARTANS: 'TECH,Mobile,FREEPROTO,0,SOCIAL,++MORALE,SOCIAL,+POLICE,SOCIAL,-INDUSTRY',
	BELIEVE: 'TECH,Psych,SOCIAL,--RESEARCH,SOCIAL,+PROBE,SOCIAL,++SUPPORT,SOCIAL,-PLANET,FANATIC,0',
	PEACE: 'TECH,Biogen,TALENT,4,SOCIAL,-EFFIC,POPULATION,-2,VOTES,2',
};
const files = {GAIANS: 'gaians', HIVE: 'hive', UNIV: 'univ', MORGAN: 'morgan',
	SPARTANS: 'spartans', BELIEVE: 'believe', PEACE: 'peace'};
return (input) => {
	const f = make('default');
	for (key in files) {
		const file = files[key] + '.txt'; const lines = #split(f.sources[file], '\n');
		let bonuses = pairs[key] + '';
		if ((key == 'GAIANS' && input.text_profile == 'gaian-physics') ||
			(key == 'UNIV' && input.text_profile == 'univ-ecology')) {
			// Change only the selected concrete TECH token; all other pairs survive.
			const tokens = #split(bonuses, ',');
			tokens[1] = key == 'GAIANS' ? 'Physic' : 'Ecology';
			bonuses = ''; let first = true;
			for (token of tokens) { if (!first) { bonuses += ','; } bonuses += token; first = false; }
		}
		lines[2] = bonuses;
		let source = ''; for (line of lines) { source += line + '\n'; }
		f.sources[file] = source;
	}
	f.reload(); return f;
};
