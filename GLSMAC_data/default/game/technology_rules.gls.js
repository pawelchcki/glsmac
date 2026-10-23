// Installed source-order technology IDs feed the existing bounded native table.
// Flag text is retained as metadata; no flag-dependent research policy is added.
const text = (value) => {
	if (#typeof(value) != 'String') { throw Error('Technology source fields must be strings'); }
	return #trim(value);
};
const integer = (value) => {
	const field = text(value); let number = 0;
	try { number = #to_int(field); } catch { : (e) => { throw Error('Technology weight must be an integer'); } }
	if (#to_string(number) != field || number < (0 - 32768) || number > 32767) { throw Error('Technology weight is out of range'); }
	return number;
};
const faction_id = (slot) => {
	if (#typeof(slot) != 'Int' || slot < 0 || slot > 6) { throw Error('Technology ownership supports player slots zero through six'); }
	return slot + 1;
};

const parse = (document) => {
	const rows = document.rows('TECHNOLOGY');
	if (#sizeof(rows) != 89) { throw Error('Installed technology table requires 89 rows'); }
	const result = []; const tokens = {}; let id = 0;
	for (row of rows) {
		if (#sizeof(row) != 9) { throw Error('Technology source row requires nine fields'); }
		const name = text(row[0]); const token = text(row[1]); const flags = text(row[8]);
		if (name == '' || token == '' || token == 'None' || token == 'Disable' || #is_defined(tokens[token])) { throw Error('Invalid or duplicate technology token or name'); }
		// Appending a marker keeps trailing empty split fields from affecting
		// the count. Flag effects remain outside this source-import contract.
		const padded = flags + 'x'; const zero_parts = #split(padded, '0'); const one_parts = #split(padded, '1');
		let remainder = '';
		for (part of zero_parts) { for (fragment of #split(part, '1')) { remainder += fragment; } }
		if (#sizeof(zero_parts) + #sizeof(one_parts) != 11 || remainder != 'x') { throw Error('Technology flags must contain nine binary digits'); }
		tokens[token] = id;
		result :+ {id: id, name: name, token: token, flags: flags,
			prerequisites: [text(row[6]), text(row[7])], weights: [integer(row[5]), integer(row[3]), integer(row[4]), integer(row[2])]};
		id++;
	}
	for (entry of result) {
		const prerequisites = [];
		for (token of entry.prerequisites) {
			if (token == 'None') { prerequisites :+ (0 - 1); }
			else if (token == 'Disable') { prerequisites :+ (0 - 2); }
			else {
				if (!#is_defined(tokens[token])) { throw Error('Unknown installed technology prerequisite: ' + token); }
				prerequisites :+ tokens[token];
			}
		}
		entry.prerequisites = prerequisites;
	}
	return result;
};

const plan = (definitions, players) => {
	if (#typeof(definitions) != 'Array' || #sizeof(definitions) != 89) { throw Error('Technology definitions are not initialized'); }
	const tokens = {}; const result = []; let id = 0;
	for (entry of definitions) {
		if (#typeof(entry) != 'Object' || entry.id != id || #typeof(entry.token) != 'String' || #is_defined(tokens[entry.token])) { throw Error('Invalid technology definition identity'); }
		tokens[entry.token] = id;
		result :+ [entry.prerequisites, 0, entry.weights]; id++;
	}
	const seen = {};
	for (player of players) {
		const mask_id = faction_id(player.id); const key = #to_string(player.id);
		if (#is_defined(seen[key])) { throw Error('Duplicate technology player slot'); } seen[key] = true;
		let mask = 1; for (let bit = 0; bit < mask_id; bit++) { mask = mask * 2; }
		const granted = {};
		for (token of player.get_faction().starting_technologies) {
			if (#typeof(token) != 'String' || !#is_defined(tokens[token])) { throw Error('Unknown faction starting technology'); }
			if (!#is_defined(granted[token])) {
				const technology_id = tokens[token]; const row = result[technology_id]; row[1] = row[1] + mask; granted[token] = true;
			}
		}
	}
	return result;
};

return {parse: parse, plan: plan, faction_id: faction_id};
