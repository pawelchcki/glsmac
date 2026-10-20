// Bounded ordinary land actions from installed TERRAIN declarations. Actual
// key bindings remain control mappings; the source's keystroke field is text.
const integer = (row, index) => {
	if (index >= #sizeof(row)) { throw Error('Missing SMAC terraforming work rate'); }
	const text = #trim(row[index]); let value = 0;
	try { value = #to_int(text); } catch { : (e) => { throw Error('SMAC terraforming work rate must be an integer'); } }
	if (#to_string(value) != text || value < 1 || value > 64) { throw Error('Unsupported SMAC terraforming work rate'); }
	return value;
};
const format_order = (template, name) => {
	const words = #split(template, ' '); let result = ''; let index = 0;
	for (word of words) {
		if (index > 0) { result += ' '; }
		if (word == '$STR0') { result += name; }
		else {
			const pieces = #split(word, '$');
			if (#sizeof(pieces) != 1) { throw Error('Unsupported SMAC terraforming order placeholder'); }
			result += word;
		}
		index++;
	}
	return result;
};
return {
	parse: (document) => {
		const rows = document.rows('TERRAIN');
		if (#sizeof(rows) < 6) { throw Error('Missing SMAC terraforming action rows'); }
		const result = {};
		for (entry of [{id: 'farm', row: 0}, {id: 'mine', row: 2}, {id: 'forest', row: 4}, {id: 'road', row: 5}]) {
			const row = rows[entry.row];
			if (#sizeof(row) < 8) { throw Error('Incomplete SMAC terraforming action declaration'); }
			const name = #trim(row[0]); const prerequisite = #trim(row[1]); const order = #trim(row[5]);
			if (name == '' || prerequisite == '' || order == '') { throw Error('Empty SMAC terraforming action metadata'); }
			result[entry.id] = {name: name, prerequisite: prerequisite, turns: integer(row, 4), order: format_order(order, name)};
		}
		return result;
	},
};
