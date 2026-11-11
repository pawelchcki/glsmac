return {

	validate: (e) => {
		if (e.caller != 0) {
			return 'Only master is allowed to spawn units';
		}
	},

	apply: (e) => {
		// Validate the optional casualty-restoration field before creating the
		// native unit, so unsupported input cannot leave a partial spawn.
		if (#is_defined(e.data.order)) {
			const order = e.data.order;
			if (#typeof(order) != 'String' || (order != 'NO_ORDERS' && order != 'HOLD' && order != 'SENTRY')) {
				throw Error('Unsupported spawn unit order');
			}
		}
		const descriptor = {
			def: e.data.type,
			owner: e.data.owner,
			tile: e.data.tile,
			morale: e.data.morale,
			health: e.data.health,
		};
		if (#is_defined(e.data.id)) {
			descriptor.id = e.data.id;
		}
		const unit = e.game.um.spawn_unit(descriptor);
		if (#is_defined(e.data.movement)) {
			unit.movement = e.data.movement;
		}
		if (#is_defined(e.data.moved_this_turn)) {
			unit.moved_this_turn = e.data.moved_this_turn;
		}
		if (#is_defined(e.data.order) && e.data.order != 'NO_ORDERS') {
			unit.set_order(e.data.order);
		}

		return {
			unit: unit,
		};
	},

	rollback: (e) => {
		e.game.um.despawn_unit(e.applied.unit);
	},

};
