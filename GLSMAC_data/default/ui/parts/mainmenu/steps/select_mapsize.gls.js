return (i) => {
	const sizes = [[68, 34], [88, 44], [112, 56], [140, 70], [180, 90]];
	let selected = 2;
	let index = 0;
	for (size of sizes) {
		if (i.settings.global.map.size_x == size[0] && i.settings.global.map.size_y == size[1]) {
			selected = index;
			break;
		}
		index++;
	}
	const next = () => {
		if (i.settings.global.map.type == 'random') {
			i.steps.select_difficulty_level(i);
		} else { // custom
			i.steps.customize_ocean_coverage(i);
		}
	};
	i.sliding.show({
		title: 'Select size of planet',
		cancel_scope: 'map_setup',
		cancel_group: i.settings.global.map.type == 'random' ? 'random_map' : undefined,
		selected: selected,
		entries: [
			['Tiny Planet', () => {
				i.settings.global.map.size_x = 68;
				i.settings.global.map.size_y = 34;
				i.settings.global.map.preset_level = 0;
				next();
			}],
			['Small Planet', () => {
				i.settings.global.map.size_x = 88;
				i.settings.global.map.size_y = 44;
				i.settings.global.map.preset_level = 1;
				next();
			}],
			['Standard Planet', () => {
				i.settings.global.map.size_x = 112;
				i.settings.global.map.size_y = 56;
				i.settings.global.map.preset_level = 2;
				next();
			}],
			['Large Planet', () => {
				i.settings.global.map.size_x = 140;
				i.settings.global.map.size_y = 70;
				i.settings.global.map.preset_level = 3;
				next();
			}],
			['Huge Planet', () => {
				i.settings.global.map.size_x = 180;
				i.settings.global.map.size_y = 90;
				i.settings.global.map.preset_level = 4;
				next();
			}],
			['Custom Size', () => {
				i.steps.customize_mapsize(i);
			}],
		],
	});
};
