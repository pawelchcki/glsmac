// Application control/lifecycle requirements, separate from original pointer
// observations. Production callbacks and native handlers own every effect.
const native_menu = #include('./_terraform_menu_fixture');
const make_fixture = () => {
	let menu = '';
	for (spec of [['GAME', 13], ['HQ', 17], ['NETWORK', 9], ['MAP', 21], ['ACTION', 31], ['TERRAFORM', 10], ['SCENARIO', 28], ['EDITOR', 29], ['HELP', 22]]) {
		menu += '#' + spec[0] + '\n' + spec[0] + '\n';
		for (let index = 0; index < spec[1]; index++) { menu += 'Menu fixture ' + #to_string(index) + '|Unused\n'; }
	}
	let terrain = '#TERRAIN\n';
	for (let index = 0; index < 20; index++) { terrain += 'Work fixture ' + #to_string(index) + ',None,Water fixture,None,4,Shape $STR0,q,Q\n'; }
	const f = native_menu({profile: 'spread', initial_base: {name: 'Gaia\'s Landing', workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9},
		sources: [{name: 'menu.txt', source: menu + '#END\n'}, {name: 'alphax.txt', source: terrain + '#END\n'}]});
	f.open_terraform = () => {
		if (!f.menu.menus.left_menu.is_open) { f.click_menu(); }
		const child = f.menu.menus.left_menu_terraform;
		if (!#is_defined(child) || !child.is_open) { f.click_header(5); }
	};
	// Defer command delivery to inspect pending controls and stale receipts.
	f.click = (index) => { return f.terrain_control(index).el.emit('click', {button: 'left'}); };
	f.open_terraform(); return f;
};
const receipt = (f, action, caller, id, success) => {
	f.events.emit('event_result', {name: 'unit_terraform', caller: caller, data: {unit_id: id, action: action}, success: success});
};
const scenarios = [];
const add = (name, run) => { const entry = {name: name}; entry.run = run; scenarios :+ entry; };

for (spec of [[0, 'farm'], [2, 'mine'], [4, 'forest'], [5, 'road']]) {
	const binding = spec;
	add('Terraform row identity submits existing native ' + binding[1] + ' command once', () => {
		const f = make_fixture(); const control = f.terrain_control(binding[0]);
		test.assert(control.entry.terrain_index == binding[0] && control.el.text == 'Shape Work fixture ' + #to_string(binding[0]) + ' (4 turns)');
		f.click(binding[0]); f.click(binding[0]); f.click(binding[0] == 0 ? 2 : 0);
		test.assert(#sizeof(f.pending.requests) == 1, 'Mounted work row must submit one command while its acknowledgement is pending');
		const request = f.pending.requests[0];
		test.assert(request.name == 'unit_terraform' && request.data == {unit_id: f.former.id, action: binding[1]});
		test.assert(f.former.get_order() == 'NO_ORDERS' && f.former.movement == 1.0, 'UI must wait for native apply');
		f.flush(); const state = f.observe();
		test.assert(state.order == binding[1] && state.work_units == 2 && state.movement_spent == 3);
		test.assert(state.terrain == {road: false, farm: false, mine: false, forest: false}, 'Four declared work turns must retain unfinished terrain');
		f.view.root.remove();
	});
}

add('Absent and ineligible selection cannot submit a work row, while restored Former can', () => {
	const f = make_fixture(); f.events.select_unit(f.units[0]); f.click(0);
	f.native.selection_reset(); f.events.select_tile(f.base.get_tile()); f.click(2);
	test.assert(#sizeof(f.pending.requests) == 0 && f.former.movement == 1.0);
	f.events.select_unit(f.former);
	f.native.with_write(() => { f.former.movement = 0.0; }); f.click(0);
	test.assert(#sizeof(f.pending.requests) == 0, 'Spent fresh Former cannot begin work');
	f.native.with_write(() => { f.former.movement = 1.0; }); f.click(0);
	test.assert(#sizeof(f.pending.requests) == 1, 'Eligibility must be re-read when the actual selected Former becomes available');
	f.flush(); test.assert(f.observe().order == 'farm'); f.view.root.remove();
});

add('Popup arrival blocks retained row callbacks and closing it restores work submission', () => {
	const f = make_fixture(); const control = f.terrain_control(0);
	f.popup.no_sliding = true; f.popup.show('please_dont_go', () => {});
	f.open_terraform(); control.el.emit('click', {button: 'left'});
	test.assert(f.popup.is_shown() && #sizeof(f.pending.requests) == 0 && f.former.movement == 1.0);
	f.popup.hide('please_dont_go'); f.flush(); f.open_terraform(); f.click(0);
	test.assert(#sizeof(f.pending.requests) == 1, 'Closing a popup must restore the existing work command');
	f.flush(); test.assert(f.observe().order == 'farm'); f.view.root.remove();
});

add('Keyboard work pending authority blocks a different menu action', () => {
	const f = make_fixture(); f.preview.frame.emit('keydown', {code: 'F', modifiers: {}});
	test.assert(#sizeof(f.pending.requests) == 1 && f.preview.order_pending != null);
	f.click(2); f.click(4);
	test.assert(#sizeof(f.pending.requests) == 1 && f.former.get_order() == 'NO_ORDERS');
	f.flush(); test.assert(f.observe().order == 'farm'); f.view.root.remove();
});

add('Shared work event name cannot release a different action, caller or unit; rejection permits retry', () => {
	const f = make_fixture(); f.click(0);
	test.assert(#sizeof(f.pending.requests) == 1, 'Farm row must create the pending work command');
	const caller = f.native.owner.id + 0; const id = f.former.id + 0;
	for (event of [{name: 'unit_terraform', caller: caller}, {name: 'unit_terraform', caller: caller, data: 'bad', success: true},
		{name: 'unit_terraform', caller: caller, data: {}, success: true},
		{name: 'unit_terraform', caller: caller, data: {unit_id: id, action: 'farm'}}]) { f.events.emit('event_result', event); }
	receipt(f, 'mine', caller, id, true); receipt(f, 'farm', caller + 1, id, true); receipt(f, 'farm', caller, f.units[0].id, true);
	f.click(2);
	test.assert(#sizeof(f.pending.requests) == 1 && f.menu.menus.left_menu_terraform.is_open && f.former.get_order() == 'NO_ORDERS',
		'Matching the event name alone must not complete another work action');
	// A rejected request never reaches native apply; acknowledge it and retry.
	f.pending.delivered = 1; receipt(f, 'farm', caller, id, false); f.click(2);
	test.assert(#sizeof(f.pending.requests) == 2 && f.former.movement == 1.0);
	f.flush(); test.assert(f.observe().order == 'mine'); f.view.root.remove();
});

add('Switching headers while work is pending preserves successor presentation and native authority', () => {
	const f = make_fixture(); f.click(0);
	test.assert(#sizeof(f.pending.requests) == 1, 'Menu must submit work before the header switch');
	f.menu.menus.left_menu.items[8].el.emit('click', {button: 'left'}); f.flush();
	test.assert(f.observe().order == 'farm');
	test.assert(f.menu.menus.left_menu.is_open && f.menu.menus.left_menu_help.is_open && f.menu.menus.left_menu.items[8].el.active);
	f.view.root.remove();
});

add('Closing menus after submission cannot cancel native work or reopen its former child', () => {
	const f = make_fixture(); f.click(0);
	test.assert(#sizeof(f.pending.requests) == 1, 'Menu must submit work before closure');
	f.menu.close_all(); f.flush();
	test.assert(f.observe().order == 'farm' && !f.menu.menus.left_menu.is_open && !f.menu.menus.left_menu_terraform.is_open);
	f.view.root.remove();
});

add('Saved row callbacks require a live open child and read the current selection', () => {
	const f = make_fixture(); const control = f.terrain_control(0); const saved = control.entry.open;
	test.assert(#typeof(saved) == 'Callable', 'Supported Terraform row must bind a production callback');
	f.events.select_unit(f.units[0]); saved();
	test.assert(#sizeof(f.pending.requests) == 0 && f.former.movement == 1.0);
	f.events.select_unit(f.former); f.menu.menus.left_menu.items[8].el.emit('click', {button: 'left'}); saved();
	test.assert(#sizeof(f.pending.requests) == 0 && f.menu.menus.left_menu_help.is_open);
	f.open_terraform(); saved();
	test.assert(#sizeof(f.pending.requests) == 1, 'Reopened callback must target the current eligible native selection');
	f.flush(); test.assert(f.observe().order == 'farm'); f.view.root.remove();
});

add('Removed menu nodes and saved callbacks cannot command a replacement game', () => {
	const old = make_fixture(); const control = old.terrain_control(0); const saved = control.entry.open;
	test.assert(#typeof(saved) == 'Callable', 'Supported Terraform row must bind a production callback');
	old.view.root.remove();
	const f = make_fixture(); const before = f.native.snapshot(); saved();
	test.assert(!control.el.emit('click', {button: 'left'}) && #sizeof(old.pending.requests) == 0 && #sizeof(f.pending.requests) == 0);
	test.assert(f.native.snapshot() == before && f.observe().order == 'none' && f.menu.menus.left_menu_terraform.is_open);
	f.view.root.remove();
});

return scenarios;
