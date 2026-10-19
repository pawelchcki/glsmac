const orders = #include('../unit_orders');
return {
	validate: (e) => { return orders.validate(e, false); },
	apply: (e) => {
		const unit = orders.apply_unit(e, false);
		const result = { original_order: unit.get_order(), owner: unit.owner }; result.unit = unit;
		unit.set_order('HOLD');
		return result;
	},
	rollback: (e) => { orders.rollback_unit(e).set_order(e.applied.original_order); },
};
