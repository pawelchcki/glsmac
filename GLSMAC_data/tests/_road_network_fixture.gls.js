const fixture = #include('./_former_work_fixture');
const move = #include('../default/game/event/move_unit');
return (profile) => {
	const f = fixture(profile); f.enable_movement();
	f.current_unit = () => { return f.game.um.get_unit(f.former.id); };
	f.move = (other) => {
		const e = {caller: f.owner.id}; e.game = f.game; e.data = {};
		e.data.unit = f.current_unit();
		e.data.tile = f.game.tm.get_tile(other ? 0 : 2, profile == 'base_road' ? 0 : 2);
		const error = move.validate(e); if (#is_defined(error)) { throw Error(error); }
		f.with_write(() => { e.resolved = move.resolve(e); e.applied = move.apply(e); });
		if (e.resolved.is_movement_successful) { f.finish_unit_move(f.former.id); }
		return e;
	};
	return f;
};
