const validate = (e) => {
	if (#typeof(e.caller) != 'Int' || !#is_defined(e.data.unit_id) || #typeof(e.data.unit_id) != 'Int' || e.data.unit_id <= 0 ||
		!#is_defined(e.data.turn_id) || #typeof(e.data.turn_id) != 'Int' || e.data.turn_id <= 0 ||
		!#is_defined(e.data.request_token) || #typeof(e.data.request_token) != 'Int' || e.data.request_token <= 0) { return 'Disband requires scalar unit turn and request identities'; }
	return e.game.validate_unit_disband(e.data.unit_id, e.caller, e.data.turn_id);
};
return {
	validate: validate,
	apply: (e) => { const error = validate(e); if (#is_defined(error)) { throw Error(error); } return e.game.disband_unit(e.data.unit_id, e.caller, e.data.turn_id); },
	rollback: (e) => { e.game.rollback_unit_disband(e.applied); },
};
