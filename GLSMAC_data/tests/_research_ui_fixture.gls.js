const native = #include('./_research_fixture');
const mocks = #include('./_ui_mocks');
const text = #include('./_research_text_fixture');
const menu_source = #include('./_ingame_menu_text_fixture');
return (blind) => {
	const f = native(blind); f.view = mocks.display(); f.events = mocks.events(); f.pending = {requests: [], delivered: 0};
	// The native fixture already declares its population/facilities. Mount the
	// shipped intake hooks without re-declaring those rendering definitions.
	const economy = {on: (name, callback) => {}, event: (name, data) => {}};
	economy.get_bm = f.game.get_bm; economy.get_tm = f.game.get_tm;
	#include('../default/game/bases')(economy);
	#include('../default/resources').configure(f.game);
	const definitions = f.game.get('technology_rules');
	for (entry of definitions) { if (entry.id >= 10) { entry.prerequisites = [(0 - 2), (0 - 2)]; } }
	definitions[1].weights = [1, 4, 2, 3]; definitions[2].weights = [4, 1, 2, 3];
	definitions[7].weights = [1, 2, 4, 3]; definitions[9].weights = [1, 2, 3, 4];
	f.with_write(() => { f.game.technologies.replace(#include('../default/game/technology_rules').plan(definitions, f.game.get_players())); });
	f.game.set('technology_rules', definitions);
	f.events.technologies = f.game.technologies;
	f.events.get_player = () => { return f.owner; }; f.events.get_players = f.game.get_players;
	f.events.get_um = () => { return f.game.um; }; f.events.get_bm = () => { return f.game.bm; };
	f.events.get_settings = f.game.get_settings; f.events.get = f.game.get;
	f.events.get_turn = f.game.get_turn; f.events.is_started = f.game.is_started; f.events.is_turn_complete = f.game.is_turn_complete;
	f.events.get_research_state = f.game.get_research_state; f.events.get_opening_state = f.game.get_opening_state;
	f.events.get_research_science = f.game.get_research_science;
	f.events.validate_research_target = f.game.validate_research_target; f.events.validate_research_priority = f.game.validate_research_priority;
	f.events.event = (name, data) => { const request = {name: name}; request.data = data; f.pending.requests :+ request; };
	const p = {modules: {bottom_bar: {height: 256, pp: {sections: {}}}}};
	p.ui = f.view.ui; p.root = f.view.root; p.game = f.events; p.maybe_quit = (quit) => {};
	p.glsmac = {load_smac_text: (name, format) => {
		if (name == 'script.txt') { return test.parse_smac_text(text.script, format); }
		if (name == 'labels.txt') { return test.parse_smac_text(text.labels, format); }
		return menu_source(name, format);
	}};
	f.menu = #include('../default/ui/parts/game/menu/menu'); p.modules.menu = f.menu; f.menu.init(p);
	f.popup = #include('../default/ui/parts/game/popup/popup'); p.modules.popup = f.popup;
	f.popup.available_popups = ['research', 'laboratories', 'please_dont_go']; f.popup.no_sliding = true; f.popup.init(p);
	f.controller = #include('../default/ui/parts/game/research'); p.modules.research = f.controller; f.controller.init(p);
	f.dialog = #include('../default/ui/parts/game/popup/research');
	f.open = () => { return f.controller.open(); };
	f.key = (code, modifiers) => {
		const event = {code: code, modifiers: #is_defined(modifiers) ? modifiers : {}};
		return f.popup.is_shown() ? f.popup.popup.el.emit('keydown', event) : f.view.root.emit('keydown', event);
	};
	f.hq = () => {
		f.menu.open('left_menu'); f.menu.menus.left_menu.items[1].el.emit('click', {});
		for (row of f.menu.menus.left_menu_hq.items) { if (row.entry.source_index == 1) { return row.el.emit('click', {}); } }
		throw Error('Missing mounted HQ research action');
	};
	f.deliver = (success) => {
		const request = f.pending.requests[f.pending.delivered]; f.pending.delivered = f.pending.delivered + 1;
		if (!#is_defined(success) || success) {
			const handler = #include('../default/game/event/' + request.name);
			const e = {caller: f.owner.id}; e.game = f.game; e.data = request.data;
			const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
			f.with_write(() => { e.applied = handler.apply(e); });
		}
		const receipt = {name: request.name, caller: f.owner.id, success: !#is_defined(success) || success}; receipt.data = request.data;
		f.events.emit('event_result', receipt);
	};
	return f;
};
