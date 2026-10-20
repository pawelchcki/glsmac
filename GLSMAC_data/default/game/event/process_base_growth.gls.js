// A separate growth stage preserves the manual production event's receipt.
// Population child events have their own apply/rollback lifecycle. After child
// undo, this receipt restores the stage's nutrients and pending notification.
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
		const old_pending = e.data.base.get('pending_starvation');
		e.game.get('f_base_process_growth')(e.game, e.data.base);
		const receipt = { old_nutrients: old_nutrients };
		receipt.old_pending = old_pending; receipt.new_pending = e.data.base.get('pending_starvation');
		return receipt;
	},

	rollback: (e) => {
		if (#is_defined(e.applied.new_pending)) {
			const pending = e.data.base.get('pending_starvation');
			if (!#is_defined(pending) || pending.request_token != e.applied.new_pending.request_token) { throw Error('Growth starvation decision changed before rollback'); }
			if (#is_defined(e.applied.old_pending)) { e.data.base.set('pending_starvation', e.applied.old_pending); }
			else {
				e.data.base.unset('pending_starvation');
				e.game.trigger('base_starvation_cancelled', {base_id: e.data.base.id, request_token: pending.request_token});
			}
		}
		if (#is_defined(e.applied.old_nutrients)) {
			e.data.base.set('accumulated_nutrients', e.applied.old_nutrients);
		} else {
			e.data.base.unset('accumulated_nutrients');
		}
	},
};
