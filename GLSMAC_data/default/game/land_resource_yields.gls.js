// Recorded farm/mine/forest arithmetic plus source-backed solar/sea/enricher
// behavior. Original comparison coverage remains distinct from application checks.
const has = (improvements, name) => { return #is_defined(improvements[name]) && improvements[name]; };
const has_technology = (player, name, game) => {
	if (name == 'None') { return true; }
	if (name == 'Disable' || !#is_defined(player.get_faction)) { return false; }
	if (#is_defined(game) && #is_defined(game.get) && game.get('technologies_initialized') == true) {
		for (definition of game.get('technology_rules')) { if (definition.token == name) { return game.technologies.has_tech(definition.id,player.id + 1); } }
		return false;
	}
	const faction = player.get_faction();
	if (!#is_defined(faction.starting_technologies)) { return false; }
	for (token of faction.starting_technologies) { if (token == name) { return true; } }
	return false;
};
return {
	apply: (tile, player, rules, existing, game) => {
		if (tile.features.xenofungus || !#is_defined(tile.terraforming)) { return existing; }
		const improvements = tile.terraforming;
		const farm = has(improvements, 'farm'); const mine = has(improvements, 'mine'); const forest = has(improvements, 'forest');
		const solar = has(improvements,'solar'); const enricher = has(improvements,'soil_enricher');
		const condenser = has(improvements,'condenser'); const borehole = has(improvements,'borehole');
		if (tile.is_land && !farm && !mine && !forest && !solar && !enricher && !condenser && !borehole) { return existing; }
		const result = #clone(existing);
		// Preserve the existing special-tile additions outside this bounded
		// improvement calculation; their full interactions remain unverified.
		const extra = {NUTRIENTS: (tile.bonuses.nutrient ? 2 : 0) + (tile.features.jungle ? 1 : 0),
			MINERALS: tile.bonuses.minerals ? 2 : 0, ENERGY: (tile.bonuses.energy ? 2 : 0) + (tile.features.river ? 1 : 0)};
		for (name of ['NUTRIENTS', 'MINERALS', 'ENERGY']) { result[name] = result[name] - extra[name]; }
		if (!tile.is_land) {
			if (!#is_defined(rules.ocean)) { throw Error('Ocean resource declaration is missing'); }
			for (name of ['NUTRIENTS','MINERALS','ENERGY']) { result[name] = rules.ocean[name]; }
			if (farm || mine || solar) {
				if (rules.improved_sea == null) { throw Error('Sea improvement resource declaration is missing'); }
				if (farm) { result.NUTRIENTS = result.NUTRIENTS + rules.improved_sea.NUTRIENTS; }
				if (mine) { result.MINERALS = result.MINERALS + rules.improved_sea.MINERALS + (has_technology(player,rules.sea_mine_bonus_tech,game) ? 1 : 0); }
				if (solar) { result.ENERGY = result.ENERGY + rules.improved_sea.ENERGY; }
			}
		} else if (borehole) {
			if (rules.borehole == null) { throw Error('Borehole resource declaration is missing'); }
			for (name of ['NUTRIENTS','MINERALS','ENERGY']) { result[name] = rules.borehole[name]; }
		} else if (forest) {
			result.NUTRIENTS = rules.forest.NUTRIENTS;
			result.MINERALS = rules.forest.MINERALS;
			result.ENERGY = rules.forest.ENERGY;
		} else {
			if ((farm || condenser) && tile.rockiness < 3) { result.NUTRIENTS = result.NUTRIENTS + rules.farm_nutrients; }
			if (enricher && farm && tile.rockiness < 3) { result.NUTRIENTS = result.NUTRIENTS + rules.farm_nutrients; }
			if (solar) {
				const elevation = #is_defined(tile.elevation) ? tile.elevation : 0;
				result.ENERGY = result.ENERGY + #min(4,#max(1,1 + elevation / 1000));
				if (#is_defined(game) && #is_defined(game.get_tm)) {
					const tm = game.get_tm();
					if (#is_defined(tm.get_terrain_state) && #is_defined(tile.x) && #is_defined(tile.y)) {
						const current = tm.get_terrain_state(tile.x,tile.y); const seen = {};
						for (direction in current.neighbors) {
							const neighbor = current.neighbors[direction];
							if (neighbor != null && (neighbor.x != tile.x || neighbor.y != tile.y)) {
								const key = #to_string(neighbor.x) + ':' + #to_string(neighbor.y);
								if (!#is_defined(seen[key])) { seen[key] = true; if (tm.get_terrain_state(neighbor.x,neighbor.y).terraforming.mirror) { result.ENERGY = result.ENERGY + 1; } }
							}
						}
					}
				}
			}
			if (mine) {
				if (result.NUTRIENTS > 0) { result.NUTRIENTS = #max(1, result.NUTRIENTS + rules.mine_nutrients); }
				let minerals = tile.rockiness >= 3 ? 3 : 1;
				if (!has(improvements, 'road')) { minerals = rules.mine_without_road_limit + (tile.rockiness >= 3 ? 1 : 0); }
				result.MINERALS = result.MINERALS + minerals;
			}
		}
		for (name of ['NUTRIENTS', 'MINERALS', 'ENERGY']) {
			if (result[name] > 2 && !has_technology(player, rules.caps[name],game)) { result[name] = 2; }
			result[name] = result[name] + extra[name];
		}
		return result;
	},
};
