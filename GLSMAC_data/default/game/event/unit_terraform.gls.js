const orders = #include('../unit_orders');
const work = #include('../terraforming');
const begin = (game,unit,action) => {
	const tile = unit.get_tile();
	const receipt = {owner:unit.owner,original_order:unit.get_order(),original_work:unit.get_terraforming(),
		movement:unit.movement + 0.0,moved:unit.moved_this_turn == true,tile_x:tile.x,tile_y:tile.y,terrain:work.flags(game,tile)};
	receipt.unit = unit;
	receipt.terrain_receipt = work.start(game,unit,action);
	receipt.expected_work = unit.get_terraforming(); receipt.expected_order = unit.get_order();
	receipt.expected_movement = unit.movement + 0.0; receipt.expected_moved = unit.moved_this_turn == true;
	receipt.expected_terrain = game.get_tm().get_terrain_state(tile.x,tile.y);
	return receipt;
};
const validate_undo = (game,unit,prior) => {
	const event = {data:{unit_id:unit.id + 0}}; event.game = game; event.applied = prior;
	orders.rollback_unit(event);
	const tile = unit.get_tile(); const tm = game.get_tm();
	if (tile.x != prior.tile_x || tile.y != prior.tile_y || unit.get_terraforming() != prior.expected_work ||
		unit.get_order() != prior.expected_order || unit.movement != prior.expected_movement || unit.moved_this_turn != prior.expected_moved ||
		tm.get_terrain_state(prior.tile_x,prior.tile_y) != prior.expected_terrain) { throw Error('Terraforming receipt is stale'); }
	if (prior.terrain_receipt > 0) { tm.validate_terrain_rollback(prior.terrain_receipt); }
};
const undo = (game,unit,prior,restore_order) => {
	validate_undo(game,unit,prior);
	const tm = game.get_tm();
	if (prior.terrain_receipt > 0) { tm.rollback_terrain(prior.terrain_receipt); }
	unit.set_terraforming(prior.original_work);
	if (restore_order && prior.original_order != 'TERRAFORM') { unit.set_order(prior.original_order); }
	unit.movement = prior.movement; unit.moved_this_turn = prior.moved;
};
return {
	validate:work.validate,
	apply:(e) => {
		const error = work.validate(e); if (#is_defined(error)) { throw Error(error); }
		return begin(e.game,orders.resolve(e.game,e.data),e.data.action);
	},
	rollback:(e) => { const unit = orders.rollback_unit(e); undo(e.game,unit,e.applied,true); },
	// Backend plans have already established live owner/epoch/turn authority.
	// Their step eligibility stays shared with ordinary primitive work. The
	// plan event seals expected_order after its own state update, prevalidates
	// both receipts, and restores its native plan/order after primitive undo.
	apply_plan:(game,unit,action) => {
		const error = work.validate_plan_step(game,unit,action); if (#is_defined(error)) { throw Error(error); }
		return begin(game,unit,action);
	},
	validate_plan_rollback:validate_undo,
	rollback_plan:(game,unit,receipt) => { undo(game,unit,receipt,false); },
};
