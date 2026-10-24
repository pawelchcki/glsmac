return {
	validate: (e) => {
		if (#typeof(e.caller) != 'Int' || e.caller != 0) { return 'Only host can credit research income'; }
		for (field of ['player_id', 'turn_id', 'income']) {
			if (!#is_defined(e.data[field]) || #typeof(e.data[field]) != 'Int') { return 'Invalid research income plan'; }
		}
		return e.game.validate_research_credit(e.data.player_id, e.data.turn_id, e.data.income);
	},
	apply: (e) => { return e.game.credit_research(e.data.player_id, e.data.turn_id, e.data.income); },
	rollback: (e) => { e.game.rollback_research(e.applied); },
};
