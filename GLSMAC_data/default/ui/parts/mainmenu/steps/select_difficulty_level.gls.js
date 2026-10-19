return (i) => {
	let entries = [];
	for (difficulty_level of i.settings.global.rules.difficulty_levels) {
		const d = difficulty_level; // TODO: gse fix: keep difficulty_level available here
		entries :+[difficulty_level, () => {
			i.settings.global.difficulty_level = d;
			i.steps.select_rules(i);
		}];
	}
	i.sliding.show({
		title: 'Pick a difficulty level',
		cancel_group: i.settings.global.map.type == 'random' ? 'random_map' : undefined,
		entries: entries
	});
};
