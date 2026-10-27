// Installed declarations only: opening ENERGY bonus and TERRAFORM cost flag.
// The flag does not establish a base fee or odd-credit rounding policy.
const parse = (document, block) => {
	const rows = document.rows(block); if (#sizeof(rows) < 2) { throw Error('Missing faction economic bonus row'); }
	const fields = rows[1]; let size = #sizeof(fields);
	if (size > 0 && fields[size - 1] == '') { size--; }
	if (size % 2 != 0) { throw Error('Faction economic bonuses require key/value pairs'); }
	let energy = 0; let discounted = false; const seen = {};
	for (let index = 0; index < size; index = index + 2) {
		const key = #uppercase(#trim(fields[index]));
		if (key == 'ENERGY' || key == 'TERRAFORM') {
			if (#is_defined(seen[key])) { throw Error('Repeated faction economic bonus is unsupported'); } seen[key] = true;
			const text = #trim(fields[index + 1]); if (text == '') { throw Error('Missing faction economic bonus parameter'); }
			if (key == 'ENERGY') {
				let amount = 0; try { amount = #to_int(text); } catch { : (e) => { throw Error('Faction ENERGY bonus must be an integer'); } }
				if (#to_string(amount) != text || amount < 0 || amount > 1000000) { throw Error('Faction ENERGY bonus is out of bounds'); }
				energy = amount;
			} else { discounted = true; }
		}
	}
	return {starting_energy:energy,terraform_cost_halved:discounted};
};
return {
	parse:parse,
	load:(glsmac,catalog) => {
		const result = {};
		for (entry of catalog) { result[entry.id] = parse(glsmac.load_smac_text(entry.file + '.txt','dialogs'),entry.block); }
		return result;
	},
};
