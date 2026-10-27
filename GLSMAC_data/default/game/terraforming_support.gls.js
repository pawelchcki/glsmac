// Local consequences the present engine can represent. Native construction
// owners are an application model; imported unknown ownership stays unknown.
// Territory transfer, fog, collateral damage and aircraft fuel remain separate.
const integer = (row) => {
	if (#sizeof(row) < 1) { throw Error('Missing terrain support coefficient'); }
	const text = #trim(row[0]); let number = 0;
	try { number = #to_int(text); } catch { : (e) => { throw Error('Terrain support coefficient must be integral'); } }
	if (#to_string(number) != text || number < 0 || number > 1000) { throw Error('Terrain support coefficient is out of bounds'); }
	return number;
};
const range = (game,tile) => {
	const tm = game.get_tm(); const queue = [{x:tile.x + 0,y:tile.y + 0,depth:0}]; const seen = {};
	seen[#to_string(tile.x) + ':' + #to_string(tile.y)] = true; let index = 0;
	while (index < #sizeof(queue)) {
		const current = queue[index]; index++;
		if (current.depth < 2) {
			const state = tm.get_terrain_state(current.x,current.y);
			for (direction of ['W','NW','N','NE','E','SE','S','SW']) {
				const next = state.neighbors[direction];
				if (next != null) {
					const key = #to_string(next.x) + ':' + #to_string(next.y);
					if (!#is_defined(seen[key])) { seen[key] = true; queue :+ {x:next.x + 0,y:next.y + 0,depth:current.depth + 1}; }
				}
			}
		}
	}
	return queue;
};
const coverage = (game,owner,tile) => {
	const result = []; const tm = game.get_tm();
	for (point of range(game,tile)) {
		const state = tm.get_terrain_state(point.x,point.y);
		if (state.terraforming.sensor && state.terraforming_owners.sensor == owner) { result :+ {x:point.x + 0,y:point.y + 0,owner:owner + 0}; }
	}
	return result;
};
return {
	parse:(document) => {
		const rows = document.rows('RULES'); if (#sizeof(rows) < 41) { throw Error('Missing terrain support RULES'); }
		// Manual pp100/104: bunker/base defense have the same intrinsic bonus;
		// stationary local repair bonuses are ten normalized percentage points.
		return {version:1,bunker_defense_percent:integer(rows[21]),sensor_defense_percent:integer(rows[40]),repair_bonus:0.1};
	},
	coverage:coverage,
	defense:(game,unit) => {
		const result = {bunker_percent:0,sensor_percent:0}; if (!#is_defined(game.get)) { return result; }
		const rules = game.get('terraforming_support_rules');
		if (!#is_defined(rules)) { return result; }
		const tile = unit.get_tile(); const state = game.get_tm().get_terrain_state(tile.x,tile.y);
		if (state.terraforming.bunker) { result.bunker_percent = rules.bunker_defense_percent; }
		if (#sizeof(coverage(game,unit.owner,tile)) > 0) { result.sensor_percent = rules.sensor_defense_percent; }
		return result;
	},
	repair_bonus:(game,unit) => {
		if (!#is_defined(game.get)) { return 0.0; }
		const rules = game.get('terraforming_support_rules'); if (!#is_defined(rules)) { return 0.0; }
		const tile = unit.get_tile(); const state = game.get_tm().get_terrain_state(tile.x,tile.y);
		if (unit.is_land && state.terraforming.bunker) { return rules.repair_bonus + 0.0; }
		if (unit.is_air && state.terraforming.airbase && state.terraforming_owners.airbase == unit.owner) { return rules.repair_bonus + 0.0; }
		return 0.0;
	},
	aerial_site:(game,owner,tile) => {
		const state = game.get_tm().get_terrain_state(tile.x,tile.y);
		return {present:state.terraforming.airbase,owner:state.terraforming_owners.airbase,
			can_refuel:state.terraforming.airbase && state.terraforming_owners.airbase == owner,
			fuel_system_supported:false};
	},
};
