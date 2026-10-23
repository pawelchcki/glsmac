// Locally supplied source text and declared terrain are inputs. The shipped
// faction/rule configuration, native startup, commands and UI controls execute.
const mocks = #include('./_ui_mocks');
const sources = {};
for (entry of research_sources) { sources[entry.filename] = entry.contents; }
const load = (name, format) => {
	if (!#is_defined(sources[name])) { throw Error('Missing local research source: ' + name); }
	return test.parse_smac_text(sources[name], format);
};
for (input of research_inputs) {
	const f = test.natural_startup_fixture(4, 4, 'flat-arid');
	#include('../default/factions').configure({
		add: (id, data) => { f.fm.add(id, data); },
		import_colors: (name) => { return f.colors; },
		import_base_names: (name) => { return {land: ['Research Fixture City'], water: ['Research Fixture Port']}; },
	}, {load_smac_text: load});
	const glsmac = mocks.events(); glsmac.config = {worldscript: 'default'};
	glsmac.load_smac_text = load;
	glsmac.game = {register_event: (name, handler) => {
		if (name == 'define_animation') {
			f.game.register_event(name, {validate: handler.validate, apply: (e) => { return {}; }, rollback: (e) => {}});
		} else { f.game.register_event(name, handler); }
	}};
	#include('../default/game/game')(glsmac);
	const configured = {}; configured.game = f.game; glsmac.emit('configure_game', configured);
	const human = f.initialize_single_player('GAIANS');
	f.game.get_settings().global.rules.set_blind_research(input.algorithm == 'ui.initial_blind_priorities.v1');
	f.start_world();
	test.assert(f.game.get_turn() == 1 && human.id == 0);
	const view = mocks.display(); const p = {modules: {bottom_bar: {height: 256, pp: {sections: {}}}}};
	p.ui = view.ui; p.root = view.root; p.game = f.game; p.glsmac = glsmac; p.maybe_quit = (quit) => {};
	const menu = #include('../default/ui/parts/game/menu/menu'); p.modules.menu = menu; menu.init(p);
	const popup = #include('../default/ui/parts/game/popup/popup'); p.modules.popup = popup;
	popup.available_popups = ['research', 'please_dont_go']; popup.no_sliding = true; popup.init(p);
	const controller = #include('../default/ui/parts/game/research'); p.modules.research = controller; controller.init(p);
	const dialog = #include('../default/ui/parts/game/popup/research');
	const observe = () => {
		const goal = f.game.get_research_state(human.id).target_id;
		if (!popup.is_shown()) { #print('RESEARCH_MAP|' + #to_string(goal)); }
		else {
			#print('RESEARCH_OPEN|' + (dialog.blind ? 'priorities' : 'research') + '|' + #to_string(goal) + '|' + dialog.header.text);
			for (row of dialog.rows) {
				if (dialog.blind) { #print('RESEARCH_ROW|' + row.el.text + '|' + #to_string(row.check.text == 'X')); }
				else { #print('RESEARCH_CARD|' + row.el.text + '|' + row.category.text); }
			}
			if (dialog.blind) { #print('RESEARCH_OK|' + dialog.ok.text); }
			#print('RESEARCH_END');
		}
	};
	#print('RESEARCH_CASE|' + input.id);
	test.assert(view.root.emit('keydown', {code: 'R', modifiers: {shift: true}})); observe();
	for (action of input.actions) {
		if (#typeof(action) == 'Object') {
			const index = #is_defined(action.choose) ? action.choose : action.toggle;
			dialog.rows[index].el.emit('click', {}); f.process_events();
		} else if (action == 'open') { test.assert(view.root.emit('keydown', {code: 'R', modifiers: {shift: true}})); }
		else if (action == 'OK') { dialog.ok.emit('click', {}); }
		else { dialog.data.el.emit('keydown', {code: action == 'Escape' ? 'ESCAPE' : 'ENTER', modifiers: {}}); }
		observe();
	}
	#print('RESEARCH_DONE'); view.root.remove();
}
