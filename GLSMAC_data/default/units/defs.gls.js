const moralesets = [
	{
		id: 'NATIVE',
		data: [
			{name: 'Hatchling'},
			{name: 'Larval Mass'},
			{name: 'Pre-Boil'},
			{name: 'Boil'},
			{name: 'Mature Boil'},
			{name: 'Great Boil'},
			{name: 'Demon Boil'},
		]
	},
];

const native_lifeform = (id, name, movement_type, movement_per_turn, base_y) => {
	return {
		id: id,
		data: {
			name: name,
			morale: 'NATIVE',
			type: 'static',
			movement_type: movement_type,
			movement_per_turn: movement_per_turn,
			render: {
				type: 'sprite',
				file: 'units.pcx',
				x: 2, y: base_y,
				w: 100, h: 75,
				cx: 53, cy: base_y + 51,
				morale_based_xshift: 102
			},
		},
	};
};

const units = [
	native_lifeform('FungalTower', 'Fungal Tower', 'immovable', 0, 79),
	native_lifeform('MindWorms', 'Mind Worms', 'land', 1, 233),
	native_lifeform('SeaLurk', 'Sea Lurk', 'water', 4, 310),
	native_lifeform('SporeLauncher', 'Spore Launcher', 'land', 1, 387),
	// Functional civilian prototype using the existing citizen portrait. This
	// static sprite does not reproduce the original human vehicle model.
	{
		id: 'ColonyPod',
		data: {
			name: 'Colony Pod', morale: 'NATIVE', type: 'static',
			movement_type: 'land', movement_per_turn: 1,
			render: {
				type: 'sprite', file: 'newicons.pcx',
				x: 79, y: 501, w: 38, h: 48, cx: 98, cy: 549,
			},
		},
	},
];

const result = {
	define: (game, rules) => {
		if (#is_defined(rules)) {
			game.event('define_moraleset', {id: 'NATIVE', data: rules.native_morale});
			game.event('define_moraleset', {id: 'STANDARD', data: rules.standard_morale});
		} else {

		for (moraleset of moralesets) {
			game.event('define_moraleset', moraleset);
		}
		}

		for (unit of units) {
			if (!#is_defined(rules) || unit.id != 'ColonyPod') { game.event('define_unit', unit); }
		}
		if (#is_defined(rules)) {
			for (entry of rules.definitions) {
				// Static portrait until the game's conventional vehicle renderer
				// supports installed CVR models. Combat/morale remain real data.
				const data = {name: entry.name, morale: 'STANDARD', type: 'static',
					movement_type: 'land', movement_per_turn: entry.movement,
					render: {type: 'sprite', file: 'newicons.pcx', x: 79, y: 501, w: 38, h: 48, cx: 98, cy: 549}};
				data.combat = entry.combat;
				game.event('define_unit', {id: entry.id, data: data});
			}
		}

	},
};

return result;
