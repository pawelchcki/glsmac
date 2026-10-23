const rules = #include('../technology_rules');
return {
	validate: (e) => {
		if (#typeof(e.caller) != 'Int' || e.caller != 0) { return 'Only host can initialize technologies'; }
		// FirstTurn sets the native counter to one before queued world events
		// drain. The initialization request still precedes that turn's effects.
		if (e.game.get_turn() > 1 || e.game.get('technologies_initialized') == true) { return 'Technologies may initialize only once during startup'; }
		try { rules.plan(e.game.get('technology_rules'), e.game.get_players()); }
		catch { : (error) => { return error.reason; } }
	},
	apply: (e) => {
		const previous = [];
		for (let id = 0; id < 89; id++) { previous :+ e.game.technologies.get(id); }
		e.game.technologies.replace(rules.plan(e.game.get('technology_rules'), e.game.get_players()));
		e.game.set('technologies_initialized', true);
		return {previous: previous};
	},
	rollback: (e) => {
		e.game.technologies.replace(e.applied.previous);
		e.game.set('technologies_initialized', false);
	},
};
