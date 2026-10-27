// Primitive effect planning from installed TERRAIN identities and the supplied
// player manual (pp46–50). Exact runtime comparisons still define measured
// agreement; this module does not invent height contours, fees or river routes.
const simple = ['farm','soil_enricher','mine','solar','forest','road','mag_tube','bunker','airbase','sensor','remove_fungus','plant_fungus','level','condenser','mirror','borehole','aquifer'];
const resource_choices = ['mine','solar','forest','condenser','mirror','borehole'];
const infrastructure = ['sensor','bunker','airbase'];
const contains = (items,value) => { for (item of items) { if (item == value) { return true; } } return false; };
const supports = (action) => { return contains(simple,action); };
// Declared application drainage: breadth-first nonascending route to actual
// water, using native neighbors and stable source order. It never alters heights
// or claims the original river-routing/RNG policy. No outlet rejects purely.
const aquifer_route = (game,unit) => {
	const tm = game.get_tm(); const origin = unit.get_tile(); const queue = [{x:origin.x + 0,y:origin.y + 0,previous_index:(0-1)}];
	// Compact native geometry v1: [1,x,y,integerCenter,water,patchLimit,neighbors].
	// The neighbor array has W,NW,N,NE,E,SE,S,SW null-or-[x,y] entries.
	// Native terrain reads are detached and pure during this synchronous plan.
	// Reuse each coordinate's complete record only within this invocation;
	// rejected edges remain eligible for examination from another parent.
	const states = {};
	const read = (x,y) => {
		const key = #to_string(x) + ':' + #to_string(y);
		if (!#is_defined(states[key])) { states[key] = tm.get_terrain_geometry(x,y); }
		return states[key];
	};
	const seen = {}; seen[#to_string(origin.x) + ':' + #to_string(origin.y)] = true; let index = 0; let outlet = (0-1);
	while (index < #sizeof(queue) && outlet < 0) {
		const point = queue[index]; const current = read(point.x,point.y);
		for (next of current[6]) {
			if (next != null) {
				const key = #to_string(next[0]) + ':' + #to_string(next[1]);
				if (!#is_defined(seen[key])) {
					const state = read(next[0],next[1]);
					if (state[3] <= current[3]) {
						seen[key] = true; queue :+ {x:next[0] + 0,y:next[1] + 0,previous_index:index + 0};
						if (state[4]) { outlet = #sizeof(queue) - 1; break; }
					}
				}
			}
		}
		index++;
	}
	if (outlet < 0) { return null; }
	// Backtrack coordinates before allocating complete feature patches. The same
	// native transaction limit governs both this pure preflight and publication.
	const path = []; let cursor = queue[outlet].previous_index;
	while (cursor >= 0) { path :+ cursor; cursor = queue[cursor].previous_index; }
	const geometry = read(origin.x,origin.y);
	if (#sizeof(path) > geometry[5]) { return {reason:'River route exceeds the supported terrain transaction capacity'}; }
	const result = [];
	for (position of path) {
		const point = queue[position]; const features = #clone(tm.get_tile(point.x,point.y).features); features.river = true;
		result :+ {x:point.x + 0,y:point.y + 0,features:features};
	}
	return result;
};
const validate = (game,unit,action) => {
	if (!supports(action)) { return 'Terraforming effect is not implemented'; }
	const tile = unit.get_tile(); const data = game.get_tm().get_terrain_state(tile.x,tile.y);
	if (tile.get_base() != null) { return 'Terraforming a base tile is not supported'; }
	if (tile.is_water != unit.is_water) { return 'Worker must occupy its compatible terrain'; }
	if (tile.is_water && (action == 'farm' || action == 'mine' || action == 'solar') && data.elevation.center < (0-1000)) { return 'Sea improvements require an ocean shelf'; }
	if (action == 'aquifer') {
		if (data.features.river) { return 'A river already exists'; }
		const route = aquifer_route(game,unit);
		if (route == null) { return 'No nonascending river outlet is available'; }
		if (#typeof(route) == 'Object') { return route.reason; }
		// Check the complete supported plan against authoritative native terrain
		// guards before accepting work; this validation does not mutate the world.
		let reason = undefined;
		try { game.get_tm().validate_terrain(route,[unit.id + 0]); }
		catch { : (error) => { reason = error.reason + ''; } }
		return reason;
	}
	if (action == 'remove_fungus') { if (!data.features.xenofungus) { return 'There is no fungus to remove'; } return; }
	if (action == 'plant_fungus') { if (data.features.xenofungus) { return 'Fungus already exists'; } return; }
	if (action == 'level') { if (tile.rockiness <= 1) { return 'Terrain is already level'; } return; }
	if (data.terraforming[action]) { return 'Improvement already exists'; }
	if (action == 'soil_enricher' && !data.terraforming.farm) { return 'Soil enrichment requires a farm'; }
	if (action == 'mag_tube' && !data.terraforming.road) { return 'A mag tube requires a road'; }
	if (action == 'farm' && tile.is_land && tile.rockiness >= 3) { return 'A farm requires non-rocky terrain'; }
	if ((action == 'farm' || action == 'mine' || action == 'solar') && (data.features.xenofungus || data.features.monolith)) { return 'Clear fungus and avoid monoliths before resource improvements'; }
	if (action == 'forest' && data.features.xenofungus) { return 'Clear fungus before planting a forest'; }
};
const replacements = (data,action) => {
	const result = [];
	if (contains(resource_choices,action) || action == 'plant_fungus') {
		for (name of resource_choices) { if (name != action && data.terraforming[name]) { result :+ name; } }
	}
	// Independent defensive/air infrastructure does not replace resource
	// improvements. Forests and boreholes explicitly exclude other enhancements;
	// planting fungus destroys enhancements other than roads and mag tubes.
	if (action == 'forest' || action == 'borehole' || action == 'plant_fungus') {
		for (name of infrastructure) { if (data.terraforming[name]) { result :+ name; } }
	}
	if (contains(infrastructure,action)) {
		for (name of ['forest','borehole']) { if (data.terraforming[name]) { result :+ name; } }
	}
	if (action == 'farm' || action == 'soil_enricher') {
		for (name of ['forest','condenser','borehole']) { if (data.terraforming[name]) { result :+ name; } }
	}
	if (action == 'forest' || action == 'plant_fungus' || action == 'condenser' || action == 'borehole') {
		for (name of ['farm','soil_enricher']) { if (data.terraforming[name]) { result :+ name; } }
	}
	return result;
};
return {
	supports:supports,
	validate:validate,
	replacements:(game,unit,action) => { const tile = unit.get_tile(); return replacements(game.get_tm().get_terrain_state(tile.x,tile.y),action); },
	plan:(game,unit,action) => {
		const reason = validate(game,unit,action); if (#is_defined(reason)) { throw Error(reason); }
		if (action == 'aquifer') { return aquifer_route(game,unit); }
		const tile = unit.get_tile(); const data = game.get_tm().get_terrain_state(tile.x,tile.y);
		const patch = {x:tile.x + 0,y:tile.y + 0};
		if (action == 'level') { patch.rockiness = tile.rockiness - 1; }
		else if (action == 'remove_fungus') { data.features.xenofungus = false; patch.features = data.features; }
		else {
			for (name of replacements(data,action)) { data.terraforming[name] = false; if (#is_defined(data.terraforming_owners)) { data.terraforming_owners[name] = (0-1); } }
			if (action == 'plant_fungus') { data.features.xenofungus = true; patch.features = data.features; }
			else { data.terraforming[action] = true; if (#is_defined(data.terraforming_owners)) { data.terraforming_owners[action] = unit.owner + 0; } }
			patch.terraforming = data.terraforming;
			if (#is_defined(data.terraforming_owners)) { patch.terraforming_owners = data.terraforming_owners; }
		}
		if (action == 'condenser' && tile.moisture >= 1 && tile.moisture < 3) { patch.moisture = tile.moisture + 1; }
		const result = [patch];
		if (action == 'condenser') {
			const tm = game.get_tm();
			for (let y = 0; y < tm.get_map_height(); y++) {
				for (let x = y % 2; x < tm.get_map_width(); x = x + 2) {
					const candidate = tm.get_tile(x,y);
					if (candidate.is_land && tm.get_distance(tile,candidate) <= 2 && candidate.moisture >= 1 && candidate.moisture < 3) {
						if (x != tile.x || y != tile.y) { result :+ {x:x + 0,y:y + 0,moisture:candidate.moisture + 1}; }
					}
				}
			}
		}
		return result;
	},
};
