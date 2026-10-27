const owners = #include('../energy_income');
const validate = (e) => {
	if (#typeof(e.caller) != 'Int' || e.caller != 0 || #typeof(e.data.player_id) != 'Int' || #typeof(e.data.credits) != 'Int') { return 'Only host can initialize declared energy reserves'; }
	const player = owners.resolve(e.game,e.data.player_id); if (player == null) { return 'Initial energy owner is not live'; }
	const rules = e.game.get('energy_rules');
	if (!#is_defined(rules) || #typeof(rules.starting_credits) != 'Int') { return 'Starting energy source is not configured'; }
	const amount = rules.starting_credits + player.get_faction().economy_bonuses.starting_energy;
	if (e.data.credits != amount) { return 'Initial energy plan differs from installed declarations'; }
	return player.validate_initial_energy(amount);
};
return {
	validate:validate,
	apply:(e) => {
		const error = validate(e); if (#is_defined(error)) { throw Error(error); }
		const player = owners.resolve(e.game,e.data.player_id);
		const receipt = {owner:player.id + 0,token:player.initialize_energy(e.data.credits)}; receipt.player = player;
		return receipt;
	},
	rollback:(e) => {
		const player = owners.resolve(e.game,e.applied.owner);
		if (player == null || player != e.applied.player) { throw Error('Initial energy owner retired'); }
		player.validate_energy_rollback(e.applied.token); player.rollback_energy(e.applied.token);
	},
};
