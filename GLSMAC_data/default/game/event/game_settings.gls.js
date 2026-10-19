const unready_players = (players) => {
	for (player of players) {
		player.set_ready(false);
	}
};

return {

	validate: (e) => {
		if (e.game.is_started()) {
			return 'Game has already started';
		}
		if (e.caller != 0) {
			return 'Only master is allowed to change game settings';
		}
	},

	apply: (e) => {
		let old_settings = [];
		let settings = e.game.get_settings().global.map;
		let changes = [];
		let restore_preset = false;
		const old_preset = #is_defined(settings.preset_level) ? #to_int(settings.preset_level) : (0 - 1);
		for (c of e.data.changes) {
			if (c[0] == 'planet_size' || c[0] == 'size_x' || c[0] == 'size_y' || c[0] == 'preset_level' || c[0] == 'type') { restore_preset = true; }
			if (c[0] == 'planet_size') {
				const xy = #split(c[1], 'x');
				changes :+['size_x', #to_int(xy[0])];
				changes :+['size_y', #to_int(xy[1])];
			} else {
				changes :+c;
			}
		}
		for (c of changes) {
			const oldv = settings[c[0]];
			if (#is_defined(oldv)) { // TODO: support all fields
				if (c[0] != 'preset_level') { old_settings :+[c[0], oldv]; }
				settings[c[0]] = c[1]; // TODO: ro/rw permissions on settings in all places
			}
		}

		// Restore provenance after dimensions/type, whose native setters clear it.
		if (restore_preset) { old_settings :+['preset_level', old_preset]; }

		unready_players(e.game.get_players());

		e.game.trigger('game_settings', {
			settings: e.data.changes,
		});
		return {
			old_settings: old_settings,
		};
	},

	rollback: (e) => {
		let settings = e.game.get_settings().global.map;
		for (c of e.applied.old_settings) {
			settings[c[0]] = c[1];
		}

		unready_players(e.game.get_players());

		e.game.trigger('game_settings', {
			settings: e.applied.old_settings
		});
	},

};
