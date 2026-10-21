// Application source/lifecycle regressions. Conditional row presentation and
// original row effects require independent observations beyond these tests.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const declared_source = #include('./_ingame_menu_text_fixture');

const fixture = (loader, game) => {
	const f = {loads: 0, closed: [], quits: []}; f.view = mocks.display();
	const p = {}; p.ui = f.view.ui;
	p.glsmac = {load_smac_text: (name, format) => {
		f.loads = f.loads + 1;
		return #is_defined(loader) ? loader(name, format) : declared_source(name, format);
	}};
	p.maybe_quit = (result) => { f.quits :+ result; };
	if (#is_defined(game)) { p.game = game; }
	f.menu = #include('../default/ui/parts/game/menu/menu'); f.menu.init(p);
	f.menu.on_close((id) => { f.closed :+ id; });
	f.open = () => { f.menu.open('left_menu'); };
	f.click = (label) => { return f.view.find('button', 'text', label).emit('click', {button: 'left'}); };
	return f;
};

behavior.scenario('nine installed source titles create the mounted menu headers', () => {
	const f = fixture(); f.open();
	let count = 0;
	for (node of f.menu.menus.left_menu.el.children) {
		if (node.kind == 'button') { count++; test.assert(node.handler_count('click') == 1); }
	}
	test.assert(count == 9 && f.loads == 2);
	for (label of ['GAME', 'HQ', 'NETWORK', 'MAP', 'ACTION', 'TERRAFORM', 'SCENARIO', 'EDIT MAP', 'HELP']) {
		test.assert(f.view.find('button', 'text', label).text == label);
	}
	f.view.root.remove();
});

behavior.scenario('switching headers closes its prior child while keeping the root mounted', () => {
	const f = fixture(); f.open(); f.click('HQ');
	test.assert(f.menu.menus.left_menu_hq.is_open && f.view.find('button', 'text', 'HQ').active);
	test.assert(f.menu.menus.left_menu_hq.el.left == f.menu.menu_width && f.menu.menus.left_menu_hq.el.zindex == 0.9,
		'Child stays beside the parent and above the bottom bar');
	f.click('MAP');
	test.assert(!f.menu.menus.left_menu_hq.is_open && f.menu.menus.left_menu_map.is_open);
	test.assert(!f.view.find('button', 'text', 'HQ').active && f.view.find('button', 'text', 'MAP').active);
	test.assert(f.menu.menus.left_menu.is_open && f.closed == ['left_menu_hq']);
	f.view.root.remove();
});

behavior.scenario('child Escape keeps the parent highlight and consumes only an unmodified key', () => {
	const f = fixture(); f.open(); f.click('HQ'); const child = f.menu.menus.left_menu_hq;
	const modified = child.el.emit('keydown', {code: 'ESCAPE', modifiers: {shift: true}});
	test.assert(modified == false && child.is_open);
	const plain = child.el.emit('keydown', {code: 'ESCAPE', modifiers: {}});
	test.assert(plain == true);
	test.assert(!child.is_open && f.menu.menus.left_menu.is_open && f.view.find('button', 'text', 'HQ').active,
		'Child open=' + #to_string(child.is_open) + ', root open=' + #to_string(f.menu.menus.left_menu.is_open) + ', highlight=' + #to_string(f.view.find('button', 'text', 'HQ').active) + ', closed=' + #to_string(f.closed));
	test.assert(f.menu.menus.left_menu.el.emit('keydown', {code: 'ESCAPE', modifiers: {}}) != true);
	f.click('HELP'); test.assert(f.menu.menus.left_menu_help.is_open);
	f.view.root.remove();
});

behavior.scenario('root closure clears its highlighted child and reopening retains a single listener', () => {
	const f = fixture(); f.open(); f.click('HQ'); const button = f.view.find('button', 'text', 'HQ');
	f.menu.close('left_menu'); f.menu.close('left_menu');
	test.assert(f.closed == ['left_menu_hq', 'left_menu'] && !button.active);
	test.assert(!f.menu.menus.left_menu_hq.el.is_visible());
	f.open(); f.click('HQ');
	test.assert(button.handler_count('click') == 1 && f.menu.menus.left_menu_hq.is_open && f.loads == 2);
	f.view.root.remove();
	test.assert(button.emit('click', {}) == false);
});

behavior.scenario('internal source separators are surfaces and never executable blank rows', () => {
	const f = fixture(); f.open(); f.click('HQ'); let separators = 0; let buttons = 0;
	for (node of f.menu.menus.left_menu_hq.el.children) {
		if (node.kind == 'surface' && node.class == 'game-menu-separator') { separators++; test.assert(node.handler_count('click') == 0); }
		if (node.kind == 'button') { buttons++; test.assert(node.text != ''); }
	}
	test.assert(separators == 4 && buttons == 14);
	f.view.root.remove();
});

behavior.scenario('existing Game new-game and quit callbacks remain distinct', () => {
	const f = fixture(); f.open(); f.click('GAME');
	f.click('Start New Game'); f.click('Quit');
	test.assert(f.quits == [false, true]);
	f.view.root.remove();
});

behavior.scenario('source wording does not select the preserved Game application actions', () => {
	const f = fixture((name, format) => { return declared_source(name, format, {title: 'Alternate Room', restart: 'Recreate', quit: 'Depart'}); });
	f.open(); f.click('ALTERNATE ROOM'); f.click('Recreate'); f.click('Depart');
	test.assert(f.quits == [false, true] && f.menu.headers[0].title == 'Alternate Room');
	let mapped = 0;
	for (entry of f.menu.headers[0].entries) {
		if (#is_defined(entry.source_index) && (entry.source_index == 11 || entry.source_index == 12)) { mapped++; test.assert(#typeof(entry.open) == 'Callable'); }
	}
	test.assert(mapped == 2);
	f.view.root.remove();
});

behavior.scenario('native selected terrain chooses source land and water wording without issuing work', () => {
	const native = test.founding_fixture(); const game = mocks.events();
	game.get_um = () => { return native.game.um; };
	const f = fixture(undefined, game); f.open();
	const unit = native.game.um.get_unit(native.unit_id); const selected = {}; selected.unit = unit;
	const movement = unit.movement + 0.0; const order = unit.get_order();
	game.emit('unit_select', selected); f.click('TERRAFORM');
	test.assert(f.view.find('button', 'text', 'Change Land 0').color == 'black');
	native.configure('water'); game.emit('unit_select', selected);
	test.assert(f.view.find('button', 'text', 'Change Sea 0').color == 'black');
	test.assert(unit.movement == movement && unit.get_order() == order);
	f.view.root.remove(); test.assert(game.count('unit_select') == 0 && game.count('tile_select') == 0);
});

behavior.scenario('invalid TERRAIN source count and placeholders reject before controls mount', () => {
	for (kind of ['count', 'placeholder']) {
		const view = mocks.display(); const p = {}; p.ui = view.ui;
		p.glsmac = {load_smac_text: (name, format) => {
			if (name == 'menu.txt') { return declared_source(name, format); }
			let source = '#TERRAIN\n'; const count = kind == 'count' ? 19 : 20;
			for (let index = 0; index < count; index++) { source += 'Land,None,Sea,None,4,Change $STR9,q,Q\n'; }
			return test.parse_smac_text(source + '#END\n', format);
		}};
		let failed = false;
		try { #include('../default/ui/parts/game/menu/menu').init(p); }
		catch { : (error) => { failed = true; } }
		test.assert(failed && #sizeof(view.live('panel')) == 0 && #sizeof(view.live('button')) == 0);
		view.root.remove();
	}
});

behavior.scenario('malformed and ambiguous installed menu definitions fail before panels mount', () => {
	for (source of ['#GAME\n&Game\nOne row\n', '#GAME\n&Game\nOne row\n#GAME\n&Other\nOther row\n']) {
		const view = mocks.display(); const p = {}; p.ui = view.ui;
		p.glsmac = {load_smac_text: (name, format) => {
			if (name == 'alphax.txt') { return declared_source(name, format); }
			return test.parse_smac_text(source, format);
		}};
		let failed = false;
		try { #include('../default/ui/parts/game/menu/menu').init(p); }
		catch { : (error) => { failed = true; } }
		test.assert(failed && #sizeof(view.live('panel')) == 0 && #sizeof(view.live('button')) == 0);
		view.root.remove();
	}
});
