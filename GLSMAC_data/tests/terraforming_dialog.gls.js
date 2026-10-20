const behavior = #include('./_behavior');
const consumer = #include('../default/game/terraforming_dialog');
const source = '#MIMIMI\n#xs 320\n#wave 5\n#caption Synthetic Ecologist\nReplace ($MINE0) when complete.\nReview $MINE0 before proceeding.\n\nKeep existing.\nProceed.\n#END\n';

behavior.scenario('native dialog parser supplies independent replacement caption body choices and parameterized names', () => {
	const parsed = consumer.parse(test.parse_smac_text(source, 'dialogs'));
	const rendered = consumer.render(parsed, 'Synthetic crop');
	test.assert(rendered.caption == 'Synthetic Ecologist' && rendered.choices == ['Keep existing.', 'Proceed.']);
	test.assert(rendered.lines == ['Replace (Synthetic crop) when complete.', 'Review Synthetic crop before proceeding.']);
	test.assert(parsed.lines[0] == 'Replace ($MINE0) when complete.');
	rendered.choices[0] = 'Changed'; rendered.lines[0] = 'Changed';
	const another = consumer.render(parsed, 'Other crop');
	test.assert(another.choices[0] == 'Keep existing.', 'Returned choices must be detached');
	test.assert(parsed.lines[0] == 'Replace ($MINE0) when complete.', 'Rendering must not change its source template');
});

let index = 0;
for (raw of ['#MIMIMI\nBody.\nCancel.\nContinue.\n#END\n',
	'#MIMIMI\n#caption One\n#caption Two\nBody.\nCancel.\nContinue.\n#END\n',
	'#MIMIMI\n#caption One\n#unknown 1\nBody.\nCancel.\nContinue.\n#END\n',
	'#MIMIMI\n#caption One\nCancel.\nContinue.\n#END\n',
	'#MIMIMI\n#caption One\nUnknown $MINE1 token.\nCancel.\nContinue.\n#END\n',
	'#MIMIMI\n#caption One\nUnknown ^ style.\nCancel.\nContinue.\n#END\n',
	'#MIMIMI\n#caption One\nBody.\n$STR0\nContinue.\n#END\n']) {
	behavior.scenario('unsupported replacement declaration cannot produce a confirmation definition ' + #to_string(index), () => {
		let rejected = false;
		try { consumer.parse(test.parse_smac_text(raw, 'dialogs')); } catch { : (e) => { rejected = true; } }
		test.assert(rejected);
	}); index++;
}
