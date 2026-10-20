return {

	validate: (e) => {
		if (e.caller != 0) {
			return 'Only master is allowed to spawn bases';
		}
	},

	apply: (e) => {
		const base = e.game.bm.spawn_base(e.data.owner, e.data.tile, {
			// name: e.data.name,
			facilities: e.data.facilities,
		});
		if (#is_defined(e.data.production_choice)) {
			try { base.select_production(e.data.production_choice); }
			catch { : (error) => { e.game.bm.despawn_base(base); throw error; } }
		}

		return {
			base: base,
		};
	},

	rollback: (e) => {
		e.game.bm.despawn_base(e.applied.base);
	},

};
