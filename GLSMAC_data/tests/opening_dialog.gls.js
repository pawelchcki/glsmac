const behavior = #include('./_behavior');
const parser = #include('../default/game/opening_dialog');
const fields = {}; fields['$NAME3,'] = 'Synthetic Leader,'; fields['$<M1:$FACTIONADJ0>'] = 'Logical';
behavior.scenario('Source paragraphs substitute declared identity and retain explicit paragraph breaks', () => {
	const doc = test.parse_smac_text('#PLANETFALL\n#xs 400\n#caption Arrival\n$NAME3, welcome to\nthe $<M1:$FACTIONADJ0> community.\n^\nPress {CONTINUE} now.\n#END\n', 'dialogs');
	const result = parser.parse(doc, 'PLANETFALL', fields);
	test.assert(result.caption == 'Arrival');
	test.assert(result.paragraphs == ['Synthetic Leader, welcome to the Logical community.', 'Press CONTINUE now.']);
});
behavior.scenario('Unknown placeholder and malformed formatting reject instead of inventing text', () => {
	for (text of ['$UNKNOWN0', '$<M2:$FACTIONADJ0>', 'broken{word', 'unpaired}']) {
		let rejected = false; try { parser.format(text, fields); } catch { : (error) => { rejected = true; } }
		test.assert(rejected);
	}
	let rejected = false; try { parser.parse(test.parse_smac_text('#A\n#unsupported 3\nBody\n#END\n', 'dialogs'), 'A', fields); } catch { : (error) => { rejected = true; } }
	test.assert(rejected);
});
behavior.scenario('Missing body and duplicate caption cannot become a usable dialog', () => {
	for (body of ['#caption Empty\n', '#caption One\n#caption Two\nBody\n']) {
		let rejected = false; try { parser.parse(test.parse_smac_text('#A\n' + body + '#END\n', 'dialogs'), 'A', fields); } catch { : (error) => { rejected = true; } }
		test.assert(rejected);
	}
});
