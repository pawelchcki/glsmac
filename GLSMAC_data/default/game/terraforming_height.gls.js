// Explicit functional approximation. These deterministic bands and slope/fee
// rules do not reproduce original contours, RNG, climate or victim handling.
const policy = 'application.band-slope-height.v1';
const fee_policy = 'application.band-fee.v1';
const known = (action) => { return action == 'raise' || action == 'lower'; };
const band = (meters) => { return meters >= 0 ? meters / 1000 : ((meters + 1) / 1000) - 1; };
const owner = (game,id) => { for (player of game.get_players()) { if (player.id == id) { return player; } } return null; };
const fail = (reason) => { return {version:1,supported:false,reason:reason,policy:policy,fee_policy:fee_policy,mode:'functional_approximation'}; };
const plan = (game,unit,action) => {
	if (!known(action)) { return fail('Unknown elevation action'); }
	const tile = unit.get_tile(); const tm = game.get_tm(); const initial = tm.get_terrain_state(tile.x,tile.y);
	const recovery = unit.get_terraforming_recovery();
	if (unit.is_water && tile.is_land) {
		if (tile.get_base() != null) { return fail('Leave the coastal port onto water before terraforming'); }
		if (!recovery.active || recovery.x != tile.x || recovery.y != tile.y || action != 'lower') { return fail('Use a land Former to raise emerged land, or reverse its initiating Sea Former uplift'); }
	}
	if (unit.is_land && tile.is_water) { return fail('Move the land Former onto land before terraforming'); }
	const destination = (band(initial.elevation.center) + (action == 'raise' ? 1 : (0-1))) * 1000 + 500;
	if (destination < (0-3500) || destination > 3500) { return fail('This terrain cannot be raised higher or lowered further'); }
	if (unit.is_land && destination < 0) { return fail('A land Former cannot lower its square below sea level; use a Sea Former on adjacent water'); }
	const queue = [{x:tile.x + 0,y:tile.y + 0,distance:0}]; const seen = {}; const baseline = []; const patches = [];
	seen[#to_string(tile.x) + ':' + #to_string(tile.y)] = true; let cursor = 0;
	while (cursor < #sizeof(queue)) {
		const point = queue[cursor]; cursor++; const state = tm.get_terrain_state(point.x,point.y);
		const bound = destination + (action == 'raise' ? (0-point.distance * 1000) : point.distance * 1000);
		const changed = action == 'raise' ? state.elevation.center < bound : state.elevation.center > bound;
		if (changed) {
			const patch = {x:point.x + 0,y:point.y + 0,canonical:{elevation:bound + 0,is_water:bound < 0}};
			if (state.is_water != (bound < 0)) {
				const flags = #clone(state.terraforming); const owners = #clone(state.terraforming_owners);
				for (name in flags) { flags[name] = false; owners[name] = (0-1); }
				patch.terraforming = flags; patch.terraforming_owners = owners;
			}
			patches :+ patch;
		}
		// All potentially influenced neighbors are sealed, including the first
		// unchanged ring. This also guards derived shared-corner refreshes.
		baseline :+ #clone(state);
		if (point.distance < 7) {
			const next_bound = destination + (action == 'raise' ? (0-(point.distance + 1) * 1000) : (point.distance + 1) * 1000);
			if ((action == 'raise' && next_bound >= (0-3500)) || (action == 'lower' && next_bound <= 3500)) {
				for (direction of ['W','NW','N','NE','E','SE','S','SW']) {
					const next = state.neighbors[direction];
					if (next != null) { const key = #to_string(next.x) + ':' + #to_string(next.y); if (!#is_defined(seen[key])) { seen[key] = true; queue :+ {x:next.x + 0,y:next.y + 0,distance:point.distance + 1}; } }
				}
			}
		}
	}
	if (#sizeof(patches) == 0) { return fail('There is no elevation change to perform'); }
	// A protected land port must retain a compatible water exit for every
	// docked naval unit. Keeping only the base's class is insufficient.
	const future_water = {}; let changes_water = false;
	for (patch of patches) {
		const key = #to_string(patch.x) + ':' + #to_string(patch.y); future_water[key] = patch.canonical.is_water;
		if (tm.get_terrain_state(patch.x,patch.y).is_water != patch.canonical.is_water) { changes_water = true; }
	}
	if (changes_water) {
		for (state of baseline) {
			const port = tm.get_tile(state.x,state.y);
			if (port.is_land && port.get_base() != null) {
				let naval = false; for (occupant of port.get_units()) { if (occupant.is_water) { naval = true; } }
				if (naval) {
					let exit = false;
					for (direction of ['W','NW','N','NE','E','SE','S','SW']) {
						const next = state.neighbors[direction];
						if (next != null) {
							const key = #to_string(next.x) + ':' + #to_string(next.y);
							if (#is_defined(future_water[key]) ? future_water[key] : tm.get_terrain_state(next.x,next.y).is_water) { exit = true; }
						}
					}
					if (!exit) { return fail('This would remove the water access of a docked sea unit'); }
				}
			}
		}
	}
	const identity = #json_text_exact({version:1,policy:policy,fee_policy:fee_policy,tiles:baseline});
	const workers = [(unit.id + 0)]; const source_rules = game.get('terraforming_rules'); const source_rule = source_rules[action]; const required = (unit.is_water ? source_rule.sea.turns : source_rule.turns) * 2;
	for (other of tile.get_units()) {
		const state = other.get_terraforming();
		if (other.id != unit.id && other.owner == unit.owner && other.get_def().can_terraform && other.health > 0.0 && state.active && state.action == action &&
			state.required_work == required && #is_defined(state.height) && state.height.terrain_identity == identity) { workers :+ (other.id + 0); }
	}
	let reason = '';
	try { tm.validate_terrain(patches,workers); } catch { : (error) => { reason = #is_defined(error.reason) ? error.reason : 'Terrain changes would alter a base, strand an unrelated unit, or affect a locked tile'; } }
	if (reason != '') { return fail(reason); }
	return {supported:true,reason:'',patches:patches,source_elevation:initial.elevation.center + 0,source_water:initial.is_water,
		destination_elevation:destination + 0,destination_water:destination < 0,identity:identity};
};
const quote = (game,unit,action) => {
	const prepared = plan(game,unit,action); if (!prepared.supported) { return prepared; }
	const payer = owner(game,unit.owner); if (payer == null) { return fail('The worker owner is no longer live'); }
	const credits = payer.get_energy_state().credits; const current = unit.get_terraforming(); const tile = unit.get_tile();
	const coefficient = #max(1,band(prepared.source_elevation) + 2); const base_fee = coefficient * coefficient;
	let fee = payer.get_faction().economy_bonuses.terraform_cost_halved ? #max(1,(base_fee + 1) / 2) : base_fee;
	const resuming = current.action == action && current.tile_x == tile.x && current.tile_y == tile.y &&
		#is_defined(current.height) && current.height.policy == policy && current.height.fee_policy == fee_policy && current.height.owner == unit.owner && current.height.terrain_identity == prepared.identity;
	let paid_fee = 0;
	if (resuming) { paid_fee = current.height.fee; fee = 0; }
	if (credits < fee) { return fail('Elevation work needs ' + #to_string(fee) + ' energy credits; current reserves are ' + #to_string(credits)); }
	const identity = #json_text_exact({unit_id:unit.id + 0,owner:unit.owner + 0,definition:unit.get_def().id,health:unit.health + 0.0,
		movement:unit.movement + 0.0,moved:unit.moved_this_turn == true,order:unit.get_order(),work:current,recovery:unit.get_terraforming_recovery(),
		automation:unit.get_automation(),home:unit.get_terraform_home()});
	return {version:1,supported:true,reason:'',policy:policy,fee_policy:fee_policy,mode:'functional_approximation',unit_id:unit.id + 0,owner:unit.owner + 0,
		turn:game.get_turn() + 0,x:tile.x + 0,y:tile.y + 0,action:action,fee:fee + 0,base_fee:base_fee + 0,paid_fee:paid_fee + 0,credits:credits + 0,
		terrain_identity:prepared.identity,unit_identity:identity,plan:prepared.patches,source_elevation:prepared.source_elevation,source_water:prepared.source_water,
		destination_elevation:prepared.destination_elevation,destination_water:prepared.destination_water,resuming:resuming};
};
return {
	policy:policy,fee_policy:fee_policy,known:known,band:band,owner:owner,plan:plan,quote:quote,failure:fail,
	validate_confirmation:(e,unit) => {
		if (!#is_defined(e.data.confirmed_height) || #typeof(e.data.confirmed_height) != 'Bool' || !e.data.confirmed_height || !#is_defined(e.data.height_quote) || #typeof(e.data.height_quote) != 'Object') { return 'Elevation work requires its current quote and explicit payment confirmation'; }
		const current = quote(e.game,unit,e.data.action); if (!current.supported) { return current.reason; }
		if (current != e.data.height_quote) { return 'The elevation quote changed; reopen it before confirming'; }
	},
	payment:(game,unit,current_quote) => {
		if (current_quote.resuming) { return unit.get_terraforming().height; }
		return {version:1,policy:policy,fee_policy:fee_policy,owner:unit.owner + 0,issued_turn:game.get_turn() + 0,fee:current_quote.fee + 0,
			source_elevation:current_quote.source_elevation + 0,source_water:current_quote.source_water,terrain_identity:current_quote.terrain_identity};
	},
};
