// Installed replacement wording only; work policy stays in terraforming.
const plain = (text) => {
	if (#typeof(text) != 'String' || #trim(text) == '') { throw Error('Empty SMAC improvement replacement text'); }
	for (marker of ['^', '|', '$', '{', '}']) {
		const parts = #split(text, marker);
		// GSE split omits the final empty field, including a lone delimiter.
		if (#sizeof(parts) != 1 || parts[0] != text) { throw Error('Unsupported SMAC improvement replacement formatting'); }
	}
	return text;
};
const format = (text, name) => {
	if (#trim(text) == '') { throw Error('Empty SMAC improvement replacement body'); }
	const words = #split(text, ' '); let result = ''; let index = 0;
	for (word of words) {
		if (index > 0) { result += ' '; }
		if (word == '$MINE0') { result += name; }
		else if (word == '($MINE0)') { result += '(' + name + ')'; }
		else { if (word != '') { plain(word); } result += word; }
		index++;
	}
	return result;
};
return {
	parse: (document) => {
		const block = document.dialog('MIMIMI'); let caption = null; const texts = [];
		for (record of block.records) {
			switch (record.kind) {
				case 'blank': { break; }
				case 'comment': { break; }
				case 'directive': {
					if (record.name == 'caption') {
						if (caption != null) { throw Error('Duplicate SMAC improvement replacement caption'); }
						caption = plain(record.argument);
					} else if (record.name != 'xs' && record.name != 'x' && record.name != 'y' && record.name != 'wave') { throw Error('Unsupported SMAC improvement replacement directive'); }
					break;
				}
				case 'text': { texts :+ record.text; break; }
				default: { throw Error('Unsupported SMAC improvement replacement record'); }
			}
		}
		const count = #sizeof(texts);
		if (caption == null || count < 3 || count > 6) { throw Error('Incomplete SMAC improvement replacement dialog'); }
		const lines = [];
		for (let index = 0; index < count - 2; index++) { format(texts[index], 'improvement'); lines :+ texts[index]; }
		return {caption: caption, lines: lines, choices: [plain(texts[count - 2]), plain(texts[count - 1])]};
	},
	render: (definition, improvement_name) => {
		plain(improvement_name); const lines = [];
		for (line of definition.lines) {
			lines :+ format(line, improvement_name);
		}
		const choices = #clone(definition.choices);
		return {caption: definition.caption, lines: lines, choices: choices};
	},
};
