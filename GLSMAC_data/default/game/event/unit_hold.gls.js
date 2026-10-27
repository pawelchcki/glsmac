const orders = #include('../unit_orders');
return {
	validate: (e) => { return orders.validate(e, false); },
	apply: (e) => { return orders.ordinary_apply(e, 'HOLD', false); },
	rollback: orders.ordinary_rollback,
};
