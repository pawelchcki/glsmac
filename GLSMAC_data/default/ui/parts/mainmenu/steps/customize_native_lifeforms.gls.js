return (i) => {
	const saved = i.settings.global.map.native_lifeforms;
	const selected = saved == 0.5 ? 1 : (saved == 0.75 ? 2 : 0);
	i.sliding.show({
		selected: selected,
		cancel_group: 'customize_map',
		title: 'Native life forms',
		entries: [
			['Rare', () => {
				i.settings.global.map.native_lifeforms = 0.25;
				i.steps.customize_cloud_cover(i);
			}, () => {
				i.set_customize_preview({
					native_lifeforms_type: 1,
				});
			}],
			['Average', () => {
				i.settings.global.map.native_lifeforms = 0.5;
				i.steps.customize_cloud_cover(i);
			}, () => {
				i.set_customize_preview({
					native_lifeforms_type: 2,
				});
			}],
			['Abundant', () => {
				i.settings.global.map.native_lifeforms = 0.75;
				i.steps.customize_cloud_cover(i);
			}, () => {
				i.set_customize_preview({
					native_lifeforms_type: 3,
				});
			}],
		],
		destructor: () => {
			i.set_customize_preview({
				native_lifeforms_type: i.customize_preview_defaults.native_lifeforms_type,
			});
		},
	});
};
