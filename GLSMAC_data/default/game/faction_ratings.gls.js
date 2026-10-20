// Partial source consumer: initial GROWTH and INDUSTRY SOCIAL declarations.
// Other faction/social bonuses require their own gameplay implementations.
const parse = (document, block) => {
	const rows = document.rows(block);
	if (#sizeof(rows) < 2) { throw Error('Missing SMAC faction bonus record'); }
	const fields = rows[1]; let size = #sizeof(fields);
	// A trailing comma is an empty delimiter field, not another bonus key.
	const last = size - 1;
	if (last >= 0 && fields[last] == '') { size--; }
	if (size % 2 != 0) { throw Error('SMAC faction bonuses require key/value pairs'); }
	const result = {growth: 0, industry: 0};
	for (let index = 0; index < size; index = index + 2) {
		if (#uppercase(#trim(fields[index])) == 'SOCIAL') {
			let descriptor = #uppercase(#trim(fields[index + 1])); let count = 0; let sign = '';
			let scanning = true;
			while (scanning) {
				const first = (descriptor + '')[0::1];
				if (first == '+' || first == '-') {
					if (sign != '' && first != sign) { throw Error('Mixed SMAC social rating signs'); }
					sign = first; count++; descriptor = (descriptor + '')[1::];
				} else { scanning = false; }
			}
			if (descriptor == 'GROWTH' || descriptor == 'INDUSTRY') {
				if (count == 0) { throw Error('SMAC social rating requires a signed magnitude'); }
				const key = #lowercase(descriptor); const value = sign == '-' ? 0 - count : count;
				result[key] = result[key] + value;
			}
		}
	}
	for (key of ['growth', 'industry']) {
		if (result[key] < -8 || result[key] > 10) { throw Error('SMAC faction rating is outside the verified range'); }
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
