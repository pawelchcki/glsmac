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
// This adapter observes native state only. TypeScript owns the yield policy.
return {
	apply: (tile, player, rules, existing, game) => {
		if (tile.features.xenofungus || !#is_defined(tile.terraforming)) { return existing; }
		const source = tile.terraforming;
		// Most all-player observations visit bare land. Avoid allocating the
		// copied improvement record and its loop contexts before this return.
		if (tile.is_land && !has(source,'farm') && !has(source,'mine') && !has(source,'forest') && !has(source,'solar') && !has(source,'soil_enricher') && !has(source,'condenser') && !has(source,'borehole')) { return existing; }
		const improvements = {};
		for (name of ['farm','mine','forest','solar','soil_enricher','condenser','borehole','road']) { improvements[name] = has(source,name); }
		let mirrors = 0;
		if (tile.is_land && improvements.solar && !improvements.forest && !improvements.borehole && #is_defined(game) && #is_defined(game.get_tm)) {
			const tm = game.get_tm();
			if (#is_defined(tm.get_terrain_state) && #is_defined(tile.x) && #is_defined(tile.y)) {
				const current = tm.get_terrain_state(tile.x,tile.y); const seen = {};
				for (direction in current.neighbors) {
					const neighbor = current.neighbors[direction];
					if (neighbor != null && (neighbor.x != tile.x || neighbor.y != tile.y)) {
						const key = #to_string(neighbor.x) + ':' + #to_string(neighbor.y);
						if (!#is_defined(seen[key])) { seen[key] = true; if (tm.get_terrain_state(neighbor.x,neighbor.y).terraforming.mirror) { mirrors = mirrors + 1; } }
					}
				}
			}
		}
		const plan = #js_call('game/land-resource-yields','plan',{
			schema:1,
			tile:{is_land:tile.is_land,rockiness:tile.rockiness,elevation:#is_defined(tile.elevation) ? tile.elevation : 0,
				jungle:tile.features.jungle,river:tile.features.river,bonuses:{nutrient:tile.bonuses.nutrient,minerals:tile.bonuses.minerals,energy:tile.bonuses.energy},improvements:improvements},
			rules:{forest:rules.forest,ocean:#is_defined(rules.ocean) ? rules.ocean : null,improved_sea:#is_defined(rules.improved_sea) ? rules.improved_sea : null,borehole:#is_defined(rules.borehole) ? rules.borehole : null,
				farm_nutrients:rules.farm_nutrients,mine_nutrients:rules.mine_nutrients,mine_without_road_limit:rules.mine_without_road_limit},
			existing:existing,
			caps:{NUTRIENTS:false,MINERALS:false,ENERGY:false},
			sea_mine_bonus: !tile.is_land && improvements.mine && has_technology(player,rules.sea_mine_bonus_tech,game),mirrors:mirrors,
		});
		const package_id = #js_package();
		const caps = {};
		for (name of ['NUTRIENTS','MINERALS','ENERGY']) {
			caps[name] = plan.needs_caps[name] ? has_technology(player,rules.caps[name],game) : false;
		}
		return #js_call('game/land-resource-yields','resolve',{schema:1,plan:plan,caps:caps},package_id);
	},
};
