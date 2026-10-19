// Functional GLSMAC land expansion. Eligibility is shared with the authoritative
// native transaction; this does not claim original-game founding rules.
return {
	validate: (game, unit_id, caller) => {
		if (#typeof(unit_id) != 'Int' || unit_id <= 0) {
			return 'Colony unit id must be a positive integer';
		}
		if (#typeof(caller) != 'Int' || caller < 0) {
			return 'Colony owner must be a nonnegative integer';
		}
		return game.validate_found_base(unit_id, caller);
	},

	choose_citizen: (game, base) => {
		const eligible = [];
		for (tile of base.get_unworked_tiles()) {
			if (!tile.has('working_pop') && tile.get_base() == null) {
				eligible :+ tile;
			}
		}
		const best = game.get('f_base_find_best_or_worst_tiles')(base, eligible, 1, 1);
		const tile = best[0];
		if (#is_defined(tile)) {
			const plan = { type: 'WORKER' };
			plan.worked_tile = tile;
			return plan;
		}
		return { type: 'DOCTOR' };
	},
};
