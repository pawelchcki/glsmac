// Stock-equivalent input declarations. These supply no population, resource
// stores, tile yields or expected city answers. Audio/artwork loading is omitted.
return (f, declared_sources, declared_factions) => {
	const game = f.game;
	const sources = #is_defined(declared_sources) ? declared_sources : #include('./_startup_faction_sources_fixture')({});
	#include('../default/factions').configure({
		add: (id, data) => {
			let included = !#is_defined(declared_factions);
			if (#is_defined(declared_factions)) { for (allowed of declared_factions) { if (id == allowed) { included = true; } } }
			if (included) { f.fm.add(id, data); }
		},
		import_colors: (name) => { return f.colors; },
		import_base_names: (name) => { return {land: ['Synthetic City'], water: ['Synthetic Port']}; },
	}, sources.glsmac);
	#include('../default/game/events')(game);
	game.on('configure', (e) => {
		#include('../default/game/bases')(game);
		#include('../default/units').configure(game);
		const terrain_source = '#TERRAIN\nFarm,None,Kelp Farm,None,4,Cultivate $STR0,f,F\n' +
			'Soil,None,Soil,Disable,8,Construct $STR0,f,F\nMine,None,Platform,None,8,Construct $STR0,M,M\n' +
			'Solar,None,Harness,None,4,Construct $STR0,S,S\nForest,None,...,Disable,4,Plant $STR0,F,Shift+F\n' +
			'Road,None,Road,Disable,1,Build $STR0,R,R\n#END\n';
		game.set('terraforming_rules', #include('../default/game/terraforming_rules').parse(test.parse_smac_text(terrain_source, 'rules')));
		game.set('movement_rules', #include('../default/game/movement_rules').parse(test.parse_smac_text('#RULES\n3\n#END\n', 'rules')));
		#include('../default/game/terraforming').configure(game);
		const resources = #include('../default/resources');
		resources.configure(game, #include('../default/game/land_resource_rules').parse(#include('./_land_resource_rules_fixture')('default')));
		resources.define(game);
		if (#is_defined(sources.mineral_rule_factor)) { game.get_settings().global.rules.set_mineral_cost_factor(sources.mineral_rule_factor); }
		const rules = #include('./_startup_unit_rules_fixture').parse(sources.former_rows);
		game.set('starting_unit_rules', #include('../default/game/unit_rules').materialize(game.um, rules));
		#include('../default/units/defs').define(game, rules);
		game.on('create_world', (world) => { #include('../default/game/world/default')(world.game); });
	});
};
