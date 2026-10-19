const colony = #include('../colony');

return {
	validate: (e) => {
		return colony.validate(e.game, e.data.unit_id, e.caller);
	},

	apply: (e) => {
		return e.game.found_base(e.data.unit_id, e.caller, (base) => {
			return colony.choose_citizen(e.game, base);
		});
	},

	rollback: (e) => {
		e.game.rollback_found_base(e.applied);
	},
};
