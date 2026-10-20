// Native map/unit lifecycle with explicit rendering acknowledgements only.
const fixture = #include('./_former_work_fixture');
const handler = #include('../default/game/event/move_unit');
return () => {
	const f = fixture('road'); f.enable_movement();
	f.current_unit = () => { return f.game.um.get_unit(f.former.id); };
	f.begin_move = (x) => {
		const e = {caller: f.owner.id}; e.game = f.game; e.data = {};
		e.data.unit = f.current_unit(); e.data.tile = f.game.tm.get_tile(x, 2);
		const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
		f.with_write(() => { e.resolved = handler.resolve(e); e.applied = handler.apply(e); });
		return e;
	};
	f.move = (x) => { const e = f.begin_move(x); if (e.resolved.is_movement_successful) { f.finish_unit_move(f.former.id); } return e; };
	return f;
};
