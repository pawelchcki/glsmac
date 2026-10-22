// Bounded common Script NEWBASE definition. Names come from native allocation.
const plain = (value) => {
	if (#typeof(value) != 'String' || #trim(value) == '') { throw Error('Empty NEWBASE source text'); }
	for (marker of ['^', '|', '$', '{', '}']) { if (#sizeof(#split(value, marker)) != 1) { throw Error('Unsupported NEWBASE formatting'); } }
	return value;
};
return (glsmac) => {
	let caption = null; let label = null;
	for (record of glsmac.load_smac_text('script.txt', 'dialogs').dialog('NEWBASE').records) {
		if (record.kind == 'text') { if (label != null) { throw Error('Duplicate NEWBASE field label'); } label = plain(record.text); }
		else if (record.kind == 'directive') {
			if (record.name == 'caption') { if (caption != null) { throw Error('Duplicate NEWBASE caption'); } caption = plain(record.argument); }
			else if (record.name != 'x' && record.name != 'y' && record.name != 'xs') { throw Error('Unsupported NEWBASE directive'); }
		} else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported NEWBASE source record'); }
	}
	if (caption == null || label == null) { throw Error('Incomplete NEWBASE source'); }
	return {caption: caption, label: label};
};
