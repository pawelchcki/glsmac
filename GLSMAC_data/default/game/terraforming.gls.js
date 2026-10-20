// First bounded work policy: one healthy ordinary Former on flat arid land.
// Installed TERRAIN declarations supply work rates, prerequisites and labels.
const empty = () => { return {action: '', work_units: 0, required_work: 0, last_turn: 0,
	previous_work_units: 0, previous_movement: 0.0, previous_moved: false, tile_x: 0, tile_y: 0, active: false}; };
const flags = (game, tile) => {
	const data = game.get_tm().get_terraforming(tile.x, tile.y);
	return {road: data.road, farm: data.farm, mine: data.mine, forest: data.forest};
};
const eligible = (game, unit, action) => {
	if (action != 'farm' && action != 'mine' && action != 'forest' && action != 'road') { return 'Unknown terraforming action'; }
	const def = unit.get_def(); const tile = unit.get_tile();
	if (def.id != 'Formers' || !unit.is_land || def.movement_per_turn != 1.0 || unit.health != def.health_max) { return 'Requires a healthy ordinary Former'; }
	if (!tile.is_land || tile.moisture != 1 || tile.rockiness != 1 || tile.features.xenofungus || tile.get_base() != null) { return 'Work currently supports flat arid non-base land'; }
	if (tile.is_locked()) { return 'Terraforming tile is locked'; }
	const cached = unit.get_terraforming();
	if (cached.work_units > 0 && cached.tile_x == tile.x && cached.tile_y == tile.y && cached.action != action) { return 'Switching unfinished terrain work is not supported yet'; }
	for (other of tile.get_units()) {
		if (other.id != unit.id && other.get_terraforming().active) { return 'Multiple Former work is not supported yet'; }
	}
	const data = game.get_tm().get_terraforming(tile.x, tile.y);
	if (data[action]) { return 'Improvement already exists'; }
	if (data.forest && action != 'road' || action == 'forest' && (data.farm || data.mine || data.solar)) { return 'Improvement replacement requires confirmation'; }
	const rules = game.get('terraforming_rules'); const rule = rules[action];
	if (rule.prerequisite == 'Disable') { return 'Terraforming action is disabled'; }
	if (rule.prerequisite != 'None') {
		let owned = false;
		for (player of game.get_players()) {
			if (player.id == unit.owner) {
				for (token of player.get_faction().starting_technologies) { if (token == rule.prerequisite) { owned = true; } }
			}
		}
		if (!owned) { return 'Terraforming prerequisite is not owned'; }
	}
};
const tick = (game, unit, action) => {
	const tile = unit.get_tile(); const rules = game.get('terraforming_rules'); const rule = rules[action]; const required = rule.turns * 2;
	const previous = unit.get_terraforming();
	let completed = 0;
	if (previous.action == action && previous.tile_x == tile.x && previous.tile_y == tile.y && previous.required_work == required) { completed = previous.work_units; }
	const movement = unit.movement + 0.0; const moved = unit.moved_this_turn == true;
	if (completed + 2 >= required) {
		const data = flags(game, tile); data[action] = true;
		game.get_tm().set_terraforming(tile.x, tile.y, data);
		unit.set_terraforming(empty());
	} else {
		unit.set_terraforming({action: action, work_units: completed + 2, required_work: required, last_turn: game.get_turn(),
			previous_work_units: completed, previous_movement: movement, previous_moved: moved, tile_x: tile.x, tile_y: tile.y, active: true});
	}
	unit.movement = 0.0; unit.moved_this_turn = true;
};
return {
	flags: flags,
	validate: (e) => {
		const orders = #include('./unit_orders'); const error = orders.validate(e, true);
		if (#is_defined(error)) { return error; }
		const unit = orders.resolve(e.game, e.data);
		if (unit.movement != 1.0) { return 'Work requires a full movement point'; }
		return eligible(e.game, unit, e.data.action);
	},
	start: tick,
	cancel: (game, unit) => {
		const state = unit.get_terraforming();
		if (!state.active) { return; }
		if (state.last_turn == game.get_turn()) {
			state.work_units = state.previous_work_units;
			unit.movement = state.previous_movement; unit.moved_this_turn = state.previous_moved;
		}
		state.active = false; state.last_turn = 0; state.previous_work_units = state.work_units;
		unit.set_terraforming(state);
	},
	configure: (game) => {
		game.get_um().on('unit_turn_ready', (e) => {
			const state = e.unit.get_terraforming();
			if (!state.active || state.last_turn >= game.get_turn()) { return; }
			const tile = e.unit.get_tile();
			if (tile.x != state.tile_x || tile.y != state.tile_y || e.unit.movement != 1.0 || #is_defined(eligible(game, e.unit, state.action))) {
				e.unit.set_terraforming(empty()); return;
			}
			tick(game, e.unit, state.action);
		});
	},
};
