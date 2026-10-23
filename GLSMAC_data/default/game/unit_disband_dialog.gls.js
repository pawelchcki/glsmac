// Recorded free and owned-city Disband dialogs both use common Script.
return (glsmac, unit_name, recycling) => {
	const marker = recycling == true ? 'DISBAND' : 'DISBAND2';
	const count = recycling == true ? 2 : 3;
	let caption = null; const lines = [];
	for (record of glsmac.load_smac_text('script.txt', 'dialogs').dialog(marker).records) {
		if (record.kind == 'text') { lines :+ record.text; }
		else if (record.kind == 'directive') {
			if (record.name == 'caption') { if (caption != null) { throw Error('Duplicate DISBAND2 caption'); } caption = record.argument; }
			else if (record.name != 'x' && record.name != 'y' && record.name != 'xs' && record.name != 'wave') { throw Error('Unsupported DISBAND2 directive'); }
		} else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported DISBAND2 record'); }
	}
	if (caption == null || #sizeof(lines) != count + 1) { throw Error('Incomplete DISBAND2 definition'); }
	for (text of [caption] + lines) {
		if (#typeof(text) != 'String' || #trim(text) == '') { throw Error('Empty DISBAND2 text'); }
		for (format_marker of ['^', '|', '{', '}']) { if (#sizeof(#split(text, format_marker)) != 1) { throw Error('Unsupported Disband formatting'); } }
	}
	const choices = []; for (let choice_index = 1; choice_index < #sizeof(lines); choice_index++) { const label = lines[choice_index] + ''; choices :+ label; }
	for (plain of [caption] + choices) { if (#sizeof(#split(plain, '$')) != 1) { throw Error('Unsupported DISBAND2 label placeholder'); } }
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
	return {caption: caption, body: body, choices: choices};
};
