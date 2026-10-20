/*
	normal game start
 */

return (game) => {

	// variables
	const players = game.get_players();
	const players_count = #sizeof(players);
	const tm = game.get_tm();
	const starting_units = game.get('starting_unit_rules');
	if (!#is_defined(starting_units) || #sizeof(starting_units) != 3) { throw Error('Basic installed unit rules are required for startup'); }
	const map_width = tm.get_map_width();
	const map_height = tm.get_map_height();
	const optimal_base_distance = #max((map_width + map_height) / 2 / players_count, 2);
	let tiles_with_bases = [];

	// functions
	const get_good_starting_base_location = (is_naval_faction) => {
		// find a good tile for starting base
		// very simple for now, TODO: improve/optimize

		// to prevent infinite loop on tiny maps with lots of players
		const max_tries = 1000;
		let tries = 0;

		// will gradually decrease min base distance when struggling to find suitable tile
		let min_base_distance = optimal_base_distance;
		const decrease_min_base_distance_every = max_tries / players_count;

		let next_min_base_distance_decrease_at = decrease_min_base_distance_every;
		while (tries < max_tries) {
			const x = game.random.get_int(0, map_width - 1);
			const y = game.random.get_int(0, map_height - 1);
			if (x % 2 != y % 2) {
				// wrong oddity, try again
				tries++;
				continue;
			}
			const tile = tm.get_tile(x, y);
			if (tile.is_water == is_naval_faction) { // naval factions start in water, others on land
				// check that no existing bases are too close
				let is_ok = true;
				for (other of tiles_with_bases) {
					if (tm.get_distance(tile, other) < min_base_distance) {
						is_ok = false; // to close
						break;
					}
				}
				if (is_ok) {
					return tile;
				} else {
					if (tries >= next_min_base_distance_decrease_at) {
						// reduce base distance to increase chance of finding tile
						next_min_base_distance_decrease_at = tries + decrease_min_base_distance_every;
						if (min_base_distance > 2) {
							min_base_distance--;
						}
					}
				}
			}
			tries++;
		}
		throw Error('Failed to find good tile for base (try again, or try larger map or fewer players)');
	};

	// Find every starting tile before emitting events. A later placement failure
	// must not leave earlier players with partial production choices or spawns.
	for (player of players) {
		const faction = player.get_faction();
		tiles_with_bases :+ get_good_starting_base_location(faction.is_naval);
	}

	// initialize each player in game
	let player_index = 0;
	for (player of players) {

		const faction = player.get_faction();

		const tile = tiles_with_bases[player_index];
		player_index++;

		// initial production choices (TODO: technologies)
		game.event('add_production_choice', {
			player: player,
			id: 'RECYCLING_TANKS',
			data: {
				type: 'facility',
				id: 'RECYCLING_TANKS',
			},
		});
		game.event('add_production_choice', {
			player: player,
			id: 'STOCKPILE_ENERGY',
			data: {
				type: 'custom',
				render: {
					type: 'sprite',
					file: 'facs/fac038.pcx',
					x: 0,
					y: 0,
					w: 215,
					h: 215,
				},
				hint: 'Minerals to Energy',
			},
		});
		let initial_project = #undefined;
		if (!faction.is_naval) {
			for (unit of starting_units) {
				let available = unit.prerequisite == 'None';
				for (token of faction.starting_technologies) { if (token == unit.prerequisite) { available = true; } }
				if (available) {
					game.event('add_production_choice', {player: player, id: unit.choice,
						data: {type: 'unit', id: unit.id, cost: unit.rows * 10, cost_rows: unit.rows, population_cost: unit.population}});
					if (unit.id == 'ColonyPod' || unit.id == 'Formers') { initial_project = unit.choice + ''; }
				}
			}
		}

		// spawn headquarters base
		game.event('spawn_base', {
			owner: player,
			tile: tile,
			facilities: [
				'HEADQUARTERS',
			],
			production_choice: initial_project,
		});

		// The basic land inventory is one conventional Scout; expansion pods
		// are constructed. Naval starting inventory remains uncalibrated.
		let type = 'ScoutPatrol';
		if (faction.is_naval) {
			type = 'SeaLurk';
		}
		game.event('spawn_unit', {
			owner: player,
			tile: tile,
			type: type,
			health: 1.0,
			morale: 1,
		});

	}

};
