// Native validation, wrapper and codec checks. Original comparisons are separate.
const behavior = #include('./_behavior');
const identity = ['Orion Vale', 'Orbit Guild', 'Orbiters', 'Orbital', 'Navigator', 'brisk'];
behavior.scenario('native faction identity survives input and returned-array mutation', () => {
	const f = test.production_fixture(); let input = #clone(identity);
	const applied = f.apply_faction_identity(input);
	test.assert(applied.identity == identity && applied.name == 'Orbit Guild');
	input[0] = 'Later input'; applied.identity[1] = 'Detached wrapper';
	const actual = f.base.get_owner().get_faction();
	test.assert(actual.identity == identity && actual.name == 'Orbit Guild');
	test.assert(actual.id == 'SYNTHETIC', 'Custom text must preserve canonical faction identity');
});
behavior.scenario('faction codec retains every custom identity field independently', () => {
	const f = test.production_fixture(); f.apply_faction_identity(identity);
	const result = f.faction_identity_codec();
	test.assert(result.received && result.roundtrip && result.independent);
});
behavior.scenario('custom identity survives full State transfer into an independent faction manager', () => {
	const f = test.production_fixture(); const result = f.state_rules_wire_probe();
	test.assert(result.identity_received);
	test.assert(result.factions && result.roundtrip);
	test.assert(result.independent);
});
behavior.scenario('native identity accepts exact editor limits and empty strings', () => {
	const f = test.production_fixture();
	const short = 'ABCDEFGHIJKLMNOPQRSTUVW'; const formal = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLM';
	const maximum = [short, formal, short, short, short, short];
	test.assert(f.apply_faction_identity(maximum).identity == maximum);
	const empty = ['', '', '', '', '', ''];
	test.assert(f.apply_faction_identity(empty).identity == empty);
});
let case_index = 0;
for (invalid of [[], ['one'], ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
	['pilot', 'guild', 'noun', 'adjective', 7, 'description'],
	['ABCDEFGHIJKLMNOPQRSTUVWX', 'guild', 'noun', 'adj', 'title', 'description'],
	['pilot', 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN', 'noun', 'adj', 'title', 'description'],
	['pilot', 'guild', 'noun', 'adj', 'title', 'line\nbreak']]) {
	const ordinal = case_index; case_index++;
	behavior.scenario('native rejects malformed identity ' + #to_string(ordinal), () => {
		const f = test.production_fixture(); f.apply_faction_identity(identity); let rejected = false;
		try { f.apply_faction_identity(invalid); } catch { : (e) => { rejected = true; } }
		test.assert(rejected, 'All fields must validate before native mutation');
		test.assert(f.base.get_owner().get_faction().identity == identity);
	});
}
