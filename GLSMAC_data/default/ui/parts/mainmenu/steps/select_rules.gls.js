return (i) => {
	i.sliding.show({
		title: 'Game rules',
		cancel_scope: 'rules',
		entries: [
			['Play with Standard Rules', () => {
				// TODO: rules
				i.steps.select_faction(i);
			}],
			['Play with Current Rules', () => {
				// TODO: rules
				i.steps.select_faction(i);
			}],
			['Customize Rules', () => {
				// TODO: custom rules
				i.steps.notimpl(i);
			}],
		]
	});
};
