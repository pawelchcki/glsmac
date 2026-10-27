// The installed starting reserve is an explicit RULES input, never a decoded
// legacy-player default or a fit to an observed post-turn treasury.
return {
	parse:(document) => {
		const rows = document.rows('RULES');
		if (#sizeof(rows) < 21 || #sizeof(rows[20]) < 1) { throw Error('Missing installed starting energy reserve'); }
		const text = #trim(rows[20][0]); let value = 0;
		try { value = #to_int(text); } catch { : (e) => { throw Error('Starting energy reserve must be an integer'); } }
		if (#to_string(value) != text || value < 0 || value > 1000000) { throw Error('Starting energy reserve is outside supported bounds'); }
		return {starting_credits:value};
	},
};
