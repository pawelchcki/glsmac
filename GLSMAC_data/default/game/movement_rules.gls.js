// Installed RULES row zero declares the number of road steps per move point.
return {
	parse: (document) => {
		const rows = document.rows('RULES');
		if (#sizeof(rows) == 0) { throw Error('Missing SMAC road movement rule'); }
		const row = rows[0];
		if (#sizeof(row) == 0) { throw Error('Missing SMAC road movement value'); }
		const text = #trim(row[0]); let rate = 0;
		try { rate = #to_int(text); } catch { : (e) => { throw Error('SMAC road movement rate must be an integer'); } }
		if (#to_string(rate) != text || rate < 1 || rate > 8) { throw Error('Unsupported SMAC road movement rate'); }
		return {road_rate: rate};
	},
};
