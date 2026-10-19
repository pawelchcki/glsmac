return (i) => {
	i.glsmac.deinit();
	i.sliding.show({
		smac_dialog: 'TOPMENU',
		entries: [
			['Start Game', () => {
				i.glsmac.init();
				i.settings.local.game_mode = 'single';
				i.steps.start_game(i);
			}],
			['Quick Start', () => {
				i.glsmac.init();
				i.settings.local.game_mode = 'single';
				i.settings.global.map.type = 'random';
				i.randomize_map();
				i.glsmac.start_game();
			}],
			['Scenario', () => {
				i.steps.scenario(i);
			}],
			['Load Game', () => {
				i.steps.notimpl(i);
			}],
			['Multiplayer', () => {
				i.glsmac.init();
				i.settings.local.game_mode = 'multi';
				i.steps.multiplayer_type(i);
			}],
			['View Credits', () => {
				i.steps.credits(i);
			}],
			['Exit Game', () => {
				i.glsmac.exit();
			}],
		]
	});
};
