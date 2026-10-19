return (i) => {
	i.sliding.show({
		smac_dialog: 'MAPMENU',
		entries: [
			['Make Random Map', () => {
				i.settings.global.map.type = 'random';
				i.randomize_map();
				i.steps.select_mapsize(i);
			}],
			['Customize Random Map', () => {
				i.settings.global.map.type = 'custom';
				i.steps.select_mapsize(i);
			}],
			['The Map of Planet', () => {
				i.settings.global.map.type = 'planet';
				i.steps.select_difficulty_level(i);
			}],
			['Huge Map of Planet', () => {
				i.settings.global.map.type = 'huge_planet';
				i.steps.select_difficulty_level(i);
			}],
			['Load Map File', () => {
				i.steps.select_map_file(i);
			}],
		]
	});
};
