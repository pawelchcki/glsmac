return (glsmac) => {

	// TODO: refactor these into modules
	const factions = #include('../factions');
	const resources = #include('../resources');
	const units = #include('../units');
	const nutrient_rules = #include('nutrient_rules');

	// Native asset initialization supplies the parsed document on both ordinary
	// and command-line Quick Start paths. Return a validated scalar; native code
	// commits it only after this complete parse succeeds.
	glsmac.on('configure_rules', (e) => { return nutrient_rules.parse(e.document); });

	const modules = ['bases'];
	let m = {};
	for (module of modules) {
		m[module] = #include(module);
	}

	glsmac.on('configure_state', (e) => {
		factions.configure(e.fm);
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
			resources.configure(game);

			resources.define(game);
			units.define(game);

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
