// Resolve command identity at the authoritative boundary. Legacy native Space
// requests still carry a Unit wrapper; it must be the exact current manager
// entity. New controls send only the scalar unit_id.
const resolve = (game, data) => {
	let id = #undefined;
	if (#is_defined(data.unit_id)) { id = data.unit_id; }
	else if (#is_defined(data.unit) && #classof(data.unit) == 'Unit') { id = data.unit.id; }
	if (#typeof(id) != 'Int' || id <= 0) { return null; }
	const um = game.get_um();
	if (!um.has_unit(id)) { return null; }
	const unit = um.get_unit(id);
	if (#is_defined(data.unit) && data.unit != unit) { return null; }
	return unit;
};

const validate = (e, movement_required) => {
		const unit = resolve(e.game, e.data);
		if (unit == null) { return 'Unit identity is not live'; }
		if (#typeof(e.caller) != 'Int' || unit.owner != e.caller) { return 'Unit command requires its owner'; }
		if (!e.game.is_started() || e.game.get_turn() <= 0 || e.game.is_turn_complete(e.caller)) { return 'Unit command requires an unfinished turn'; }
		if (unit.health <= 0.0 || unit.is_immovable) { return 'Unit cannot receive movement orders'; }
		if (unit.get_tile().is_locked()) { return 'Unit tile is locked'; }
		if (movement_required && !unit.needs_orders()) { return 'Unit has no pending moves'; }
};

return {
	resolve: resolve,
	validate: validate,
	apply_unit: (e, movement_required) => {
		const error = validate(e, movement_required);
		if (#is_defined(error)) { throw Error(error); }
		return resolve(e.game, e.data);
	},
	rollback_unit: (e) => {
		const unit = resolve(e.game, e.data);
		if (unit == null || unit != e.applied.unit || unit.owner != e.applied.owner) { throw Error('Unit order rollback identity changed'); }
		return unit;
	},
};
