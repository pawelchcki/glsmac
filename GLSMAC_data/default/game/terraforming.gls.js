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
	for (other of tile.get_units()) {
		if (other.id != unit.id && other.get_terraforming().active) { return 'Multiple Former work is not supported yet'; }
	}
	const data = game.get_tm().get_terraforming(tile.x, tile.y);
	if (data[action]) { return 'Improvement already exists'; }
	if (data.forest && action != 'road' || action == 'forest' && (data.mine || data.solar)) { return 'This improvement replacement is not supported yet'; }
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
const needs_confirmation = (game, unit, action) => {
	return action == 'forest' && game.get_tm().get_terraforming(unit.get_tile().x, unit.get_tile().y).farm;
};
const can_resume_exhausted = (game, unit, action) => {
	const state = unit.get_terraforming(); const tile = unit.get_tile();
	const rules = game.get('terraforming_rules'); const rule = rules[action];
	return unit.movement == 0.0 && unit.moved_this_turn && !state.active && state.action == action && state.work_units > 0 &&
		state.tile_x == tile.x && state.tile_y == tile.y && state.required_work == rule.turns * 2 &&
		state.previous_moved && state.previous_movement > 0.0 && state.previous_movement < 1.0;
};
const tick = (game, unit, action) => {
	const tile = unit.get_tile(); const rules = game.get('terraforming_rules'); const rule = rules[action]; const required = rule.turns * 2;
	const previous = unit.get_terraforming();
	let completed = 0;
	if (previous.tile_x == tile.x && previous.tile_y == tile.y) { completed = previous.work_units; }
	const movement = unit.movement + 0.0; const moved = unit.moved_this_turn == true;
	if (movement == 0.0) {
		// A cancelled partial-move task can be ordered again while exhausted.
		// It resumes next turn; issuing this order earns no extra work.
		previous.active = true; previous.last_turn = game.get_turn();
		unit.set_terraforming(previous); return;
	}
	if (completed + 2 >= required) {
		const data = flags(game, tile); data[action] = true;
		if (action == 'forest') { data.farm = false; }
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
	needs_confirmation: needs_confirmation,
	validate: (e) => {
		const orders = #include('./unit_orders'); const error = orders.validate(e, false);
		if (#is_defined(error)) { return error; }
		const unit = orders.resolve(e.game, e.data);
		if (unit.movement > 1.0) { return 'Work requires at most one movement point'; }
		if (#is_defined(e.data.replace_existing) && #typeof(e.data.replace_existing) != 'Bool') { return 'Replacement confirmation must be boolean'; }
		const reason = eligible(e.game, unit, e.data.action); if (#is_defined(reason)) { return reason; }
		if (unit.movement <= 0.0) {
			if (!can_resume_exhausted(e.game, unit, e.data.action)) { return 'Unit has no pending moves'; }
		} else {
			const readiness = orders.validate(e, true); if (#is_defined(readiness)) { return readiness; }
		}
		if (needs_confirmation(e.game, unit, e.data.action) && (!#is_defined(e.data.replace_existing) || !e.data.replace_existing)) { return 'Improvement replacement requires confirmation'; }
	},
	start: tick,
	cancel: (game, unit) => {
		const state = unit.get_terraforming();
		if (!state.active) { return; }
		if (state.last_turn == game.get_turn() && !state.previous_moved) {
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
