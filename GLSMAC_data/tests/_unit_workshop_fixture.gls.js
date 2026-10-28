// Actual production pane and Workshop; display/native arithmetic boundaries are explicit.
const mocks = #include('./_ui_mocks');
const screen = #include('../default/ui/parts/game/popup/base_screen');
return () => {
	const f = {};
	f.view = mocks.display();
	f.view.ui.get_width = () => { return 1024; };
	f.game = mocks.events();
	f.state = { events: [], closed: 0, player: 0, turn: 1 };
	f.rules = #include('./_startup_unit_rules_fixture').parse().definitions;
	f.sea = #clone(f.rules[1]); f.sea.id = 'SeaFormers'; f.sea.movement = 4; f.sea.movement_type = 'water'; f.sea.source_components.chassis = 3;
	f.rules[1].name = 'Authored Worker';
	f.choices = [
		{ id: 'TANKS', type: 'facility', facility_id: 'RECYCLING_TANKS', name: 'Recycling Tanks', description: 'Synthetic facility description', cost: 32 },
		{ id: 'COLONY_POD', type: 'unit', unit_id: 'ColonyPod', name: 'Colony Pod', description: '', cost: 30, population_cost: 1 },
		{ id: 'FORMERS', type: 'unit', unit_id: 'Formers', name: 'Authored Worker', cost: 27, population_cost: 0 },
		{ id: 'SEA_FORMERS', type: 'unit', unit_id: 'SeaFormers', name: 'Foil Worker', cost: 83, population_cost: 0 },
		{ id: 'CUSTOM', type: 'custom', facility_id: '', name: 'Unsupported custom project', description: '', cost: 10 },
	];
	f.owner = { id: 0, get_faction: () => { return { is_progenitor: false }; }, get_production_choices: () => { return f.choices; } };
	f.make_base = (id) => {
		const b = {};
		b.id = id; b.name = 'Base ' + #to_string(id);
		b.state = { owner: 0, production: { choice_id: '', minerals: 0, last_processed_turn: 1 }, installed: {}, surplus: 4, size: 2, unsupported: false };
		b.get_owner = () => { const owner = {} + f.owner; owner.id = b.state.owner; return owner; };
		b.get_production = () => { return b.state.production; };
		// Arithmetic is a native boundary; this UI fixture supplies a fixed
		// preview witness and tests how the actual picker presents it.
		b.get_production_switch_loss = (id) => {
			if (b.state.production.choice_id == '' || b.state.production.choice_id == id) { return 0; }
			if (b.state.unsupported) { throw ContextError('unsupported switch'); }
			return 6;
		};
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
	f.game.get_turn = () => { return f.state.turn; };
	f.game.get_year = () => { return 2101; };
	f.game.get = (name) => {
		if (name == 'starting_unit_rules') { return f.rules; }
		if (name == 'sea_former_rule') { return f.sea; }
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
	f.screen = screen;
	f.workshop = () => { f.view.find('button', 'text', 'WORKSHOP').emit('click', {}); return screen.workshop.dialog; };
	f.ok = () => { screen.update_production_selection(); };
	return f;
};

