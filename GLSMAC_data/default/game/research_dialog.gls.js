// Presentation inputs only. Research state, availability and commands are native.
const plain = (value, button) => {
	if (#typeof(value) != 'String' || #trim(value) == '') { throw Error('Empty research source text'); }
	let result = value;
	// Button directives use '&' for a mnemonic. Body text contains literal
	// ampersands (including the Explore priority), which must be retained.
	if (#is_defined(button) && button) {
		result = ''; for (part of #split(value, '&')) { result += part; }
	}
	let displayed = '';
	for (part of #split(result, '^')) { if (displayed != '') { displayed += ' '; } displayed += part; }
	return #trim(displayed);
};
const block = (document, name, lines, buttons) => {
	let caption = null; const text = []; const extra = [];
	for (record of document.dialog(name).records) {
		if (record.kind == 'text') { text :+ plain(record.text); }
		else if (record.kind == 'directive') {
			if (record.name == 'caption') { if (caption != null) { throw Error('Duplicate research caption'); } caption = plain(record.argument); }
			else if (record.name == 'button') { extra :+ plain(record.argument, true); }
			else if (record.name != 'xs' && record.name != 'x' && record.name != 'y' && record.name != 'wave' && record.name != 'itemlist') { throw Error('Unsupported research directive'); }
		} else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported research source record'); }
	}
	if (caption == null || #sizeof(text) != lines || #sizeof(extra) != buttons) { throw Error('Incomplete research source block: ' + name); }
	return {caption: caption, lines: text, buttons: extra};
};
const label_rows = (document) => {
	const rows = [];
	for (record of document.dialog('LABELS').records) {
		if (record.kind == 'text') { rows :+ record.text; }
		else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported research label record'); }
	}
	if (#sizeof(rows) < 104) { throw Error('Incomplete research button labels'); }
	const text = #trim(rows[0]); let count = 0;
	try { count = #to_int(text); } catch { : (e) => { throw Error('Invalid research label count'); } }
	if (#to_string(count) != text || count != #sizeof(rows) - 1) { throw Error('Invalid research label table'); }
	return rows;
};
const labels = (document) => { const rows = label_rows(document); return {ok: plain(rows[102], true), cancel: plain(rows[103], true)}; };
return {
	load_laboratories: (glsmac) => {
		const definition = block(glsmac.load_smac_text('script.txt', 'dialogs'), 'STATUSLABS', 0, 0);
		const rows = label_rows(glsmac.load_smac_text('labels.txt', 'dialogs'));
		if (#sizeof(rows) < 691) { throw Error('Incomplete laboratory labels'); }
		return {caption: definition.caption, accumulated: plain(rows[378]), per_turn: plain(rows[379]), summary: plain(rows[690]), ok: plain(rows[102], true)};
	},
	load: (glsmac) => {
		const document = glsmac.load_smac_text('script.txt', 'dialogs');
		const directed = block(document, 'TECHNOLOGY', 0, 2); const priorities = block(document, 'TECHRANDOM', 7, 0);
		return {directed: directed, priorities: priorities, labels: labels(glsmac.load_smac_text('labels.txt', 'dialogs'))};
	},
	load_rules: (glsmac) => {
		const document = glsmac.load_smac_text('script.txt', 'dialogs');
		const definition = block(document, 'RULES', 18, 1);
		return {caption: definition.caption, blind: definition.lines[9], reset: definition.buttons[0],
			labels: labels(glsmac.load_smac_text('labels.txt', 'dialogs'))};
	},
};
