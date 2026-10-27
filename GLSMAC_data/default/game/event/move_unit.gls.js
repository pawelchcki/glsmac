const evaluate_cost = #include('../movement_cost');

return {

	observe_cost: evaluate_cost,

	validate: (e) => {

		if (e.data.unit.owner != e.caller) {
			return 'Unit can only be moved by it\'s owner';
		}

		const src_tile = e.data.unit.get_tile();
		const dst_tile = e.data.tile;

		if (src_tile == dst_tile) {
			return 'Source tile is same as destination tile';
		}

		if (src_tile.is_locked()) {
			return 'Source tile is locked';
		}
		if (dst_tile.is_locked()) {
			return 'Destination tile is locked';
		}

		if (e.data.unit.is_immovable) {
			return 'Unit is immovable';
		}
		if (e.data.unit.movement <= 0.0) {
			return 'Unit is out of moves';
		}
		if (src_tile == dst_tile) {
			return 'Destination tile is same as source tile';
		}
		if (!src_tile.is_adjactent_to(dst_tile)) {
			return 'Destination tile is not adjactent to source tile';
		}
		if (e.data.unit.is_land && dst_tile.is_water) {
			return 'Land units can\'t move to water tile';
		}
		if (e.data.unit.is_water && dst_tile.is_land) {
			return 'Water units can\'t move to land tile';
		}

		let any_foreign_units_in_tile = false;
		for (unit of dst_tile.get_units()) {
			if (unit.owner != e.data.unit.owner) {
				any_foreign_units_in_tile = true;
				break;
			}
		}
		if (any_foreign_units_in_tile) {
			return 'Destination tile contains foreign units (combat not implemented yet)';
		}
		// TODO: ZOC
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
		const src_tile = unit.get_tile();
		const dst_tile = e.data.tile;

		const movement = unit.movement + 0.0;
		const cost = evaluate_cost(e); const road_rate = cost.road_rate;

		const result = {
			orig: {
				tile: src_tile,
				movement: movement,
				moved_this_turn: unit.moved_this_turn == true,
			}
		};

		const movement_cost = cost.total_cost;

		let next = () => {
			// reduce remaining movement points (even if failed)
			if (road_rate > 0) {
				const steps = #round(movement * #to_float(road_rate));
				unit.movement = steps > 1 ? #to_float(steps - 1) / #to_float(road_rate) : 0.0;
			} else { if (movement >= movement_cost) {
				unit.movement = movement - movement_cost;
			} else {
				unit.movement = 0.0;
			} }
			unit.moved_this_turn = true;
		};

		if (e.resolved.is_movement_successful) {
			unit.move_to_tile(dst_tile, next);
		} else {
			next();
		}

		return result;
	},

	rollback: (e) => {

		const unit = e.data.unit;
		const orig = e.applied.orig;
		unit.move_to_tile(orig.tile, () => {
			unit.movement = orig.movement;
			unit.moved_this_turn = orig.moved_this_turn;
		});
	},

};
