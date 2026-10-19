// Actual native owner/base/prices, shipped base picker and shipped selection
// event validator/apply. Display nodes, synchronous command delivery and the
// already-open base identity are declared boundaries; unrelated base content,
// terrain economics, art and renderer geometry are not populated or simulated.
// This is GLSMAC construction/application coverage, not new original UI parity.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const screen = #include('../default/ui/parts/game/popup/base_screen');
const command = #include('../default/game/event/set_base_production');
const fixture = () => {
	const f = {}; f.native = test.founding_fixture(); f.commands = [];
	f.native.game.get_settings().global.map.preset_level = 0;
	f.native.game.get_settings().global.rules.set_mineral_cost_factor(1);
	f.native.with_write(() => {
		f.native.game.bm.undefine_facility('RECYCLING_TANKS');
		f.native.game.bm.define_facility('RECYCLING_TANKS', {
			name: 'Recycling Tanks', description: 'Declared four rows', cost: 32, cost_rows: 4,
			render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 },
		});
		f.native.game.bm.define_facility('NO_PRICE', {
			name: 'Unavailable fallback', description: '', cost: 0,
			render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 },
		});
		f.native.owner.add_production_choice('NO_PRICE', { type: 'facility', id: 'NO_PRICE' });
		f.native.owner.add_production_choice('COLONY_POD', {
			type: 'unit', id: 'ColonyPod', cost: 30, cost_rows: 3, population_cost: 1,
		});
	});
	f.view = mocks.display(); f.view.ui.get_width = () => { return 1024; };
	f.game = mocks.events();
	f.game.get_player = () => { return f.native.game.get_player(); };
	f.game.event = (name, data) => {
		test.assert(name == 'set_base_production', 'Picker must use the shipped production command');
		const e = {}; e.game = f.native.game; e.caller = f.game.get_player().id; e.data = data;
		const error = command.validate(e);
		if (#is_defined(error)) { throw FixtureCommandRejected(error); }
		f.native.with_write(() => { command.apply(e); });
		f.commands :+ [name, data.base.id, data.choice_id];
	};
	const p = {}; p.ui = f.view.ui; p.game = f.game;
	p.modules = { bottom_bar: { height: 256 }, menu: { close_all: () => {} } };
	f.popup = #include('../default/ui/parts/game/popup/popup');
	f.popup.available_popups = ['base_screen']; f.popup.no_sliding = true;
	screen.available_sections = ['buttons'];
	f.popup.init(p);
	// Populate only the native identity and the unrelated bottom-bar display
	// surface needed by actual on_show/on_hide. No fake base object or choices.
	screen.base = f.native.base; screen.base_id = f.native.base.id;
	screen.sections.bottom_bar = {}; screen.sections.bottom_bar.frame = f.view.root.area({});
	f.popup.show('base_screen', (result) => {});
	f.open = () => { screen.show_production_selection(); };
	f.pick = (id) => {
		test.assert(screen.production_choices != null, 'The actual picker must expose a choice list');
		screen.production_choices.value = id;
		screen.production_choices.emit('select', { value: id });
	};
	f.cancel = () => { f.view.find('button', 'text', 'CANCEL').emit('click', {}); };
	f.confirm = () => { f.view.find('button', 'text', 'OK').emit('click', {}); };
	return f;
};
const ids = (choices) => {
	const result = [];
	for (choice of choices) { result :+ choice.id; }
	return result;
};

behavior.scenario('actual native free projects remain available through the shipped base-screen filter', () => {
	const f = fixture();
	test.assert(screen.is_open && f.native.base.get_owner().id == f.game.get_player().id);
	test.assert(ids(f.native.owner.get_production_choices()) == ['COLONY_POD', 'RECYCLING_TANKS']);
	const available = screen.get_production_choices();
	test.assert(ids(available) == ['COLONY_POD', 'RECYCLING_TANKS'], 'Native valid zero-price projects must survive the actual UI filter');
	for (choice of available) { test.assert(choice.cost == 0); }
	f.view.root.remove();
});

behavior.scenario('actual free picker labels and previews cancel without native state or side effects', () => {
	const f = fixture(); const before = f.native.snapshot(); const inspect = f.native.inspect();
	f.open();
	test.assert(screen.production_choices != null, 'Valid free projects must create the actual choice list');
	test.assert(screen.production_choices.items == [['COLONY_POD', 'ColonyPod (0 minerals)'], ['RECYCLING_TANKS', 'Recycling Tanks (0 minerals)']]);
	for (id of ['RECYCLING_TANKS', 'COLONY_POD']) {
		f.pick(id);
		test.assert(screen.production_switch_preview.text == 'Switch loss: 0 minerals');
		test.assert(f.native.snapshot() == before && f.native.inspect() == inspect, 'Draft selection and native previews remain read-only');
	}
	f.cancel();
	test.assert(screen.production_selection == null && f.commands == []);
	test.assert(f.native.snapshot() == before && f.native.inspect() == inspect);
	f.view.root.remove();
});

behavior.scenario('actual picker confirmation validates and applies each free project through shipped commands', () => {
	const f = fixture(); const inspect = f.native.inspect();
	for (id of ['COLONY_POD', 'RECYCLING_TANKS']) {
		f.open(); f.pick(id); f.confirm();
		test.assert(screen.production_selection == null);
		test.assert(f.native.base.get_production() == { choice_id: id, minerals: 0, last_processed_turn: 1 });
		test.assert(f.native.base.get_size() == 0 && f.native.inspect().unit_ids == inspect.unit_ids);
		test.assert(!f.native.base.has_facility('RECYCLING_TANKS'), 'Selection does not immediately complete a free project');
	}
	test.assert(f.commands == [['set_base_production', f.native.base.id, 'COLONY_POD'], ['set_base_production', f.native.base.id, 'RECYCLING_TANKS']]);
	f.view.root.remove();
});

behavior.scenario('actual installed facilities invalid zero fallbacks and foreign bases stay excluded', () => {
	const f = fixture();
	f.native.with_write(() => { f.native.base.select_production('RECYCLING_TANKS'); });
	f.native.set_turn(2);
	f.native.with_write(() => { f.native.base.process_production(2, 0); });
	test.assert(f.native.base.has_facility('RECYCLING_TANKS'));
	test.assert(ids(screen.get_production_choices()) == ['COLONY_POD']);
	f.open();
	test.assert(screen.production_choices.items == [['COLONY_POD', 'ColonyPod (0 minerals)']]);
	f.cancel();
	// Native fixture's economy host is a distinct actual local Player0; its
	// owner1/base remain unchanged. No substitute foreign Base/Player objects.
	f.native.enable_economy();
	test.assert(f.game.get_player().id != f.native.base.get_owner().id);
	const before = f.native.snapshot(); const inspect = f.native.inspect();
	test.assert(screen.get_production_choices() == []); f.open();
	test.assert(screen.production_selection == null && f.commands == []);
	test.assert(f.native.snapshot() == before && f.native.inspect() == inspect);
	f.view.root.remove();
});

behavior.scenario('actual native rule changes recover positive picker prices without caching free descriptors', () => {
	const f = fixture(); f.open();
	test.assert(screen.production_choices != null && screen.production_choices.items[0][1] == 'ColonyPod (0 minerals)');
	f.cancel();
	f.native.game.get_settings().global.map.preset_level = 2;
	f.native.game.get_settings().global.rules.set_mineral_cost_factor(11);
	const before = f.native.snapshot(); const inspect = f.native.inspect();
	f.open();
	test.assert(screen.production_choices.items == [['COLONY_POD', 'ColonyPod (33 minerals)'], ['RECYCLING_TANKS', 'Recycling Tanks (44 minerals)']]);
	f.pick('RECYCLING_TANKS');
	test.assert(screen.production_switch_preview.text == 'Switch loss: 0 minerals');
	f.cancel();
	test.assert(f.native.snapshot() == before && f.native.inspect() == inspect && f.commands == []);
	f.view.root.remove();
});
