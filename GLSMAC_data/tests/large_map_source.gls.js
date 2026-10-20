// Source-consumer invariants are application coverage, separate from the
// immutable original warning traces. All paragraph inputs here are synthetic.
const behavior = #include('./_behavior');
const make = #include('./_large_map_text_fixture');
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (e) => { failed = true; } }
	test.assert(failed, 'Unsupported warning source must fail explicitly');
};

behavior.scenario('large-map warning consumes the common source caption body and two action slots lazily', () => {
	const f = make('default'); const before = #sizeof(f.loads);
	test.assert(#typeof(f.bundle.large_map_warning) == 'Callable', 'Installed large-map warnings need a production source consumer');
	const definition = f.bundle.large_map_warning();
	test.assert(definition.caption == 'Warning!');
	test.assert(definition.choices == ['Continue anyway.', 'Never mind.']);
	test.assert(definition.lines == ['Synthetic warning paragraph.', '', 'Synthetic follow-up paragraph.']);
	test.assert(#sizeof(f.loads) == before + 1 && f.loads[before] == ['script.txt', 'dialogs']);
});

for (profile of ['default', 'common', 'expansion', 'both']) {
	behavior.scenario('controlled warning source profile ' + profile + ' follows the observed common source', () => {
		const f = make(profile); const definition = f.bundle.large_map_warning();
		const common = profile == 'common' || profile == 'both';
		test.assert(definition.caption == (common ? 'Core Notice' : 'Warning!'));
		test.assert(definition.choices == (common ? ['Proceed here.', 'Return here.'] : ['Continue anyway.', 'Never mind.']));
	});
}

behavior.scenario('warning definitions are detached from a single successful source cache', () => {
	const f = make('common'); const before = #sizeof(f.loads);
	const first = f.bundle.large_map_warning(); first.choices[0] = 'Changed choice'; first.lines[0] = 'Changed body'; first.caption = 'Changed caption';
	f.sources['script.txt'] = 'Source changed after successful capture';
	const second = f.bundle.large_map_warning();
	test.assert(second.caption == 'Core Notice' && second.choices == ['Proceed here.', 'Return here.']);
	test.assert(second.lines == ['Synthetic warning paragraph.', '', 'Synthetic follow-up paragraph.']);
	test.assert(#sizeof(f.loads) == before + 1);
});

behavior.scenario('dimension and warning consumers share one installed common document', () => {
	for (order of ['dimension', 'warning']) {
		const f = make('default'); const before = #sizeof(f.loads);
		if (order == 'dimension') { f.bundle.dimension_dialog(); f.bundle.large_map_warning(); }
		else { f.bundle.large_map_warning(); f.bundle.dimension_dialog(); }
		let common_reads = 0; let label_reads = 0;
		for (let n = before; n < #sizeof(f.loads); n++) {
			if (f.loads[n][0] == 'script.txt') { common_reads++; }
			if (f.loads[n][0] == 'labels.txt') { label_reads++; }
		}
		test.assert(common_reads == 1 && label_reads == 1);
	}
});

behavior.scenario('missing malformed and unsupported warning definitions never fall back to English literals', () => {
	for (source of ['#OTHER\n#caption Other\n', '#VERYLARGEMAP\nBody\nOne\nTwo\n',
		'#VERYLARGEMAP\n#caption\nBody\nOne\nTwo\n', '#VERYLARGEMAP\n#caption One\n#caption Two\nBody\nOne\nTwo\n',
		'#VERYLARGEMAP\n#caption Title\nOne\nTwo\n', '#VERYLARGEMAP\n#caption Title\n^\nOne\nTwo\n',
		'#VERYLARGEMAP\n#caption Title\n#itemlist\nBody\nOne\nTwo\n', '#VERYLARGEMAP\n#caption Title\n#unknown value\nBody\nOne\nTwo\n',
		'#VERYLARGEMAP\n#caption ^Formatted\nBody\nOne\nTwo\n', '#VERYLARGEMAP\n#caption Title\nTwo|Columns\nOne\nTwo\n',
		'#VERYLARGEMAP\n#caption Title\n$VALUE\nOne\nTwo\n', '#VERYLARGEMAP\n#caption Title\nBody\nOne\n{Two}\n',
		'#VERYLARGEMAP\n#caption One\nBody\nOne\nTwo\n#VERYLARGEMAP\n#caption Other\nBody\nOne\nTwo\n']) {
		const f = make('default'); f.sources['script.txt'] = source;
		rejects(() => { f.bundle.large_map_warning(); });
	}
	const f = make('expansion'); f.sources['script.txt'] = undefined;
	rejects(() => { f.bundle.large_map_warning(); });
});

behavior.scenario('a failed optional warning definition leaves static menus and dimension controls usable', () => {
	const f = make('default');
	f.sources['script.txt'] = '#CUSTOMMAP\n#caption Custom Map Size\n#VERYLARGEMAP\n#caption Warning!\n';
	rejects(() => { f.bundle.large_map_warning(); });
	test.assert(f.bundle.dimension_dialog() == {caption: 'Custom Map Size', horizontal: 'Horizontal', vertical: 'Vertical'});
	const menu = {entries: [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']]};
	f.bundle.apply_dialog('TOPMENU', menu);
	test.assert(menu.entries[0][0] == 'Start Game' && menu.entries[6][0] == 'Exit Game');
});
