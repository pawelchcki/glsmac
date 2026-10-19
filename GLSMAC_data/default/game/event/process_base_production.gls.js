return {

	validate: (e) => {
		if (e.caller != 0) {
			return 'Only host can process base production';
		}
		if (#typeof(e.data.turn_id) != 'Int' || e.data.turn_id < 1) {
			return 'Production turn must be a positive integer';
		}
		if (e.data.turn_id != e.game.get_turn()) {
			return 'Production turn does not match current turn';
		}
		if (#typeof(e.data.minerals) != 'Int' || e.data.minerals < 0) {
			return 'Production minerals must be a nonnegative integer';
		}
		const production = e.data.base.get_production();
		if (e.data.turn_id <= production.last_processed_turn) {
			return 'Base production already processed for this turn';
		}
	},

	apply: (e) => {
		return e.data.base.process_production(e.data.turn_id, e.data.minerals);
	},

	rollback: (e) => {
		if (#is_defined(e.applied.unit_receipt)) {
			e.data.base.rollback_unit_production(e.applied.unit_receipt);
		} else {
			e.data.base.restore_production(e.applied.previous, e.applied.added_facility);
		}
	},

};
