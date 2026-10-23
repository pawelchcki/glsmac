const source = #include('../../../game/opening_dialog');
return {
	visible_phase: null, frame: null, background: null, caption_node: null, input: null,
	confirm: null, dismiss: null, phase: null, pending: false, p: null,
	landing: null, phase_session: null,
	close: () => {
		if (this.landing != null) { this.landing.cancel(); this.landing = null; }
		if (this.frame != null) { this.frame.remove(); this.frame = null; }
		if (this.background != null) { this.background.remove(); this.background = null; }
		this.caption_node = null; this.input = null; this.confirm = null; this.dismiss = null;
	},
	base: (id) => {
		for (base of this.p.game.get_bm().get_bases()) { if (base.id == id) { return base; } }
		return null;
	},
	submit: (action, session, phase) => {
		if (this.pending) { return true; }
		const state = this.p.game.get_opening_state();
		if (state.session != session || state.phase != phase || this.frame == null) { return true; }
		const base = this.base(state.base_id); if (base == null) { return true; }
		const data = {session: state.session, action: action, base_id: 0, previous_name: '', name: ''};
		if (action == 'name') { data.base_id = base.id; data.previous_name = base.name + ''; data.name = this.input.value + ''; }
		const error = this.p.game.validate_opening(this.p.game.get_player().id, data.session, action, data.base_id, data.previous_name, data.name);
		if (#is_defined(error)) { this.error.text = error; return true; }
		this.pending = true; this.p.game.event('opening_command', data); return true;
	},
	paragraphs: (paragraphs, top, width) => {
		let y = top;
		for (paragraph of paragraphs) {
			let line = ''; let node = this.frame.text({class: 'popup-text', left: 20, top: y, font: 'arialnb.ttf:18', text: ''});
			for (word of #split(paragraph, ' ')) {
				const candidate = line == '' ? word : line + ' ' + word;
				node.text = candidate;
				if (node.get_width() > width && line != '') { node.text = line; y += 22; node = this.frame.text({class: 'popup-text', left: 20, top: y, font: 'arialnb.ttf:18', text: word}); line = word; }
				else { line = candidate; }
			}
			y += 36;
		}
		return y;
	},
	show: (state) => {
		const p = this.p; const base = this.base(state.base_id); if (base == null) { return; }
		const definitions = source.load(p.glsmac, p.game, base);
		const phase = state.phase; const session = state.session;
		const width = 700; const height = phase == 'first-base-name' ? 180 : 390;
		if (phase == 'planetfall') { this.background = p.root.surface({id: 'opening-backdrop', left: 0, right: 0, top: 0, bottom: 0, zindex: 0.98, background: 'xopeninga.pcx:stretch()'}); }
		this.frame = p.root.window({id: 'opening-' + phase, class: 'default-panel', align: 'center', width: width, height: height, header_height: 0, zindex: 0.99, blocker: 'transparent'});
		this.error = this.frame.text({class: 'popup-text', left: 20, top: height - 75, text: ''});
		const definition = phase == 'planetfall' ? definitions.planetfall : (phase == 'first-base-name' ? definitions.name : definitions.tour);
		if (definition.caption != null) { this.caption_node = this.frame.text({class: 'popup-text', align: 'top center', top: 15, text: #uppercase(definition.caption)}); }
		if (phase == 'first-base-name') {
			this.frame.text({class: 'popup-text', left: 20, top: 62, text: definitions.name.paragraphs[0]});
			this.input = this.frame.input({class: 'popup-input', left: 100, top: 55, width: 575, height: 26, max_length: 24, value: base.name + ''});
			this.input.on('input', () => { return this.submit('name', session, phase); });
		} else { this.paragraphs(definition.paragraphs, phase == 'planetfall' ? 55 : 20, width - 45); }
		const button_width = phase == 'tour' ? 310 : 660;
		const button_left = phase == 'tour' ? 370 : 20;
		const button = this.frame.button({class: 'popup-button', text: definitions.ok, left: button_left, top: height - 42, width: button_width, height: 26});
		const action = phase == 'planetfall' ? 'planetfall' : (phase == 'first-base-name' ? 'name' : 'dismiss');
		button.on('click', () => { return this.submit(action, session, phase); });
		const x = (p.ui.get_width() - width) / 2 + button_left + button_width / 2;
		const y = (p.ui.get_height() - height) / 2 + height - 42 + 13;
		if (phase == 'tour') { this.dismiss = button; this.dismiss_x = x; this.dismiss_y = y; }
		else { this.confirm = button; this.confirm_x = x; this.confirm_y = y; }
		this.frame.on('keydown', (e) => { if (e.modifiers == {} && e.code == 'ENTER' && phase != 'tour') { this.submit(action, session, phase); } return true; });
		this.visible_phase = phase;
	},
	refresh: () => {
		const state = this.p.game.get_opening_state();
		if (state.phase == 'preparing' || state.phase == 'starting') { return true; }
		if (state.phase == 'failed') { this.close(); this.visible_phase = null; this.p.glsmac.reset(); return false; }
		if (state.phase == this.phase && state.session == this.phase_session) { return true; }
		const land = this.phase == 'planetfall' && state.phase == 'first-base-name' && state.session == this.phase_session;
		this.close(); this.pending = false; this.phase = state.phase; this.phase_session = state.session;
		if (land) {
			this.visible_phase = 'landing';
			this.landing = #include('pod_landing')(this.p, state, () => {
				this.landing = null;
				const now = this.p.game.get_opening_state();
				if (now.session == state.session && now.phase == 'first-base-name' && now.base_id == state.base_id) { this.show(now); }
			});
			return true;
		}
		if (state.phase == 'none' || state.phase == 'map') { this.visible_phase = 'map'; }
		else { this.show(state); }
		return true;
	},
	init: (p) => {
		this.p = p; this.phase = null; this.visible_phase = null; this.pending = false; this.auto_pending = null;
		if (!#is_defined(p.game.get_opening_state)) { this.visible_phase = 'map'; return; }
		const life = p.root.area({id: 'opening-lifecycle', width: 0, height: 0});
		life.on('remove', () => { this.close(); this.visible_phase = null; this.phase = null; this.pending = false; });
		life.listen(p.game, 'event_result', (e) => {
			if (e.name == 'opening_command') { this.pending = false; }

		});
		#include('auto_end_turn')(p.game, life);
		life.timer(50, () => { return this.refresh(); });
		this.refresh();
	},
};
