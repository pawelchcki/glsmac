// Installed resource coefficients; work availability and resource caps remain separate policies.
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
			ocean:{NUTRIENTS:1,MINERALS:0,ENERGY:0},improved_sea:{NUTRIENTS:2,MINERALS:1,ENERGY:3},
			borehole:{NUTRIENTS:0,MINERALS:6,ENERGY:6},sea_mine_bonus_tech:'EcoEng2',
			caps: {NUTRIENTS: 'Gene', MINERALS: 'EcoEng', ENERGY: 'EnvEcon'}};
	},
	parse: (document) => {
		const resources = document.rows('RESOURCEINFO'); const rules = document.rows('RULES');
		if (#sizeof(resources) < 6 || #sizeof(rules) < 56) { throw Error('Missing SMAC land resource rule rows'); }
		const forest = resources[3]; const farm = resources[5];
		const tuple = (row) => { return {NUTRIENTS:integer(row,1,0,16),MINERALS:integer(row,2,0,16),ENERGY:integer(row,3,0,16)}; };
		return {
			forest: {NUTRIENTS: integer(forest, 1, 0, 16), MINERALS: integer(forest, 2, 0, 16), ENERGY: integer(forest, 3, 0, 16)},
			farm_nutrients: integer(farm, 1, 0, 16),
			ocean:tuple(resources[0]),
			improved_sea:#sizeof(resources) >= 7 ? tuple(resources[6]) : null,
			borehole:#sizeof(resources) >= 9 ? tuple(resources[8]) : null,
			sea_mine_bonus_tech:#sizeof(rules) >= 58 ? token(rules,57) : 'Disable',
			mine_without_road_limit: integer(rules[8], 0, 0, 1),
			mine_nutrients: integer(rules[9], 0, (0 - 1), 0),
			caps: {NUTRIENTS: token(rules, 53), MINERALS: token(rules, 54), ENERGY: token(rules, 55)},
		};
	},
};
