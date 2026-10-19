// A separate growth stage preserves the manual production event's receipt.
// Population child events have their own apply/rollback lifecycle; this receipt
// restores only the stage's nutrient field after any child undo is complete.
return {
	validate: (e) => {
		if (e.caller != 0) { return 'Only host can process base growth'; }
		if (#typeof(e.data.turn_id) != 'Int' || e.data.turn_id < 1) {
			return 'Growth turn must be a positive integer';
		}
		if (e.data.turn_id != e.game.get_turn()) { return 'Growth turn does not match current turn'; }
		const production = e.data.base.get_production();
		if (production.choice_id != '' && production.last_processed_turn != e.data.turn_id) {
			return 'Base production must be processed before growth';
		}
	},

	apply: (e) => {
		const old_nutrients = e.data.base.get('accumulated_nutrients');
		e.game.get('f_base_process_growth')(e.game, e.data.base);
		return { old_nutrients: old_nutrients };
	},

	rollback: (e) => {
		if (#is_defined(e.applied.old_nutrients)) {
			e.data.base.set('accumulated_nutrients', e.applied.old_nutrients);
		} else {
			e.data.base.unset('accumulated_nutrients');
		}
	},
};
