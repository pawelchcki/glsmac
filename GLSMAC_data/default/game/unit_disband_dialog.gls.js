// The recorded ordinary-disband dialog uses common Script, not expansion text.
return (glsmac, unit_name) => {
	let caption = null; const lines = [];
	for (record of glsmac.load_smac_text('script.txt', 'dialogs').dialog('DISBAND2').records) {
		if (record.kind == 'text') { lines :+ record.text; }
		else if (record.kind == 'directive') {
			if (record.name == 'caption') { if (caption != null) { throw Error('Duplicate DISBAND2 caption'); } caption = record.argument; }
			else if (record.name != 'x' && record.name != 'y' && record.name != 'xs' && record.name != 'wave') { throw Error('Unsupported DISBAND2 directive'); }
		} else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported DISBAND2 record'); }
	}
	if (caption == null || #sizeof(lines) != 4) { throw Error('Incomplete DISBAND2 definition'); }
	for (text of [caption] + lines) {
		if (#typeof(text) != 'String' || #trim(text) == '') { throw Error('Empty DISBAND2 text'); }
		for (marker of ['^', '|', '{', '}']) { if (#sizeof(#split(text, marker)) != 1) { throw Error('Unsupported DISBAND2 formatting'); } }
	}
	for (plain of [caption, lines[1], lines[2], lines[3]]) { if (#sizeof(#split(plain, '$')) != 1) { throw Error('Unsupported DISBAND2 label placeholder'); } }
	// Only the observed unit-type token is supported. Its value comes from the
	// actual selected native definition, never from source text or a fixture.
	let body = ''; let index = 0;
	for (word of #split(lines[0], ' ')) {
		if (index > 0) { body = body + ' '; }
		if (word == '$UNITTYPE0' || word == '$UNITTYPE0?') {
			if (#typeof(unit_name) != 'String' || #trim(unit_name) == '') { throw Error('Missing actual Disband unit name'); }
			body = body + unit_name + (word == '$UNITTYPE0?' ? '?' : '');
		} else { if (#sizeof(#split(word, '$')) != 1) { throw Error('Unsupported DISBAND2 body placeholder'); } body = body + word; }
		index++;
	}
	// Materialize array references before passing values to typed native UI
	// properties. GSE array slots are references, unlike ordinary JS values.
	return {caption: caption, body: body, choices: [lines[1] + '', lines[2] + '', lines[3] + '']};
};
