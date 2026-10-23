const source = #include('../../../game/interface_tour_dialog');
return {
	active: false, frame: null, life: null, controls: [], source_id: null, generation: 0, p: null,
	valid: (session, generation) => {
		if (!this.active || this.generation != generation) { return false; }
		const state = this.p.game.get_opening_state();
		return state.session == session && state.phase == 'tour' && this.p.game.get_turn() == 1;
	},
	stop: () => {
		this.active = false; this.generation = this.generation + 1;
		if (this.frame != null) { this.frame.remove(); this.frame = null; }
		if (this.life != null) { const life = this.life; this.life = null; life.remove(); }
		if (this.p != null) { this.p.modules.menu.close_all(); }
		this.controls = []; this.source_id = null; this.index = null; this.p = null; this.opening = null; this.definitions = null;
	},
	finish: (session, generation) => {
		if (!this.valid(session, generation) || this.pending) { return true; }
		const game = this.p.game; const caller = game.get_player().id;
		const error = game.validate_opening(caller, session, 'dismiss', 0, '', '');
		if (#is_defined(error)) { throw Error(error); }
		this.pending = true;
		game.event('opening_command', {session: session, action: 'dismiss', base_id: 0, previous_name: '', name: ''});
		return true;
	},
	show: (index, session, generation) => {
		if (!this.valid(session, generation) || this.pending) { return true; }
		if (this.frame != null) { this.frame.remove(); }
		const p = this.p; const menu = p.modules.menu; menu.close_all();
		const page = this.definitions.pages[index]; this.source_id = page.id; this.index = index;
		if (page.id == 'TOURMENU') { menu.open('left_menu', {align: 'bottom left', left: 0, bottom: menu.bottom_bar_height}); }
		if (page.id == 'TOURCOMMLINK') { menu.show_commlink(this.definitions.no_contacts); }
		const width = 700; const height = 300;
		this.frame = p.root.window({id: 'interface-tour-page', class: 'default-panel', align: 'center', width: width, height: height, header_height: 0, zindex: 0.99, blocker: 'transparent'});
		this.opening.paragraphs(page.definition.paragraphs, 20, width - 45, this.frame);
		const last = index == #sizeof(this.definitions.pages) - 1;
		const next = () => { if (this.index != index) { return true; } if (last) { return this.finish(session, generation); } return this.show(index + 1, session, generation); };
		this.controls = [];
		let ordinal = 0;
		for (label of (last ? [this.definitions.close] : [this.definitions.next, this.definitions.end])) {
			const left = last ? 20 : 20 + ordinal * 350; const button_width = last ? 660 : 310;
			const node = this.frame.button({class: 'popup-button', text: label, left: left, top: height - 42, width: button_width, height: 26});
			node.on('click', ordinal == 0 ? next : () => { if (this.index == index) { return this.finish(session, generation); } return true; });
			const control = {x: (p.ui.get_width() - width) / 2 + left + button_width / 2, y: (p.ui.get_height() - height) / 2 + height - 29}; control.node = node;
			this.controls :+ control; ordinal++;
		}
		this.frame.on('keydown', (e) => { if (e.modifiers == {} && e.code == 'ENTER') { next(); } return true; });
		return true;
	},
	start: (p, opening, session, base) => {
		const state = p.game.get_opening_state();
		if (this.active || state.session != session || state.phase != 'tour') { return true; }
		if (#is_defined(p.game.validate_opening(p.game.get_player().id, session, 'dismiss', 0, '', ''))) { return true; }
		for (player of p.game.get_players()) { if (player.id != p.game.get_player().id) { throw Error('Interface tour requires a known one-participant contact context'); } }
		const definitions = source.load(p.glsmac, p.game, base);
		opening.close(); this.p = p; this.opening = opening; this.definitions = definitions;
		this.active = true; this.pending = false; this.generation = this.generation + 1; const generation = this.generation;
		this.life = p.root.area({id: 'interface-tour-lifecycle', width: 0, height: 0});
		this.life.on('remove', () => { this.stop(); });
		this.life.listen(p.game, 'event_result', (e) => { if (e.name == 'opening_command' && !e.success) { this.pending = false; } });
		this.life.timer(50, () => { if (!this.valid(session, generation)) { this.stop(); return false; } return true; });
		return this.show(0, session, generation);
	},
};
