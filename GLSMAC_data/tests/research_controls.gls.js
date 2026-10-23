const behavior = #include('./_behavior');
const fixture = #include('./_research_ui_fixture');

behavior.scenario('real Shift R opens source-driven directed choices ordered by native category and source ID', () => {
	const f = fixture(false); test.assert(f.key('R', {shift: true}));
	test.assert(f.popup.is_shown() && f.dialog.header.text == 'Synthetic Research' && #sizeof(f.dialog.rows) == 4);
	const ids = []; const labels = [];
	for (row of f.dialog.rows) { ids :+ row.id; labels :+ row.category.text; }
	test.assert(ids == [2, 1, 7, 9] && labels == ['EXPLORE 1', 'DISCOVER 1', 'BUILD 1', 'CONQUER 1']);
	test.assert(f.key('ESCAPE') && f.popup.is_shown() && #sizeof(f.pending.requests) == 0);
	f.dialog.rows[1].el.emit('click', {});
	test.assert(#sizeof(f.pending.requests) == 1 && f.pending.requests[0].data == {target_id: 1});
	test.assert(f.game.get_research_state(f.owner.id).target_id == (0 - 1));
	f.deliver(); test.assert(!f.popup.is_shown() && f.game.get_research_state(f.owner.id).target_id == 1);
	test.assert(f.open() && f.popup.is_shown()); f.key('ESCAPE');
	test.assert(f.popup.is_shown() && f.game.get_research_state(f.owner.id).target_id == 1);
	f.view.root.remove();
});

behavior.scenario('mounted HQ source identity reaches the same research controller', () => {
	const f = fixture(true); test.assert(f.hq());
	test.assert(f.popup.is_shown() && f.dialog.header.text == 'Synthetic Priorities' && !f.menu.menus.left_menu.is_open);
	test.assert(f.dialog.rows[0].el.text == 'Area A' && f.dialog.rows[0].check.text == 'X' && f.dialog.ok.text == 'Accept');
	f.view.root.remove();
});

for (closing of ['ok', 'escape', 'enter']) {
	const close = closing;
	behavior.scenario('blind checkbox changes reach native state and persist through ' + close, () => {
		const f = fixture(true); f.open(); f.dialog.rows[2].el.emit('click', {});
		test.assert(f.dialog.rows[2].check.text == '' && #sizeof(f.pending.requests) == 1);
		f.dialog.rows[2].check.emit('click', {}); test.assert(#sizeof(f.pending.requests) == 1);
		f.deliver(); test.assert(f.dialog.rows[2].check.text == 'X');
		if (close == 'ok') { f.dialog.ok.emit('click', {}); }
		else { f.key(close == 'escape' ? 'ESCAPE' : 'ENTER'); }
		test.assert(!f.popup.is_shown()); f.open();
		test.assert(f.dialog.rows[0].check.text == 'X' && f.dialog.rows[2].check.text == 'X');
		f.dialog.rows[0].check.emit('click', {}); f.deliver(); f.dialog.rows[2].check.emit('click', {}); f.deliver();
		f.dialog.ok.emit('click', {}); f.open();
		for (row of f.dialog.rows) { test.assert(row.check.text == ''); }
		f.view.root.remove();
	});
}

behavior.scenario('unrelated receipts cannot confirm pending research and rejection allows retry', () => {
	const f = fixture(false); f.open(); f.dialog.rows[0].el.emit('click', {});
	f.events.emit('event_result', {name: 'set_research_target', caller: f.owner.id + 1, data: {target_id: 2}, success: true});
	f.events.emit('event_result', {name: 'set_research_target', caller: f.owner.id, data: {target_id: 1}, success: true});
	f.dialog.rows[1].el.emit('click', {});
	test.assert(f.popup.is_shown() && #sizeof(f.pending.requests) == 1 && f.dialog.pending != null);
	f.deliver(false); test.assert(f.popup.is_shown() && f.dialog.pending == null && f.game.get_research_state(f.owner.id).target_id == (0 - 1));
	f.dialog.rows[1].el.emit('click', {}); f.deliver();
	test.assert(!f.popup.is_shown() && f.game.get_research_state(f.owner.id).target_id == 1);
	f.view.root.remove();
});

behavior.scenario('pending request survives closure and reopening without acknowledging a later presentation', () => {
	const f = fixture(false); f.open(); const old = f.dialog.rows[0].el;
	old.emit('click', {}); f.popup.hide('research'); f.open();
	f.dialog.rows[0].el.emit('click', {}); test.assert(#sizeof(f.pending.requests) == 1);
	f.deliver(); test.assert(f.popup.is_shown() && f.dialog.pending == null && f.game.get_research_state(f.owner.id).target_id == 2);
	f.dialog.rows[1].el.emit('click', {}); f.deliver();
	test.assert(!f.popup.is_shown() && f.game.get_research_state(f.owner.id).target_id == 1);
	f.view.root.remove();
});

behavior.scenario('modal ownership inactive turns and removed controllers prevent research submission', () => {
	const f = fixture(true); f.popup.show('please_dont_go', (result) => {});
	test.assert(!f.open() && #sizeof(f.pending.requests) == 0);
	f.popup.hide('please_dont_go'); f.events.emit('turn_status', {status: 'please_wait'});
	test.assert(!f.open()); f.events.emit('turn_status', {status: 'active'}); f.open();
	const saved_open = f.controller.open; const saved_submit = f.dialog.submit; const generation = f.dialog.generation;
	f.view.root.remove(); test.assert(!saved_open()); saved_submit(0, generation);
	test.assert(#sizeof(f.pending.requests) == 0);
});
