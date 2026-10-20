const pops = #include('pops');
const facilities = #include('facilities');
const base_work = #include('base_work');
const starvation = #include('base_starvation');

const globals = {};

const get_nutrient_factor = (base) => {
	if (#typeof(base.get_nutrient_factor) == 'Callable') {
		const factor = base.get_nutrient_factor();
		if (#is_defined(factor)) {
			return factor;
		}
	}
	return globals.map_growth_base;
};

const get_nutrients_for_growth = (game, base) => {
	// The row count is GLSMAC's existing growth policy, separate from the
	// bounded original-game no-base factor supplied by the optional native API.
	return get_nutrient_factor(base) * (base.get_size() + 1);
};

const get_pending_growth = (base) => {
	const intake = base.get_intake();
	const consumption = base.get_consumption();
	return intake.NUTRIENTS - consumption.NUTRIENTS;
};

const get_pending_production = (base) => {
	const intake = base.get_intake();
	const consumption = base.get_consumption();
	return #max(0, intake.MINERALS - consumption.MINERALS);
};

const process_production = (game, base) => {
	const production = base.get_production();
	if (production.choice_id != '' && production.last_processed_turn < game.get_turn()) {
		// Capture income before growth changes workers. The observed starvation
		// transfer covers projects that stay incomplete. Preserve the existing
		// native completion path, which can change population or resource intake
		// before queued growth decides whether the base is actually starving.
		let minerals = get_pending_production(base);
		let nutrients = base.get('accumulated_nutrients');
		if (!#is_defined(nutrients)) { nutrients = 0; }
		if (nutrients + get_pending_growth(base) < 0) {
			for (choice of base.get_owner().get_production_choices()) {
				if (choice.id == production.choice_id && production.minerals + minerals < choice.cost) {
					// A zero-credit receipt still marks this turn before growth.
					minerals = 0; break;
				}
			}
		}
		game.event('process_base_production', {
			base: base,
			turn_id: game.get_turn(),
			minerals: minerals,
		});
	}
};

const reset_nutrients = (game, base) => {
	const nfg = get_nutrients_for_growth(game, base);
	let accumulated = base.get('accumulated_nutrients');
	if (!#is_defined(accumulated)) {
		accumulated = 0;
	}
	let updated = accumulated - nfg;
	if (updated < 0) {
		updated = 0;
	}
	base.set('accumulated_nutrients', updated);
};

const get_tile_score = (base, tile) => {
	const resources = tile.get_resources(base.get_owner());
	return resources.NUTRIENTS * 3 + resources.MINERALS * 2 + resources.ENERGY; // simple logic for now, TODO: improve based on what base needs
};

const find_best_or_worst_tiles = (base, tiles, count, modifier) => { // modifier 1 to find best tiles, -1 to find worst tiles
	let keys = {};
	let result = [];
	for (let i = 0; i < count; i++) {
		if (i >= #sizeof(tiles)) {
			break;
		}
		let best = null;
		for (tile of tiles) {
			const key = #to_string(tile.x) + '_' + #to_string(tile.y);
			if (#is_defined(keys[key])) {
				continue;
			}
			const score = get_tile_score(base, tile) * modifier;
			if (best == null || score > best.score) {
				best = {
					tile: tile,
					key: key,
					score: score,
				};
			}
		}
		if (best != null) {
			keys[best.key] = true;
			result :+best.tile;
		} else {
			break;
		}
	}
	return result;
};

const process_growth = (game, base) => {
	if (base.has('pending_starvation')) { return; }
	let grow = false;

	let accumulated = base.get('accumulated_nutrients');
	if (!#is_defined(accumulated)) {
		accumulated = 0;
	}
	accumulated += get_pending_growth(base);
	if (accumulated < 0) {
		// The stage is replicated; only the actual host emits population events.
		if (!game.is_master()) { return; }
		let pop = null;
		// try to remove non-worker pop first
		for (p of base.get_pops()) {
			if (!p.has('worked_tile')) {
				pop = p;
				break;
			}
		}
		if (pop == null) {
			const worst_tile = (find_best_or_worst_tiles(base, base.get_worked_tiles(), 1, 0 - 1))[0];
			if (#is_defined(worst_tile)) {
				const p = worst_tile.get('working_pop');
				if (#is_defined(p)) {
					pop = p;
				} else {
					#print('bug: could not find pop of worked tile');
				}
			} else {
				#print('bug: could not find worst tile for depopulation');
			}
		}
		if (pop != null && starvation.offer(game, base, pop)) { return; }
		game.event('remove_base_pop', {
			base: base,
			pop: pop,
		});
		return;
	}
	base.set('accumulated_nutrients', accumulated);
	if (base.get_size() == 0) {
		grow = true; // always grow new bases to 1
	}

	if (!grow) {
		if (accumulated >= get_nutrients_for_growth(game, base)) {
			grow = true; // growth from nutrients
		}
	}

	if (grow && game.is_master()) {
		// Unworked means absent from this base's own set. Nearby bases can
		// still occupy or claim those squares; use the same live eligibility
		// checks as explicit citizen assignment before comparing their yields.
		const eligible = [];
		for (tile of base.get_unworked_tiles()) {
			if (base_work.workable_tile(game, base, tile) && !tile.has('working_pop') && !base.is_tile_worked(tile)) { eligible :+ tile; }
		}
		const best_tile = (find_best_or_worst_tiles(base, eligible, 1, 1))[0];
		if (#is_defined(best_tile)) {
			// found tile to work, spawn worker
			// TODO: talents logic
			game.event('add_base_pop', {
				base: base,
				type: 'WORKER',
				worked_tile: best_tile,
			});
		} else {
			// all tiles already worked, spawn doctor
			game.event('add_base_pop', {
				base: base,
				type: 'DOCTOR',
			});
		}
	}
};

const calculate_growth_base = (game) => {
	const tm = game.get_tm();
	let w = tm.get_map_width();
	let h = tm.get_map_height();

	let map_size = w * h;

	// rough approximations similar to SMAC's standard/small/tiny logic but using GLSMAC wider map ratio
	// used for base growth calculations
	let map_growth_base = 0;
	if (map_size > 5500) {
		map_growth_base = 15; // standard map
	} else if (map_size > 4000) {
		map_growth_base = 14; // between standard and small map, SMAC skips it but makes sense imo
	} else if (map_size > 3000) {
		map_growth_base = 13; // small map
	} else if (map_size > 1800) {
		map_growth_base = 12; // tiny map
	} else if (map_size > 1000) {
		map_growth_base = 11; // below tiny (SMAC doesn't have it but let's do)
	} else {
		map_growth_base = 10; // below tiny (SMAC doesn't have it but let's do)
	}
	globals.map_growth_base = map_growth_base;
	game.set('map_growth_base', map_growth_base);
};

const pop_work_tile = (base, pop, tile) => {
	pop_unwork(base, pop);
	pop.set_type('WORKER');
	pop.set('worked_tile', tile);
	tile.set('working_pop', pop);
	base.add_worked_tile(tile);
};

const pop_unwork = (base, pop, new_type) => {
	const tile = pop.get('worked_tile');
	if (#is_defined(tile)) {
		tile.unset('working_pop');
		pop.unset('worked_tile');
		base.remove_worked_tile(tile);
		if (#is_defined(new_type)) {
			pop.set_type(new_type);
		}
	}
};

return (game) => {

	const bm = game.get_bm();

	bm.on('get_base_intake', (e) => {
		let result = {
			NUTRIENTS: 0,
			MINERALS: 0,
			ENERGY: 0,
		};

		const f_add_tile = (tile) => {
			const r = tile.get_resources();
			result.NUTRIENTS = result.NUTRIENTS + r.NUTRIENTS;
			result.MINERALS = result.MINERALS + r.MINERALS;
			result.ENERGY = result.ENERGY + r.ENERGY;
		};

		f_add_tile(e.base.get_tile());
		for (tile of e.base.get_worked_tiles()) {
			f_add_tile(tile);
		}

		return result;
	});

	bm.on('get_base_consumption', (e) => {
		let result = {
			NUTRIENTS: e.base.get_size() * 2, // 2 nutrients per pop
			MINERALS: 0,
			ENERGY: 0,
		};

		// TODO: supported units

		return result;
	});

	bm.on('get_base_workable_tiles', (e) => {
		let result = [];
		const t_center = e.base.get_tile();
		let added_tiles = {};
		const f_add = (tile) => {
			const key = #to_string(tile.x) + '_' + #to_string(tile.y);
			if (tile != t_center && !#is_defined(added_tiles[key])) {
				added_tiles[key] = true;
				result :+tile;
			}
			return tile;
		};
		const t_n = f_add(t_center.get_N());
		const t_ne = f_add(t_center.get_NE());
		const t_e = f_add(t_center.get_E());
		const t_se = f_add(t_center.get_SE());
		const t_s = f_add(t_center.get_S());
		const t_sw = f_add(t_center.get_SW());
		const t_w = f_add(t_center.get_W());
		const t_nw = f_add(t_center.get_NW());
		const t_n_nw = f_add(t_n.get_NW());
		const t_n_ne = f_add(t_n.get_NE());
		const t_ne_ne = f_add(t_ne.get_NE());
		const t_e_ne = f_add(t_e.get_NE());
		const t_e_se = f_add(t_e.get_SE());
		const t_se_se = f_add(t_se.get_SE());
		const t_s_se = f_add(t_s.get_SE());
		const t_s_sw = f_add(t_s.get_SW());
		const t_sw_sw = f_add(t_sw.get_SW());
		const t_w_sw = f_add(t_w.get_SW());
		const t_w_nw = f_add(t_w.get_NW());
		const t_nw_nw = f_add(t_nw.get_NW());
		return result;
	});

	pops.define(game);
	facilities.define(game);

	game.on('start', (e) => {

		calculate_growth_base(game);

		const bm = game.get_bm();

		// set bases-related globals
		// TODO: prettier way to do this? needs to be callable from events
		game.set('f_base_get_nutrient_factor', get_nutrient_factor);
		game.set('f_base_get_pending_growth', get_pending_growth);
		game.set('f_base_get_pending_production', get_pending_production);
		game.set('f_base_process_growth', process_growth);
		game.set('f_base_reset_nutrients', reset_nutrients);
		game.set('f_base_pop_work_tile', pop_work_tile);
		game.set('f_base_pop_unwork_tile', pop_unwork);
		game.set('f_base_find_best_or_worst_tiles', find_best_or_worst_tiles);

		// new turn, process all bases
		game.on('turn', (e) => {
			for (base of bm.get_bases()) {
				process_production(game, base);
				// Production is queued, so population decisions must be queued
				// after it and inspect the state after its native completion.
				game.event('process_base_growth', { base: base, turn_id: game.get_turn() });

			}
		});

	});
};
