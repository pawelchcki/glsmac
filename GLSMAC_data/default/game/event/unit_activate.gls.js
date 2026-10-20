const orders = #include('../unit_orders');
return {
	validate: (e) => { return orders.validate(e, false); },
	apply: (e) => {
		const unit = orders.apply_unit(e, false);
		const result = { original_order: unit.get_order(), owner: unit.owner }; result.unit = unit;
		if (result.original_order == 'TERRAFORM') {
			result.original_work = unit.get_terraforming(); result.movement = unit.movement + 0.0; result.moved = unit.moved_this_turn == true;
			#include('../terraforming').cancel(e.game, unit);
		}
		unit.set_order('NO_ORDERS');
		return result;
	},
	rollback: (e) => {
		const unit = orders.rollback_unit(e);
		if (e.applied.original_order == 'TERRAFORM') {
			unit.set_terraforming(e.applied.original_work); unit.movement = e.applied.movement; unit.moved_this_turn = e.applied.moved;
		}
		else { unit.set_order(e.applied.original_order); }
	},
};
