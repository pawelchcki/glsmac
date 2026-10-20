// First recorded road scope: flat arid land without fungus. Read live flags
// from the manager so roads constructed after selecting a tile take effect.
const get_road_rate = (e, src_tile, dst_tile) => {
	if (!e.data.unit.is_land || !src_tile.is_land || !dst_tile.is_land ||
		src_tile.moisture != 1 || dst_tile.moisture != 1 || src_tile.rockiness != 1 || dst_tile.rockiness != 1 ||
		src_tile.features.xenofungus || dst_tile.features.xenofungus) { return 0; }
	const tm = e.game.get_tm();
	if (!tm.get_terraforming(src_tile.x, src_tile.y).road || !tm.get_terraforming(dst_tile.x, dst_tile.y).road) { return 0; }
	const rules = e.game.get('movement_rules');
	return rules.road_rate;
};

const get_movement_cost = (unit, src_tile, dst_tile) => {
	const is_native = true; // TODO: non-native units

	if (
		dst_tile.is_land &&
		src_tile.features.river &&
		dst_tile.features.river
	) {
		return 1.0 / 3.0;
	}

	if (dst_tile.features.xenofungus) {
		if (is_native) {
			if (dst_tile.is_water) {
				return 1.0;
			} else {
				return 1.0 / 3.0;
			}
		}
		return 3.0;
	}
	return 1.0;
};

const get_movement_aftercost = (unit, src_tile, dst_tile) => {
	const is_native = true; // TODO: non-native units
	if (is_native && dst_tile.features.xenofungus) {
		return 0.0;
	}
	if (dst_tile.is_land && dst_tile.rockiness >= 3) {
		return 1.0;
	}
	return 0.0;
};

return {

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

		const road_rate = get_road_rate(e, src_tile, dst_tile);
		if (road_rate > 0 && #round(movement * #to_float(road_rate)) >= 1) {
			return {is_movement_successful: true};
		}
		let movement_cost = get_movement_cost(e.data.unit, src_tile, dst_tile);

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
		const road_rate = get_road_rate(e, src_tile, dst_tile);

		const result = {
			orig: {
				tile: src_tile,
				movement: movement,
				moved_this_turn: unit.moved_this_turn == true,
			}
		};

		let movement_cost = get_movement_cost(unit, src_tile, dst_tile) + get_movement_aftercost(unit, src_tile, dst_tile);

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
