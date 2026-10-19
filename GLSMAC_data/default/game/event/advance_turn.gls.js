return {

	validate: (e) => {
		if (e.caller != 0) {
			return 'Only host can advance turn';
		}
		const current_turn = e.game.get_turn();
		// FirstTurn initializes the native counter before dispatching turn one.
		if (e.data.turn_id != current_turn + 1 && !(current_turn == 1 && e.data.turn_id == 1)) {
			return 'Turn id is not next in sequence';
		}
		if (e.data.turn_id != 1) {
			for (player of e.game.get_players()) {
				if (!e.game.is_turn_complete(player.id)) {
					return 'Can\'t advance turn because player ' + #to_string(player.id) + ' did not complete it';
				}
			}
		}
	},

	apply: (e) => {
		e.game.advance_turn(e.data.turn_id);
	},

	rollback: (e) => {
		#print('TODO: ADVANCE TURN ROLLBACK');
	},

};
