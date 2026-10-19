// GLSMAC growth integration over actual native Base/Pop/Tile/TM/BM objects.
// Only terrain yields, event delivery and display nodes are supplied boundaries.
const configure_bases = #include('../default/game/bases');
const add_pop = #include('../default/game/event/add_base_pop');

return (level) => {
	const f = test.production_fixture();
	f.game.get_settings().global.map.preset_level = level;
	f.add_worker(0);
	f.enable_economy();
	f.game.tm.on('get_tile_resources', (e) => {
		return { NUTRIENTS: 2, MINERALS: 0, ENERGY: 0 };
	});
	const values = {};
	const handlers = {};
	const rules = {};
	rules.get_bm = () => { return f.game.bm; };
	rules.get_tm = () => { return f.game.tm; };
	rules.get_year = () => { return 2101; };
	rules.get_turn = () => { return f.game.get_turn(); };
	rules.get = (key) => { return values[key]; };
	rules.set = (key, value) => { values[key] = value; };
	rules.on = (name, callback) => { handlers[name] = callback; };
	rules.event = (name, data) => {
		// Fixture declarations replace artwork only; population changes are real.
		if (name == 'define_base_pop' || name == 'define_base_facility') { return; }
		test.assert(name == 'add_base_pop', 'Unexpected growth event: ' + name);
		const e = { caller: 0 }; e.game = rules; e.data = data;
		test.assert(!#is_defined(add_pop.validate(e)));
		add_pop.apply(e);
	};
	configure_bases(rules);
	handlers.start({});
	f.rules = rules;
	f.store = (nutrients) => { f.with_write(() => { f.base.set('accumulated_nutrients', nutrients); }); };
	f.turn = () => { f.with_write(() => { handlers.turn({}); }); };
	return f;
};
