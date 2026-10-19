return (i) => {
	const saved = i.settings.global.map.erosive_forces;
	const selected = saved == 0.75 ? 1 : (saved == 1.0 ? 2 : 0);
	i.sliding.show({
		selected: selected,
		cancel_group: 'customize_map',
		title: 'Adjust erosive forces',
		entries: [
			['Strong', () => {
				i.settings.global.map.erosive_forces = 0.5;
				i.steps.customize_native_lifeforms(i);
			}, () => {
				i.set_customize_preview({
					erosive_forces_type: 1,
				});
			}],
			['Average', () => {
				i.settings.global.map.erosive_forces = 0.75;
				i.steps.customize_native_lifeforms(i);
			}, () => {
				i.set_customize_preview({
					erosive_forces_type: 2,
				});
			}],
			['Weak', () => {
				i.settings.global.map.erosive_forces = 1.0;
				i.steps.customize_native_lifeforms(i);
			}, () => {
				i.set_customize_preview({
					erosive_forces_type: 3,
				});
			}],
		],
		destructor: () => {
			i.set_customize_preview({
				erosive_forces_type: i.customize_preview_defaults.erosive_forces_type,
			});
		},
	});
};
