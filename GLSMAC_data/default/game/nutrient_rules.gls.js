// Public installed-data mapping: RULES data row five, scalar field zero.
// No other row, translated comment or original gameplay policy is interpreted.
const parse = (document) => {
	const rows = document.rows('RULES');
	if (#sizeof(rows) <= 5) { throw Error('SMAC RULES is missing nutrient data row five'); }
	const row = rows[5];
	if (#sizeof(row) == 0) { throw Error('SMAC nutrient row has no scalar field'); }
	for (let i = 1; i < #sizeof(row); i++) {
		if (row[i] != '') { throw Error('SMAC nutrient row contains additional nonempty fields'); }
	}
	// Canonical matching avoids partial numeric conversions, overflow, signs,
	// leading zeroes and decimal/exponent forms. The bounded rule is 1..100.
	let matched = 0;
	for (let value = 1; value <= 100; value++) {
		if (row[0] == #to_string(value)) { matched = value; break; }
	}
	if (matched == 0) { throw Error('SMAC nutrient multiplier must be a canonical integer from 1 through 100'); }
	return matched;
};

return {
	parse: parse,
	apply: (document, rules) => {
		const factor = parse(document);
		rules.set_nutrient_cost_factor(factor);
	},
};
