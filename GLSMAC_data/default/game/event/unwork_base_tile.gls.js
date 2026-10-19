const base_work = #include('../base_work');

return {

	validate: (e) => {
		const error = base_work.validate_base(e);
		if (#is_defined(error)) { return error; }
		if (!base_work.workable_tile(e.game, e.data.base, e.data.tile)) { return 'Tile is not a workable location for this base'; }
		const work_pop = e.data.tile.get('working_pop');
		if (!#is_defined(work_pop)) {
			return 'Tile is not being worked';
		}
		if (!base_work.contains_pop(e.data.base, work_pop)) { return 'Tile is not worked by a live citizen of this base'; }
		if (!base_work.valid_pop_links(e.game, e.data.base, work_pop) || work_pop.get('worked_tile') != e.data.tile) { return 'Tile has inconsistent worker links'; }
	},

	apply: (e) => {
		const pop = e.data.tile.get('working_pop');
		const old_pop_type = pop.get_type();
		e.game.get('f_base_pop_unwork_tile')(e.data.base, pop, 'DOCTOR');
		return {
			pop: pop,
			old_pop_type: old_pop_type,
		};
	},

	rollback: (e) => {
		e.game.get('f_base_pop_work_tile')(e.data.base, e.applied.pop, e.data.tile);
		e.applied.pop.set_type(e.applied.old_pop_type);
	},

};
