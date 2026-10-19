// Actual Player copies used by connection notifications must own their choice
// payloads. The fixture returns plain observations, never copied-player wrappers
// that could survive native destruction. This is GLSMAC lifecycle coverage.
const behavior = #include('./_behavior');

behavior.scenario('Player copy owns independent facility and custom production payloads', () => {
	const f = test.production_fixture();
	const result = f.player_copy_probe('ownership');
	test.assert(result.facility_independent, 'facility payload must not alias the original Player');
	test.assert(result.custom_independent, 'custom payload must not alias the original Player');
	test.assert(result.custom_payload_preserved && result.serialized_equal);
	test.assert(result.choices == f.owner.get_production_choices());
});

behavior.scenario('Player copy preserves scalar fields and returns copied descriptor values', () => {
	const f = test.production_fixture();
	const result = f.player_copy_probe('ownership');
	test.assert(result.scalars_match);
	test.assert(result.name == 'Fixture' && result.full_name == 'Fixture (Synthetic)');
	test.assert(result.role == 1 && result.slot == 1 && result.difficulty == 'Transcend');
	test.assert(result.connected && result.turn_completed);
	result.choices[0].name = 'Edited descriptor';
	const original = f.owner.get_production_choices();
	test.assert(original[0].name == 'Recycling Tanks');
});

for (kind of ['mutation', 'copy_destroyed', 'source_destroyed']) {
	behavior.scenario('Player production choices survive independent ' + kind, () => {
		const f = test.production_fixture();
		const result = f.player_copy_probe(kind);
		test.assert(result.facility_independent && result.custom_independent);
		test.assert(result.lifetime_ok, 'actual native removal/destruction must preserve the surviving owner');
		test.assert(result.original_unchanged);
		test.assert(result.custom_payload_preserved);
	});
}
