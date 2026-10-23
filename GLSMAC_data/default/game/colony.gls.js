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

	validate_action: (game, unit_id, caller) => {
		if (#typeof(unit_id) != 'Int' || unit_id <= 0 || #typeof(caller) != 'Int' || caller < 0) { return 'Invalid colony unit or owner'; }
		const um = game.get_um();
		if (!um.has_unit(unit_id)) { return 'Colony unit no longer exists'; }
		const base = um.get_unit(unit_id).get_tile().get_base();
		if (base != null) { return game.validate_join_base(unit_id, base.id, caller); }
		// A ready Pod can explain an invalid site through the shared controller.
		// The actual transaction still validates the complete founding site.
		if (#is_defined(game.validate_found_base_unit)) { return game.validate_found_base_unit(unit_id, caller); }
		return game.validate_found_base(unit_id, caller);
	},

	choose_citizen: (game, base, productive_only) => {
		const eligible = [];
		for (tile of base.get_unworked_tiles()) {
			if (!tile.has('working_pop') && tile.get_base() == null) {
				eligible :+ tile;
			}
		}
		const best = game.get('f_base_find_best_or_worst_tiles')(base, eligible, 1, 1);
		const tile = best[0];
		if (#is_defined(tile)) {
			if (#is_defined(productive_only) && productive_only) {
				const resources = tile.get_resources(base.get_owner());
				if (resources.NUTRIENTS * 3 + resources.MINERALS * 2 + resources.ENERGY <= 0) { return {type: 'DOCTOR'}; }
			}
			const plan = { type: 'WORKER' };
			plan.worked_tile = tile;
			return plan;
		}
		return { type: 'DOCTOR' };
	},
};
