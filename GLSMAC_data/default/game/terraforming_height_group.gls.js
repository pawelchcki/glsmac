// Explicit application cooperation: every confirmed participant pays once;
// shared work is credited once per contributor/turn and terrain commits once.
const order_restore = (unit,state) => {
	unit.set_terraforming(state.work); unit.set_terraforming_recovery(state.recovery);
	if (state.order != 'TERRAFORM' && state.order != 'AUTOMATE') { unit.set_order(state.order); }
	unit.movement = state.movement; unit.moved_this_turn = state.moved;
};
const capture = (unit) => {
	const tile = unit.get_tile(); const state = {owner:unit.owner + 0,x:tile.x + 0,y:tile.y + 0,order:unit.get_order(),work:unit.get_terraforming(),
		recovery:unit.get_terraforming_recovery(),movement:unit.movement + 0.0,moved:unit.moved_this_turn == true}; state.unit = unit; return state;
};
const collect = (unit,action) => {
	const result = []; const current = unit.get_terraforming();
	for (other of unit.get_tile().get_units()) {
		const state = other.get_terraforming();
		if (other.id == unit.id || (other.owner == unit.owner && state.active && state.action == action && #is_defined(state.height) &&
			state.height.terrain_identity == current.height.terrain_identity && state.required_work == current.required_work && other.get_def().can_terraform && other.health > 0.0)) {
			result :+ capture(other);
		}
	}
	return result;
};
return {
	collect:collect,capture:capture,restore:order_restore,
	seal:(states) => { for (state of states) { state.expected = capture(state.unit); } },
	validate:(game,states) => {
		for (state of states) {
			if (!game.get_um().has_unit(state.unit.id)) { throw Error('Cooperative elevation worker retired before rollback'); }
			const live = game.get_um().get_unit(state.unit.id);
			if (live != state.unit || capture(live) != state.expected) { throw Error('Cooperative elevation work changed before rollback'); }
		}
	},
	rollback:(states) => { for (state of states) { order_restore(state.unit,state); } },
};
