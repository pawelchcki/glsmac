// Minimal equivalent UI input records. No original faction prose or mechanics.
// These declarations are parser inputs, never recorded expected frames.
const dimensions = #include('./_dimension_text_fixture');
const join_lines = (lines, delimiter) => { let result = ''; let first = true; for (line of lines) { if (!first) { result += delimiter; } result += line; first = false; } return result; };
const world_source = '#WORLDSIZE\n5\nTiny Planet,24,48\nSmall Planet,32,64\nStandard Planet,40,80\nLarge Planet,44,90\nHuge Planet,64,128\n#END\n';
const headers = [{file:'gaians',key:'GAIANS',formal:'Gaia\'s Stepdaughters',role:'The Green',noun:'Gaians',name:'Deirdre',gender:'F',adjective:'Gaian',title:'Lady',description:'beautiful',id:'GAIANS'},{file:'hive',key:'HIVE',formal:'Human Hive',role:'The Despot',noun:'Hive',name:'Yang',gender:'M',adjective:'Hive',title:'Chairman',description:'ruthless',id:'HIVE'},{file:'univ',key:'UNIV',formal:'University of Planet',role:'The Scientist',noun:'University',name:'Zakharov',gender:'M',adjective:'University',title:'Provost',description:'brilliant',id:'UNIVERSITY'},{file:'morgan',key:'MORGAN',formal:'Morgan Industries',role:'The Mogul',noun:'Morganites',name:'Morgan',gender:'M',adjective:'Morganic',title:'CEO',description:'shrewd',id:'MORGANITES'},{file:'spartans',key:'SPARTANS',formal:'Spartan Federation',role:'The Survivalist',noun:'Spartans',name:'Santiago',gender:'F',adjective:'Spartan',title:'Colonel',description:'vigilant',id:'SPARTANS'},{file:'believe',key:'BELIEVE',formal:'The Lord\'s Believers',role:'The Fundamentalist',noun:'Believers',name:'Miriam',gender:'F',adjective:'Believing',title:'Sister',description:'pious',id:'BELIEVERS'},{file:'peace',key:'PEACE',formal:'Peacekeeping Forces',role:'The Humanitarian',noun:'Peacekeepers',name:'Lal',gender:'M',adjective:'Peacekeeper',title:'Brother',description:'humane',id:'PEACEKEEPERS'},{file:'cyborg',key:'CYBORG',formal:'The Cybernetic Consciousness',role:'The Algorithm',noun:'Consciousness',name:'Aki Zeta-5',gender:'F',adjective:'Cybernetic',title:'Prime Function',description:'analytical',id:'CONSCIOUSNESS'},{file:'pirates',key:'PIRATES',formal:'Nautilus Pirates',role:'The Buccaneer',noun:'Pirates',name:'Svensgaard',gender:'M',adjective:'Nautilus',title:'Captain',description:'heroic',id:'PIRATES'},{file:'drone',key:'DRONE',formal:'The Free Drones',role:'The Laborer',noun:'Drones',name:'Domai',gender:'M',adjective:'Free Drone',title:'Foreman',description:'stalwart',id:'DRONES'},{file:'angels',key:'ANGELS',formal:'The Data Angels',role:'The Infogrrrrl',noun:'Angels',name:'Roze',gender:'F',adjective:'Datatech',title:'Datajack',description:'stylish',id:'ANGELS'},{file:'fungboy',key:'FUNGBOY',formal:'The Cult of Planet',role:'The Voice',noun:'Planet Cult',name:'Cha Dawn',gender:'M',adjective:'Cultist',title:'Prophet',description:'charismatic',id:'PLANETCULT'},{file:'caretake',key:'CARETAKE',formal:'Manifold Caretakers',role:'The Conservator',noun:'Caretakers',name:'H\'minee',gender:'F',adjective:'Caretaker',title:'Guardian',description:'insightful',id:'CARETAKERS'},{file:'usurper',key:'USURPER',formal:'Manifold Usurpers',role:'The Insurgent',noun:'Usurpers',name:'Marr',gender:'M',adjective:'Usurper',title:'Conqueror',description:'mighty',id:'USURPERS'}];
return (profile) => {
	const f = dimensions.create('default', world_source);
	const label_values = {};
	label_values['101'] = 'OK'; label_values['102'] = 'Cancel'; label_values['687'] = 'INFO';
	label_values['738'] = 'Male'; label_values['739'] = 'Female';
	label_values['174'] = 'Name:'; label_values['175'] = 'Formal:';
	label_values['176'] = 'Noun:'; label_values['177'] = 'Adjective:';
	label_values['483'] = 'Title'; label_values['484'] = 'Description'; label_values['485'] = 'Gender';
	label_values['1114'] = profile == 'both' ? 'CHOOSE ORBIT CREWS' : 'CHOOSE YOUR FACTIONS';
	label_values['1115'] = 'The Original SMAC Factions'; label_values['1116'] = 'The New Factions';
	label_values['1117'] = 'Mix Old and New Factions'; label_values['1118'] = 'CHANGE NAME';
	label_values['1120'] = 'PLAY RANDOM FACTION'; label_values['1121'] = 'PLAY SELECTED FACTION'; label_values['1122'] = 'RANDOM';
	const lines = #split(f.sources['labels.txt'], '\n');
	for (key in label_values) { const index = #to_int(key) + 2; lines[index] = label_values[key]; }
	f.sources['labels.txt'] = join_lines(lines, '\n');
	let base = '#FACTIONS\n'; let expansion = '#NEWFACTIONS\n'; let index = 0;
	for (original of headers) {
		const row = #clone(original);
		if (profile == 'both' && row.file == 'cyborg') {
			row.name = 'Nova'; row.formal = 'Orbit Guild'; row.role = 'Orbit Agenda'; row.noun = 'Orbiters';
			row.adjective = 'Orbital'; row.title = 'Navigator'; row.description = 'brisk'; row.gender = 'M';
		}
		const source = '#' + row.key + '\n' + row.formal + ',' + row.role + ',' + row.noun + ',M,1,' + row.name + ',' + row.gender + ',0,1,0,0,0\n' +
			'Logo,1,1,1,1\nSynthetic,1\nSynthetic,2\n' + row.adjective + ',adverb,city\n' +
			'Collective,Collective,Collective,Collective\n' + row.title + ',' + row.description + ',technical,phrase\n#END\n';
		f.sources[row.file + '.txt'] = source;
		const record = row.file + ',' + row.key + '\n';
		if (index < 7) { base += record; } else { expansion += record; }
		index++;
	}
	let worlds = ''; for (line of #split(world_source, '\n')) { if (line != '#END') { worlds += line + '\n'; } }
	f.sources['alphax.txt'] = worlds + base + expansion + '#CUSTOMFACTIONS\n#END\n';
	const editor_source = (prefix) => {
		let source = '';
		for (definition of [['NAME', 'Name (Male):'], ['NAME2', 'Name (Female):'], ['NAME3', 'Name:']]) {
			const label = prefix == '' ? definition[1] : prefix + (definition[0] == 'NAME' ? ' Male:' : ' Female:');
			source += '#' + definition[0] + '\n#xs 440\n#caption ' + (prefix == '' ? 'Enter Your Name' : prefix + ' Pilot') + '\n#x -5\n#y -5\n#itemlist\n';
			if (definition[0] != 'NAME3') { source += '#button ' + (prefix == '' ? 'Change Gender' : prefix + ' Style') + '\n'; }
			source += label + '\n';
		}
		return source + '#CUSTOMNAMES\n#xs 440\n#x -5\n#y -5\n#button ' + (prefix == '' ? 'Restore Defaults' : prefix + ' Reset') + '\n#caption ' + (prefix == '' ? 'Customize Your Faction' : prefix + ' Crew') + '\n#END\n';
	};
	const strip_end = (source) => { let result = ''; for (line of #split(source, '\n')) { if (line != '#END') { result += line + '\n'; } } return result; };
	f.sources['script.txt'] = strip_end(f.sources['script.txt']) + editor_source(profile == 'common' || profile == 'both' ? 'Core' : '');
	f.sources['xscript.txt'] = strip_end(f.sources['xscript.txt']) + editor_source(profile == 'expansion' || profile == 'both' ? 'Addon' : '');
	f.reload(); return f;
};
