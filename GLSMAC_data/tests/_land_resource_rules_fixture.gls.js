// Equivalent installed input records. No yield answers are embedded.
return (profile) => {
	const changed = profile == 'altered';
	let source = '#RULES\n';
	for (let row = 0; row < 58; row++) {
		let value = '0';
		if (row == 8) { value = changed ? '0' : '1'; }
		if (row == 9) { value = changed ? '0' : '-1'; }
		if (row >= 53 && row <= 55) { value = 'SyntheticCap'; }
		if (row == 57) { value = 'SyntheticSeaMining'; }
		source += value + '\n';
	}
	source += '#RESOURCEINFO\n' +
		'Ocean,1,0,0,0\nBase,2,1,1,0\nBonus,2,2,2,0\n' +
		(changed ? 'Forest,2,3,2,0\n' : 'Forest,1,2,1,0\n') +
		'Tanks,1,1,1,0\n' + (changed ? 'Land,2,*,*,0\n' : 'Land,1,*,*,0\n') +
		(changed ? 'Improved Sea,3,2,4,0\n' : 'Improved Sea,2,1,3,0\n') + 'Monolith,2,2,2,0\n' +
		(changed ? 'Borehole,0,7,8,0\n' : 'Borehole,0,6,6,0\n') + '#END\n';
	return test.parse_smac_text(source, 'rules');
};
