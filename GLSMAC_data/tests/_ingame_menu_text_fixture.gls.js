// Explicit synthetic installed input for existing UI regressions. No original
// labels, row conditions, command bindings or parity answers live here.
const declarations = (game_labels) => {
	let source = '';
	for (spec of [['GAME', 'Game', 13], ['HQ', 'HQ', 17], ['NETWORK', 'Network', 9], ['MAP', 'Map', 21],
		['ACTION', 'Action', 31], ['TERRAFORM', 'Terraform', 10], ['SCENARIO', 'Scenario', 28], ['EDITOR', 'Edit Map', 29], ['HELP', 'Help', 22]]) {
		const title = spec[0] == 'GAME' && #is_defined(game_labels) ? game_labels.title : spec[1];
		source += '#' + spec[0] + '\n&' + title + '\n';
		for (let index = 0; index < spec[2]; index++) {
			let text = 'Fixture ' + spec[0] + ' row ' + #to_string(index);
			if (spec[0] == 'GAME' && index == 11) { text = #is_defined(game_labels) ? game_labels.restart : 'Start New Game'; }
			if (spec[0] == 'GAME' && index == 12) { text = #is_defined(game_labels) ? game_labels.quit : 'Quit'; }
			source += text + '|Odd+Key\n';
		}
	}
	return source + '#END\n';
};
return (name, format, game_labels) => {
	if (name == 'menu.txt' && format == 'menus') { return test.parse_smac_text(declarations(game_labels), format); }
	if (name == 'alphax.txt' && format == 'rules') {
		let source = '#TERRAIN\n';
		for (let index = 0; index < 20; index++) { source += 'Land ' + #to_string(index) + ',None,Sea ' + #to_string(index) + ',None,4,Change $STR0,q,Q\n'; }
		return test.parse_smac_text(source + '#END\n', format);
	}
	throw Error('Undeclared in-game regression source: ' + name);
};
