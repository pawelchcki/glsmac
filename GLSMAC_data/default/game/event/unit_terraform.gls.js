const orders = #include('../unit_orders');
const work = #include('../terraforming');
const height = #include('../terraforming_height');
const height_group = #include('../terraforming_height_group');
const cooperation = #include('../terraforming_cooperation');
const begin = (game,unit,action,height_quote,manual) => {
	const tile = unit.get_tile();
	const receipt = {owner:unit.owner,turn:game.get_turn() + 0,manual:manual,original_plan:unit.get_automation(),original_order:unit.get_order(),original_work:unit.get_terraforming(),
		movement:unit.movement + 0.0,moved:unit.moved_this_turn == true,tile_x:tile.x,tile_y:tile.y,terrain:work.flags(game,tile)};
	receipt.unit = unit; receipt.original_recovery = unit.get_terraforming_recovery(); receipt.energy_receipt = 0; receipt.terrain_receipt = 0; receipt.group = []; receipt.cohort = [];
	try {
		if (manual && receipt.original_plan.command != '') { #include('../terraforming_automation').cancel(game,unit); }
		if (height.known(action)) {
			if (!#is_defined(height_quote) || !height_quote.supported) { throw Error('Confirm a current height quote before starting elevation work'); }
			const payer = height.owner(game,unit.owner);
			if (height_quote.fee > 0) { receipt.energy_receipt = payer.change_energy(0-height_quote.fee,height_quote.credits,game.get_turn()); }
			const previous = receipt.original_work; const rule = work.describe(game,unit,action);
			const initial = height_quote.resuming ? #clone(previous) : {action:action,work_units:0,required_work:rule.turns * 2,last_turn:0,
				previous_work_units:0,previous_movement:unit.movement + 0.0,previous_moved:unit.moved_this_turn == true,
				tile_x:tile.x + 0,tile_y:tile.y + 0,active:false};
			initial.active = false; initial.last_turn = 0;
			initial.height = height.payment(game,unit,height_quote); unit.set_terraforming(initial);
		}
		let prepared_job = undefined;
		if (!height.known(action)) { prepared_job = cooperation.prepare(game,unit,action,work.describe(game,unit,action).turns * 2); }
		receipt.terrain_receipt = work.start(game,unit,action,receipt,prepared_job);
	} catch { : (error) => {
		const payer = height.owner(game,unit.owner);
		if (receipt.terrain_receipt > 0) { game.get_tm().validate_terrain_rollback(receipt.terrain_receipt); }
		if (receipt.energy_receipt > 0) { payer.validate_energy_rollback(receipt.energy_receipt); }
		if (receipt.terrain_receipt > 0) { game.get_tm().rollback_terrain(receipt.terrain_receipt); }
		if (manual) { unit.set_automation(receipt.original_plan); }
		unit.set_terraforming(receipt.original_work); unit.set_terraforming_recovery(receipt.original_recovery);
		if (receipt.original_order != 'TERRAFORM' && receipt.original_order != 'AUTOMATE') { unit.set_order(receipt.original_order); }
		unit.movement = receipt.movement; unit.moved_this_turn = receipt.moved;
		if (receipt.energy_receipt > 0) { payer.rollback_energy(receipt.energy_receipt); }
		throw Error('Terraforming failed: ' + error.reason);
	} }
	receipt.expected_recovery = unit.get_terraforming_recovery(); receipt.expected_plan = unit.get_automation();
	receipt.expected_work = unit.get_terraforming(); receipt.expected_order = unit.get_order();
	receipt.expected_movement = unit.movement + 0.0; receipt.expected_moved = unit.moved_this_turn == true;
	receipt.expected_terrain = game.get_tm().get_terrain_state(tile.x,tile.y);
	return receipt;
};
const validate_undo = (game,unit,prior) => {
	const event = {data:{unit_id:unit.id + 0}}; event.game = game; event.applied = prior;
	orders.rollback_unit(event);
	const tile = unit.get_tile(); const tm = game.get_tm();
	height_group.validate(game,prior.group);
	cooperation.validate(game,prior.cohort);
	if (game.get_turn() != prior.turn || (prior.manual && unit.get_automation() != prior.expected_plan)) { throw Error('Terraforming plan receipt is stale'); }
	if (tile.x != prior.tile_x || tile.y != prior.tile_y || unit.get_terraforming() != prior.expected_work ||
		unit.get_order() != prior.expected_order || unit.get_terraforming_recovery() != prior.expected_recovery || unit.movement != prior.expected_movement || unit.moved_this_turn != prior.expected_moved ||
		tm.get_terrain_state(prior.tile_x,prior.tile_y) != prior.expected_terrain) { throw Error('Terraforming receipt is stale'); }
	if (prior.terrain_receipt > 0) { tm.validate_terrain_rollback(prior.terrain_receipt); }
	if (prior.energy_receipt > 0) { const payer = height.owner(game,prior.owner); if (payer == null) { throw Error('Elevation payer retired'); } payer.validate_energy_rollback(prior.energy_receipt); }
};
const undo = (game,unit,prior,restore_order) => {
	validate_undo(game,unit,prior);
	const tm = game.get_tm();
	if (prior.terrain_receipt > 0) { tm.rollback_terrain(prior.terrain_receipt); }
	height_group.rollback(prior.group);
	cooperation.rollback(prior.cohort);
	if (prior.manual) { unit.set_automation(prior.original_plan); }
	unit.set_terraforming(prior.original_work); unit.set_terraforming_recovery(prior.original_recovery);
	if (restore_order && prior.original_order != 'TERRAFORM' && prior.original_order != 'AUTOMATE') { unit.set_order(prior.original_order); }
	unit.movement = prior.movement; unit.moved_this_turn = prior.moved;
	if (prior.energy_receipt > 0) { height.owner(game,prior.owner).rollback_energy(prior.energy_receipt); }
	#include('../terraforming_view_revision').changed(game);
};
return {
	validate:work.validate,
	apply:(e) => {
		const error = work.validate(e); if (#is_defined(error)) { throw Error(error); }
		return begin(e.game,orders.resolve(e.game,e.data),e.data.action,e.data.height_quote,true);
	},
	rollback:(e) => { const unit = orders.rollback_unit(e); undo(e.game,unit,e.applied,true); },
	// Backend plans have already established live owner/epoch/turn authority.
	// Their step eligibility stays shared with ordinary primitive work. The
	// plan event seals expected_order after its own state update, prevalidates
	// both receipts, and restores its native plan/order after primitive undo.
	apply_plan:(game,unit,action) => {
		const error = work.validate_plan_step(game,unit,action); if (#is_defined(error)) { throw Error(error); }
		if (height.known(action)) { throw Error('Automation requires separate explicit paid elevation consent'); }
		return begin(game,unit,action,undefined,false);
	},
	validate_plan_rollback:validate_undo,
	rollback_plan:(game,unit,receipt) => { undo(game,unit,receipt,false); },
};
