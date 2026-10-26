// Native validation, wrapper and codec checks. Original comparisons are separate.
const behavior = #include('./_behavior');
const identity = ['Orion Vale', 'Orbit Guild', 'Orbiters', 'Orbital', 'Navigator', 'brisk'];
behavior.scenario('Duplicate participants start their own cities without sharing human customization or mutating the catalog', () => {
	const f = test.natural_startup_fixture(40, 80, 'flat-arid'); const game = f.game;
	#include('./_natural_startup_mechanics')(f);
	const ids = ['GAIANS', 'GAIANS', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
	const catalog = f.fm.list(); const original = #clone(catalog[0].identity);
	const authored = #clone(original); authored[0] = 'Trace Commander';
	f.initialize_roster('GAIANS', {factions: ids, human_slot: 0, random_human: false}, authored); f.start_world();
	const players = game.get_players();
	for (let index = 0; index < 7; index++) { test.assert(players[index].get_faction().id == ids[index] && players[index].id == index); }
	test.assert(#sizeof(game.bm.get_bases()) == 7 && players[0].type == 'human' && players[1].type == 'computer');
	test.assert(players[0].get_faction().identity == authored && players[0].name == 'Trace Commander');
	const duplicate = #clone(original); duplicate[1] = duplicate[1] + '-2'; duplicate[2] = duplicate[2] + '-2';
	test.assert(players[1].get_faction().identity == duplicate, 'The duplicate opponent resolves only its actual formal-name and noun collisions');
	const unchanged = f.fm.list(); test.assert(unchanged[0].identity == original, 'Human customization does not mutate the configured catalog');
});

for (profile of ['default', 'both']) {
	behavior.scenario('installed identity headers initialize every native template for source profile ' + profile, () => {
		const f = test.world_startup_fixture(16, 16); const source = #include('./_faction_text_fixture')(profile);
		for (entry of #include('../default/factions').source_catalog()) {
			const filename = entry.file + '.txt'; const lines = #split(source.sources[filename], '\n'); lines[2] = 'TECH,Synthetic';
			let text = ''; for (line of lines) { text += line + '\n'; } source.sources[filename] = text;
		}
		source.reload();
		#include('../default/factions').configure({add: (id, data) => { f.fm.add(id, data); }, import_colors: (name) => { return f.colors; }, import_base_names: (name) => { return {land: [], water: []}; }}, source.glsmac);
		const templates = f.fm.list();
		test.assert(templates[0].identity == ['Deirdre', 'Gaia\'s Stepdaughters', 'Gaians', 'Gaian', 'Lady', 'beautiful']);
		test.assert(templates[7].identity == (profile == 'both' ? ['Nova', 'Orbit Guild', 'Orbiters', 'Orbital', 'Navigator', 'brisk'] : ['Aki Zeta-5', 'The Cybernetic Consciousness', 'Consciousness', 'Cybernetic', 'Prime Function', 'analytical']));
		test.assert(templates[7].id == 'CONSCIOUSNESS' && templates[8].is_naval && templates[12].is_progenitor, 'Identity import preserves canonical IDs and gameplay flags');
	});
}
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
