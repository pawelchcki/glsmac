// Public installed-data mapping: RULES data row six, scalar field zero.
// Neighboring rows, including nutrient configuration, remain uninterpreted.
const parse = (document) => {
	const rows = document.rows('RULES');
	if (#sizeof(rows) <= 6) { throw Error('SMAC RULES is missing mineral data row six'); }
	const row = rows[6];
	if (#sizeof(row) == 0) { throw Error('SMAC mineral row has no scalar field'); }
	for (let i = 1; i < #sizeof(row); i++) {
		if (row[i] != '') { throw Error('SMAC mineral row contains additional nonempty fields'); }
	}
	// Match the bounded canonical decimal grammar without partial conversion.
	let matched = 0;
	for (let value = 1; value <= 100; value++) {
		if (row[0] == #to_string(value)) { matched = value; break; }
	}
	if (matched == 0) { throw Error('SMAC mineral multiplier must be a canonical integer from 1 through 100'); }
	return matched;
};

return {
	parse: parse,
	apply: (document, rules) => {
		const factor = parse(document);
		rules.set_mineral_cost_factor(factor);
	},
};
