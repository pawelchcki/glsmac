// Authoritative worker policy. Installed TERRAIN declarations supply land/sea
// work rates, prerequisites and labels.
const source_rules = #include('./terraforming_rules');
const effects = #include('./terraforming_effects');
const describe = (game, unit, action) => { return source_rules.for_tile(game.get('terraforming_rules'), unit.get_tile(), action); };
const empty = () => { return {action: '', work_units: 0, required_work: 0, last_turn: 0,
	previous_work_units: 0, previous_movement: 0.0, previous_moved: false, tile_x: 0, tile_y: 0, active: false}; };
const flags = (game, tile) => {
	const data = game.get_tm().get_terraforming(tile.x, tile.y);
	return {road: data.road, farm: data.farm, mine: data.mine, forest: data.forest};
};
const prerequisite_error = (game, owner, prerequisite) => {
	if (prerequisite == 'Disable') { return 'Terraforming action is disabled'; }
	if (game.get_settings().global.rules.get_terraforming_policy().ignore_technologies) { return; }
	if (prerequisite != 'None') {
		let owned = false;
		if (game.get('technologies_initialized') == true) {
			for (definition of game.get('technology_rules')) {
				if (definition.token == prerequisite && game.technologies.has_tech(definition.id, owner + 1)) { owned = true; }
			}
		} else {
			// Declared pre-technology startup sources have only faction grants.
			for (player of game.get_players()) {
				if (player.id == owner) {
					for (token of player.get_faction().starting_technologies) { if (token == prerequisite) { owned = true; } }
				}
			}
		}
		if (!owned) { return 'Terraforming prerequisite is not owned'; }
	}
};
const eligible = (game, unit, action) => {
	const rule = describe(game,unit,action);
	if (rule == null) { return 'Terraforming source declaration is missing'; }
	if (!rule.enabled) { return 'Terraforming action is disabled'; }
	const reason = prerequisite_error(game,unit.owner,rule.prerequisite); if (#is_defined(reason)) { return reason; }
	const def = unit.get_def(); const tile = unit.get_tile();
	if (!def.can_terraform || (!unit.is_land && !unit.is_water) || unit.health != def.health_max) { return 'Requires a healthy surface Terraforming module'; }
	if (tile.is_locked()) { return 'Terraforming tile is locked'; }
	for (other of tile.get_units()) {
		if (other.id != unit.id && other.get_terraforming().active) { return 'Multiple Former work is not supported yet'; }
	}
	return effects.validate(game,unit,action);
};
const needs_confirmation = (game, unit, action) => { return #sizeof(effects.replacements(game,unit,action)) > 0; };
const can_resume_exhausted = (game, unit, action) => {
	const state = unit.get_terraforming(); const tile = unit.get_tile();
	const rule = describe(game,unit,action);
	return unit.movement == 0.0 && unit.moved_this_turn && !state.active && state.action == action && state.work_units > 0 &&
		state.tile_x == tile.x && state.tile_y == tile.y && state.required_work == rule.turns * 2 &&
		state.previous_movement > 0.0 && state.previous_movement <= unit.get_def().movement_per_turn;
};
// Read-only selection preflight. Actual replacement/fee/target consent remains
// a separate commit validation step, never synthesized by menu availability.
const validate_selection = (e) => {
	const orders = #include('./unit_orders'); const error = orders.validate(e, false);
	if (#is_defined(error)) { return error; }
	const unit = orders.resolve(e.game, e.data);
	if (unit.movement > unit.get_def().movement_per_turn) { return 'Work exceeds its actual movement budget'; }
	const reason = eligible(e.game, unit, e.data.action); if (#is_defined(reason)) { return reason; }
	if (unit.movement <= 0.0) {
		if (!can_resume_exhausted(e.game, unit, e.data.action)) { return 'Unit has no pending moves'; }
	} else {
		const readiness = orders.validate(e, true); if (#is_defined(readiness)) { return readiness; }
	}
};
const tick = (game, unit, action) => {
	const tile = unit.get_tile(); const rule = describe(game,unit,action); const required = rule.turns * 2;
	const previous = unit.get_terraforming();
	let completed = 0;
	if (previous.tile_x == tile.x && previous.tile_y == tile.y) { completed = previous.work_units; }
	const movement = unit.movement + 0.0; const moved = unit.moved_this_turn == true;
	if (movement == 0.0) {
		// A cancelled first work tick can be ordered again while exhausted.
		// It resumes next turn; issuing this order earns no extra work.
		previous.active = true; previous.last_turn = game.get_turn();
		unit.set_terraforming(previous); return 0;
	}
	let terrain_receipt = 0;
	if (completed + 2 >= required) {
		terrain_receipt = game.get_tm().apply_terrain(effects.plan(game,unit,action),[unit.id + 0]);
		unit.set_terraforming(empty());
	} else {
		unit.set_terraforming({action: action, work_units: completed + 2, required_work: required, last_turn: game.get_turn(),
			previous_work_units: completed, previous_movement: movement, previous_moved: moved, tile_x: tile.x, tile_y: tile.y, active: true});
	}
	unit.movement = 0.0; unit.moved_this_turn = true;
	return terrain_receipt;
};
return {
	flags: flags,
	describe: describe,
	prerequisite_error: prerequisite_error,
	needs_confirmation: needs_confirmation,
	validate_selection: (e) => { return validate_selection(e); },
	validate: (e) => {
		const reason = validate_selection(e); if (#is_defined(reason)) { return reason; }
		const unit = #include('./unit_orders').resolve(e.game, e.data);
		if (#is_defined(e.data.replace_existing) && #typeof(e.data.replace_existing) != 'Bool') { return 'Replacement confirmation must be boolean'; }
		if (needs_confirmation(e.game, unit, e.data.action) && (!#is_defined(e.data.replace_existing) || !e.data.replace_existing)) { return 'Improvement replacement requires confirmation'; }
	},
	validate_plan_step:(game,unit,action) => {
		const plan = unit.get_automation();
		if (plan.command == '' || plan.owner != unit.owner || plan.issued_turn > game.get_turn()) { return 'Worker plan is not current'; }
		const event = {caller:unit.owner + 0,data:{unit_id:unit.id + 0}}; event.game = game;
		const error = #include('./unit_orders').validate(event,false); if (#is_defined(error)) { return error; }
		if (unit.movement <= 0.0 || unit.movement > unit.get_def().movement_per_turn) { return 'Worker plan has no valid movement budget'; }
		const reason = eligible(game,unit,action); if (#is_defined(reason)) { return reason; }
		const state = unit.get_terraforming();
		if (state.active && state.last_turn >= game.get_turn()) { return 'Worker already received its turn credit'; }
		if (needs_confirmation(game,unit,action)) { return 'Worker plan cannot invent replacement consent'; }
	},
	start: tick,
	cancel: (game, unit) => {
		const state = unit.get_terraforming();
		if (!state.active) { return; }
		if (state.last_turn == game.get_turn() && !state.previous_moved &&
			state.previous_work_units > 0 && state.work_units > state.previous_work_units) {
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
			if (tile.x != state.tile_x || tile.y != state.tile_y || e.unit.movement != e.unit.get_def().movement_per_turn || #is_defined(eligible(game, e.unit, state.action))) {
				e.unit.set_terraforming(empty()); return;
			}
			tick(game, e.unit, state.action);
		});
	},
};
