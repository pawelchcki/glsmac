// Native inputs only: the production resource handler calculates every yield.
const mocks = #include('./_mocks');
const resources = #include('../default/resources');
const capture = mocks.capture_tm_handler('get_tile_resources');
resources.configure(capture.game);
const handler = capture.get();

const run_input = (input) => {
	const player = { id: input.faction_id };
	const base = {
		id: input.base_id,
		has_facility: (id) => {
			if (id == 'HEADQUARTERS') { return input.headquarters; }
			if (id == 'RECYCLING_TANKS') { return input.recycling_tanks; }
			return false;
		},
		get_owner: () => { return player; },
	};
	const tile = {
		x: input.x, y: input.y,
		is_land: input.land,
		rockiness: input.land ? 1 : 0, moisture: input.land ? 1 : 0,
		features: { xenofungus: false, jungle: false, river: input.river },
		bonuses: { nutrient: false, minerals: false, energy: false },
		get_base: () => { return base; },
	};
	base.get_tile = () => { return tile; };
	const event = {};
	event.player = player;
	event.tile = tile;
	const result = handler(event);
	test.assert(#typeof(result.NUTRIENTS) == 'Int');
	test.assert(#typeof(result.MINERALS) == 'Int');
	test.assert(#typeof(result.ENERGY) == 'Int');
	#print('HECO_RESULT|' + input.id + '|' + #to_string(result.NUTRIENTS) + '|' + #to_string(result.MINERALS) + '|' + #to_string(result.ENERGY));
};

for (input of headless_inputs) { run_input(input); }
#print('HECO_DONE|' + #to_string(#sizeof(headless_inputs)));
