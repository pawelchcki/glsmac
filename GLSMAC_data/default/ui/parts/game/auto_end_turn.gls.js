// A solo preference, armed only by accepted player orders. Native readiness
// notifications can arrive later than movement/combat event_result. No timer
// runs while another ready unit is waiting for the player to think or act.
return (game, owner) => {
	const pending = {turn: null, armed_turn: null, armed_session: null};
	const request = () => {
		const state = game.get_opening_state(); const turn = game.get_turn(); const caller = game.get_player().id; const session = state.session;
		if (!state.automatic_end_turn || state.phase != 'map' || pending.armed_turn != turn || pending.armed_session != session || pending.turn == turn || game.is_turn_complete(caller) || game.get_um().has_ready_unit(caller)) { return; }
		pending.turn = turn;
		owner.timer(0, () => {
			pending.turn = null;
			const current = game.get_opening_state();
			if (current.session == session && current.automatic_end_turn && current.phase == 'map' && game.get_turn() == turn && !game.is_turn_complete(caller) && !game.get_um().has_ready_unit(caller)) {
				pending.armed_turn = null;
				game.event('complete_turn', {});
			}
			return false;
		});
	};
	owner.listen(game, 'event_result', (e) => {
		if (!e.success || e.caller != game.get_player().id) { return; }
		let order = false;
		for (name of ['unit_skip_turn', 'unit_hold', 'unit_sentry', 'unit_terraform', 'move_unit', 'attack_unit', 'unit_disband', 'found_base', 'join_base']) {
			if (e.name == name) { order = true; }
		}
		if (!order) { return; }
		const state = game.get_opening_state();
		pending.armed_turn = game.get_turn(); pending.armed_session = state.session;
		request();
	});
	owner.listen(game, 'turn_status', (e) => { if (e.status == 'turn_complete') { request(); } });
};
