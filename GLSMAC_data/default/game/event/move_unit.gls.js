const cost_policy = #include('../movement_cost');
const evaluate_cost = cost_policy.evaluate;

// Installed manual p102 describes ships in bases as in port. This bounded
// noncombat entry uses actual owned coastal bases; it cannot cross inland.
const owned_port = (actor, tile) => {
 const base = tile.get_base();
 if (base == null || base.get_owner().id != actor.owner) { return false; }
 const neighbors = tile.get_surrounding_tiles();
 for (neighbor of neighbors) { if (neighbor.is_water) { return true; } }
 return false;
};
// One noncombat edge validator shared by actual movement and future route
// edges. Actual commands always supply their unit's live native source tile.
const validate_at = (game, actor, src_tile, dst_tile) => {
 if (src_tile == dst_tile) { return 'Source tile is same as destination tile'; }
 if (src_tile.is_locked()) { return 'Source tile is locked'; }
 if (dst_tile.is_locked()) { return 'Destination tile is locked'; }
 if (actor.is_immovable) { return 'Unit is immovable'; }
 if (!src_tile.is_adjactent_to(dst_tile)) { return 'Destination tile is not adjactent to source tile'; }
 if (actor.is_land && dst_tile.is_water) { return 'Land units can\'t move to water tile'; }
 if (actor.is_water && dst_tile.is_land) {
  if (!owned_port(actor,dst_tile) || (!src_tile.is_water && !owned_port(actor,src_tile))) { return 'Water units require an owned coastal port'; }
 }
 for (occupant of dst_tile.get_units()) {
  if (occupant.owner != actor.owner) { return 'Destination tile contains foreign units (combat not implemented yet)'; }
 }
};

const validate_rollback = (e) => {
 const expected = e.applied.expected; const unit = e.data.unit; const tile = unit.get_tile();
 if (!e.applied.completed || tile.is_locked() || tile.x != expected.x || tile.y != expected.y || unit.movement != expected.movement ||
  unit.moved_this_turn != expected.moved || unit.get_terraforming() != e.applied.expected_work ||
  unit.get_order() != e.applied.expected_order) { throw Error('Movement receipt is stale'); }
 if (#is_defined(e.applied.expected_recovery) && unit.get_terraforming_recovery() != e.applied.expected_recovery) { throw Error('Movement recovery receipt is stale'); }
 if (#is_defined(e.applied.expected_plan) && unit.get_automation() != e.applied.expected_plan) { throw Error('Movement plan receipt is stale'); }
};

return {

	observe_cost: evaluate_cost,
	validate_rollback: validate_rollback,

	validate_at: validate_at,
	validate: (e) => {
		if (e.data.unit.owner != e.caller) { return 'Unit can only be moved by it\'s owner'; }
		if (e.data.unit.movement <= 0.0) { return 'Unit is out of moves'; }
		if (#is_defined(e.data.automation_epoch) || #is_defined(e.data.automation_cursor)) {
			const plan = e.data.unit.get_automation();
			if (#typeof(e.data.automation_epoch) != 'Int' || #typeof(e.data.automation_cursor) != 'Int' || plan.command == '' ||
				e.data.automation_epoch != plan.epoch || e.data.automation_cursor != plan.cursor + 1) { return 'Automation movement intent is stale'; }
		}
		return validate_at(e.game,e.data.unit,e.data.unit.get_tile(),e.data.tile);
	},

	resolve: (e) => {

		const movement = e.data.unit.movement + 0.0;

		const src_tile = e.data.unit.get_tile();
		const dst_tile = e.data.tile;

		const cost = evaluate_cost(e); const road_rate = cost.road_rate;
		if (road_rate > 0 && #round(movement * #to_float(road_rate)) >= 1) {
			return {is_movement_successful: true};
		}
		const movement_cost = cost.base_cost;

		return {
			is_movement_successful:
				(movement >= movement_cost) // unit has enough moves
				||
				(e.game.random.get_float(0.0, movement_cost) < movement) // unit doesn't have enough moves but was lucky
		};
	},

	apply: (e) => {

		const unit = e.data.unit;
		const original_work = unit.get_terraforming();
		const original_recovery = #is_defined(unit.get_terraforming_recovery) ? unit.get_terraforming_recovery() : undefined;
		const original_order = unit.get_order();
		let original_plan = undefined;
		if (!#is_defined(e.data.automation_epoch) && #is_defined(unit.get_automation) && unit.get_automation().command != '') {
			original_plan = unit.get_automation(); #include('../terraforming_automation').cancel(e.game,unit);
		}
		const src_tile = unit.get_tile();
		const dst_tile = e.data.tile;

		const movement = unit.movement + 0.0;
		const cost = evaluate_cost(e); const road_rate = cost.road_rate;

		const result = {
			orig: {
				tile: src_tile,
				movement: movement,
				moved_this_turn: unit.moved_this_turn == true,
				work: original_work,
				recovery: original_recovery,
				order: original_order,
			}
		};

		const movement_cost = cost.total_cost;
		let remaining = movement >= movement_cost ? movement - movement_cost : 0.0;
		if (road_rate > 0) { const steps = #round(movement * #to_float(road_rate)); remaining = steps > 1 ? #to_float(steps - 1) / #to_float(road_rate) : 0.0; }
		result.expected = {x:e.resolved.is_movement_successful ? dst_tile.x + 0 : src_tile.x + 0,
			y:e.resolved.is_movement_successful ? dst_tile.y + 0 : src_tile.y + 0,movement:remaining,moved:true};
		result.original_plan = original_plan;
		result.completed = false;
		const unit_id = unit.id + 0; const owner = unit.owner + 0; const turn = e.game.get_turn() + 0;
		const automation_epoch = #is_defined(e.data.automation_epoch) ? e.data.automation_epoch : 0;
		const automation_cursor = #is_defined(e.data.automation_cursor) ? e.data.automation_cursor : 0;

		let next = () => {
			unit.movement = remaining;
			unit.moved_this_turn = true;
			// Native SetTile may abandon a paid height job/recovery marker.
			// Seal the actual post-callback state before scheduling another step.
			result.expected_work = unit.get_terraforming();
			result.expected_recovery = #is_defined(unit.get_terraforming_recovery) ? unit.get_terraforming_recovery() : undefined;
			result.expected_order = unit.get_order();
			result.expected_plan = #is_defined(unit.get_automation) ? unit.get_automation() : undefined;
			result.completed = true;
			if (automation_epoch > 0 && e.resolved.is_movement_successful) {
				#include('../terraforming_automation').after_move(e.game,unit_id,owner,automation_epoch,automation_cursor,turn);
			}
		};

		if (e.resolved.is_movement_successful) {
			unit.move_to_tile(dst_tile, next);
		} else {
			next();
		}

		return result;
	},

	rollback: (e, after_restore) => {

		const unit = e.data.unit;
		const orig = e.applied.orig;
		validate_rollback(e);
		const restore = () => {
			const same_intent = !#is_defined(e.applied.expected_plan) || unit.get_automation() == e.applied.expected_plan;
			if (#is_defined(e.applied.original_plan) && same_intent) { unit.set_automation(e.applied.original_plan); }
			if (unit.get_terraforming() != orig.work) { unit.set_terraforming(orig.work); }
			if (#is_defined(orig.recovery)) { unit.set_terraforming_recovery(orig.recovery); }
			if (same_intent && orig.order != 'TERRAFORM' && orig.order != 'AUTOMATE') { unit.set_order(orig.order); }
			unit.movement = orig.movement;
			unit.moved_this_turn = orig.moved_this_turn;
			if (#is_defined(after_restore)) { after_restore(); }
		};
		// An unsuccessful partial-MP attempt debits movement without changing
		// tiles. Its receipt still needs undo, but native movement correctly
		// rejects a second move onto the actor's current tile.
		if (unit.get_tile() == orig.tile) { restore(); }
		else { unit.move_to_tile(orig.tile, restore); }
	},

};
