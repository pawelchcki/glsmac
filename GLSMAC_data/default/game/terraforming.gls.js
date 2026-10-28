// Authoritative worker policy. Installed TERRAIN declarations supply land/sea
// work rates, prerequisites and labels.
const source_rules = #include('./terraforming_rules');
const effects = #include('./terraforming_effects');
const height = #include('./terraforming_height');
const height_group = #include('./terraforming_height_group');
const cooperation = #include('./terraforming_cooperation');
const view_revision = #include('./terraforming_view_revision');
const describe = (game, unit, action) => {
	const rules = game.get('terraforming_rules');
	if (height.known(action) && unit.is_water && #is_defined(rules[action])) { return rules[action].sea; }
	return source_rules.for_tile(rules, unit.get_tile(), action);
};
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
	if (!def.can_terraform || (!unit.is_land && !unit.is_water) || unit.health <= 0.0) { return 'Only a living land or sea terraforming unit can do this work'; }
	if (tile.is_locked()) { return 'Terraforming tile is locked'; }
	let height_plan = null; if (height.known(action)) { height_plan = height.plan(game,unit,action); if (!height_plan.supported) { return height_plan.reason; } }
	let cooperative_plan = null;
	for (other of tile.get_units()) {
		const state = other.get_terraforming();
		if (other.id != unit.id && state.active) {
			if (height.known(action)) {
				if (other.owner != unit.owner || state.action != action || !#is_defined(state.height) || state.height.terrain_identity != height_plan.identity || state.required_work != rule.turns * 2) { return 'Another incompatible terraforming job is active on this square'; }
			} else {
				if (cooperative_plan == null) {
					let failure = '';
					try { cooperative_plan = cooperation.prepare(game,unit,action,rule.turns * 2); }
					catch { : (error) => { failure = error.reason + ''; } }
					if (failure != '') { return failure; }
				}
				if (!cooperation.matches(other,state,action,rule.turns * 2,cooperative_plan.job,tile.x,tile.y,unit.is_water)) { return 'Another incompatible terraforming job is active on this square'; }
			}
		}
	}
	if (height.known(action)) { return; }
	return effects.validate(game,unit,action);
};
const needs_confirmation = (game, unit, action) => { return #sizeof(effects.replacements(game,unit,action)) > 0; };
const can_resume_exhausted = (game, unit, action) => {
	const state = unit.get_terraforming(); const tile = unit.get_tile();
	const rule = describe(game,unit,action);
	const ready = unit.movement == 0.0 && unit.moved_this_turn && !state.active && state.action == action && state.work_units > 0 &&
		state.tile_x == tile.x && state.tile_y == tile.y && state.required_work == rule.turns * 2 &&
		state.previous_movement > 0.0 && state.previous_movement <= unit.get_def().movement_per_turn;
	if (!ready) { return false; }
	if (#is_defined(state.job)) {
		let same = false;
		try { same = cooperation.prepare(game,unit,action,rule.turns * 2).job == state.job; }
		catch { : (error) => { same = false; } }
		return same;
	}
	return true;
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
	} else if (unit.get_automation().command == '') {
		const readiness = orders.validate(e, true); if (#is_defined(readiness)) { return readiness; }
	}
	// Manual work can replace an active plan only after every normal domain,
	// budget and consent check; selection itself never changes the intent.
	return orders.automation_cancel_error(e,unit);
};
const tick_apply = (game, unit, action, receipt, prepared_job) => {
	const tile = unit.get_tile(); const rule = describe(game,unit,action); const required = rule.turns * 2;
	const previous = unit.get_terraforming();
	let completed = 0;
	if (previous.tile_x == tile.x && previous.tile_y == tile.y && (!#is_defined(previous.height) || previous.action == action)) { completed = previous.work_units; }
	if (height.known(action)) {
		receipt.group = height_group.collect(unit,action);
		for (member of receipt.group) { completed = #max(completed,member.work.work_units); }
	}
	let cooperative_plan = null; let own_completed = completed;
	if (!height.known(action) && (#is_defined(prepared_job) || #is_defined(previous.job))) {
		cooperative_plan = #is_defined(prepared_job) ? prepared_job : cooperation.prepare(game,unit,action,required);
		if (!#is_defined(prepared_job) && previous.job != cooperative_plan.job) { throw Error('Terrain changed during cooperative work; issue a new order'); }
		// Existing observed manual switching carries this worker's own credit.
		// It never carries another participant's work or stale same-job terrain.
		if (#is_defined(previous.job) && previous.action == action && previous.job != cooperative_plan.job) { own_completed = 0; }
		receipt.cohort = cooperation.collect(unit,action,required,cooperative_plan.job);
		completed = own_completed; let found = false;
		for (member of receipt.cohort) {
			if (member.unit.id == unit.id) { found = true; } else { completed = completed + member.work.work_units; }
		}
		if (!found) { receipt.cohort :+ cooperation.capture(unit); }
	}
	const movement = unit.movement + 0.0; const moved = unit.moved_this_turn == true;
	if (movement == 0.0) {
		// A cancelled first work tick can be ordered again while exhausted.
		// It resumes next turn; issuing this order earns no extra work.
		previous.active = true; previous.last_turn = game.get_turn();
		unit.set_terraforming(previous); return 0;
	}
	let terrain_receipt = 0; let prepared_height = null;
	if (height.known(action)) {
		prepared_height = height.plan(game,unit,action);
		if (!prepared_height.supported || !#is_defined(previous.height) || previous.height.terrain_identity != prepared_height.identity) { throw Error('Paid elevation work no longer matches its sealed terrain'); }
	}
	if (completed + 2 >= required) {
		const worker_ids = [];
		if (height.known(action)) { for (member of receipt.group) { worker_ids :+ (member.unit.id + 0); } } else if (cooperative_plan != null) { for (member of receipt.cohort) { worker_ids :+ (member.unit.id + 0); } } else { worker_ids :+ unit.id + 0; }
		terrain_receipt = game.get_tm().apply_terrain(height.known(action) ? prepared_height.patches : (cooperative_plan != null ? cooperative_plan.patches : effects.plan(game,unit,action)),worker_ids);
		receipt.terrain = terrain_receipt;
		if (height.known(action)) {
			for (member of receipt.group) {
				const worker = member.unit; const current_tile = worker.get_tile();
				worker.set_terraforming_recovery(worker.is_water && current_tile.is_land ? {active:true,x:current_tile.x + 0,y:current_tile.y + 0} : {active:false,x:0,y:0});
				worker.set_terraforming(empty());
			}
		}
		if (cooperative_plan != null) {
			receipt.cohort_modified = true;
			for (member of receipt.cohort) { const worker = member.unit; worker.set_terraforming(empty()); if (member.order != 'TERRAFORM' && member.order != 'AUTOMATE') { worker.set_order(member.order); } }
		}
		unit.set_terraforming(empty());
	} else {
		const own_next = cooperative_plan != null ? own_completed : completed;
		const next = {action: action, work_units: own_next + 2, required_work: required, last_turn: game.get_turn(),
			previous_work_units: own_next, previous_movement: movement, previous_moved: moved, tile_x: tile.x, tile_y: tile.y, active: true};
		if (cooperative_plan != null) { next.job = cooperative_plan.job; }
		if (height.known(action)) { next.height = previous.height; }
		unit.set_terraforming(next);
		if (height.known(action)) {
			for (member of receipt.group) { if (member.unit.id != unit.id) { const shared = member.unit.get_terraforming(); shared.work_units = completed + 2; member.unit.set_terraforming(shared); } }
		}
	}
	unit.movement = 0.0; unit.moved_this_turn = true;
	return terrain_receipt;
};
const tick = (game,unit,action,output,prepared_job) => {
	const original = unit.get_terraforming(); const order = unit.get_order(); const movement = unit.movement + 0.0;
	const moved = unit.moved_this_turn == true; const recovery = unit.get_terraforming_recovery(); const receipt = {terrain:0,group:[],cohort:[],cohort_modified:false};
	try {
		const result = tick_apply(game,unit,action,receipt,prepared_job);
		if (#is_defined(output)) { output.group = []; for (member of receipt.group) { if (member.unit.id != unit.id) { output.group :+ #clone(member); } } height_group.seal(output.group); }
		if (#is_defined(output)) {
			output.cohort = [];
			if (receipt.cohort_modified) { for (member of receipt.cohort) { if (member.unit.id != unit.id) { output.cohort :+ #clone(member); } } }
			cooperation.seal(output.cohort);
		}
		view_revision.changed(game);
		return result;
	} catch { : (error) => {
		if (receipt.terrain > 0) { game.get_tm().validate_terrain_rollback(receipt.terrain); game.get_tm().rollback_terrain(receipt.terrain); }
		height_group.rollback(receipt.group);
		if (receipt.cohort_modified) { cooperation.rollback(receipt.cohort); }
		unit.set_terraforming(original); unit.set_terraforming_recovery(recovery);
		if (order != 'TERRAFORM' && order != 'AUTOMATE') { unit.set_order(order); }
		unit.movement = movement; unit.moved_this_turn = moved; throw Error('Terraforming failed: ' + error.reason);
	} }
};

return {
	flags: flags,
	quote_height:(e) => {
		const error = validate_selection(e); if (#is_defined(error)) { return height.failure(error); }
		return height.quote(e.game,#include('./unit_orders').resolve(e.game,e.data),e.data.action);
	},
	describe: describe,
	cohort_state:cooperation.state,
	prerequisite_error: prerequisite_error,
	needs_confirmation: needs_confirmation,
	validate_selection: (e) => { return validate_selection(e); },
	validate: (e) => {
		const reason = validate_selection(e); if (#is_defined(reason)) { return reason; }
		const unit = #include('./unit_orders').resolve(e.game, e.data);
		if (#is_defined(e.data.replace_existing) && #typeof(e.data.replace_existing) != 'Bool') { return 'Replacement confirmation must be boolean'; }
		if (needs_confirmation(e.game, unit, e.data.action) && (!#is_defined(e.data.replace_existing) || !e.data.replace_existing)) { return 'Improvement replacement requires confirmation'; }
		if (height.known(e.data.action)) { return height.validate_confirmation(e,unit); }
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
	// Accepting a distinct automation job abandons payment identity, without
	// refunding committed money, restoring movement or clearing safe recovery.
	abandon_paid_height:(game,unit) => { if (#is_defined(unit.get_terraforming().height)) { unit.set_terraforming(empty()); view_revision.changed(game); } },
	cancel: (game, unit) => {
		const state = unit.get_terraforming();
		if (!state.active) { return; }
		if (height.known(state.action)) { state.active = false; state.last_turn = 0; unit.set_terraforming(state); view_revision.changed(game); return; }
		if (state.last_turn == game.get_turn() && !state.previous_moved &&
			state.previous_work_units > 0 && state.work_units > state.previous_work_units) {
			state.work_units = state.previous_work_units;
			unit.movement = state.previous_movement; unit.moved_this_turn = state.previous_moved;
		}
		state.active = false; state.last_turn = 0; state.previous_work_units = state.work_units;
		unit.set_terraforming(state); view_revision.changed(game);
	},
	configure: (game) => {
		game.get_um().on('automation_step_pending', (e) => {
			const request = {caller:e.caller}; request.game = game; request.data = e.data;
			return #include('./terraforming_automation').pending_step(request);
		});
		game.get_um().on('unit_turn_ready', (e) => {
			if (e.unit.get_automation().command != '') { #include('./terraforming_automation').enqueue(game,e.unit); return; }
			const state = e.unit.get_terraforming();
			if (!state.active || state.last_turn >= game.get_turn()) { return; }
			const tile = e.unit.get_tile();
			if (height.known(state.action)) {
				const prepared = height.plan(game,e.unit,state.action);
				if (!prepared.supported || !#is_defined(state.height) || state.height.terrain_identity != prepared.identity) {
					const reason = prepared.supported ? 'Terrain changed during paid elevation work; issue a new confirmed order' : prepared.reason;
					e.unit.set('terraforming_failure',{policy:height.policy,action:state.action,turn:game.get_turn() + 0,reason:reason,paid_fee:#is_defined(state.height) ? state.height.fee : 0});
					e.unit.set_terraforming(empty()); view_revision.changed(game); game.message('Elevation work stopped: ' + reason); return;
				}
			}
			if (#is_defined(state.job)) {
				let reason = '';
				try { if (cooperation.prepare(game,e.unit,state.action,state.required_work).job != state.job) { reason = 'Terrain changed during cooperative work; issue a new order'; } }
				catch { : (error) => { reason = error.reason + ''; } }
				if (reason != '') { e.unit.set('terraforming_failure',{policy:cooperation.policy,action:state.action,turn:game.get_turn() + 0,reason:reason}); e.unit.set_terraforming(empty()); view_revision.changed(game); game.message('Terraforming work stopped: ' + reason); return; }
			}
			if (tile.x != state.tile_x || tile.y != state.tile_y || e.unit.movement != e.unit.get_def().movement_per_turn || #is_defined(eligible(game, e.unit, state.action))) {
				e.unit.set_terraforming(empty()); view_revision.changed(game); return;
			}
			tick(game, e.unit, state.action);
		});
	},
};
