return {
	validate: (e) => {
		if (#typeof(e.caller) != 'Int' || e.caller < 0 || e.caller > 6) { return 'Invalid research caller'; }
		if (!#is_defined(e.data.priority) || #typeof(e.data.priority) != 'Int') { return 'Research priority must be an integer'; }
		if (!#is_defined(e.data.enabled) || #typeof(e.data.enabled) != 'Bool') { return 'Research priority state must be boolean'; }
		return e.game.validate_research_priority(e.caller, e.data.priority);
	},
	apply: (e) => { return e.game.set_research_priority(e.caller, e.data.priority, e.data.enabled); },
	rollback: (e) => { e.game.rollback_research(e.applied); },
};
