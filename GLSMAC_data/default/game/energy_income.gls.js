// Declared application funding policy for real paid terraforming. The existing
// base allocation supplies economy income; original opening treasury, deficits
// and collection timing remain separate unverified contracts.
const allocation = #include('./base_energy_allocation');
const resolve = (game, id) => {
	for (player of game.get_players()) { if (player.id == id) { return player; } }
	return null;
};
const income = (game, owner) => {
	let total = 0;
	for (base of game.get_bm().get_bases()) {
		if (base.get_owner().id == owner) {
			const intake = base.get_intake(); const consumption = base.get_consumption();
			const economy = allocation.get(base, intake.ENERGY - consumption.ENERGY).economy;
			// Debt, bankruptcy and forced sales are not invented here. Existing
			// positive economy generation funds the real finite native treasury.
			const earned = #max(0, economy.value + economy.bonus);
			if (earned > 9223372036854775807 - total) { throw Error('Energy income overflow'); }
			total += earned;
		}
	}
	return total;
};
const plan = (game) => {
	const result = [];
	// A world without cities generates no budget. This also keeps the ordinary
	// unit-only turn controller independent of a city economy implementation.
	if (#sizeof(game.get_bm().get_bases()) == 0) { return result; }
	const turn = game.get_turn();
	for (player of game.get_players()) {
		if (!game.is_turn_complete(player.id)) { throw Error('Energy collection requires every completed turn'); }
		const state = player.get_energy_state();
		if (state.last_income_turn > turn) { throw Error('Energy ledger belongs to a future turn'); }
		if (state.last_income_turn < turn) {
			const amount = income(game, player.id);
			if (amount > 9223372036854775807 - state.credits) { throw Error('Energy treasury overflow'); }
			result :+ {player_id: player.id + 0, turn_id: turn + 0, income: amount + 0, expected_balance: state.credits + 0};
		}
	}
	return result;
};
return {
	resolve: resolve, income: income, plan: plan,
	enqueue: (game) => {
		// Compute every owner's complete plan before publishing any event.
		const rows = plan(game);
		for (row of rows) { game.event('credit_energy_income', row); }
	},
};
