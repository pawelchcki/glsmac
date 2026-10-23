const source = #include('../../../../game/unit_disband_dialog');
return {
	init: (p, preview) => {
		this.p = p; this.preview = preview; this.session = null; this.waiting = null; this.dialog = null; this.alive = true;
		this.token = #is_defined(this.token) ? this.token + 1 : 0; const generation = this.token;
		preview.frame.on('remove', () => { if (this.generation == generation) { this.alive = false; this.cancel(); } }); this.generation = generation;
	},
	active: () => { return this.session != null || this.waiting != null; },
	release: () => {
		const pending = this.preview.order_pending;
		if (pending != null && (pending.name == 'unit_disband_draft' || pending.name == 'unit_disband') && pending.request_token == this.token) { this.preview.order_pending = null; }
	},
	close: () => { const dialog = this.dialog; this.dialog = null; this.session = null; if (dialog != null) { dialog.frame.remove(); } },
	cancel: () => { this.waiting = null; this.close(); this.release(); },
	resolve: (session) => {
		const game = this.p.game; const pending = this.preview.order_pending;
		if (!this.alive || !this.preview.is_turn_active || this.preview.selected_unit_id != session.unit_id || game.get_player().id != session.owner || game.get_turn() != session.turn_id ||
			this.p.modules.popup.is_shown() || pending == null || pending.name != 'unit_disband_draft' || pending.request_token != session.request_token ||
			#is_defined(game.validate_unit_disband(session.unit_id, session.owner, session.turn_id))) { return null; }
		const unit = game.get_um().get_unit(session.unit_id);
		if (unit != session.unit || unit.get_tile() != session.tile || unit.movement != session.movement || unit.moved_this_turn != session.moved || unit.health != session.health || unit.get_order() != session.order) { return null; }
		return unit;
	},
	refresh: () => { if (this.session != null && this.resolve(this.session) == null) { this.cancel(); } },
	finish: (e) => {
		const pending = this.waiting;
		if (pending == null || e.name != 'unit_disband' || !#is_defined(e.success) || #typeof(e.success) != 'Bool' || e.caller != pending.owner || !#is_defined(e.data) || #typeof(e.data) != 'Object') { return; }
		for (field of ['unit_id', 'turn_id', 'request_token']) { if (!#is_defined(e.data[field]) || e.data[field] != pending.data[field]) { return; } }
		this.waiting = null; this.release();
		this.preview.update_order_buttons(); this.preview.update_skip_button(); this.preview.update_found_button();
	},
	select: (session, index) => {
		if (this.session == null || this.session.request_token != session.request_token) { return; }
		if (this.resolve(session) == null) { this.cancel(); return; }
		this.dialog.selected = index; let position = 0;
		for (row of this.dialog.rows) { row.class = 'popup-choice' + (position == index ? ' popup-choice-active' : ''); position++; }
	},
	commit: (session) => {
		if (this.session == null || this.session.request_token != session.request_token || this.waiting != null) { return; }
		if (this.resolve(session) == null) { this.cancel(); return; }
		const selected = this.dialog.selected;
		if (selected == 0) { this.cancel(); return; }
		// Only ordinary disband has a command. The third source choice remains
		// a draft; self-destruct effects are outside the recorded transfer.
		if (selected != 1) { this.p.modules.bottom_bar.process_message('Self-destruct is not available yet.'); return; }
		const data = {unit_id: session.unit_id, turn_id: session.turn_id, request_token: session.request_token};
		session.data = data; this.waiting = session;
		this.preview.order_pending = {name: 'unit_disband', unit_id: session.unit_id, turn_id: session.turn_id, request_token: session.request_token};
		this.close(); this.p.game.event('unit_disband', data);
	},
	open: () => {
		if (!this.alive || this.active()) { return false; }
		const unit = this.preview.get_order_unit(false); if (unit == null) { return false; }
		const game = this.p.game; const owner = game.get_player().id; const turn = game.get_turn();
		if (#is_defined(game.validate_unit_disband(unit.id, owner, turn))) { return false; }
		const definition = source(this.p.glsmac, unit.get_def().name + '');
		this.token = this.token + 1; const token = this.token;
		const session = {unit_id: unit.id + 0, owner: owner, turn_id: turn, request_token: token, movement: unit.movement + 0.0, moved: unit.moved_this_turn == true, health: unit.health + 0.0, order: unit.get_order()}; session.unit = unit; session.tile = unit.get_tile();
		this.session = session; this.preview.order_pending = {name: 'unit_disband_draft', unit_id: unit.id + 0, request_token: token};
		const frame = this.p.ui.root.window({class: 'default-panel', width: 460, height: 240, align: 'center', zindex: 0.95, blocker: 'rgba(0,0,0,120)', header_height: 0});
		const dialog = {selected: 0, rows: []}; dialog.frame = frame;
		dialog.caption = frame.text({class: 'base-screen-frame-title', text: definition.caption, left: 12, top: 12});
		dialog.body = frame.text({class: 'base-screen-frame-text', text: definition.body, left: 12, top: 48});
		let index = 0;
		for (label of definition.choices) {
			const choice = index; const row = frame.button({class: 'popup-choice', text: label, left: 12, top: 82 + index * 30, width: 436, height: 26, textalign: 'left'});
			row.on('click', () => { if (this.session != null && this.session.request_token == token) { this.select(session, choice); } return true; }); dialog.rows :+ row; index++;
		}
		dialog.ok = frame.button({class: 'game-popup-button', text: 'OK', left: 12, top: 198, width: 436, height: 26, is_ok: true});
		this.dialog = dialog; this.select(session, 0);
		dialog.ok.on('click', () => { this.commit(session); return true; });
		frame.on('keydown', (e) => {
			if (this.session != null && this.session.request_token == token && e.modifiers == {}) {
				if (e.code == 'ESCAPE') { this.cancel(); }
				else if (e.code == 'ENTER') { this.commit(session); }
				else if (e.code == 'UP' && this.dialog.selected > 0) { this.select(session, this.dialog.selected - 1); }
				else if (e.code == 'DOWN' && this.dialog.selected < 2) { this.select(session, this.dialog.selected + 1); }
			}
			return true;
		});
		frame.on('remove', () => { if (this.dialog == dialog) { this.dialog = null; this.session = null; if (this.waiting == null) { this.release(); } } });
		return true;
	},
};
