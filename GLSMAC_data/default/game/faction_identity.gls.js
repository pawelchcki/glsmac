// The six installed faction-header fields shared by backend templates and UI.
const plain = (value) => {
	if (#typeof(value) != 'String' || #trim(value) == '') { throw Error('Empty SMAC faction identity text'); }
	for (marker of ['^', '|', '$', '{', '}']) {
		if (#sizeof(#split(value, marker)) != 1) { throw Error('Unsupported SMAC faction identity formatting'); }
	}
	return value + '';
};
const parse = (document, block) => {
	const rows = document.rows(block);
	if (#sizeof(rows) < 7 || #sizeof(rows[0]) < 6 || #sizeof(rows[4]) < 1 || #sizeof(rows[6]) < 2) {
		throw Error('Incomplete SMAC faction identity header');
	}
	return [plain(rows[0][5]), plain(rows[0][0]), plain(rows[0][2]), plain(rows[4][0]), plain(rows[6][0]), plain(rows[6][1])];
};
return {
	parse: parse,
	load: (glsmac, catalog) => {
		const result = {};
		for (entry of catalog) { result[entry.id] = parse(glsmac.load_smac_text(entry.file + '.txt', 'dialogs'), entry.block); }
		return result;
	},
};
