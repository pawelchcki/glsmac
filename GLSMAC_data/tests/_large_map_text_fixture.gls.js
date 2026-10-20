// Synthetic source inputs for the real native parser and production consumers.
const dimensions = #include('./_dimension_text_fixture');
const without_end = (source) => {
	let result = '';
	let in_warning = false;
	for (line of #split(source, '\n')) {
		if (line == '#VERYLARGEMAP') { in_warning = true; }
		if (line != '#END' && !in_warning) { result = result + line + '\n'; }
	}
	return result;
};
const block = (caption, first, second) => {
	return '#VERYLARGEMAP\n#caption ' + caption + '\n#xs 440\n#x -5\n#y -5\nSynthetic warning paragraph.\n^\nSynthetic follow-up paragraph.\n' + first + '\n' + second + '\n#END\n';
};
return (profile) => {
	const f = dimensions.create('default', dimensions.world_source);
	const common = profile == 'common' || profile == 'both';
	const expansion = profile == 'expansion' || profile == 'both';
	f.sources['script.txt'] = without_end(f.sources['script.txt']) + block(common ? 'Core Notice' : 'Warning!', common ? 'Proceed here.' : 'Continue anyway.', common ? 'Return here.' : 'Never mind.');
	f.sources['xscript.txt'] = without_end(f.sources['xscript.txt']) + block(expansion ? 'Expansion Notice' : 'Warning!', expansion ? 'Expansion go.' : 'Continue anyway.', expansion ? 'Expansion stop.' : 'Never mind.');
	f.reload();
	return f;
};
