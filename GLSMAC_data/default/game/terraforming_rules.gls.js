// Every installed land/sea TERRAIN declaration. Actual key delivery remains a
// controller mapping; source keystroke fields are retained as source text.
const vocabulary = #include('./terraforming_actions');
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
const variant = (row, offset, entry, turns) => {
	const name = #trim(row[offset]); const prerequisite = #trim(row[offset + 1]); const order = #trim(row[5]);
	if (name == '' || prerequisite == '' || order == '') { throw Error('Empty SMAC terraforming action metadata'); }
	return {id: entry.id, source_row: entry.row, name: name, prerequisite: prerequisite,
		turns: turns, order: format_order(order, name), enabled: prerequisite != 'Disable' && !#is_defined(entry.editor_only),
		help_key: #trim(row[6]), shortcut: #trim(row[7])};
};
return {
	format_order: format_order,
	entries: vocabulary.entries,
	for_tile: (rules, tile, action) => {
		if (!#is_defined(rules[action])) { return null; }
		const rule = rules[action];
		return tile.is_water ? rule.sea : rule;
	},
	parse: (document) => {
		const rows = document.rows('TERRAIN');
		if (#sizeof(rows) < 6) { throw Error('Missing SMAC terraforming action rows'); }
		const result = {};
		for (entry of vocabulary.entries) {
			// Older declared compact fixtures contain the first six source rows;
			// they cannot invent metadata for absent higher source identities.
			if (entry.row >= #sizeof(rows)) { break; }
			const row = rows[entry.row];
			if (#sizeof(row) < 8) { throw Error('Incomplete SMAC terraforming action declaration'); }
			const turns = integer(row, 4); const land = variant(row, 0, entry, turns); const sea = variant(row, 2, entry, turns);
			land.sea = sea; result[entry.id] = land;
		}
		return result;
	},
};
