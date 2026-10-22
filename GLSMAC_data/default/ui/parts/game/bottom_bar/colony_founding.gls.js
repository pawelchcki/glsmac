const source = #include('../../../../game/colony_founding_dialog');
return {
	init: (p, preview) => {
		this.p = p; this.preview = preview; this.session = null; this.waiting = null; this.dialog = null; this.token = 0; this.alive = true;
		preview.frame.on('remove', () => { this.alive = false; this.cancel(); });
	},
	active: () => { return this.session != null || this.waiting != null; },
	release: () => {
		this.preview.founding_pending_id = null; this.preview.founding_pending_name = null; this.preview.founding_pending_base_id = null;
	},
	close: () => {
		const dialog = this.dialog; this.dialog = null; this.session = null;
		if (dialog != null) { dialog.frame.remove(); }
	},
	cancel: () => { this.waiting = null; this.close(); this.release(); },
	resolve: (session) => {
		const game = this.p.game;
		if (!this.alive || !this.preview.is_turn_active || game.get_turn() != session.turn_id || game.get_player().id != session.owner ||
			this.preview.selected_unit_id != session.unit_id || this.preview.order_pending != null || this.p.modules.popup.is_shown()) { return null; }
		const units = game.get_um(); if (!units.has_unit(session.unit_id)) { return null; }
		const unit = units.get_unit(session.unit_id);
		if (unit != session.unit || unit.get_tile() != session.tile || #is_defined(game.validate_found_base(unit.id, session.owner))) { return null; }
		return unit;
	},
	refresh: () => { if (this.session != null && this.resolve(this.session) == null) { this.cancel(); } },
	finish: (e) => {
		const pending = this.waiting;
		if (pending == null || e.name != 'found_base' || !#is_defined(e.success) || #typeof(e.success) != 'Bool' || e.caller != pending.owner ||
			!#is_defined(e.data) || #typeof(e.data) != 'Object') { return; }
		for (field of ['unit_id', 'turn_id', 'request_token', 'name']) { if (!#is_defined(e.data[field]) || e.data[field] != pending.data[field]) { return; } }
		this.waiting = null; this.release();
		if (e.success && #is_defined(this.p.modules.menu)) { this.p.modules.menu.close_all(); }
	},
	commit: (session) => {
		if (this.session == null || this.session.request_token != session.request_token || this.waiting != null) { return; }
		const unit = this.resolve(session); if (unit == null) { this.cancel(); return; }
		const name = this.dialog.input.value;
		if (#typeof(name) != 'String' || #is_defined(this.p.game.validate_named_found_base(unit.id, session.owner, session.turn_id, name))) { return; }
		const data = {unit_id: unit.id + 0, turn_id: session.turn_id + 0, request_token: session.request_token + 0, name: name};
		session.data = data; this.waiting = session; this.close();
		this.p.game.event('found_base', data);
	},
	open: () => {
		if (!this.alive || this.active()) { return false; }
		const unit = this.preview.get_found_unit(); if (unit == null || unit.get_tile().get_base() != null) { return false; }
		const definition = source(this.p.glsmac); const game = this.p.game; const owner = game.get_player().id;
		const draft = game.preview_found_base(unit.id, owner);
		this.token = this.token + 1; const token = this.token;
		const session = {unit_id: unit.id + 0, owner: owner, turn_id: game.get_turn(), request_token: token}; session.unit = unit; session.tile = unit.get_tile();
		this.session = session; this.preview.founding_pending_id = unit.id; this.preview.founding_pending_name = 'found_base';
		const frame = this.p.ui.root.window({class: 'default-panel', width: 400, height: 150, align: 'center', zindex: 0.95, blocker: 'rgba(0,0,0,120)', header_height: 0});
		const dialog = {}; dialog.frame = frame;
		dialog.caption = frame.text({class: 'base-screen-frame-title', text: definition.caption, left: 12, top: 12, align: 'top left'});
		dialog.label = frame.text({class: 'base-screen-frame-text', text: definition.label, left: 12, top: 54, align: 'top left'});
		dialog.input = frame.input({class: 'popup-input', left: 80, top: 48, width: 308, height: 26, max_length: 24, value: draft});
		dialog.ok = frame.button({class: 'game-popup-button', text: 'OK', left: 12, top: 108, width: 178, height: 24});
		dialog.cancel = frame.button({class: 'game-popup-button', text: 'Cancel', left: 210, top: 108, width: 178, height: 24});
		this.dialog = dialog;
		dialog.input.on('input', () => { this.commit(session); return true; });
		dialog.ok.on('click', () => { this.commit(session); return true; });
		dialog.cancel.on('click', () => { if (this.session != null && this.session.request_token == token) { this.cancel(); } return true; });
		frame.on('keydown', (e) => {
			if (this.session != null && this.session.request_token == token && e.modifiers == {}) {
				if (e.code == 'ESCAPE') { this.cancel(); } else if (e.code == 'ENTER') { this.commit(session); }
			}
			return true;
		});
		frame.on('remove', () => { if (this.dialog == dialog) { this.dialog = null; this.session = null; if (this.waiting == null) { this.release(); } } });
		return true;
	},
};
