const factions = [
	['Gaians', 'gaians', {}],
	['Hive', 'hive', {}],
	['University', 'univ', {}],
	['Morganites', 'morgan', {}],
	['Spartans', 'spartans', {}],
	['Believers', 'believe', {}],
	['Peacekeepers', 'peace', {}],
	['Consciousness', 'cyborg', {}],
	['Pirates', 'pirates', {is_naval: true}],
	['Drones', 'drone', {}],
	['Angels', 'angels', {}],
	['Planetcult', 'fungboy', {}],
	['Caretakers', 'caretake', {is_progenitor: true}],
	['Usurpers', 'usurper', {is_progenitor: true}],
];

return {

	source_catalog: () => {
		const result = [];
		for (faction of factions) {
			result :+ {id: #uppercase(faction[0]), file: faction[1] + '', block: #uppercase(faction[1])};
		}
		return result;
	},

	configure: (fm, glsmac) => {
		let ratings = null;
		let starting = null;
		let identities = null;
		if (#is_defined(glsmac)) {
			const catalog = [];
			for (faction of factions) { catalog :+ {id: #uppercase(faction[0]), file: faction[1] + '', block: #uppercase(faction[1])}; }
			ratings = #include('game/faction_ratings').load(glsmac, catalog);
			starting = #include('game/faction_starting_technologies').load(glsmac, catalog);
			identities = #include('game/faction_identity').load(glsmac, catalog);
		}
		for (f of factions) {
			const definition = {
				name: f[0],
				colors: fm.import_colors(f[1] + '.pcx'),
				bases: {
					render: {
						type: 'sprite_grid',
						file: f[1] + '.pcx',
						grid_x: 1, grid_y: 1,
						cell_width: 100, cell_height: 75,
						cell_padding: 1,
					},
					names: fm.import_base_names(f[1] + '.txt'),
				},
			} + f[2];
			const id = #uppercase(f[0]);
			if (ratings != null) { definition.social_ratings = ratings[id]; }
			if (starting != null) { definition.starting_technologies = starting[id]; }
			if (identities != null) { definition.identity = identities[id]; }
			fm.add(id, definition);
		}
	},

};
