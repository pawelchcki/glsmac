// Synthetic installed declarations, not stock table bodies or oracle outputs.
const make = () => {
	const rows = [];
	for (let id = 0; id < 89; id++) {
		rows :+ ['Synthetic ' + #to_string(id), 'Token' + #to_string(id), '4', '2', '3', '1', 'None', 'None', '000000000'];
	}
	rows[0][1] = 'Ecology'; rows[1][1] = 'Physic'; rows[2][1] = 'InfNet';
	rows[3][6] = 'Ecology'; rows[3][7] = 'Physic';
	rows[4][6] = 'Token5'; rows[5][6] = 'Token4';
	rows[6][6] = 'Disable'; rows[7][1] = 'Long=Token'; rows[8][6] = 'Long=Token';
	rows[9][1] = 'Synthetic';
	return rows;
};
const source = (rows) => {
	let result = '#TECHNOLOGY\n';
	for (row of rows) {
		let first = true;
		for (field of row) { if (!first) { result += ','; } first = false; result += field; }
		result += '\n';
	}
	return result + '#END\n';
};
return {
	rows: make, source: source,
	parse: () => { return #include('../default/game/technology_rules').parse(test.parse_smac_text(source(make()), 'rules')); },
	player: (slot, tokens) => {
		const faction = {}; faction.starting_technologies = tokens;
		return {id: slot, get_faction: () => { return faction; }};
	},
};
