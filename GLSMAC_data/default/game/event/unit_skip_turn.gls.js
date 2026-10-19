const orders = #include('../unit_orders');
return {

	validate: (e) => {
		return orders.validate(e, true);
	},

	apply: (e) => {
		const unit = orders.apply_unit(e, true);

		const result = {
			// Numeric native fields are live Ptr values. Materialize a value
			// before mutation so rollback does not retain a reference to zero.
			original_movement: unit.movement + 0.0,
			owner: unit.owner,
		};
		result.unit = unit;

		unit.movement = 0.0;

		return result;
	},

	rollback: (e) => {
		const unit = orders.rollback_unit(e);
		unit.movement = e.applied.original_movement;
	},

};
