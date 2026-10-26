// Synthetic input world and source text; actual native participants, recipes,
// ownership, base income, switch authority and queued turn events.
return (automatic) => {
	const f = test.natural_startup_fixture(16, 16, 'flat-arid'); const game = f.game;
	#include('./_natural_startup_mechanics')(f);
	if (automatic) { game.on('configure', (e) => { #include('../default/game/computer_production').configure(game); }); }
	f.initialize_declared_players(['GAIANS', 'HIVE'], 'Citizen'); f.configure_declared_world();
	f.human = game.get_player(0); f.computer = game.get_player(1);
	const technologies = #include('./_technology_rules_fixture').parse(); game.set('technology_rules', technologies);
	f.with_write(() => { game.technologies.replace(#include('../default/game/technology_rules').plan(technologies, [])); });
	game.set('technologies_initialized', true);
	f.set_declared_research(0, [0], (0 - 1), 0); f.set_declared_research(1, [0], (0 - 1), 0);
	const rules = game.get('starting_unit_rules');
	let colony = null; for (rule of rules) { if (rule.id == 'ColonyPod') { colony = rule; } }
	f.with_write(() => {
		for (player of game.get_players()) {
			player.add_production_choice(colony.choice, {type: 'unit', id: colony.id, cost: colony.rows * 10, cost_rows: colony.rows, population_cost: colony.population});
			const tile = game.tm.get_tile(player.id == 0 ? 2 : 10, player.id == 0 ? 2 : 10);
			const base = game.bm.spawn_base(player, tile, {name: 'Synthetic ' + #to_string(player.id), facilities: ['HEADQUARTERS']});
			base.create_pop({type: 'DOCTOR'}); base.set('accumulated_nutrients', 0);
			base.restore_production({choice_id: colony.choice, minerals: 3, last_processed_turn: 1}, '');
			if (player.id == 0) { f.human_base = base; } else { f.base = base; }
		}
	});
	f.receipts = []; f.failures = [];
	game.on('event_result', (e) => {
		if (!e.success) { f.failures :+ e.name; }
		if (e.name == 'computer_base_production' && e.success) { f.receipts :+ e.data; }
	});
	f.advance = () => { game.event('complete_turn', {}); f.process_events(); };
	f.snapshot = #include('./_state_trace_observer').make(game, 'economy-research-v1', 'explicit-world').read;
	f.former_rule = () => {
		for (rule of game.get('starting_unit_rules')) { if (rule.id == 'Formers') { return rule; } }
		throw Error('Missing synthetic Formers rule');
	};
	f.add_former_choice = () => {
		const rule = f.former_rule();
		f.with_write(() => { f.computer.add_production_choice(rule.choice, {type: 'unit', id: rule.id, cost: rule.rows * 10, cost_rows: rule.rows, population_cost: rule.population}); });
	};
	f.request = (caller) => {
		const e = {caller: #is_defined(caller) ? caller : 0, data: {player_id: 1, turn_id: game.get_turn()}}; e.game = game; return e;
	};
	return f;
};
