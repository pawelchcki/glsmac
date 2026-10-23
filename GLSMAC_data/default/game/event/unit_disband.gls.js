const validate = (e) => {
	if (#typeof(e.caller) != 'Int' || !#is_defined(e.data.unit_id) || #typeof(e.data.unit_id) != 'Int' || e.data.unit_id <= 0 ||
		!#is_defined(e.data.turn_id) || #typeof(e.data.turn_id) != 'Int' || e.data.turn_id <= 0 ||
		!#is_defined(e.data.request_token) || #typeof(e.data.request_token) != 'Int' || e.data.request_token <= 0) { return 'Disband requires scalar unit turn and request identities'; }
	const error = e.game.validate_unit_disband(e.data.unit_id, e.caller, e.data.turn_id);
	if (#is_defined(error)) { return error; }
	if (#is_defined(e.data.base_id) && (#typeof(e.data.base_id) != 'Int' || e.data.base_id < 0 ||
		e.game.get_unit_disband_base(e.data.unit_id, e.caller, e.data.turn_id) != e.data.base_id)) { return 'Disband base context changed'; }
};
return {
	validate: validate,
	apply: (e) => { const error = validate(e); if (#is_defined(error)) { throw Error(error); } return e.game.disband_unit(e.data.unit_id, e.caller, e.data.turn_id); },
	rollback: (e) => { e.game.rollback_unit_disband(e.applied); },
};
