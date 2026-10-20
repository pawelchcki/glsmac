// Equivalent input TECH pairs, including the two controlled source swaps.
const make = #include('./_faction_ratings_fixture');
return (input) => {
	const f = make('default');
	let gaian = 'Ecology'; let cyborg = 'Physic';
	if (#is_defined(input.profile)) {
		if (input.profile == 'gaian-physics') { gaian = 'Physic'; }
		if (input.profile == 'cyborg-ecology') { cyborg = 'Ecology'; }
	}
	for (entry of [{file: 'gaians.txt', pairs: 'TECH,' + gaian + ',SOCIAL,-MORALE'},
		{file: 'cyborg.txt', pairs: 'TECH,' + cyborg + ',TECH,InfNet,SOCIAL,-GROWTH'}]) {
		const lines = #split(f.sources[entry.file], '\n'); lines[2] = entry.pairs;
		let source = ''; for (line of lines) { source += line + '\n'; }
		f.sources[entry.file] = source;
	}
	f.reload(); return f;
};
