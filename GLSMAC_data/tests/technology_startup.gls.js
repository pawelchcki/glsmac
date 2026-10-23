// Full shipped game configuration and native startup on declared terrain.
// Only asset text/art loading and world generation are supplied boundaries.
const behavior = #include('./_behavior');
const text_fixture = #include('./_technology_rules_fixture');
const mocks = #include('./_ui_mocks');
const unit_count = (game) => {
	let count = 0;
	for (let y = 0; y < 4; y++) {
		for (let x = y % 2; x < 4; x = x + 2) { count += #sizeof(game.tm.get_tile(x, y).get_units()); }
	}
	return count;
};
const startup = (profile, corrupt) => {
	const f = test.natural_startup_fixture(4, 4, 'flat-arid');
	const factions = #include('./_startup_faction_sources_fixture')({profile: profile});
	#include('../default/factions').configure({
		add: (id, data) => { f.fm.add(id, data); },
		import_colors: (name) => { return f.colors; },
		import_base_names: (name) => { return {land: ['Synthetic City'], water: ['Synthetic Port']}; },
	}, factions.glsmac);
	const unit_document = test.parse_smac_text(#include('./_startup_unit_rules_fixture').source, 'rules');
	const resource_document = #include('./_land_resource_rules_fixture')('default');
	const global_rows = resource_document.rows('RULES'); global_rows[0][0] = '3';
	const menu_document = #include('./_ingame_menu_text_fixture')('alphax.txt', 'rules');
	const technology_rows = text_fixture.rows();
	if (corrupt) { technology_rows[88][7] = 'Missing'; }
	const document = {rows: (name) => {
		if (name == 'TECHNOLOGY') { return technology_rows; }
		if (name == 'RULES') { return global_rows; }
		if (name == 'RESOURCEINFO') { return resource_document.rows(name); }
		if (name == 'TERRAIN') { return menu_document.rows(name); }
		return unit_document.rows(name);
	}};
	const glsmac = mocks.events(); glsmac.config = {worldscript: 'default'};
	glsmac.game = {register_event: (name, handler) => {
		if (name == 'define_animation') {
			// Artwork/sound definitions are the explicit display boundary. Keep
			// real authority validation; gameplay events use their shipped code.
			f.game.register_event(name, {validate: handler.validate, apply: (e) => { return {}; }, rollback: (e) => {}});
		} else { f.game.register_event(name, handler); }
	}};
	glsmac.load_smac_text = (name, kind) => {
		if (name != 'alphax.txt' || kind != 'rules') { throw Error('Unexpected startup asset'); }
		return document;
	};
	#include('../default/game/game')(glsmac);
	const configured = {}; configured.game = f.game; glsmac.emit('configure_game', configured);
	f.human = f.initialize_single_player('GAIANS');
	return f;
};

for (profile of ['default', 'gaian-physics']) {
	const source_profile = profile;
	behavior.scenario('production startup initializes native technology ownership from ' + source_profile + ' sources', () => {
		const f = startup(source_profile, false); const game = f.game;
		const receipts = {initialized: 0, failed: 0, failures: ''};
		game.on('event_result', (e) => {
			if (e.name == 'initialize_technologies' && e.success) { receipts.initialized = receipts.initialized + 1; }
			if (!e.success) { receipts.failed = receipts.failed + 1; receipts.failures = receipts.failures + ' ' + e.name; }
		});
		f.start_world();
		test.assert(receipts.initialized == 1 && receipts.failed == 0 && game.get_turn() == 1,
			'Initialization receipts=' + #to_string(receipts.initialized) + ', failed=' + #to_string(receipts.failed) + receipts.failures + ', turn=' + #to_string(game.get_turn()));
		test.assert(game.get('technologies_initialized') == true && #sizeof(game.get('technology_rules')) == 89);
		test.assert(game.technologies.has_tech(source_profile == 'default' ? 0 : 1, 1));
		test.assert(!game.technologies.has_tech(source_profile == 'default' ? 1 : 0, 1));
		test.assert(!game.technologies.has_tech(0, 0) && !game.technologies.has_tech(0, 2));
		const final_row = game.technologies.get(88);
		test.assert(game.technologies.category(0) == 3 && final_row[2] == [1, 2, 3, 4]);
		test.assert(#sizeof(game.bm.get_bases()) == 1 && unit_count(game) == 1);
		const e = {caller: 0, data: {}}; e.game = game;
		test.assert(#is_defined(#include('../default/game/event/initialize_technologies').validate(e)));
		f.process_events(); test.assert(receipts.initialized == 1);
	});
}

behavior.scenario('an invalid final technology row rejects real startup before world creation or ownership changes', () => {
	const f = startup('default', true); const before = f.game.technologies.get(0);
	const spawned = {count: 0}; f.game.um.on('unit_spawn', (e) => { spawned.count = spawned.count + 1; });
	let failed = false;
	try { f.start_world(); } catch { : (error) => { failed = true; } }
	test.assert(failed && f.game.get_turn() == 0 && #sizeof(f.game.bm.get_bases()) == 0 && spawned.count == 0);
	test.assert(f.game.technologies.get(0) == before && !f.game.technologies.has_tech(0, 1));
});

behavior.scenario('host validation and exact initialization rollback preserve the prior native table', () => {
	const f = startup('default', false); const game = f.game;
	game.set('technology_rules', text_fixture.parse());
	const handler = #include('../default/game/event/initialize_technologies'); const e = {caller: 1, data: {}}; e.game = game;
	test.assert(#is_defined(handler.validate(e)) && !game.technologies.has_tech(0, 1));
	e.caller = 0; test.assert(!#is_defined(handler.validate(e)));
	const previous = []; for (let id = 0; id < 89; id++) { previous :+ game.technologies.get(id); }
	f.with_write(() => { e.applied = handler.apply(e); });
	test.assert(game.technologies.has_tech(0, 1) && #is_defined(handler.validate(e)));
	f.with_write(() => { handler.rollback(e); });
	const restored = []; for (let restored_id = 0; restored_id < 89; restored_id++) { restored :+ game.technologies.get(restored_id); }
	test.assert(restored == previous && game.get('technologies_initialized') == false && !#is_defined(handler.validate(e)));
});
