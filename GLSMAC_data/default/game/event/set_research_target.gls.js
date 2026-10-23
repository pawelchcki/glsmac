return {
	validate: (e) => {
		if (#typeof(e.caller) != 'Int' || e.caller < 0 || e.caller > 6) { return 'Invalid research caller'; }
		if (!#is_defined(e.data.target_id) || #typeof(e.data.target_id) != 'Int') { return 'Research target must be an integer'; }
		return e.game.validate_research_target(e.caller, e.data.target_id);
	},
	apply: (e) => { return e.game.select_research_target(e.caller, e.data.target_id); },
	rollback: (e) => { e.game.rollback_research(e.applied); },
};
