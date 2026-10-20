return (glsmac) => {

	// TODO: refactor these into modules
	const factions = #include('../factions');
	const resources = #include('../resources');
	const units = #include('../units');
	const nutrient_rules = #include('nutrient_rules');
	const mineral_rules = #include('mineral_rules');
	const world_sizes = #include('world_sizes');
	const unit_rules = #include('unit_rules');
	const land_resource_rules = #include('land_resource_rules');
	const terraforming_rules = #include('terraforming_rules');

	// Native asset initialization supplies the parsed document on both ordinary
	// and command-line Quick Start paths. Return a validated scalar; native code
	// commits it only after this complete parse succeeds.
	glsmac.on('configure_rules', (e) => { return nutrient_rules.parse(e.document); });
	glsmac.on('configure_mineral_rules', (e) => { return mineral_rules.parse(e.document); });
	glsmac.on('configure_world_sizes', (e) => { return world_sizes.parse(e.document); });

	const modules = ['bases'];
	let m = {};
	for (module of modules) {
		m[module] = #include(module);
	}

	glsmac.on('configure_state', (e) => {
		factions.configure(e.fm, glsmac);
	});

	#include('events')(glsmac.game);

	glsmac.on('configure_game', (e) => {

		const game = e.game;

		game.on('configure', (e) => {

			for (module of m) {
				module(game);
			}

			const um = game.get_um();

			um.on('unit_spawn', (e) => {
				//
			});

			um.on('unit_despawn', (e) => {
				//
			});

			units.configure(game);
			const document = glsmac.load_smac_text('alphax.txt', 'rules');
			game.set('terraforming_rules', terraforming_rules.parse(document));
			#include('terraforming').configure(game);
			resources.configure(game, land_resource_rules.parse(document));

			resources.define(game);
			const starting_rules = unit_rules.parse(document);
			game.set('starting_unit_rules', unit_rules.materialize(um, starting_rules));
			units.define(game, starting_rules);

			const worldscript = #is_defined(glsmac.config.worldscript) ? glsmac.config.worldscript : 'default';
			game.on('create_world', (e) => {
				const generator = #include('world/' + worldscript);
				generator(e.game);
			});

			game.on('error', (e) => {
				glsmac.ui.error('Game initialization failed', () => {
					if (
						#is_defined(glsmac.config.quickstart) ||
						#is_defined(glsmac.config.host) ||
						#is_defined(glsmac.config.join)
					) {
						glsmac.exit();
					} else {
						glsmac.reset();
					}
				});
			});

		});

	});

};
