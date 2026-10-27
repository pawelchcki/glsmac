// Recorded road scope: flat arid land without fungus. Bases connect to roads
// without gaining a road flag. Read live state so later road edits take effect.
const get_road_rate = (e, src_tile, dst_tile) => {
	if (!e.data.unit.is_land || !src_tile.is_land || !dst_tile.is_land ||
		src_tile.moisture != 1 || dst_tile.moisture != 1 || src_tile.rockiness != 1 || dst_tile.rockiness != 1 ||
		src_tile.features.xenofungus || dst_tile.features.xenofungus) { return 0; }
	const tm = e.game.get_tm();
	if ((src_tile.get_base() == null && !tm.get_terraforming(src_tile.x, src_tile.y).road) ||
		(dst_tile.get_base() == null && !tm.get_terraforming(dst_tile.x, dst_tile.y).road)) { return 0; }
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

// Read-only evaluation of the same live policy used by resolve/apply.
// Actual debit/result must still be sampled after the authoritative command;
// this quote is not an observed outcome or proof of original movement parity.
return (e) => {
 const unit = e.data.unit; const source = unit.get_tile(); const destination = e.data.tile;
 const base_cost = get_movement_cost(unit, source, destination);
 const after_cost = get_movement_aftercost(unit, source, destination);
 return {road_rate: get_road_rate(e, source, destination), base_cost: base_cost, after_cost: after_cost, total_cost: base_cost + after_cost};
};
