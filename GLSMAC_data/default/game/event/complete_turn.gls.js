const starvation = #include('../base_starvation');
return {

	validate: (e) => {
		if (starvation.pending(e.game)) { return 'Confirm pending starvation before completing turn'; }
		if (e.game.has_pending_actions(e.caller)) { return 'Wait for accepted unit actions to finish'; }
		if (e.game.is_turn_complete(e.caller)) {
			return 'Turn already completed by this player';
		}
	},

	apply: (e) => {
		if (starvation.pending(e.game)) { throw Error('Confirm pending starvation before completing turn'); }
		if (e.game.has_pending_actions(e.caller)) { throw Error('Wait for accepted unit actions to finish'); }
		e.game.complete_turn(e.caller);
		if (e.game.is_master()) {
			let everybody_completed_turn = true;
			for (player of e.game.get_players()) {
				if (!e.game.is_turn_complete(player.id)) {
					everybody_completed_turn = false;
					break;
				}
			}
			if (everybody_completed_turn) {
				#include('../energy_income').enqueue(e.game);
				e.game.event('advance_turn', {
					turn_id: e.game.get_turn() + 1
				});
			}
		}

	},

	rollback: (e) => {
		e.game.uncomplete_turn(e.caller);
	},

};
