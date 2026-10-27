const base_work = #include('../base_work');
const validate = (e) => {
	if (e.caller != 0) {
		return 'Only master is allowed to add base pop';
	}
	let live = false;
	for (base of e.game.get_bm().get_bases()) { if (base == e.data.base) { live = true; } }
	if (!live) { return 'Population base is no longer part of this game'; }
	if (#is_defined(e.data.automatic_growth) && #typeof(e.data.automatic_growth) != 'Bool') { return 'Automatic growth intent must be boolean'; }
	const automatic = #is_defined(e.data.automatic_growth) && e.data.automatic_growth;
	if (!automatic && #is_defined(e.data.worked_tile)) {
		const tile = e.data.worked_tile;
		if (!base_work.workable_tile(e.game, e.data.base, tile) || tile.has('working_pop') || e.data.base.is_tile_worked(tile)) {
			return 'Requested population work tile is no longer vacant';
		}
	}
};
return {
	validate: validate,
	apply: (e) => {

		const reason = validate(e); if (#is_defined(reason)) { throw Error(reason); }
		const base = e.data.base;
		let type = e.data.type; let worked_tile = e.data.worked_tile;
		if (#is_defined(e.data.automatic_growth) && e.data.automatic_growth) {
			// Growth children are deferred. Re-evaluate before changing stores or
			// population so an earlier city's claim is never overwritten.
			const assignment = e.game.get('f_base_choose_growth_assignment')(e.game, base);
			type = assignment.type; worked_tile = assignment.worked_tile;
		}

		// reset nutrients
		const old_nutrients = base.get('accumulated_nutrients');
		e.game.get('f_base_reset_nutrients')(e.game, base);

		// spawn population
		const pop = base.create_pop({
			type: type,
			worked_tile: worked_tile,
		});

		if (#is_defined(worked_tile)) {
			e.game.get('f_base_pop_work_tile')(base, pop, worked_tile);
		}

		return {
			base: base,
			pop: pop,
			old_nutrients: old_nutrients,
			worked_tile: worked_tile,
		};
	},

	rollback: (e) => {
		if (#is_defined(e.applied.worked_tile)) {
			e.game.get('f_base_pop_unwork_tile')(e.applied.base, e.applied.pop);
		}
		e.data.base.destroy_pop(e.applied.pop);
		e.data.base.set('accumulated_nutrients', e.applied.old_nutrients);
	},

};
