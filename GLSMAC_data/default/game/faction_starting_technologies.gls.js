// Concrete TECH tokens only. Numeric free-tech choices need a research UI.
const parse = (document, block) => {
	const rows = document.rows(block);
	if (#sizeof(rows) < 2) { throw Error('Missing SMAC starting technology bonus record'); }
	const fields = rows[1]; let size = #sizeof(fields); const last = size - 1;
	if (last >= 0 && fields[last] == '') { size--; }
	if (size % 2 != 0) { throw Error('SMAC starting bonuses require pairs'); }
	const result = []; const seen = {};
	for (let index = 0; index < size; index = index + 2) {
		if (#uppercase(#trim(fields[index])) == 'TECH') {
			const token = #trim(fields[index + 1]);
			if (token == '') { throw Error('Empty SMAC starting technology'); }
			let numeric = false;
			try { const number = #to_int(token); numeric = #to_string(number) == token; } catch { : (e) => {} }
			if (!numeric && !#is_defined(seen[token])) { seen[token] = true; result :+ token; }
		}
	}
	return result;
};
return {
	parse: parse,
	load: (glsmac, catalog) => {
		const result = {};
		for (entry of catalog) { result[entry.id] = parse(glsmac.load_smac_text(entry.file + '.txt', 'dialogs'), entry.block); }
		return result;
	},
};
