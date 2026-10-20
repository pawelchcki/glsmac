// Installed inputs for the bounded farm/mine/forest resource policy.
const integer = (row, column, low, high) => {
	if (column >= #sizeof(row)) { throw Error('Missing SMAC land resource coefficient'); }
	const text = #trim(row[column]); let value = 0;
	try { value = #to_int(text); } catch { : (e) => { throw Error('SMAC land resource coefficient must be an integer'); } }
	if (#to_string(value) != text || value < low || value > high) { throw Error('Unsupported SMAC land resource coefficient'); }
	return value;
};
const token = (rows, index) => {
	const row = rows[index];
	if (#sizeof(row) == 0 || #trim(row[0]) == '') { throw Error('Missing SMAC land resource cap technology'); }
	return #trim(row[0]);
};
return {
	defaults: () => {
		return {forest: {NUTRIENTS: 1, MINERALS: 2, ENERGY: 1}, farm_nutrients: 1,
			mine_without_road_limit: 1, mine_nutrients: (0 - 1),
			caps: {NUTRIENTS: 'Gene', MINERALS: 'EcoEng', ENERGY: 'EnvEcon'}};
	},
	parse: (document) => {
		const resources = document.rows('RESOURCEINFO'); const rules = document.rows('RULES');
		if (#sizeof(resources) < 6 || #sizeof(rules) < 56) { throw Error('Missing SMAC land resource rule rows'); }
		const forest = resources[3]; const farm = resources[5];
		return {
			forest: {NUTRIENTS: integer(forest, 1, 0, 16), MINERALS: integer(forest, 2, 0, 16), ENERGY: integer(forest, 3, 0, 16)},
			farm_nutrients: integer(farm, 1, 0, 16),
			mine_without_road_limit: integer(rules[8], 0, 0, 1),
			mine_nutrients: integer(rules[9], 0, (0 - 1), 0),
			caps: {NUTRIENTS: token(rules, 53), MINERALS: token(rules, 54), ENERGY: token(rules, 55)},
		};
	},
};
