// Installed Manual p48: three connected road squares per normal movement
// point across land terrain. Original wet/uneven traversal is unmeasured.
// Bases connect without gaining a road flag; read every live road edit.
// Fungus traversal remains under the separately bounded existing policy.
const get_road_rate = (e, src_tile, dst_tile) => {
	if (!e.data.unit.is_land || !src_tile.is_land || !dst_tile.is_land ||
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
		unit.is_land && dst_tile.is_land &&
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
	if (unit.is_land && dst_tile.is_land && dst_tile.rockiness >= 3) {
		return 1.0;
	}
	return 0.0;
};

// Read-only evaluation of the same live policy used by resolve/apply.
// Actual debit/result must still be sampled after the authoritative command;
// this quote is not an observed outcome or proof of original movement parity.
const evaluate_at = (game, unit, source, destination) => {
 // Installed manual p48: connected mag tubes cost no movement while the
 // actual command still requires positive remaining MP. No implicit city
 // connection, original terrain exception or pixel/timing parity is inferred.
 if (unit.is_land && source.is_land && destination.is_land) {
  const from = game.get_tm().get_terraforming(source.x,source.y);
  const to = game.get_tm().get_terraforming(destination.x,destination.y);
  if (from.mag_tube && to.mag_tube) { return {road_rate:0,base_cost:0.0,after_cost:0.0,total_cost:0.0}; }
 }
 const event = {}; event.game = game; event.data = {}; event.data.unit = unit;
 const base_cost = get_movement_cost(unit, source, destination);
 const after_cost = get_movement_aftercost(unit, source, destination);
 return {road_rate:get_road_rate(event,source,destination),base_cost:base_cost,after_cost:after_cost,total_cost:base_cost + after_cost};
};
return {
 evaluate:(e) => { return evaluate_at(e.game,e.data.unit,e.data.unit.get_tile(),e.data.tile); },
 evaluate_at:evaluate_at,
};
