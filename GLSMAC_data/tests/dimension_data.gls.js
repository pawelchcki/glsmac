const behavior = #include('./_behavior');
const fixtures = #include('./_dimension_text_fixture');
const make = (profile) => { return fixtures.create(profile, fixtures.world_source); };
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Unsupported dimension source must fail explicitly');
};
const labels_source = (f, count, index, value) => {
	const lines = #split(f.sources['labels.txt'], '\n'); lines[1] = count;
	if (index >= 0) { lines[index + 2] = value; }
	let text = '';
	for (line of lines) { text = text + line + '\n'; }
	f.sources['labels.txt'] = text;
};

behavior.scenario('installed dimension definition loads common caption and indexed labels only when requested', () => {
	const f = make('default');
	test.assert(#sizeof(f.loads) == 3);
	test.assert(#typeof(f.bundle.dimension_dialog) == 'Callable', 'Installed dimension controls need a source-data consumer');
	const definition = f.bundle.dimension_dialog();
	test.assert(definition == {caption: 'Custom Map Size', horizontal: 'Horizontal', vertical: 'Vertical'});
	test.assert(f.loads[3] == ['script.txt', 'dialogs'] && f.loads[4] == ['labels.txt', 'dialogs']);
	const rows = f.bundle.rules.rows('WORLDSIZE');
	test.assert(#sizeof(rows) == 6 && rows[0] == ['5']);
});

behavior.scenario('common and expansion caption inputs remain separate while labels follow their source ordinals', () => {
	for (profile of ['default', 'alternate', 'core', 'both']) {
		const f = make(profile); const definition = f.bundle.dimension_dialog();
		test.assert(definition.caption == (profile == 'core' || profile == 'both' ? 'Core Dimensions' : 'Custom Map Size'));
		test.assert(definition.horizontal == (profile == 'alternate' || profile == 'both' ? 'Meridian' : 'Horizontal'));
		test.assert(definition.vertical == (profile == 'alternate' || profile == 'both' ? 'Parallel' : 'Vertical'));
	}
});

behavior.scenario('dimension definitions are detached from their cache and sources are loaded once', () => {
	const f = make('both'); const first = f.bundle.dimension_dialog();
	first.caption = 'Changed output'; first.horizontal = 'Changed output';
	f.sources['labels.txt'] = 'Changed source after caching';
	const second = f.bundle.dimension_dialog();
	test.assert(second == {caption: 'Core Dimensions', horizontal: 'Meridian', vertical: 'Parallel'});
	test.assert(#sizeof(f.loads) == 5);
});

behavior.scenario('noncanonical incorrect and insufficient label counts are rejected', () => {
	for (count of ['0', '1091', '01131', '+1131', '1131.0', '1132', '1131x', '999999999999999999999']) {
		const f = make('default'); labels_source(f, count, (0 - 1), '');
		rejects(() => { f.bundle.dimension_dialog(); });
	}
});

behavior.scenario('empty and unsupported formatting in the required labels is rejected', () => {
	for (index of [1090, 1091]) {
		for (value of ['', '  ', '^Formatted', 'Two|Lines', '#unknown label']) {
			const f = make('default'); labels_source(f, '1131', index, value);
			rejects(() => { f.bundle.dimension_dialog(); });
		}
	}
});

behavior.scenario('missing and ambiguous label blocks cannot fall back to English literals', () => {
	for (mode of ['missing', 'ambiguous', 'file']) {
		const f = make('default');
		if (mode == 'missing') { f.sources['labels.txt'] = '#OTHER\n1131\n'; }
		if (mode == 'ambiguous') { f.sources['labels.txt'] = f.sources['labels.txt'] + '#LABELS\n1\nOther\n'; }
		if (mode == 'file') { f.sources['labels.txt'] = undefined; }
		rejects(() => { f.bundle.dimension_dialog(); });
	}
});

behavior.scenario('malformed common caption definitions reject unsupported structure', () => {
	for (source of ['#OTHER\n#caption Other\n', '#CUSTOMMAP\n', '#CUSTOMMAP\n#caption\n',
		'#CUSTOMMAP\n#caption One\n#caption Two\n', '#CUSTOMMAP\n#caption One\n#CUSTOMMAP\n#caption Two\n',
		'#CUSTOMMAP\n#caption Title\nUnexpected body\n', '#CUSTOMMAP\n#caption Title\n#itemlist\n',
		'#CUSTOMMAP\n#caption ^Unsupported\n', '#CUSTOMMAP\n#caption Title\n#unknown directive\n']) {
		const f = make('default'); f.sources['script.txt'] = source;
		rejects(() => { f.bundle.dimension_dialog(); });
		test.assert(#sizeof(f.loads) == 4, 'Bad caption fails before labels are requested');
	}
});

behavior.scenario('missing common script does not silently consume the expansion dialog', () => {
	const f = make('alternate'); f.sources['script.txt'] = undefined;
	rejects(() => { f.bundle.dimension_dialog(); });
	test.assert(#sizeof(f.loads) == 4);
});

behavior.scenario('a failed optional dimension definition leaves existing static menus usable', () => {
	const f = make('default'); f.sources['labels.txt'] = '#LABELS\n1\nIncomplete\n';
	rejects(() => { f.bundle.dimension_dialog(); });
	const menu = {entries: [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']]};
	f.bundle.apply_dialog('TOPMENU', menu);
	test.assert(menu.entries[0][0] == 'Start Game' && menu.entries[6][0] == 'Exit Game');
});

behavior.scenario('a repaired label source can complete a failed optional definition without reloading unrelated documents', () => {
	const f = make('both'); const valid_labels = f.sources['labels.txt'];
	f.sources['labels.txt'] = '#LABELS\n1\nIncomplete\n';
	rejects(() => { f.bundle.dimension_dialog(); });
	test.assert(#sizeof(f.loads) == 5);
	f.sources['labels.txt'] = valid_labels;
	const repaired = f.bundle.dimension_dialog();
	test.assert(repaired == {caption: 'Core Dimensions', horizontal: 'Meridian', vertical: 'Parallel'});
	test.assert(#sizeof(f.loads) == 6 && f.loads[5] == ['labels.txt', 'dialogs'], 'Retry reloads only the document whose optional definition did not complete');
	f.sources['labels.txt'] = 'Changed after successful retry';
	test.assert(f.bundle.dimension_dialog() == repaired && #sizeof(f.loads) == 6);
	const menu = {entries: [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']]};
	f.bundle.apply_dialog('TOPMENU', menu);
	test.assert(menu.entries[0][0] == 'Start Game' && menu.entries[6][0] == 'Exit Game');
});

behavior.scenario('recreating the source bundle recovers an invalid cached common document without changing the prior menus', () => {
	const f = make('default'); const valid_common = f.sources['script.txt'];
	f.sources['script.txt'] = '#CUSTOMMAP\n#caption\n';
	rejects(() => { f.bundle.dimension_dialog(); });
	f.sources['script.txt'] = valid_common;
	rejects(() => { f.bundle.dimension_dialog(); });
	test.assert(#sizeof(f.loads) == 4, 'A controller keeps its parsed common document until the bundle is recreated');
	const old_bundle = f.bundle;
	f.reload();
	test.assert(f.bundle.dimension_dialog() == {caption: 'Custom Map Size', horizontal: 'Horizontal', vertical: 'Vertical'});
	test.assert(#sizeof(f.loads) == 9);
	const old_menu = {entries: [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']]};
	const new_menu = {entries: [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']]};
	old_bundle.apply_dialog('TOPMENU', old_menu); f.bundle.apply_dialog('TOPMENU', new_menu);
	test.assert(old_menu == new_menu && old_menu.entries[0][0] == 'Start Game');
});
