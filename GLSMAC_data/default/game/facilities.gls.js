const def = (game, id, name, description, hint, cost, cost_rows, pcx) => {
	game.event('define_base_facility', {
		id: id,
		def: {
			name: name,
			description: description,
			hint: hint,
			cost: cost,
			cost_rows: cost_rows,
			render: {
				type: 'sprite',
				file: 'facs/' + pcx,
				x: 0,
				y: 0,
				w: 215,
				h: 215,
			},
		},
	});
};

const result = {
	define: (game) => {

		def(game, 'HEADQUARTERS',
			'Headquarters',
			'Administrative center of your colony. +1 ENERGY. No inefficiency. Enemy probe teams may not attempt mind control here.',
			'Efficiency',
			40, 0,
			'fac001.pcx'
		);

		// Four declared rows use the bounded human preset factor when known.
		// The explicit32-mineral fallback covers unmodeled settings.
		def(game, 'RECYCLING_TANKS',
			'Recycling Tanks',
			'Increases NUTRIENT, MINERALS and ENERGY output of base square.',
			'Bonus Resources',
			32, 4,
			'fac003.pcx'
		);

	},
};

return result;
