// Bounded installed opening text. This consumer does not implement general SMAC
// grammar, inflection or rich-text styling; unknown placeholder forms reject.
const format = (text, fields) => {
	let result = ''; let first = true;
	for (word of #split(text, ' ')) {
		let value = word;
		let substituted = false;
		for (key in fields) { if (word == key) { value = fields[key] + ''; substituted = true; } }
		if (!substituted && word != '') {
			const dollar = #split(word, '$');
			if (#sizeof(dollar) != 1 || dollar[0] != word) { throw Error('Unsupported opening placeholder: ' + word); }
			const separator = #split(word, '|');
			if (#sizeof(separator) != 1 || separator[0] != word) { throw Error('Unsupported opening separator'); }
			// Sentinel preserves an empty suffix: GSE split drops trailing empties.
			const begin = #split(word + '|', '{');
			if (#sizeof(begin) == 2) {
				const end = #split(begin[1], '}');
				if (#sizeof(end) != 2 || end[0] == '') { throw Error('Unbalanced opening emphasis'); }
				const tail = #split(end[1], '|');
				if (#sizeof(tail) != 1) { throw Error('Unsupported opening emphasis'); }
				value = begin[0] + end[0] + tail[0];
			} else {
				const end = #split(word, '}');
				if (#sizeof(begin) != 1 || #sizeof(end) != 1 || end[0] != word) { throw Error('Unsupported opening emphasis'); }
			}
		}
		if (!first) { result += ' '; } first = false; result += value;
	}
	return result;
};
const parse = (document, id, fields) => {
	let caption = null; let button = null; let paragraph = ''; const paragraphs = [];
	for (record of document.dialog(id).records) {
		if (record.kind == 'text') {
			if (record.text == '^') { if (paragraph != '') { paragraphs :+ paragraph; paragraph = ''; } }
			else { if (paragraph != '') { paragraph += ' '; } paragraph += format(record.text, fields); }
		} else if (record.kind == 'directive') {
			if (record.name == 'caption' && caption == null) { caption = format(record.argument, fields); }
			else if (record.name == 'button' && button == null) { button = format(record.argument, fields); }
			else if (record.name != 'xs' && record.name != 'x' && record.name != 'y') { throw Error('Unsupported opening dialog directive: ' + record.name); }
		} else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported opening dialog record'); }
	}
	if (paragraph != '') { paragraphs :+ paragraph; }
	if (#sizeof(paragraphs) == 0) { throw Error('Opening dialog has no body'); }
	const result = {caption: caption, button: button}; result.paragraphs = paragraphs; return result;
};
return {
	format: format,
	parse: parse,
	load: (glsmac, game, base) => {
		const player = game.get_player(); const identity = player.get_faction().identity;
		const fields = {};
		fields['$NAME3'] = player.name + ''; fields['$NAME3,'] = player.name + ',';
		fields['$TITLE2'] = identity[4] + '';
		// This bounded English source form references the supplied adjective.
		// Other grammatical modifiers are deliberately unsupported.
		fields['$<M1:$FACTIONADJ0>'] = identity[3] + '';
		fields['$BASENAME0'] = base.name + ''; fields['$BASENAME0.'] = base.name + '.';
		let unit_name = null;
		for (unit of base.get_tile().get_units()) { if (unit.owner == player.id && unit_name == null) { unit_name = unit.get_def().name + ''; } }
		if (unit_name == null) { throw Error('Opening narrative needs an actual owned unit'); }
		fields['$UNITNAME1'] = unit_name;
		const common = glsmac.load_smac_text('script.txt', 'dialogs');
		const planetfall = parse(common, 'PLANETFALL', fields);
		const name = parse(common, 'FIRSTBASE', fields);
		const tour = parse(glsmac.load_smac_text('tutor.txt', 'dialogs'), 'LANDFALL', fields);
		if (planetfall.caption == null || name.caption == null || tour.button == null || #sizeof(name.paragraphs) != 1) { throw Error('Incomplete installed opening definitions'); }
		const labels = [];
		for (record of glsmac.load_smac_text('labels.txt', 'dialogs').dialog('LABELS').records) { if (record.kind == 'text') { labels :+ record.text; } }
		if (#sizeof(labels) < 104) { throw Error('Missing opening confirmation labels'); }
		return {planetfall: planetfall, name: name, tour: tour, ok: labels[102] + ''};
	},
};
