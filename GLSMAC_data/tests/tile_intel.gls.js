const preview = #include('../default/ui/parts/game/bottom_bar/tile_preview');
const state = { lines: [], removed: 0, coordinates: null };
const list = {
	remove: () => { state.removed = state.removed + 1; },
	text: (properties) => {
		// Every rendered row must be text, including pods and imported landmarks.
		test.assert(#typeof(properties.text) == 'String');
		state.lines :+ properties.text;
	},
};
preview.frame = {
	listview: (properties) => { return list; },
	text: (properties) => {
		const label = {};
		label.text = properties.text;
		state.coordinates = label;
		return label;
	},
};
preview.show_resources = false;
preview.tile = {
	x: 2, y: 4, elevation: 500, is_water: false, rockiness: 1, moisture: 3,
	features: {
		unity_pod: true, volcano: true, sunny_mesa: true,
		garland_crater: true, fossil_field_ridge: true, unity_energy: true,
		unity_chopper: true, unity_radar: true, future_landmark: true,
	},
	bonuses: { nutrient: true, future_bonus: true },
	terraforming: {
		road: true, mag_tube: true, forest: true, farm: true, soil_enricher: true,
		solar: true, mine: true, condenser: true, mirror: true, borehole: true,
		sensor: true, bunker: true, airbase: true, future_improvement: true,
	},
	get_resources: () => { return { NUTRIENTS: 3, MINERALS: 2, ENERGY: 1 }; },
};
const has_line = (text) => {
	for (line of state.lines) {
		if (line == text) { return true; }
	}
	return false;
};

preview.set_lines();
for (label of [
	'Supply Pod', 'Volcano', 'Sunny Mesa', 'Garland Crater', 'Fossil Ridge',
	'Unity Reactor', 'Unity Chopper', 'Unity Radar', 'Nutrient bonus',
	'Road', 'Mag Tube', 'Forest', 'Farm', 'Soil Enricher', 'Solar Collector',
	'Mine', 'Condenser', 'Echelon Mirror', 'Borehole', 'Sensor Array', 'Bunker', 'Airbase',
]) {
	test.assert(has_line(label));
}
test.assert(state.coordinates.text == '(2 , 4)');

// Sea improvements use their sea names, and replacing the preview removes old rows.
state.lines = [];
preview.tile.is_water = true;
preview.tile.elevation = 0 - 1500;
preview.tile.features = { geothermal: true, xenofungus: true };
preview.tile.terraforming = { farm: true, solar: true, mine: true, road: false };
preview.set_lines();
test.assert(state.removed == 1);
for (label of ['Ocean', 'Depth: 1500', 'Sea Fungus', 'Geothermal', 'Kelp Farm', 'Tidal Harness', 'Mining Platform']) {
	test.assert(has_line(label));
}
test.assert(!has_line('Farm'));
test.assert(!has_line('Road'));

// The existing click-to-resources mode remains separate from terrain labels.
state.lines = [];
preview.show_resources = true;
preview.set_lines();
test.assert(state.removed == 2);
test.assert(has_line('Nutrients: 3'));
test.assert(has_line('Minerals: 2'));
test.assert(has_line('Energy: 1'));
test.assert(!has_line('Kelp Farm'));
