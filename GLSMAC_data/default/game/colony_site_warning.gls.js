// Common Script BASETOONEAR supplies the visible warning. Site authority is native.
return (glsmac) => {
	const paragraphs = [];
	for (record of glsmac.load_smac_text('script.txt', 'dialogs').dialog('BASETOONEAR').records) {
		if (record.kind == 'text') {
			if (#trim(record.text) == '') { throw Error('Empty BASETOONEAR body'); }
			for (marker of ['^', '|', '$', '{', '}']) { if (#sizeof(#split(record.text, marker)) != 1) { throw Error('Unsupported BASETOONEAR formatting'); } }
			paragraphs :+ #trim(record.text);
		} else if (record.kind == 'directive') {
			if (record.name != 'x' && record.name != 'y' && record.name != 'xs' && record.name != 'wave' && record.name != 'caption') { throw Error('Unsupported BASETOONEAR directive'); }
		} else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported BASETOONEAR record'); }
	}
	if (#sizeof(paragraphs) == 0) { throw Error('Missing BASETOONEAR body'); }
	let text = ''; for (paragraph of paragraphs) { if (text != '') { text = text + ' '; } text = text + paragraph; }
	return text;
};
