const policy = #include('../computer_production');
const resolve = (game, player_id) => {
	for (player of game.get_players()) { if (player.id == player_id) { return player; } }
	return null;
};
const validate = (e) => {
	if (e.caller != 0 || !policy.offline(e.game)) { return 'Computer production requires the offline host'; }
	if (#typeof(e.data.player_id) != 'Int' || #typeof(e.data.turn_id) != 'Int') { return 'Computer production requires integer identities'; }
	if (!e.game.is_started() || e.data.turn_id <= 1 || e.data.turn_id != e.game.get_turn()) { return 'Computer production requires the current ordinary turn'; }
	const player = resolve(e.game, e.data.player_id);
	if (player == null || player.type != 'computer') { return 'Computer production requires a live computer participant'; }
	if (e.game.get('technologies_initialized') != true) { return 'Computer production requires initialized technologies'; }
	const previous = e.game.get(policy.key(player.id));
	if (#is_defined(previous) && previous.turn_id >= e.data.turn_id) { return 'Computer production already processed this turn'; }
	const token = e.game.get('computer_production_next_receipt');
	if (#is_defined(token) && (token < 0 || token >= 9223372036854775807)) { return 'Computer production receipt identities exhausted'; }
};
return {
	validate: validate,
	apply: (e) => {
		const error = validate(e); if (#is_defined(error)) { throw Error(error); }
		const player = resolve(e.game, e.data.player_id); const marker = policy.key(player.id);
		const receipt = {previous_turn: e.game.get(marker), added_choice: '', choice: null, base: null, previous: null, expected: null};
		const previous_token = e.game.get('computer_production_next_receipt');
		receipt.token = (#is_defined(previous_token) ? previous_token : 0) + 1;
		const plan = policy.proposal(e.game, player);
		if (plan != null) {
			const rule = plan.rule;
			if (plan.add_choice) {
				player.add_production_choice(rule.choice, {type: 'unit', id: rule.id, cost: rule.rows * 10, cost_rows: rule.rows, population_cost: rule.population});
				receipt.added_choice = rule.choice + '';
				for (choice of player.get_production_choices()) { if (choice.id == rule.choice) { receipt.choice = choice; } }
			}
			try {
				if (plan.base.get_production_switch_loss(rule.choice) != 0) { throw Error('Computer opening switch must preserve minerals'); }
				receipt.previous = plan.base.select_production(rule.choice); receipt.base = plan.base;
				receipt.expected = plan.base.get_production();
			} catch { : (failure) => {
				if (receipt.added_choice != '') { player.remove_production_choice(receipt.added_choice); }
				throw failure;
			} }
		}
		e.game.set('computer_production_next_receipt', receipt.token + 0);
		e.game.set(marker, {turn_id: e.data.turn_id + 0, token: receipt.token + 0});
		return receipt;
	},
	rollback: (e) => {
		const player = resolve(e.game, e.data.player_id); const marker = policy.key(e.data.player_id); const receipt = e.applied;
		if (player == null || e.game.get_turn() != e.data.turn_id || e.game.get(marker) != {turn_id: e.data.turn_id, token: receipt.token}) { throw Error('Computer production receipt is stale'); }
		// Removal can reject an in-use or replaced recipe. Check every dependent
		// owner/base before restoring anything so rejection remains atomic.
		if (receipt.added_choice != '') {
			let current_choice = null;
			for (choice of player.get_production_choices()) { if (choice.id == receipt.added_choice) { current_choice = choice; } }
			if (current_choice == null || current_choice != receipt.choice) { throw Error('Computer production choice changed after its receipt'); }
			for (base of e.game.get_bm().get_bases()) {
				if (base.get_owner().id == player.id && base != receipt.base && base.get_production().choice_id == receipt.added_choice) { throw Error('Computer production choice is now used by another base'); }
			}
		}
		if (receipt.base != null) {
			let current = null;
			for (base of e.game.get_bm().get_bases()) { if (base == receipt.base) { current = base; } }
			if (current == null || current.get_owner().id != player.id || current.get_production() != receipt.expected) { throw Error('Computer production base changed after its receipt'); }
			current.restore_production(receipt.previous, '');
		}
		if (receipt.added_choice != '') { player.remove_production_choice(receipt.added_choice); }
		if (#is_defined(receipt.previous_turn)) { e.game.set(marker, receipt.previous_turn); } else { e.game.unset(marker); }
	},
};
