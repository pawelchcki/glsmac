// Application authority/lifetime checks. Fixtures contain declared inputs only.
const scenarios = []; const behavior = {scenario: (name, run) => { const entry = {name: name}; entry.run = run; scenarios :+ entry; }};
const prepare = #include('./_unit_disband_fixture'); const declared = #include('./_unit_disband_regression_input');
const fixture = (input) => {
	const f = prepare(#is_defined(input) ? input : declared); f.action('tab'); f.requests = []; f.defer = false;
	const send = f.preview.disband.p.game.event;
	f.preview.disband.p.game.event = (name, data) => {
		if (name == 'unit_disband') { const request = {name: name}; request.data = data; f.requests :+ request; if (f.defer) { return; } }
		send(name, data);
	};
	f.deliver = (request) => { send(request.name, request.data); f.flush(); };
	f.open = () => { f.open_action(); f.flush(); f.action({row_source: 9}); const dialog = f.dialog(); if (dialog == null) { throw Error('Missing actual Disband dialog'); } return dialog; };
	f.invoke = (handlers) => { for (entry of handlers) { if (entry.name == 'click') { entry.callback({button: 'left'}); } } };
	return f;
};
const unchanged = (f, before) => { test.assert(f.native.snapshot() == before, 'Draft/cancellation must preserve native world'); test.assert(#sizeof(f.requests) == 0); };
behavior.scenario('actual source9 uses common source caption body and choices despite expansion decoy', () => {
	const f = fixture(); const before = f.native.snapshot(); const dialog = f.open(); let common = null;
	const definition = #include('../default/game/unit_disband_dialog')(f.glsmac);
	test.assert(#typeof(definition.body) == 'String', 'Native Text requires a materialized String');
	for (choice of definition.choices) { test.assert(#typeof(choice) == 'String', 'Native Button text requires a materialized String'); }
	for (source of declared.sources) { if (source.name == 'script.txt') { common = test.parse_smac_text(source.source, 'dialogs'); } }
	let caption = null; const lines = [];
	for (record of common.dialog('DISBAND2').records) { if (record.kind == 'directive' && record.name == 'caption') { caption = record.argument; } if (record.kind == 'text') { lines :+ record.text; } }
	test.assert(dialog.caption == caption, 'Actual caption must use common Script');
	test.assert(dialog.body == lines[0], 'Actual body must use common Script');
	for (let index = 0; index < 3; index++) { test.assert(dialog.choices[index] == lines[index + 1], 'Each actual choice must use common Script'); }
	test.assert(f.menu.menus.left_menu.is_open && !f.menu.menus.left_menu_action.is_open && dialog.selected == 0);
	unchanged(f, before); f.view.root.remove();
});
behavior.scenario('Escape default confirmation and reopening preserve units and reset actual draft', () => {
	const f = fixture(); const before = f.native.snapshot(); f.open(); f.action('down'); f.action('cancel');
	test.assert(f.dialog() == null && f.preview.order_pending == null); unchanged(f, before);
	test.assert(f.open().selected == 0); f.action('confirm'); test.assert(f.dialog() == null); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('actual arrow drafts clamp and third choice cannot dispatch ordinary disband', () => {
	const f = fixture(); const before = f.native.snapshot(); f.open(); f.action('up'); test.assert(f.dialog().selected == 0);
	f.action('down'); test.assert(f.dialog().selected == 1); f.action('down'); f.action('down'); test.assert(f.dialog().selected == 2);
	// Observe the actual message before the display boundary ticks timers.
	f.dialog().frame.emit('keydown', {code: 'ENTER', modifiers: {}}); test.assert(f.dialog() != null && f.dialog().selected == 2);
	let notice = null; for (node of f.view.live('text')) { if (#is_defined(node.left) && node.left == 228 && #is_defined(node.top) && node.top == 10) { notice = node.text; } }
	test.assert(notice == 'Self-destruct is not available yet.'); unchanged(f, before); f.action('cancel'); f.view.root.remove();
});
behavior.scenario('real ordinary confirmation removes only selected Former through native authority', () => {
	const f = fixture(); const former = f.units[1].id + 0; const scout = f.units[0]; const colony = f.units[2]; const base = f.base;
	f.open(); f.action('down'); f.action('button-ok');
	test.assert(#sizeof(f.requests) == 1 && f.requests[0].data.unit_id == former && !f.game.um.has_unit(former));
	test.assert(f.game.um.get_unit(scout.id) == scout && f.game.um.get_unit(colony.id) == colony && f.base == base && f.base.get_size() == 1);
	test.assert(f.native.selected_id() == colony.id && f.preview.selected_unit_id == colony.id && f.dialog() == null);
	test.assert(f.menu.menus.left_menu.is_open && !f.menu.menus.left_menu_action.is_open && f.preview.order_pending == null); f.view.root.remove();
});
behavior.scenario('old choice and confirmation callbacks cannot change a reopened draft', () => {
	const f = fixture(); const before = f.native.snapshot(); const first = f.open(); const old_ok = first.ok.get_handlers();
	const old_rows = f.preview.disband.dialog.rows[2].get_handlers(); f.action('cancel'); const second = f.open();
	f.invoke(old_rows); f.invoke(old_ok); f.flush(); test.assert(f.dialog().frame == second.frame && f.dialog().selected == 0); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('missing focus foreign unit and blocked readiness cannot open a retained Disband row', () => {
	const f = fixture(); f.open_action(); const saved = f.source_control(9).el.get_handlers(); f.events.select_tile(f.base.get_tile());
	const before = f.native.snapshot(); f.invoke(saved); f.flush(); test.assert(f.dialog() == null); unchanged(f, before);
	let foreign = null; f.native.with_write(() => { const data = {def: 'Formers', health: 1.0, morale: 2}; data.owner = f.game.get_player(0); data.tile = f.units[1].get_tile(); foreign = f.game.um.spawn_unit(data); });
	f.events.select_unit(foreign); const other = f.native.snapshot(); f.invoke(saved); f.flush(); test.assert(f.dialog() == null); unchanged(f, other);
	f.events.select_unit(f.units[1]); f.native.configure_unit(f.units[1].id, 'no_moves'); f.open_action(); const spent = f.native.snapshot();
	f.invoke(saved); f.flush(); test.assert(f.dialog() == null); unchanged(f, spent); f.view.root.remove();
});
behavior.scenario('common unit-type token renders the actual selected native definition name', () => {
	const f = fixture(#include('./_unit_disband_name_regression_input')); const before = f.native.snapshot(); const dialog = f.open();
	test.assert(dialog.body == 'Retire ' + f.units[1].get_def().name + '?');
	test.assert(#sizeof(dialog.choices) == 3 && dialog.selected == 0); f.action('cancel'); test.assert(f.dialog() == null);
	unchanged(f, before); f.view.root.remove();
});
behavior.scenario('popup pending work and inactive turn guard live Disband callbacks', () => {
	const f = fixture(); f.open_action(); const saved = f.source_control(9).el.get_handlers(); const before = f.native.snapshot();
	f.preview.order_pending = {name: 'unit_terraform', unit_id: f.units[1].id, action: 'farm'}; f.invoke(saved); f.flush(); test.assert(f.dialog() == null); f.preview.order_pending = null;
	f.preview.is_turn_active = false; f.invoke(saved); f.flush(); test.assert(f.dialog() == null); f.preview.is_turn_active = true;
	f.popup.no_sliding = true; f.popup.show('please_dont_go', () => {}); f.invoke(saved); f.flush(); test.assert(f.preview.disband.dialog == null); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('changed focus turn or tile invalidates the captured ordinary confirmation', () => {
	for (kind of ['focus','turn','tile']) {
		const f = fixture(); const dialog = f.open(); const saved = dialog.ok.get_handlers(); f.action('down');
		if (kind == 'focus') { f.events.select_unit(f.units[0]); }
		else if (kind == 'turn') { f.native.set_turn(f.game.get_turn() + 1); }
		else { f.native.enable_movement(); f.native.with_write(() => { f.units[1].move_to_tile(f.game.tm.get_tile(4, 4), () => {}); }); f.native.finish_unit_move(f.units[1].id); }
		const before = f.native.snapshot(); f.invoke(saved); f.flush(); test.assert(f.dialog() == null); unchanged(f, before); f.view.root.remove();
	}
});
behavior.scenario('duplicate confirmation queues once and wrong receipts cannot release removal authority', () => {
	const f = fixture(); const dialog = f.open(); f.action('down'); const saved = dialog.ok.get_handlers(); const before = f.native.snapshot(); f.defer = true;
	f.invoke(saved); f.invoke(saved); f.flush(); test.assert(#sizeof(f.requests) == 1 && f.preview.order_pending != null && f.dialog() == null);
	const request = f.requests[0];
	for (field of ['unit_id','turn_id','request_token']) {
		const data = #clone(request.data); data[field] = data[field] + 1; const result = {name: 'unit_disband', caller: f.native.owner.id, success: true}; result.data = data;
		f.events.emit('event_result', result); test.assert(f.preview.order_pending != null);
	}
	for (spec of [['unit_hold',f.native.owner.id,true],['unit_disband',f.native.owner.id + 1,true],['unit_disband',f.native.owner.id,1]]) {
		const result = {name: spec[0], caller: spec[1], success: spec[2]}; result.data = request.data; f.events.emit('event_result', result); test.assert(f.preview.order_pending != null);
	}
	f.preview.submit_unit_order('unit_hold'); test.assert(#sizeof(f.requests) == 1 && f.native.snapshot() == before);
	f.menu.close_all(); f.deliver(request);
	test.assert(!f.game.um.has_unit(request.data.unit_id) && f.preview.order_pending == null && !f.menu.menus.left_menu.is_open); f.view.root.remove();
});
behavior.scenario('header switches and removed menu owners invalidate retained row callbacks', () => {
	const f = fixture(); f.open_action(); const saved = f.source_control(9).el.get_handlers(); const before = f.native.snapshot();
	f.menu.menus.left_menu.items[5].el.emit('click', {button: 'left'}); f.flush(); f.invoke(saved); test.assert(f.dialog() == null); unchanged(f, before);
	f.view.root.remove(); f.invoke(saved); test.assert(f.dialog() == null && f.view.running_timers() == 0); unchanged(f, before);
});
behavior.scenario('removed old modal callbacks cannot act on a replacement native game', () => {
	const old = fixture(); const dialog = old.open(); old.action('down'); const saved = dialog.ok.get_handlers(); old.view.root.remove();
	const f = fixture(); const current = f.open(); const before = f.native.snapshot(); old.invoke(saved); f.flush();
	test.assert(f.dialog().frame == current.frame && f.dialog().selected == 0); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('malformed disband command identities fail shipped validation without mutation', () => {
	const f = fixture(); const handler = #include('../default/game/event/unit_disband'); const turn = f.game.get_turn(); const before = f.native.snapshot();
	for (data of [{unit_id: f.units[1].id}, {unit_id: true, turn_id: turn, request_token: 1}, {unit_id: f.units[1].id, turn_id: turn, request_token: 'bad'},
		{unit_id: f.units[1].id, turn_id: turn + 1, request_token: 1}, {unit_id: 999999, turn_id: turn, request_token: 1}]) {
		const e = {caller: f.native.owner.id}; e.game = f.game; e.data = data; test.assert(#is_defined(handler.validate(e)));
	}
	unchanged(f, before); f.view.root.remove();
});
return scenarios;
