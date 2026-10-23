return {
	validate: (e) => {
		const d = e.data;
		if (#typeof(d.session) != 'Int' || #typeof(d.action) != 'String' || #typeof(d.base_id) != 'Int' || #typeof(d.previous_name) != 'String' || #typeof(d.name) != 'String') { return 'Invalid opening command'; }
		return e.game.validate_opening(e.caller, d.session, d.action, d.base_id, d.previous_name, d.name);
	},
	apply: (e) => {
		const d = e.data;
		e.game.apply_opening(e.caller, d.session, d.action, d.base_id, d.previous_name, d.name);
	},
	rollback: (e) => { throw Error('Opening acknowledgements are committed locally; restart to abandon this opening'); },
};
