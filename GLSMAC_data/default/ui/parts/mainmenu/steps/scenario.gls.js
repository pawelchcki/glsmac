return (i) => {
	i.sliding.show({
		smac_dialog: 'SCENARIOMENU',
		title: 'Scenario',
		entries: [
			['Play Scenario', () => { i.steps.notimpl(i); }],
			['Create Scenario', () => { i.steps.notimpl(i); }],
			['Load Map File', () => {
				i.glsmac.init();
				i.settings.local.game_mode = 'single';
				i.steps.select_map_file(i);
			}],
			['Edit Scenario', () => { i.steps.notimpl(i); }],
		],
	});
};
