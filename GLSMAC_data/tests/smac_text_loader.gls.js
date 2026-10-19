// Installed-text import contract, using synthetic strings only. This exercises
// the production parser and document binding without assets or original rules.
const behavior = #include('./_behavior');
const rejects = (callback) => {
	let failed = false;
	try { callback(); } catch { : (error) => { failed = true; } }
	test.assert(failed, 'Invalid SMAC text query must fail explicitly');
};

behavior.scenario('native rules binding returns trimmed strings including quoted and empty fields', () => {
	// GSE decodes \n and \t, but \r becomes a literal r. CRLF input is
	// covered directly by the C++ parser fixture; use genuine LF here.
	const doc = test.parse_smac_text('#RULES\nAlpha, 7, "comma,semi;value", , tail, ; note\n#END', 'rules');
	test.assert(doc.ids() == ['RULES']);
	test.assert(doc.rows('RULES') == [['Alpha', '7', 'comma,semi;value', '', 'tail', '']]);
	const block = doc.block('RULES');
	test.assert(block.id == 'RULES' && block.line == 1);
	test.assert(#sizeof(block.records) == 1 && block.records[0].line == 2);
});

behavior.scenario('native dialog records preserve directives comments blanks and substitutions in source order', () => {
	const doc = test.parse_smac_text('#DIALOG\n; comment\n#xs 440\n\n^Hello $NAME {x} [y]\n#END', 'dialogs');
	test.assert(doc.dialog('DIALOG') == {
		id: 'DIALOG', line: 1, records: [
			{ kind: 'comment', line: 2, text: '; comment', name: '', argument: '' },
			{ kind: 'directive', line: 3, text: '#xs 440', name: 'xs', argument: '440' },
			{ kind: 'blank', line: 4, text: '', name: '', argument: '' },
			{ kind: 'text', line: 5, text: '^Hello $NAME {x} [y]', name: '', argument: '' },
		],
	});
});

behavior.scenario('native document preserves duplicate ids and requires explicit occurrences for every lookup', () => {
	const doc = test.parse_smac_text('#SAME\nfirst\n#SAME\nsecond\n#END', 'rules');
	test.assert(doc.ids() == ['SAME', 'SAME']);
	for (name of ['block', 'rows', 'menu', 'dialog']) {
		const query = doc[name]; rejects(() => { query('SAME'); });
		rejects(() => { query('SAME', 2); });
	}
	test.assert(doc.rows('SAME', 0) == [['first']] && doc.rows('SAME', 1) == [['second']]);
	const first = doc.block('SAME', 0); const second = doc.dialog('SAME', 1);
	test.assert(first.line == 1 && first.records[0].text == 'first');
	test.assert(second.line == 3 && second.records[0].text == 'second');
});

behavior.scenario('native menu binding keeps mnemonic labels unknown shortcuts and interior separators', () => {
	const doc = test.parse_smac_text('#MENU\n; comment\nTitle\n\n&Open|Ctrl+O\n\n&Odd|Unfamiliar\n\n#END', 'menus');
	test.assert(doc.menu('MENU') == {
		title: 'Title', items: [
			{ label: '&Open', shortcut: 'Ctrl+O', separator: false, line: 5 },
			{ label: '', shortcut: '', separator: true, line: 6 },
			{ label: '&Odd', shortcut: 'Unfamiliar', separator: false, line: 7 },
		],
	});
	const no_shortcut = test.parse_smac_text('#MENU\nOther\n&Plain', 'menus');
	test.assert(no_shortcut.menu('MENU').items == [{ label: '&Plain', shortcut: '', separator: false, line: 3 }]);
});

behavior.scenario('returned native document collections are independent of later queries', () => {
	const doc = test.parse_smac_text('#ONE\nvalue, 12\n#END', 'rules');
	const ids = doc.ids(); ids[0] = 'changed';
	const rows = doc.rows('ONE'); const row = rows[0]; row[0] = 'changed';
	const block = doc.block('ONE'); block.id = 'changed'; const record = block.records[0]; record.text = 'changed';
	test.assert(doc.ids() == ['ONE'] && doc.rows('ONE') == [['value', '12']]);
	test.assert(doc.block('ONE').id == 'ONE' && doc.dialog('ONE').records[0].text == 'value, 12');
	const menus = test.parse_smac_text('#MENU\nTitle\n&Open|O', 'menus');
	const menu = menus.menu('MENU'); menu.title = 'changed'; const item = menu.items[0]; item.label = 'changed';
	test.assert(menus.menu('MENU') == { title: 'Title', items: [{ label: '&Open', shortcut: 'O', separator: false, line: 3 }] });
});

behavior.scenario('native parse binding rejects invalid arguments formats and malformed quoted rules', () => {
	rejects(() => { test.parse_smac_text(); });
	rejects(() => { test.parse_smac_text('#A'); });
	rejects(() => { test.parse_smac_text('#A', 'rules', 'extra'); });
	rejects(() => { test.parse_smac_text(7, 'rules'); });
	rejects(() => { test.parse_smac_text('#A', 7); });
	rejects(() => { test.parse_smac_text('#A', 'unknown'); });
	rejects(() => { test.parse_smac_text('#A\n"unterminated', 'rules'); });
});

behavior.scenario('native lookup bindings reject invalid counts ids and occurrence types without damaging documents', () => {
	const doc = test.parse_smac_text('#ONE\nvalue\n#END', 'rules');
	rejects(() => { doc.ids('extra'); });
	for (name of ['block', 'rows', 'menu', 'dialog']) {
		const query = doc[name];
		rejects(() => { query(); }); rejects(() => { query('ONE', 0, 'extra'); });
		rejects(() => { query(1); }); rejects(() => { query('MISSING'); });
		rejects(() => { query('ONE', (0 - 1)); }); rejects(() => { query('ONE', 1); });
		rejects(() => { query('ONE', '0'); }); rejects(() => { query('ONE', 0.0); });
		rejects(() => { query('ONE', true); }); rejects(() => { query('ONE', null); });
	}
	test.assert(doc.ids() == ['ONE'] && doc.rows('ONE') == [['value']]);
});

behavior.scenario('detached native query callback retains its document independently of other parses', () => {
	let doc = test.parse_smac_text('#ONE\noriginal\n#END', 'rules');
	const query = doc.rows; doc = undefined;
	const other = test.parse_smac_text('#ONE\nother\n#END', 'rules');
	test.assert(query('ONE') == [['original']] && other.rows('ONE') == [['other']]);
});
