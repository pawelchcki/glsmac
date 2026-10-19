// GLSMAC production UI contract; no original-game economy or rendering claims.
// Execute real base popup, picker, buttons and production/facility sections.
// Unrelated resource artwork and native managers are explicit boundaries.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const fixture = () => {
	const f = {};
	f.view = mocks.display();
	f.view.ui.get_width = () => { return 1024; };
	f.game = mocks.events();
	f.state = { events: [], closed: 0, player: 0 };
	f.choices = [
		{ id: 'TANKS', type: 'facility', facility_id: 'RECYCLING_TANKS', name: 'Recycling Tanks', description: 'Synthetic facility description', cost: 32 },
		{ id: 'COLONY_POD', type: 'unit', unit_id: 'ColonyPod', name: 'Colony Pod', description: '', cost: 30, population_cost: 1 },
		{ id: 'CUSTOM', type: 'custom', facility_id: '', name: 'Unsupported custom project', description: '', cost: 10 },
	];
	f.owner = { id: 0, get_faction: () => { return { is_progenitor: false }; }, get_production_choices: () => { return f.choices; } };
	f.make_base = (id) => {
		const b = {};
		b.id = id; b.name = 'Base ' + #to_string(id);
		b.state = { owner: 0, production: { choice_id: '', minerals: 0, last_processed_turn: 1 }, installed: {}, surplus: 4, size: 2 };
		b.get_owner = () => { const owner = {} + f.owner; owner.id = b.state.owner; return owner; };
		b.get_production = () => { return b.state.production; };
		b.has_facility = (id) => { return #is_defined(b.state.installed[id]); };
		b.get_facilities = () => { return b.state.installed; };
		b.get_intake = () => { return { NUTRIENTS: 2, MINERALS: b.state.surplus, ENERGY: 2 }; };
		b.get_consumption = () => { return { NUTRIENTS: 2, MINERALS: 0, ENERGY: 0 }; };
		b.get_size = () => { return b.state.size; };
		b.get = (name) => { return 0; };
		b.get_pops = () => { return []; };
		return b;
	};
	f.base = f.make_base(1); f.other = f.make_base(2);
	f.game.get_player = () => { return { id: f.state.player }; };
	f.game.get_year = () => { return 2101; };
	f.game.get = (name) => {
		if (name == 'map_growth_base') { return 10; }
		if (name == 'f_base_get_nutrient_factor') { return (base) => { return 10; }; }
		if (name == 'f_base_get_pending_production') { return (base) => { return base.state.surplus; }; }
		return (base) => { return 0; };
	};
	f.game.get_bm = () => { return { get_pop_renders: (owner) => { return {}; } }; };
	f.game.event = (name, data) => { f.state.events :+ [name, data.base.id, data.choice_id]; };
	const p = {};
	p.ui = f.view.ui; p.game = f.game;
	p.modules = { bottom_bar: { height: 256 }, menu: { close_all: () => {} } };
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.available_popups = ['base_screen']; f.popup.no_sliding = true;
	screen.available_sections = ['facilities', 'buttons', 'bottom_bar'];
	f.popup.init(p);
	// Keep set()'s real data flow, isolating sections unrelated to production.
	for (name of ['nutrients', 'economy', 'game_state', 'resources', 'energy', 'middle_area']) {
		const section = { set: (data) => {}, set_commerce: (data) => {}, set_energy_grid: (data) => {} };
		section.body = f.view.root.panel({}); screen.sections[name] = section;
	}
	f.show = (base) => { screen.set({ base: base }); f.popup.show('base_screen', (result) => { f.state.closed = f.state.closed + 1; }); };
	f.show(f.base);
	f.change = () => { f.view.find('button', 'text', 'CHANGE').emit('click', {}); };
	f.pick = (id) => { screen.production_choices.value = id; screen.production_choices.emit('select', { value: id }); };
	f.ok = () => { screen.update_production_selection(); };
	return f;
};

const f = fixture();
behavior.scenario('idle production displays real zero storage and no invented queue', () => {
	test.assert(f.view.find('text', 'text', 'IDLE') != null);
	test.assert(screen.sections.bottom_bar.parts.production.production_cells.children == []);
	for (node of f.view.live('button')) { test.assert(node.text != 'QUEUE' && node.text != 'HURRY'); }
	for (node of f.view.live('text')) { test.assert(node.text != 'Mind Worms' && node.text != 'Recreation Commons' && node.text != 'Empty Slot'); }
});
behavior.scenario('CHANGE opens declared supported choices by stable id and Cancel emits nothing', () => {
	f.change();
	test.assert(screen.production_selection != null);
	test.assert(screen.production_choices.items == [['TANKS', 'Recycling Tanks (32 minerals)'], ['COLONY_POD', 'Colony Pod (30 minerals)']]);
	f.pick('TANKS');
	f.view.find('button', 'text', 'CANCEL').emit('click', {});
	test.assert(screen.production_selection == null && f.state.events == []);
	test.assert(f.base.state.production.minerals == 0 && f.base.state.production.choice_id == '');
});
behavior.scenario('OK submits once and stale closing controls cannot submit again', () => {
	f.change(); f.pick('TANKS');
	const old_ok = f.view.find('button', 'text', 'OK');
	old_ok.emit('click', {}); old_ok.emit('click', {}); f.ok();
	test.assert(f.state.events == [['set_base_production', 1, 'TANKS']]);
	test.assert(screen.production_selection == null);
});
behavior.scenario('production area opens the same picker and Escape cancels only the inner pane', () => {
	screen.sections.bottom_bar.parts.production.body.emit('mousedown', {});
	test.assert(screen.production_selection != null);
	test.assert(screen.production_selection.emit('keydown', { code: 'ESCAPE', modifiers: {} }));
	test.assert(screen.production_selection == null && f.popup.is_shown());
	test.assert(f.state.events == [['set_base_production', 1, 'TANKS']] && f.state.closed == 0);
});
behavior.scenario('refresh discards a draft before old OK can target another base', () => {
	f.change(); f.pick('TANKS');
	const old_ok = f.view.find('button', 'text', 'OK');
	screen.set({ base: f.other });
	old_ok.emit('click', {}); f.ok();
	test.assert(screen.production_selection == null && #sizeof(f.state.events) == 1);
	f.change(); f.pick('TANKS');
	f.game.emit('update_base', { base: f.other }); f.ok();
	test.assert(screen.production_selection == null && #sizeof(f.state.events) == 1);
});
behavior.scenario('foreign ownership rejects opening and changed ownership rejects submission', () => {
	f.other.state.owner = 1; screen.set({ base: f.other }); f.change();
	test.assert(screen.production_selection == null);
	f.other.state.owner = 0; screen.set({ base: f.other }); f.change(); f.pick('TANKS');
	f.other.state.owner = 1; f.ok();
	test.assert(screen.production_selection == null && #sizeof(f.state.events) == 1);
	f.other.state.owner = 0;
});
behavior.scenario('backend updates show selected title real minerals surplus and exact turn estimate', () => {
	f.base.state.production.choice_id = 'TANKS'; f.base.state.production.minerals = 12;
	f.show(f.base);
	f.game.emit('update_base', { base: f.base });
	const production = screen.sections.bottom_bar.parts.production;
	test.assert(production.production_title.text == 'Recycling Tanks');
	test.assert(production.production_amount.text == '12 / 32 minerals');
	test.assert(production.production_pending.text == '+4 minerals / turn');
	test.assert(production.production_label.text == '5 TURNS');
	test.assert(#sizeof(production.production_cells.children) == 32);
	f.change(); f.pick('TANKS'); f.ok();
	test.assert(#sizeof(f.state.events) == 1, 'Reselecting the active project emits no event');
});
behavior.scenario('zero surplus is displayed without inventing a completion date', () => {
	f.base.state.surplus = 0; f.game.emit('update_base', { base: f.base });
	test.assert(screen.sections.bottom_bar.parts.production.production_label.text == 'NO SURPLUS');
	test.assert(screen.sections.bottom_bar.parts.production.production_amount.text == '12 / 32 minerals');
});
behavior.scenario('completion refresh installs the real facility and removes its build choice', () => {
	f.base.state.production.choice_id = ''; f.base.state.production.minerals = 3;
	f.base.state.installed.RECYCLING_TANKS = { name: 'Recycling Tanks' };
	f.game.emit('update_base', { base: f.base });
	test.assert(screen.sections.bottom_bar.parts.production.production_title.text == 'IDLE');
	test.assert(screen.sections.bottom_bar.parts.production.production_amount.text == 'Stored: 3 minerals');
	test.assert(#sizeof(screen.sections.facilities.list.children) == 1);
	test.assert(screen.sections.facilities.list.children[0].text == 'Recycling Tanks');
	f.change(); test.assert(screen.production_choices.items == [['COLONY_POD', 'Colony Pod (30 minerals)']]);
	f.view.find('button', 'text', 'CANCEL').emit('click', {});
	test.assert(#sizeof(f.state.events) == 1);
});
behavior.scenario('unknown draft choice and a newly installed facility cannot submit', () => {
	f.show(f.other); f.change(); f.pick('missing'); f.ok();
	test.assert(#sizeof(f.state.events) == 1);
	f.change(); f.pick('TANKS'); f.other.state.installed.RECYCLING_TANKS = { name: 'Recycling Tanks' }; f.ok();
	test.assert(#sizeof(f.state.events) == 1);
});
behavior.scenario('closing and reopening the base drops the previous draft', () => {
	f.other.state.installed = {}; f.show(f.other); f.change();
	screen.p.hide();
	test.assert(screen.production_selection == null && !f.popup.is_shown());
	f.show(f.base); f.ok();
	test.assert(#sizeof(f.state.events) == 1 && f.state.closed == 1);
});

behavior.scenario('Colony Pod selection cancels and confirms through the same real picker', () => {
	f.show(f.base); f.change(); f.pick('COLONY_POD');
	f.view.find('button', 'text', 'CANCEL').emit('click', {});
	test.assert(#sizeof(f.state.events) == 1 && f.base.state.production.choice_id == '');
	f.change(); f.pick('COLONY_POD'); f.ok();
	test.assert(f.state.events[1] == ['set_base_production', 1, 'COLONY_POD']);
	f.ok(); test.assert(#sizeof(f.state.events) == 2);
});
behavior.scenario('active Colony Pod renders its cost and population delay as a unit project', () => {
	f.base.state.production.choice_id = 'COLONY_POD'; f.base.state.production.minerals = 15;
	f.base.state.surplus = 5; f.base.state.size = 2;
	f.game.emit('update_base', { base: f.base });
	const production = screen.sections.bottom_bar.parts.production;
	test.assert(production.production_title.text == 'Colony Pod');
	test.assert(production.production_amount.text == '15 / 30 minerals');
	test.assert(production.production_pending.text == '+5 minerals / turn');
	test.assert(production.production_label.text == '3 TURNS');
	test.assert(screen.sections.bottom_bar.parts.queue.status.text == 'Unit project');
	f.base.state.size = 1; f.base.state.production.minerals = 37;
	f.game.emit('update_base', { base: f.base });
	test.assert(production.production_amount.text == '37 / 30 minerals');
	test.assert(production.production_label.text == 'NEEDS POPULATION');
	f.change(); f.pick('COLONY_POD'); f.ok();
	test.assert(#sizeof(f.state.events) == 2, 'Active project reselection emits no duplicate command');
});
behavior.scenario('completed Colony Pod remains available for manual reselection', () => {
	f.base.state.production.choice_id = ''; f.base.state.production.minerals = 7;
	f.game.emit('update_base', { base: f.base });
	test.assert(screen.sections.bottom_bar.parts.production.production_title.text == 'IDLE');
	test.assert(screen.sections.bottom_bar.parts.production.production_amount.text == 'Stored: 7 minerals');
	test.assert(screen.sections.bottom_bar.parts.queue.status.text == 'No project');
	f.change(); test.assert(screen.production_choices.items == [['COLONY_POD', 'Colony Pod (30 minerals)']]);
	f.pick('COLONY_POD'); f.ok();
	test.assert(f.state.events[2] == ['set_base_production', 1, 'COLONY_POD']);
});
