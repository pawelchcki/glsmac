const energy = #include('../energy_income');
const validate = (e) => {
	if (#typeof(e.caller) != 'Int' || e.caller != 0) { return 'Only host can collect completed-turn energy'; }
	for (field of ['player_id','turn_id','income','expected_balance']) {
		if (#typeof(e.data[field]) != 'Int') { return 'Invalid energy income plan'; }
	}
	if (!e.game.is_started() || e.data.turn_id <= 0 || e.data.turn_id != e.game.get_turn() || e.data.income < 0) { return 'Energy income turn is stale'; }
	for (player of e.game.get_players()) { if (!e.game.is_turn_complete(player.id)) { return 'Energy collection requires every completed turn'; } }
	const player = energy.resolve(e.game, e.data.player_id); if (player == null) { return 'Energy owner is not live'; }
	const state = player.get_energy_state();
	if (state.credits != e.data.expected_balance || state.last_income_turn >= e.data.turn_id ||
		e.data.income > 9223372036854775807 - state.credits || e.data.income != energy.income(e.game, player.id)) { return 'Energy income plan changed'; }
};
return {
	validate: validate,
	apply: (e) => {
		const error = validate(e); if (#is_defined(error)) { throw Error(error); }
		const player = energy.resolve(e.game, e.data.player_id);
		const result = {token: player.credit_energy_income(e.data.income,e.data.turn_id), owner: player.id + 0}; result.player = player;
		return result;
	},
	rollback: (e) => {
		const player = energy.resolve(e.game,e.applied.owner);
		if (player == null || player != e.applied.player) { throw Error('Energy receipt owner retired'); }
		player.validate_energy_rollback(e.applied.token); player.rollback_energy(e.applied.token);
	},
};
