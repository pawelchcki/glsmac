// Detached observations cover all seven research slots, including inactive
// slots. Both live players' treasuries and registries remain observable too;
// the caller separately observes native entity and owner snapshots.
return (game) => {
	const players = [];
	for (player of [0, 1, 2, 3, 4, 5, 6]) {
		const row = {player: player, selection: game.get_research_state(player), science: game.get_research_science(player)};
		players :+ row;
	}
	const technologies = [];
	for (let id = 0; id < 89; id++) {
		const row = game.technologies.get(id);
		technologies :+ row;
	}
	const participants = [];
	for (player of game.get_players()) {
		const row = {id: player.id, energy: player.get_energy_state(), choices: player.get_production_choices()};
		participants :+ row;
	}
	return {players: players, technologies: technologies, participants: participants};
};
