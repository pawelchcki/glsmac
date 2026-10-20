// Policy inferred from the recorded land-worker queries. Solar, sea, fungus,
// special terrain interactions and later facility bonuses need more evidence.
const has = (improvements, name) => { return #is_defined(improvements[name]) && improvements[name]; };
const has_technology = (player, name) => {
	if (name == 'None') { return true; }
	if (name == 'Disable' || !#is_defined(player.get_faction)) { return false; }
	const faction = player.get_faction();
	if (!#is_defined(faction.starting_technologies)) { return false; }
	for (token of faction.starting_technologies) { if (token == name) { return true; } }
	return false;
};
return {
	apply: (tile, player, rules, existing) => {
		if (!tile.is_land || tile.features.xenofungus || !#is_defined(tile.terraforming)) { return existing; }
		const improvements = tile.terraforming;
		const farm = has(improvements, 'farm'); const mine = has(improvements, 'mine'); const forest = has(improvements, 'forest');
		if (!farm && !mine && !forest) { return existing; }
		const result = #clone(existing);
		// Preserve the existing special-tile additions outside this bounded
		// improvement calculation; their full interactions remain unverified.
		const extra = {NUTRIENTS: (tile.bonuses.nutrient ? 2 : 0) + (tile.features.jungle ? 1 : 0),
			MINERALS: tile.bonuses.minerals ? 2 : 0, ENERGY: (tile.bonuses.energy ? 2 : 0) + (tile.features.river ? 1 : 0)};
		for (name of ['NUTRIENTS', 'MINERALS', 'ENERGY']) { result[name] = result[name] - extra[name]; }
		if (forest) {
			result.NUTRIENTS = rules.forest.NUTRIENTS;
			result.MINERALS = rules.forest.MINERALS;
			result.ENERGY = rules.forest.ENERGY;
		} else {
			if (farm && tile.rockiness < 3) { result.NUTRIENTS = result.NUTRIENTS + rules.farm_nutrients; }
			if (mine) {
				if (result.NUTRIENTS > 0) { result.NUTRIENTS = #max(1, result.NUTRIENTS + rules.mine_nutrients); }
				let minerals = tile.rockiness >= 3 ? 3 : 1;
				if (!has(improvements, 'road')) { minerals = rules.mine_without_road_limit + (tile.rockiness >= 3 ? 1 : 0); }
				result.MINERALS = result.MINERALS + minerals;
			}
		}
		for (name of ['NUTRIENTS', 'MINERALS', 'ENERGY']) {
			if (result[name] > 2 && !has_technology(player, rules.caps[name])) { result[name] = 2; }
			result[name] = result[name] + extra[name];
		}
		return result;
	},
};
