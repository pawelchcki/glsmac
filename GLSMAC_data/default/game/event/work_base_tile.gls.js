const base_work = #include('../base_work');

return {

	validate: (e) => {
		const error = base_work.validate_base(e);
		if (#is_defined(error)) { return error; }
		if (!base_work.valid_pop_links(e.game, e.data.base, e.data.pop)) { return 'Population is not a live citizen of this base or has inconsistent worker links'; }
		if (!base_work.workable_tile(e.game, e.data.base, e.data.tile)) { return 'Tile is not a workable location for this base'; }
		if (e.data.tile.has('working_pop')) {
			return 'Tile is already being worked';
		}
		if (e.data.base.is_tile_worked(e.data.tile)) { return 'Tile has inconsistent worker links'; }
	},

	apply: (e) => {
		const previous = {
			old_pop_type: e.data.pop.get_type(),
			old_worked_tile: e.data.pop.get('worked_tile'),
		};
		e.game.get('f_base_pop_work_tile')(e.data.base, e.data.pop, e.data.tile);
		return previous;
	},

	rollback: (e) => {
		if (#is_defined(e.applied.old_worked_tile)) {
			e.game.get('f_base_pop_work_tile')(e.data.base, e.data.pop, e.applied.old_worked_tile);
		} else {
			e.game.get('f_base_pop_unwork_tile')(e.data.base, e.data.pop);
		}
		e.data.pop.set_type(e.applied.old_pop_type);
	},

};
