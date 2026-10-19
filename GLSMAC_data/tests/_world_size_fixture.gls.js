// Explicit native-rules boundary for existing display-only menu fixtures.
// The default values come from the native historical table. Actual table
// validation, transfer and selection have separate native-backed suites.
return (settings) => {
	const sizes = test.default_world_sizes();
	settings.global.rules.get_world_sizes = () => { return #clone(sizes); };
	settings.global.rules.select_world_size = (map, level) => {
		const size = sizes[level];
		map.size_x = size.size_x; map.size_y = size.size_y; map.preset_level = level;
	};
};
