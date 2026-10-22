// Application presentation/source/lifecycle guards, separate from pointer gold.
const behavior = #include('./_behavior');
const mounted = #include('./_terraform_menu_fixture');
const fixture = (prerequisite) => {
	let menu = '';
	for (spec of [['GAME', 13], ['HQ', 17], ['NETWORK', 9], ['MAP', 21], ['ACTION', 31], ['TERRAFORM', 10], ['SCENARIO', 28], ['EDITOR', 29], ['HELP', 22]]) {
		menu += '#' + spec[0] + '\n' + spec[0] + '\n';
		for (let i = 0; i < spec[1]; i++) { menu += 'Source ' + #to_string(i) + '|Unused\n'; }
	}
	let terrain = '#TERRAIN\n';
	for (let i = 0; i < 20; i++) {
		const needed = #is_defined(prerequisite) && (i == 0 || i == 8) ? prerequisite : 'None';
		terrain += 'Land ' + #to_string(i) + ',' + needed + ',Sea ' + #to_string(i) + ',None,' + #to_string(1 + i % 4) + ',Shape $STR0,q,Q\n';
	}
	const f = mounted({profile: 'spread', initial_base: {name: 'Gaia\'s Landing', workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9},
		sources: [{name: 'menu.txt', source: menu + '#END\n'}, {name: 'alphax.txt', source: terrain + '#END\n'}]});
	f.click_menu(); f.click_header(5);
	f.row = (index) => {
		for (row of f.menu.menus.left_menu_terraform.items) { if (#is_defined(row.entry.terrain_index) && row.entry.terrain_index == index) { return row; } }
		throw Error('Missing mounted terrain source identity');
	};
	return f;
};
behavior.scenario('Ready native Former rows use source rates and compact observed groups without effects', () => {
	const f = fixture(); const child = f.menu.menus.left_menu_terraform; const before = f.native.snapshot();
	test.assert(!f.row(1).el.is_visible() && !f.row(6).el.is_visible());
	for (spec of [[0, 'Shape Land 0 (1 turns)'], [2, 'Shape Land 2 (3 turns)'], [3, 'Shape Land 3 (4 turns)'], [5, 'Shape Land 5 (2 turn)']]) {
		const row = f.row(spec[0]); test.assert(row.el.text == spec[1] && f.color(row.el) == 'rgb(176, 212, 235)');
	}
	let count = 0;
	for (row of child.rows) {
		if (row.el.is_visible()) {
			test.assert(row.el.top == count * f.menu.item_height + (#is_defined(row.entry.separator) ? f.menu.item_height / 2 : 0)); count++;
		}
	}
	test.assert(count == 33 && child.el.height == count * f.menu.item_height);
	test.assert(#sizeof(f.pending.requests) == 0 && f.native.snapshot() == before); f.observe(); f.view.root.remove();
});
behavior.scenario('Live native reselection restores retained Terraform rows labels and source identities', () => {
	const f = fixture(); const child = f.menu.menus.left_menu_terraform; const row = f.row(0).el; const before = f.native.snapshot();
	f.events.select_unit(f.units[0]); f.flush();
	test.assert(f.row(1).el.is_visible() && f.row(6).el.is_visible() && row.text == 'Shape Land 0' && f.color(row) == 'black');
	f.events.select_unit(f.former); f.flush();
	test.assert(f.menu.menus.left_menu_terraform == child && f.row(0).el == row && !f.row(1).el.is_visible());
	test.assert(row.text == 'Shape Land 0 (1 turns)' && f.color(row) == 'rgb(176, 212, 235)');
	test.assert(f.native.snapshot() == before && #sizeof(f.pending.requests) == 0); f.observe(); f.view.root.remove();
});
for (kind of ['no_moves', 'dead', 'locked', 'completed', 'inactive']) {
	behavior.scenario('Terraform presentation does not advertise an ineligible native ' + kind + ' Former', () => {
		const f = fixture(); f.native.configure_unit(f.former.id, kind); f.menu.refresh_terrain();
		test.assert(f.color(f.row(0).el) == 'black' && f.row(0).el.text == 'Shape Land 0');
		test.assert(#sizeof(f.pending.requests) == 0); f.view.root.remove();
	});
}
for (needed of ['Disable', 'UNOWNED_TEST_TECH']) {
	behavior.scenario('Installed ' + needed + ' prerequisite keeps bound and unbound terrain rows dark', () => {
		const f = fixture(needed);
		test.assert(f.color(f.row(0).el) == 'black' && f.color(f.row(8).el) == 'black');
		test.assert(f.color(f.row(2).el) == 'rgb(176, 212, 235)');
		const before = f.native.snapshot(); f.row(0).el.emit('click', {button: 'left'}); f.row(8).el.emit('click', {button: 'left'});
		test.assert(#sizeof(f.pending.requests) == 0 && f.native.snapshot() == before); f.view.root.remove();
	});
}
behavior.scenario('Escape Tab and root reopening retain the actual header until its next click toggles it', () => {
	const f = fixture(); const child = f.menu.menus.left_menu_terraform; const before = f.native.snapshot();
	f.escape(); test.assert(!child.is_open && f.menu.menus.left_menu.items[5].el.active);
	f.tab(); test.assert(f.native.selected_id() == f.units[2].id && !f.menu.menus.left_menu.is_open);
	f.click_menu(); test.assert(!child.is_open && f.menu.menus.left_menu.items[5].el.active);
	f.click_header(5); test.assert(!child.is_open && !f.menu.menus.left_menu.items[5].el.active);
	test.assert(f.native.snapshot() == before && #sizeof(f.pending.requests) == 0); f.observe(); f.view.root.remove();
});
behavior.scenario('Actual native owner technology unlocks source metadata and the existing work command', () => {
	const f = fixture('UNOWNED_TEST_TECH');
	test.assert(f.color(f.row(0).el) == 'black' && f.color(f.row(8).el) == 'black');
	f.native.apply_faction_starting_technologies(['UNOWNED_TEST_TECH']); f.menu.refresh_terrain();
	test.assert(f.color(f.row(0).el) == 'rgb(176, 212, 235)' && f.color(f.row(8).el) == 'rgb(176, 212, 235)');
	f.row(0).el.emit('click', {button: 'left'});
	test.assert(#sizeof(f.pending.requests) == 1 && f.pending.requests[0].name == 'unit_terraform');
	f.flush();
	test.assert(f.former.movement == 0.0 && f.game.tm.get_terraforming(f.former.get_tile().x, f.former.get_tile().y).farm);
	f.observe(); f.view.root.remove();
});
