const orders = #include('../unit_orders');
const work = #include('../terraforming');
return {
	validate: work.validate,
	apply: (e) => {
		const error = work.validate(e); if (#is_defined(error)) { throw Error(error); }
		const unit = orders.resolve(e.game, e.data); const tile = unit.get_tile();
		const receipt = {owner: unit.owner, original_order: unit.get_order(), original_work: unit.get_terraforming(),
			movement: unit.movement + 0.0, moved: unit.moved_this_turn == true, tile_x: tile.x, tile_y: tile.y, terrain: work.flags(e.game, tile)};
		receipt.unit = unit;
		work.start(e.game, unit, e.data.action);
		return receipt;
	},
	rollback: (e) => {
		const unit = orders.rollback_unit(e); const prior = e.applied;
		e.game.get_tm().set_terraforming(prior.tile_x, prior.tile_y, prior.terrain);
		unit.set_terraforming(prior.original_work);
		if (prior.original_order != 'TERRAFORM') { unit.set_order(prior.original_order); }
		unit.movement = prior.movement; unit.moved_this_turn = prior.moved;
	},
};
