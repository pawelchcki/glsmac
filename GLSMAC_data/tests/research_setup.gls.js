const behavior = #include('./_behavior');
const factions = #include('./_faction_controls_fixture');
const text = #include('./_research_text_fixture');
const source = #include('../default/game/research_dialog');
const customize = #include('../default/ui/parts/mainmenu/steps/customize_rules');
const rules_step = #include('../default/ui/parts/mainmenu/steps/select_rules');
const create = () => {
	const f = factions.create();
	f.rules = f.native.game.get_settings().global.rules; f.rules.set_blind_research(true);
	f.m.glsmac.load_smac_text = (name, format) => { return test.parse_smac_text(name == 'script.txt' ? text.script : text.labels, format); };
	f.m.steps = {select_faction: factions.show, customize_rules: customize};
	f.button = (label) => { return f.view.find('button', 'text', label).emit('click', {}); };
	f.toggle = () => { return f.button('Synthetic Blind Study'); };
	f.key = (code) => { return f.view.find('window', 'title', 'Synthetic Game Rules').emit('keydown', {code: code, modifiers: {}}); };
	return f;
};
behavior.scenario('custom rules load source labels and cancel discards the draft', () => {
	const f = create(); customize(f.m);
	test.assert(f.view.find('button', 'text', 'X').text == 'X');
	f.toggle(); test.assert(f.rules.get_blind_research());
	f.button('Never mind'); test.assert(f.state.reset == 1 && f.rules.get_blind_research());
	customize(f.m); test.assert(f.view.find('button', 'text', 'X').text == 'X');
	f.key('ESCAPE'); test.assert(f.rules.get_blind_research());
});
behavior.scenario('standard reset stays in customize and Enter confirms only a pending draft', () => {
	const f = create(); customize(f.m); f.toggle(); f.button('Restore Standard');
	test.assert(f.view.find('button', 'text', 'X').text == 'X');
	test.assert(#sizeof(f.view.live('input')) == 0);
	f.toggle(); f.key('ENTER');
	test.assert(!f.m.pending_research_blind && f.rules.get_blind_research());
	test.assert(#sizeof(f.view.live('window')) == 1 && #sizeof(f.state.attempts) == 0);
});
behavior.scenario('abandoned customized setup does not replace current rules', () => {
	const f = create(); customize(f.m); f.toggle(); f.button('Accept');
	f.view.find('button', 'text', 'Cancel').emit('click', {});
	const captured = {}; f.m.sliding = {show: (data) => { captured.data = data; }};
	rules_step(f.m); captured.data.entries[1][1]();
	test.assert(f.m.pending_research_blind && f.rules.get_blind_research());
});
behavior.scenario('native launch rejection restores rules and a retry commits the draft', () => {
	const f = create(); f.state.reject = true; customize(f.m); f.toggle(); f.button('Accept');
	f.button('OK'); f.button('OK');
	test.assert(f.rules.get_blind_research() && #sizeof(f.state.attempts) == 1);
	f.button('OK'); f.state.reject = false; f.button('OK');
	test.assert(!f.rules.get_blind_research() && #sizeof(f.state.attempts) == 2);
});
behavior.scenario('removed customize controls cannot change a later presentation', () => {
	const f = create(); customize(f.m);
	const old_toggle = f.view.find('button', 'text', 'Synthetic Blind Study'); const old_ok = f.view.find('button', 'text', 'Accept');
	f.button('Never mind'); customize(f.m); old_toggle.emit('click', {}); old_ok.emit('click', {});
	test.assert(f.view.find('button', 'text', 'X').text == 'X' && !#is_defined(f.m.pending_research_blind));
});
behavior.scenario('research source preserves body ampersands and source button mnemonics', () => {
	const f = create();
	f.m.glsmac.load_smac_text = (name, format) => {
		let contents = name == 'script.txt' ? text.script : text.labels;
		if (name == 'script.txt') {
			contents = '#TECHNOLOGY\n#caption Changed Caption\n#button &Inspect\n#button &Search\n#TECHRANDOM\n#caption Changed Priorities\nA & B\nSecond\nThird\n\nExplore & Grow\nLearn\nBuild\nConquer\n#END\n';
		}
		return test.parse_smac_text(contents, format);
	};
	const loaded = source.load(f.m.glsmac);
	test.assert(loaded.directed.caption == 'Changed Caption' && loaded.directed.buttons == ['Inspect', 'Search']);
	test.assert(loaded.priorities.lines[0] == 'A & B' && loaded.priorities.lines[3] == 'Explore & Grow');
});
behavior.scenario('malformed research blocks and label counts fail before mounting controls', () => {
	const f = create();
	for (script of ['#TECHNOLOGY\n#caption Duplicate\n#caption Again\n#END\n', '#RULES\n#caption Missing Options\n#button Reset\n#END\n']) {
		f.m.glsmac.load_smac_text = (name, format) => { return test.parse_smac_text(name == 'script.txt' ? script : text.labels, format); };
		let rejected = false; try { customize(f.m); } catch { : (e) => { rejected = true; } }
		test.assert(rejected && #sizeof(f.view.live('window')) == 0);
	}
	f.m.glsmac.load_smac_text = (name, format) => { return test.parse_smac_text(name == 'script.txt' ? text.script : '#LABELS\n1\nAccept\n#END\n', format); };
	let rejected = false; try { customize(f.m); } catch { : (e) => { rejected = true; } }
	test.assert(rejected && #sizeof(f.view.live('window')) == 0);
});
