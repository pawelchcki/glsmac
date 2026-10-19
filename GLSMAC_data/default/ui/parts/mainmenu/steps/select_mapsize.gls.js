return (i) => {
	const rules = i.settings.global.rules;
	const sizes = rules.get_world_sizes();
	const map = i.settings.global.map;
	let selected = 2;
	let remembered = false;
	if (#is_defined(map.preset_level) && map.preset_level >= 0 && map.preset_level < #sizeof(sizes)) {
		const previous = sizes[map.preset_level];
		if (map.size_x == previous.size_x && map.size_y == previous.size_y) {
			selected = previous.level; remembered = true;
		}
	}
	if (!remembered) {
		for (size of sizes) {
			if (map.size_x == size.size_x && map.size_y == size.size_y) {
				selected = size.level;
				break;
			}
		}
	}
	const next = () => {
		if (i.settings.global.map.type == 'random') {
			i.steps.select_difficulty_level(i);
		} else { // custom
			i.steps.customize_ocean_coverage(i);
		}
	};
	const make_entry = (size) => {
		return [size.name, () => {
			rules.select_world_size(map, size.level);
			next();
		}];
	};
	const entries = [];
	for (size of sizes) { entries :+ make_entry(size); }
	entries :+ ['Custom Size', () => { i.steps.customize_mapsize(i); }];
	i.sliding.show({
		title: 'Select size of planet',
		cancel_scope: 'map_setup',
		cancel_group: i.settings.global.map.type == 'random' ? 'random_map' : undefined,
		selected: selected,
		entries: entries,
	});
};
