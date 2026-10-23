return (i) => {
	i.sliding.show({
		title: 'Game rules',
		cancel_scope: 'rules',
		entries: [
			['Play with Standard Rules', () => {
				i.pending_research_blind = true;
				i.steps.select_faction(i);
			}],
			['Play with Current Rules', () => {
				i.pending_research_blind = i.settings.global.rules.get_blind_research();
				i.steps.select_faction(i);
			}],
			['Customize Rules', () => {
				i.steps.customize_rules(i);
			}],
		]
	});
};
