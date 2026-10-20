// Application source-consumer invariants; original UX agreement is separate.
const behavior = #include('./_behavior');
const make = #include('./_faction_text_fixture');
const rejects = (callback) => {
	let rejected = false;
	try { callback(); } catch { : (e) => { rejected = true; } }
	test.assert(rejected, 'Unsupported faction source must fail explicitly');
};
behavior.scenario('faction setup loads the installed roster headers and common editor definitions lazily', () => {
	const f = make('default'); const before = #sizeof(f.loads);
	test.assert(#typeof(f.bundle.faction_setup) == 'Callable', 'Installed faction setup needs a production source consumer');
	const setup = f.bundle.faction_setup();
	test.assert(#sizeof(setup.factions) == 14 && #sizeof(setup.base) == 7 && #sizeof(setup.expansion) == 7);
	test.assert(setup.base[0] == 'GAIANS' && setup.expansion[0] == 'CONSCIOUSNESS');
	test.assert(setup.factions[0].values == ['Deirdre', 'Gaia\'s Stepdaughters', 'Gaians', 'Gaian', 'Lady', 'beautiful', 'Female']);
	test.assert(setup.factions[7].values == ['Aki Zeta-5', 'The Cybernetic Consciousness', 'Consciousness', 'Cybernetic', 'Prime Function', 'analytical', 'Female']);
	test.assert(setup.factions[7].role == 'The Algorithm');
	test.assert(setup.factions[7].leader_gender == 'F' && setup.factions[1].leader_gender == 'M');
	test.assert(setup.caption == 'CHOOSE YOUR FACTIONS');
	test.assert(setup.labels == ['Name:', 'Formal:', 'Noun:', 'Adjective:', 'Title', 'Description', 'Gender']);
	test.assert(setup.name[0].label == 'Name (Male):' && setup.name[1].label == 'Name (Female):');
	test.assert(setup.name[0].button == 'Change Gender' && setup.customize.button == 'Restore Defaults');
	test.assert(#sizeof(f.loads) == before + 16, 'Common script, labels and fourteen header documents are loaded once');
});
for (profile of ['default', 'common', 'expansion', 'both']) {
	behavior.scenario('controlled installed faction source profile ' + profile, () => {
		const f = make(profile); const setup = f.bundle.faction_setup();
		const common = profile == 'common' || profile == 'both';
		test.assert(#uppercase(setup.name[0].caption) == (common ? 'CORE PILOT' : 'ENTER YOUR NAME'));
		test.assert(setup.customize.caption == (common ? 'Core Crew' : 'Customize Your Faction'));
		if (profile == 'both') {
			test.assert(setup.caption == 'CHOOSE ORBIT CREWS');
			test.assert(setup.factions[7].values == ['Nova', 'Orbit Guild', 'Orbiters', 'Orbital', 'Navigator', 'brisk', 'Male']);
			test.assert(setup.factions[7].role == 'Orbit Agenda');
			test.assert(setup.factions[7].leader_gender == 'M');
		}
	});
}
behavior.scenario('faction definitions return detached successful cached values', () => {
	const f = make('both'); const first = f.bundle.faction_setup(); const after = #sizeof(f.loads);
	first.base[0] = 'MISSING'; first.factions[0].values[0] = 'Mutated'; first.name[0].label = 'Mutated';
	f.sources['cyborg.txt'] = 'Changed input after successful import';
	const second = f.bundle.faction_setup();
	test.assert(second.base[0] == 'GAIANS' && second.factions[0].values[0] == 'Deirdre');
	test.assert(second.name[0].label == 'Core Male:' && #sizeof(f.loads) == after);
});
behavior.scenario('missing duplicate malformed header and unknown roster input are rejected', () => {
	for (kind of ['missing', 'header', 'gender', 'duplicate', 'unknown', 'caption', 'labels']) {
		const f = make('default');
		if (kind == 'missing') { f.sources['cyborg.txt'] = undefined; }
		if (kind == 'header') { f.sources['cyborg.txt'] = '#CYBORG\nToo,Short\n#END\n'; }
		if (kind == 'gender') { f.sources['cyborg.txt'] = '#CYBORG\nFormal,Role,Noun,M,1,Name,X\nOne\nTwo\nThree\nAdjective\nCollective\nTitle,Description\n#END\n'; }
		if (kind == 'duplicate') { f.sources['cyborg.txt'] = f.sources['cyborg.txt'] + '\n#CYBORG\nDuplicate\n#END\n'; }
		if (kind == 'unknown') {
			f.sources['alphax.txt'] = '#FACTIONS\nmissing,MISSING\n#NEWFACTIONS\ncyborg,CYBORG\n#CUSTOMFACTIONS\n#END\n'; f.reload();
		}
		if (kind == 'caption') { f.sources['script.txt'] = '#NAME\n#itemlist\nName:\n#END\n'; }
		if (kind == 'labels') { f.sources['labels.txt'] = '#LABELS\n2\nA\nB\n#END\n'; }
		rejects(() => { f.bundle.faction_setup(); });
	}
});
behavior.scenario('optional faction import failures do not remove installed static menus', () => {
	const f = make('default'); f.sources['cyborg.txt'] = undefined;
	rejects(() => { f.bundle.faction_setup(); });
	const menu = {entries: [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']]};
	f.bundle.apply_dialog('TOPMENU', menu); test.assert(menu.entries[0][0] == 'Start Game');
});
