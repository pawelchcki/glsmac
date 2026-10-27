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

		const energy_rules = game.get('energy_rules');
		if (!#is_defined(energy_rules)) { throw Error('Installed initial energy rules are required for startup'); }
		const initial_credits = energy_rules.starting_credits + faction.economy_bonuses.starting_energy;
		// Explicit current-version new-world eligibility is distinct from an
		// unfunded legacy/received player. Never turn a load or retry into a grant.
		if (!#is_defined(player.validate_initial_energy(initial_credits))) {
			game.event('initialize_energy', {player_id:player.id + 0,credits:initial_credits});
		}

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
		let initial_rows = 0;
		if (!faction.is_naval) {
			for (unit of starting_units) {
				let available = unit.prerequisite == 'None';
				for (token of faction.starting_technologies) { if (token == unit.prerequisite) { available = true; } }
				if (available) {
					game.event('add_production_choice', {player: player, id: unit.choice,
						data: {type: 'unit', id: unit.id, cost: unit.rows * 10, cost_rows: unit.rows, population_cost: unit.population}});
					if (unit.id == 'ColonyPod' || unit.id == 'Formers') { initial_project = unit.choice + ''; initial_rows = unit.rows + 0; }
				}
			}
		}

		// User-requested technology waiver affects worker availability only. Keep
		// the original opening project calculation separate from these new choices.
		if (game.get_settings().global.rules.get_terraforming_policy().ignore_technologies) {
			for (unit of starting_units) {
				if (unit.weapon_mode == 9) {
					let already_available = !faction.is_naval && unit.prerequisite == 'None';
					if (!faction.is_naval) {
						for (token of faction.starting_technologies) { if (token == unit.prerequisite) { already_available = true; } }
					}
					if (!already_available) {
						game.event('add_production_choice', {player: player, id: unit.choice,
							data: {type: 'unit', id: unit.id, cost: unit.rows * 10, cost_rows: unit.rows, population_cost: unit.population}});
					}
				}
			}
			const sea_former = game.get('sea_former_rule');
			if (#is_defined(sea_former) && sea_former != null) {
				game.event('add_production_choice', {player: player, id: sea_former.choice,
					data: {type: 'unit', id: sea_former.id, cost: sea_former.rows * 10, cost_rows: sea_former.rows, population_cost: 0}});
			}
		}

		// spawn headquarters base
		const headquarters = {
			owner: player,
			tile: tile,
			facilities: [
				'HEADQUARTERS',
			],
		};
		if (#is_defined(initial_project)) {
			let bonus = #undefined;
			if (player.is_master) {
				bonus = game.get_initial_production_bonus(initial_rows);
			}
			if (#is_defined(bonus)) {
				// A creation plan precedes the first production tick. Ordinary
				// active-turn selections retain their existing processing epoch.
				headquarters.initial_production = {choice_id: initial_project + '', minerals: bonus + 0};
			} else { headquarters.production_choice = initial_project + ''; }
		}
		game.event('spawn_base', headquarters);

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
