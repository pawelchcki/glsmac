// A solo preference, armed only by accepted player orders. Native readiness
// notifications can arrive later than movement/combat event_result. No timer
// runs while another ready unit is waiting for the player to think or act.
return (game, owner) => {
	const pending = {turn: null, armed_turn: null, armed_session: null};
	// Minimal presentation facades can omit this capability; native completion
	// validation remains authoritative. Real games use the shared native fence.
	const busy = (caller) => { return #is_defined(game.has_pending_actions) && game.has_pending_actions(caller); };
	const request = () => {
		const state = game.get_opening_state(); const turn = game.get_turn(); const caller = game.get_player().id; const session = state.session;
		if (!state.automatic_end_turn || state.phase != 'map' || pending.armed_turn != turn || pending.armed_session != session || pending.turn == turn || game.is_turn_complete(caller) || game.get_um().has_ready_unit(caller) || busy(caller)) { return; }
		pending.turn = turn;
		owner.timer(0, () => {
			pending.turn = null;
			const current = game.get_opening_state();
			if (current.session == session && current.automatic_end_turn && current.phase == 'map' && game.get_turn() == turn && !game.is_turn_complete(caller) && !game.get_um().has_ready_unit(caller) && !busy(caller)) {
				pending.armed_turn = null;
				game.event('complete_turn', {});
			}
			return false;
		});
	};
	owner.listen(game, 'event_result', (e) => {
		if (!e.success || e.caller != game.get_player().id) { return; }
		if (e.name == 'unit_terraform_plan_step') {
			if (!#is_defined(e.data.unit_id) || !game.get_um().has_unit(e.data.unit_id)) { return; }
			if (game.get_um().get_unit(e.data.unit_id).owner != game.get_player().id) { return; }
		}
		let order = false;
		for (name of ['unit_skip_turn', 'unit_hold', 'unit_sentry', 'unit_terraform', 'unit_terraform_plan', 'unit_terraform_plan_step', 'move_unit', 'attack_unit', 'unit_disband', 'found_base', 'join_base']) {
			if (e.name == name) { order = true; }
		}
		if (!order) { return; }
		const state = game.get_opening_state();
		pending.armed_turn = game.get_turn(); pending.armed_session = state.session;
		request();
	});
	owner.listen(game, 'turn_status', (e) => { if (e.status == 'turn_complete') { request(); } });
};
