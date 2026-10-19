const integer = (text, minimum, maximum) => {
	let value = 0;
	try { value = #to_int(text); }
	catch { : (e) => { throw Error('SMAC world-size dimension must be a canonical integer'); } }
	if (#to_string(value) != text || value < minimum || value > maximum) {
		throw Error('SMAC world-size dimension is outside supported bounds');
	}
	return value;
};
const shape = (row, fields) => {
	if (#sizeof(row) < fields) { throw Error('Incomplete SMAC world-size row'); }
	for (let n = fields; n < #sizeof(row); n++) {
		if (row[n] != '') { throw Error('Unexpected SMAC world-size field'); }
	}
};
const parse = (document) => {
	const rows = document.rows('WORLDSIZE');
	if (#sizeof(rows) != 6) { throw Error('SMAC world-size table requires five ordered presets'); }
	shape(rows[0], 1);
	if (integer(rows[0][0], 5, 5) != 5) { throw Error('Unsupported SMAC world-size count'); }
	const result = [];
	for (let level = 0; level < 5; level++) {
		const row = rows[level + 1]; shape(row, 3);
		const label = #split(row[0], '|');
		if (#sizeof(label) > 2 || #trim(label[0]) == '') { throw Error('Invalid SMAC world-size label'); }
		const width = integer(row[1], 2, 2048) * 2;
		const height = integer(row[2], 2, 4096);
		if (height % 2 != 0) { throw Error('SMAC world-size height must be even'); }
		result :+ {level: level, name: #trim(label[0]), description: #sizeof(label) == 2 ? #trim(label[1]) : '', size_x: width, size_y: height};
	}
	return result;
};
return {
	parse: parse,
	apply: (document, rules) => { rules.set_world_sizes(parse(document)); },
};
