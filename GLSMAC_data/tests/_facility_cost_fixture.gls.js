// Actual native fixture, with explicit declared rows and named-preset level.
// Expected factors come from economy.human_mineral_factor.v1 at rule10,
// INDUSTRY0. Total item construction remains a GLSMAC application contract.
return (level) => {
	const f = test.production_fixture();
	const settings = f.game.get_settings();
	settings.global.map.preset_level = level;
	f.with_write(() => {
		f.game.bm.define_facility('OBSERVED_TANKS', {
			name: 'Recycling Tanks', description: 'Four declared mineral rows',
			cost: 32, cost_rows: 4,
			render: { type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1 },
		});
		f.owner.add_production_choice('OBSERVED_TANKS', { type: 'facility', id: 'OBSERVED_TANKS' });
	});
	return f;
};
