// Minimal equivalent source inputs, independent of recorded original answers.
const make = #include('./_faction_text_fixture');
const social = {hive: 'SOCIAL,+GROWTH,SOCIAL,+INDUSTRY', spartans: 'SOCIAL,-INDUSTRY',
	cyborg: 'SOCIAL,-GROWTH', pirates: 'SOCIAL,-GROWTH', drone: 'SOCIAL,++INDUSTRY',
	fungboy: 'SOCIAL,-INDUSTRY', usurper: 'SOCIAL,+GROWTH'};
const overrides = {};
overrides['growth-positive'] = [2, (0 - 3), 10, 10];
overrides['industry-positive'] = [(0 - 3), 4, 10, 10];
overrides['rules-a'] = [0, 0, 17, 23]; overrides['rules-b'] = [0, 0, 23, 17];
const signed = (value, name) => {
	let result = 'SOCIAL,'; const magnitude = value < 0 ? 0 - value : value;
	for (let index = 0; index < magnitude; index++) { result += value < 0 ? '-' : '+'; }
	return result + name;
};
return (profile) => {
	const f = make('default'); let nutrient = 10; let mineral = 10;
	for (entry of #include('../default/factions').source_catalog()) {
		const filename = entry.file + '.txt'; const lines = #split(f.sources[filename], '\n');
		lines[2] = #is_defined(social[entry.file]) ? social[entry.file] + '' : 'TECH,Synthetic';
		if (entry.file == 'cyborg' && profile != 'default') {
			const values = overrides[profile]; let pairs = 'TECH,Synthetic';
			for (index of [0, 1]) { if (values[index] != 0) { pairs += ',' + signed(values[index], index == 0 ? 'GROWTH' : 'INDUSTRY'); } }
			lines[2] = pairs; nutrient = values[2]; mineral = values[3];
		}
		let source = ''; for (line of lines) { source += line + '\n'; } f.sources[filename] = source;
	}
	f.sources['alphax.txt'] = '#RULES\n3\n2\n3,2\n2\n8\n' + #to_string(nutrient) + '\n' + #to_string(mineral) + '\n' + f.sources['alphax.txt'];
	f.reload(); return f;
};
