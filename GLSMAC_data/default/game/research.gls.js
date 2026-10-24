// Initial directed science income. The host plans timing; the native ledger
// owns duplicate protection and rollback. Peers apply transmitted scalars.
const energy = #include('base_energy_allocation');
// Explicit stock-difficulty opening observations. This lookup establishes no
// cause, AI policy, later acquisition timing or arbitrary faction modifiers.
const first_credit_turn = {Citizen: 5, Specialist: 5, Talent: 2, Librarian: 2, Thinker: 2, Transcend: 2};
const income = (game, player_id) => {
	let total = 0;
	for (base of game.get_bm().get_bases()) {
		if (base.get_owner().id == player_id) {
			const intake = base.get_intake(); const consumption = base.get_consumption();
			const allocation = energy.get(base, intake.ENERGY - consumption.ENERGY);
			const labs = allocation.labs.value + allocation.labs.bonus;
			if (labs > 0) { total += labs; }
		}
	}
	return total;
};
return {
	income: income,
	configure: (game) => {
		game.on('turn', (e) => {
			if (game.is_master() && !game.get_settings().global.rules.get_blind_research()) {
				const turn = game.get_turn();
				for (player of game.get_players()) {
					const difficulty = player.get_difficulty_level(); const first = first_credit_turn[difficulty];
					if (#is_defined(first) && game.get_research_state(player.id).target_id >= 0) {
						game.event('credit_research_income', {player_id: player.id + 0, turn_id: turn + 0, income: turn >= first ? income(game, player.id) + 0 : 0});
					}
				}
			}
		});
	},
};
