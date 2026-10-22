const colony = #include('../colony');

return {
	validate: (e) => {
		if (#is_defined(e.data.name)) {
			if (!#is_defined(e.data.unit_id) || #typeof(e.data.unit_id) != 'Int' || e.data.unit_id <= 0 || #typeof(e.data.name) != 'String' || !#is_defined(e.data.turn_id) || #typeof(e.data.turn_id) != 'Int' ||
				!#is_defined(e.data.request_token) || #typeof(e.data.request_token) != 'Int' || e.data.request_token <= 0) { return 'Invalid named founding authority'; }
			return e.game.validate_named_found_base(e.data.unit_id, e.caller, e.data.turn_id, e.data.name);
		}
		return colony.validate(e.game, e.data.unit_id, e.caller);
	},

	apply: (e) => {
		if (#is_defined(e.data.name)) {
			return e.game.found_named_base(e.data.unit_id, e.caller, e.data.turn_id, e.data.name, (base) => { return colony.choose_citizen(e.game, base, true); });
		}
		return e.game.found_base(e.data.unit_id, e.caller, (base) => {
			return colony.choose_citizen(e.game, base);
		});
	},

	rollback: (e) => {
		e.game.rollback_found_base(e.applied);
	},
};
