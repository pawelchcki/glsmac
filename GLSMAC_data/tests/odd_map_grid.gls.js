// Application geometry and native codec invariants, separate from the four
// original post-generation dimension observations and actual browser lifecycle.
const behavior = #include('./_behavior');
for (dimensions of [[4, 3], [8, 5], [60, 48], [60, 49], [62, 49], [258, 49]]) {
	behavior.scenario('configured native grid and snapshot preserve ' + #to_string(dimensions[0]) + 'x' + #to_string(dimensions[1]), () => {
		const f = test.production_fixture(); const map = f.game.get_settings().global.map;
		map.size_x = dimensions[0]; map.size_y = dimensions[1]; map.preset_level = 99;
		const before = f.map_settings_snapshot('current');
		test.assert(#typeof(f.map_grid_probe) == 'Callable', 'Native custom grids need a direct geometry/codec probe');
		const actual = f.map_grid_probe();
		test.assert(actual.width == dimensions[0] && actual.height == dimensions[1]);
		test.assert(actual.half_width == dimensions[0] / 2 && actual.tile_count == dimensions[0] * dimensions[1] / 2);
		test.assert(actual.links && actual.roundtrip, 'Cylindrical edges, polar edges, shared vertices and serialized tiles must remain consistent');
		test.assert(actual.rejects_single_row, 'A valid odd-height codec must still reject single-row files before linking tiles');
		test.assert(f.map_settings_snapshot('current') == before && map.preset_level == 99, 'Grid construction must not rewrite configured dimensions');
	});
}

for (dimensions of [[60, 48], [4, 3], [8, 5], [60, 49], [258, 49]]) {
	behavior.scenario('actual polar normalization retains grid parity and serializable centers at ' + #to_string(dimensions[0]) + 'x' + #to_string(dimensions[1]), () => {
		const f = test.production_fixture(); const map = f.game.get_settings().global.map;
		map.size_x = dimensions[0]; map.size_y = dimensions[1]; map.preset_level = 99;
		const actual = f.map_polar_probe();
		test.assert(actual.width == dimensions[0] && actual.height == dimensions[1]);
		test.assert(actual.links && actual.roundtrip, 'Changed polar corners must update derived centers and survive the actual decoder');
		test.assert(actual.polar_zero && actual.rng_preserved, 'Both real pole rows must be flattened with the existing number of random draws');
	});
}

for (dimensions of [[60, 48], [4, 3], [8, 5], [60, 49], [258, 49]]) {
	behavior.scenario('actual final tile pass fills both meshes at ' + #to_string(dimensions[0]) + 'x' + #to_string(dimensions[1]), () => {
		const f = test.production_fixture(); const map = f.game.get_settings().global.map;
		map.size_x = dimensions[0]; map.size_y = dimensions[1]; map.preset_level = 99;
		const before = f.map_settings_snapshot('current');
		const actual = f.map_mesh_probe();
		const tiles = dimensions[0] * dimensions[1] / 2;
		const edge_tiles = (dimensions[1] + 1) / 2;
		test.assert(actual.vertices == (tiles * 4 + edge_tiles) * 5 && actual.surfaces == (tiles * 4 + edge_tiles) * 4, 'Every even row adds one wrapped land diamond, including the last odd-height row');
		test.assert(actual.data_vertices == tiles * 5 && actual.data_surfaces == tiles * 4, 'Picking mesh must contain every valid tile without an edge copy');
		test.assert(f.map_settings_snapshot('current') == before, 'Mesh generation must preserve configured dimensions');
	});
}

behavior.scenario('native grid probe rejects impossible dimensions without changing settings', () => {
	const f = test.production_fixture(); const map = f.game.get_settings().global.map;
	for (dimensions of [[0, 49], [61, 49], [514, 49], [60, 0], [60, 257]]) {
		map.size_x = dimensions[0]; map.size_y = dimensions[1];
		const before = f.map_settings_snapshot('current'); let failed = false;
		try { f.map_grid_probe(); } catch { : (e) => { failed = true; } }
		test.assert(failed && f.map_settings_snapshot('current') == before);
	}
});
