// Bounded opening support for offline computer participants. Frozen all-player
// traces observe the resulting Formers projects, not a general AI algorithm.
const offline = (game) => {
	const local = game.get_settings().local;
	return local.game_mode == 'single' && local.network_type == 'none' && local.network_role == 'none';
};
const key = (player_id) => { return 'computer_production_turn_' + #to_string(player_id); };
const choice = (player, id) => {
	for (entry of player.get_production_choices()) { if (entry.id == id) { return entry; } }
	return null;
};
const proposal = (game, player) => {
	if (player.type != 'computer' || !offline(game) || game.get('technologies_initialized') != true) { return null; }
	const rules = game.get('starting_unit_rules'); const technologies = game.get('technology_rules');
	if (!#is_defined(rules) || !#is_defined(technologies)) { return null; }
	let former = null;
	for (rule of rules) { if (rule.id == 'Formers') { former = rule; } }
	if (former == null || former.prerequisite == 'Disable') { return null; }
	let available = former.prerequisite == 'None';
	for (definition of technologies) {
		if (definition.token == former.prerequisite && game.technologies.has_tech(definition.id, player.id + 1)) { available = true; }
	}
	if (!available) { return null; }
	const existing = choice(player, former.choice);
	if (existing != null && (existing.type != 'unit' || existing.unit_id != 'Formers')) { return null; }
	// A ready unit anywhere in the empire or an existing project suffices. The
	// policy does not replace a human choice or flood every city with Formers.
	let selected = null;
	for (base of game.get_bm().get_bases()) {
		if (base.get_owner().id == player.id) {
			const production = base.get_production(); const project = choice(player, production.choice_id);
			if (project != null && project.type == 'unit' && project.unit_id == 'Formers') { return null; }
			// Computer switch-loss behavior above the uncharged opening range,
			// other project categories, sea bases and growth decisions are gaps.
			if (base.get_tile().is_land && base.get_size() == 1 && !base.has_facility('SKUNKWORKS') &&
				production.minerals >= 0 && production.minerals <= 10 && project != null && project.type == 'unit' &&
				project.unit_id == 'ColonyPod' && project.population_cost >= base.get_size()) {
				if (selected == null || base.id < selected.id) { selected = base; }
			}
		}
	}
	if (selected == null) { return null; }
	const tm = game.get_tm();
	for (let y = 0; y < tm.get_map_height(); y++) {
		for (let x = y % 2; x < tm.get_map_width(); x = x + 2) {
			for (unit of tm.get_tile(x, y).get_units()) {
				if (unit.owner == player.id && unit.get_def().id == 'Formers') { return null; }
			}
		}
	}
	const result = {add_choice: existing == null}; result.base = selected; result.rule = former; return result;
};
return {
	offline: offline, key: key, proposal: proposal,
	configure: (game) => {
		// bases registers its start listener first. Register after its production
		// and growth callbacks so selecting a project never erases this turn's
		// credited income by stamping the current native processing epoch early.
		game.on('start', (start) => {
			game.on('turn', (turn) => {
				if (game.is_master() && offline(game) && game.get_turn() > 1 && game.get('technologies_initialized') == true) {
					for (player of game.get_players()) {
						if (player.type == 'computer') { game.event('computer_base_production', {player_id: player.id + 0, turn_id: game.get_turn() + 0}); }
					}
				}
			});
		});
	},
};
