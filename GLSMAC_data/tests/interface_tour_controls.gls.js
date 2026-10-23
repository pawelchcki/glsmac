const behavior = #include('./_behavior'); const fixture = #include('./_interface_tour_fixture');
behavior.scenario('Source-driven Tour mounts real MENU and Commlink while preserving native turn and unit state', () => {
	const f = fixture(); const before = f.snapshot(); f.start(); let pages = 0;
	while (f.guided.active && !f.guided.pending) {
		const id = f.guided.source_id; pages++;
		test.assert(f.game.get_turn() == 1 && f.snapshot() == before);
		test.assert(f.menu.menus.left_menu.is_open == (id == 'TOURMENU'));
		test.assert(f.menu.menus.right_menu.is_open == (id == 'TOURCOMMLINK'));
		if (id == 'TOURMENU') { test.assert(#sizeof(f.menu.menus.left_menu.items) == 9); }
		if (id == 'TOURCOMMLINK') { test.assert(f.menu.menus.right_menu.empty_label.text == 'Nobody reachable' && f.menu.menus.right_menu.el.bottom == 256); }
		const controls = f.guided.controls;
		test.assert(controls[0].node.text == (id == 'TOUROVER' ? 'Leave sample' : 'Advance sample'));
		f.guided.frame.emit('keydown', {code: 'ENTER', modifiers: {}});
	}
	test.assert(pages == 13 && f.game.get_opening_state().phase == 'tour');
	f.f.process_events(); f.tick(); test.assert(f.game.get_opening_state().phase == 'map' && f.game.get_turn() == 1);
	test.assert(f.snapshot() == before && !f.menu.menus.left_menu.is_open && !f.menu.menus.right_menu.is_open);
	f.view.root.remove();
});
behavior.scenario('Stale page callbacks and duplicate End Tour cannot redirect or repeat native completion', () => {
	const f = fixture(); f.start(); const first = f.guided.controls[0].node.get_handlers(); const next = first[0].callback;
	next({}); test.assert(f.guided.source_id == 'TOUR2'); next({}); test.assert(f.guided.source_id == 'TOUR2');
	const controls = f.guided.controls; const ending = controls[1].node.get_handlers(); const end = ending[0].callback;
	const results = {accepted: 0}; f.game.on('event_result', (e) => { if (e.name == 'opening_command' && e.success) { results.accepted = results.accepted + 1; } });
	end({}); end({}); f.f.process_events(); f.tick(); end({});
	test.assert(results.accepted == 1 && f.game.get_turn() == 1 && f.game.get_opening_state().phase == 'map');
	f.view.root.remove();
});
behavior.scenario('Tour modal keys preserve units and owner removal invalidates saved controls without acknowledging', () => {
	const f = fixture(); const before = f.snapshot(); f.start(); const controls = f.guided.controls; const handlers = controls[1].node.get_handlers(); const end = handlers[0].callback;
	for (code of ['SPACE', 'LEFT', 'M', 'I', 'ESCAPE']) { test.assert(f.guided.frame.emit('keydown', {code: code, modifiers: {}})); }
	test.assert(f.snapshot() == before && f.game.get_opening_state().phase == 'tour');
	f.view.root.remove(); end({}); f.f.process_events();
	test.assert(!f.guided.active && f.game.get_opening_state().phase == 'tour' && f.view.running_timers() == 0);
	f.f.retire(); end({}); test.assert(f.game.get_turn() == 0);
});
behavior.scenario('Ordinary Commlink preserves an empty foreign-participant panel without inventing contact labels', () => {
	const f = fixture(); f.menu.open('left_menu');
	f.menu.game = {get_player: () => { return {id: 0}; }, get_players: () => { return [{id: 0}, {id: 7}]; }};
	f.menu.show_commlink();
	test.assert(f.menu.menus.right_menu.is_open && !#is_defined(f.menu.menus.right_menu.empty_label) && !f.menu.menus.left_menu.is_open);
	f.menu.game = f.p.game; f.menu.show_commlink();
	test.assert(f.menu.menus.right_menu.empty_label.text == 'Nobody reachable' && !f.menu.menus.left_menu.is_open);
	f.menu.game = {get_player: () => { return {id: 0}; }, get_players: () => { return [{id: 0}, {id: 7}]; }};
	f.menu.show_commlink(); test.assert(f.menu.menus.right_menu.is_open && !f.menu.menus.right_menu.empty_label.is_visible());
	f.menu.game = f.p.game;
	f.p.game.get_players = () => { return [{id: 0}, {id: 7}]; };
	const prompt = f.opening.frame; let rejected = false; try { f.start(); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && !f.guided.active && f.opening.frame == prompt && !prompt.is_removed());
	f.view.root.remove();
});
behavior.scenario('Missing installed Tour pages reject before replacing the prompt or changing native state', () => {
	const f = fixture(); const prompt = f.opening.frame; const before = f.snapshot();
	f.documents.tutorial = test.parse_smac_text('#TOUR1\nOnly one declared page.\n#END\n', 'dialogs');
	let rejected = false; try { f.start(); } catch { : (error) => { rejected = true; } }
	test.assert(rejected && !f.guided.active && f.opening.frame == prompt && !prompt.is_removed());
	test.assert(f.snapshot() == before && f.game.get_turn() == 1 && f.game.get_opening_state().phase == 'tour');
	f.view.root.remove();
});
