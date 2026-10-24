// Explicit isolated-human fixture: this suite covers bounded mechanics, not the production opponent roster.
// Synthetic declared documents and explicit display delivery. Native startup,
// first-turn gating, Headquarters, unit state and opening commands remain real.
return () => {
	const f = test.natural_startup_fixture(16, 16, 'flat-arid');
	#include('./_natural_startup_mechanics')(f); f.initialize_isolated_player('GAIANS'); f.start_world(true);
	const game = f.game; const state = game.get_opening_state(); const bases = game.bm.get_bases(); const base = bases[0];
	game.event('opening_command', {session: state.session, action: 'planetfall', base_id: 0, previous_name: '', name: ''}); f.process_events();
	game.event('opening_command', {session: state.session, action: 'name', base_id: base.id, previous_name: base.name + '', name: 'Synthetic Haven'}); f.process_events(); f.opening_tick();
	const view = #include('./_ui_mocks').display({get_width: () => { return 0; }});
	view.ui.get_width = () => { return 1024; }; view.ui.get_height = () => { return 768; };
	// Adapt only EventEmitter unsubscribe signatures across the display boundary.
	const bridge = {}; const subscriptions = [];
	for (method of ['get_contacts', 'get_player', 'get_players', 'get_opening_state', 'get_turn', 'get_um', 'get_bm', 'get_tm', 'validate_opening', 'event']) { bridge[method] = game[method]; }
	bridge.on = (name, callback) => { const id = game.on(name, callback); subscriptions :+ {name: name, id: id}; return #sizeof(subscriptions) - 1; };
	bridge.off = (name, token) => { const index = #is_defined(token) ? token : name; const subscription = subscriptions[index]; game.off(subscription.name, subscription.id); };
	const topics = ['TOUR1', 'TOUR2', 'TOURMENU', 'TOURCOMMLINK', 'TOURUNITSINFO', 'TOURTERRAININFO', 'TOURSTACKINFO', 'TOURMESSAGEINFO', 'TOURBUTTONMESSAGE', 'TOURBUTTONINFO', 'TOURWORLDINFO', 'TOURDATEINFO', 'TOUROVER'];
	let tutorial = '';
	for (id of topics) { tutorial += '#' + id + '\n#xs 300\nDeclared {two word} ' + id + ' {$UNITNAME0} text.\n'; }
	tutorial += '#END\n'; let labels = '#LABELS\n';
	for (let index = 0; index < 630; index++) {
		let label = 'Synthetic label ' + #to_string(index);
		if (index == 220) { label = 'Leave sample'; } if (index == 236) { label = 'Finish sample'; }
		if (index == 237) { label = 'Advance sample'; } if (index == 629) { label = 'Nobody reachable'; }
		labels += label + '\n';
	}
	labels += '#END\n'; const documents = {};
	documents.tutorial = test.parse_smac_text(tutorial, 'dialogs'); documents.labels = test.parse_smac_text(labels, 'dialogs');
	const p = {}; p.root = view.root; p.ui = view.ui; p.game = bridge;
	p.glsmac = {load_smac_text: (name, format) => {
		if (name == 'tutor.txt') { return documents.tutorial; } if (name == 'labels.txt') { return documents.labels; }
		return #include('./_ingame_menu_text_fixture')(name, format);
	}};
	p.modules = {bottom_bar: {height: 256}, popup: {is_shown: () => { return false; }}}; p.maybe_quit = () => {};
	const menu = #include('../default/ui/parts/game/menu/menu'); menu.init(p); p.modules.menu = menu;
	const opening = #include('../default/ui/parts/game/opening'); const guided = #include('../default/ui/parts/game/interface_tour');
	opening.guided = guided; opening.p = p; opening.frame = p.root.window({width: 700, height: 390});
	const result = {}; result.f = f; result.game = game; result.view = view; result.base = base; result.menu = menu; result.p = p; result.opening = opening; result.guided = guided; result.documents = documents;
	result.start = () => { return guided.start(p, opening, state.session, base); };
	result.tick = () => { for (timer of view.timers) { timer.tick(); } };
	result.unit = () => { const units = base.get_tile().get_units(); return units[0]; };
	result.snapshot = () => { const unit = result.unit(); return [unit.id + 0, unit.def + '', unit.tile.x + 0, unit.tile.y + 0, unit.health + 0.0, unit.movement + 0.0, unit.get_order()]; };
	return result;
};
