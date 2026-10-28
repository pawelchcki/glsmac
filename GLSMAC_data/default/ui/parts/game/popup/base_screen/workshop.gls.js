// Existing-design Workshop. Choosing a design changes the production draft;
// the base screen remains responsible for validating and submitting production.
const unit_render = #include('../../../../../units/render');
return {
	init: (p) => {
		this.p = p; this.session = null; this.dialog = null; this.next_token = 0;
	},
	cancel: () => {
		const dialog = this.dialog;
		this.dialog = null; this.session = null;
		if (dialog != null) { dialog.frame.remove(); }
	},
	resolve: (session) => {
		if (this.session == null || this.session.token != session.token || !this.p.is_open() ||
			this.p.get_selection() != session.selection || this.p.get_base() != session.base ||
			this.p.game.get_player().id != session.owner || this.p.game.get_turn() != session.turn) { return false; }
		return session.base.get_owner().id == session.owner;
	},
	choose: (session) => {
		if (this.session == null || this.session.token != session.token) { return; }
		if (!this.resolve(session)) { this.cancel(); return; }
		const selected = this.dialog.choices == null ? '' : this.dialog.choices.value;
		let valid = false;
		// Re-read the authoritative available inventory. A disappeared choice
		// or a reused ID for a different unit cannot transfer an old preview.
		for (choice of this.p.get_choices()) {
			if (choice.id == selected && choice.type == 'unit') {
				for (row of session.rows) { if (row.id == selected && row.unit_id == choice.unit_id) { valid = true; } }
			}
		}
		this.cancel();
		if (valid) { this.p.select(selected); }
	},
	preview: (session) => {
		if (this.session == null || this.session.token != session.token) { return; }
		if (!this.resolve(session)) { this.cancel(); return; }
		const dialog = this.dialog;
		dialog.preview.clear();
		const selected = dialog.choices == null ? '' : dialog.choices.value;
		for (row of session.rows) {
			if (row.id == selected) {
				const render = unit_render(row.definition);
				dialog.preview.surface({align: 'top center', top: 12, width: render.w, height: render.h,
					background: render.file + ':crop(' + #to_string(render.x) + ',' + #to_string(render.y) + ',' +
						#to_string(render.x + render.w - 1) + ',' + #to_string(render.y + render.h - 1) + ')'});
				dialog.preview.text({class: 'base-screen-frame-title', text: row.name, align: 'top center', top: 105});
				dialog.preview.text({class: 'base-screen-frame-text', text: 'Cost: ' + #to_string(row.cost) + ' minerals', left: 12, top: 142});
				const definition = row.definition;
				if (#is_defined(definition.combat)) {
					const movement_type = #is_defined(definition.movement_type) ? definition.movement_type : 'land';
					dialog.preview.text({class: 'base-screen-frame-text', text: 'Movement: ' + #to_string(definition.movement) + ' (' + movement_type + ')', left: 12, top: 166});
					dialog.preview.text({class: 'base-screen-frame-text', text: 'Offense: ' + #to_string(definition.combat.offense) + '   Defense: ' + #to_string(definition.combat.defense), left: 12, top: 190});
					dialog.preview.text({class: 'base-screen-frame-text', text: 'Reactor: ' + #to_string(definition.combat.reactor), left: 12, top: 214});
					if (definition.weapon_mode == 9) { dialog.preview.text({class: 'base-screen-frame-text', text: 'Terraforming module', left: 12, top: 238}); }
				}
			}
		}
	},
	open: () => {
		this.cancel();
		const base = this.p.get_base(); const selection = this.p.get_selection();
		if (!this.p.is_open() || base == null || selection == null || base.get_owner().id != this.p.game.get_player().id) { return; }
		const rows = []; const items = [];
		const rules = this.p.game.get('starting_unit_rules'); const sea = this.p.game.get('sea_former_rule');
		const definitions = #clone(rules);
		if (sea != null) { definitions :+ #clone(sea); }
		let selected = ''; const draft = this.p.get_choice();
		for (choice of this.p.get_choices()) {
			if (choice.type == 'unit') {
				const row = {id: choice.id + '', unit_id: choice.unit_id + '', name: choice.name + '', cost: choice.cost + 0};
				row.definition = {id: row.unit_id};
				for (definition of definitions) { if (definition.id == row.unit_id) { row.definition = #clone(definition); } }
				rows :+ row; items :+ [row.id, row.name];
				if (selected == '' || row.id == draft) { selected = row.id; }
			}
		}
		this.next_token = this.next_token + 1;
		const token = this.next_token;
		const owner = base.get_owner().id + 0;
		const turn = this.p.game.get_turn();
		const session = {token: token, owner: owner, turn: turn};
		session.base = base; session.selection = selection; session.rows = rows;
		this.session = session;
		const dialog = {}; this.dialog = dialog;
		dialog.frame = this.p.ui.root.window({class: 'default-panel', align: 'center', width: 620, height: 370,
			zindex: 0.95, blocker: 'rgba(0,0,0,120)', header_height: 0});
		if (#is_defined(dialog.frame.presentation_role)) { dialog.frame.presentation_role('dialog', 'game.unit_workshop'); }
		dialog.frame.text({class: 'base-screen-frame-title', text: 'UNIT WORKSHOP', align: 'top center', top: 12});
		dialog.preview = dialog.frame.panel({class: 'default-panel-inner', left: 278, right: 12, top: 42, bottom: 52});
		dialog.choices = null;
		if (#sizeof(items) > 0) {
			const list_frame = dialog.frame.panel({left: 12, width: 254, top: 42, bottom: 52});
			const list = list_frame.scrollview({left: 0, right: 0, top: 0, bottom: 0, has_hscroll: false, vscroll_class: 'default-scroll-v'});
			dialog.choices = list.choicelist({left: 0, right: 0, top: 0, height: #sizeof(items) * 29,
				itemclass: 'popup-list-button', itemheight: 27, itempadding: 2, items: items, value: selected, keyboard: false});
			dialog.choices.on('select', (e) => { this.preview(session); return true; });
		} else {
			dialog.frame.text({class: 'base-screen-frame-text', text: 'No unit designs are available to build.', left: 14, top: 60});
		}
		dialog.ok = dialog.frame.button({class: 'game-popup-button', text: 'SELECT', left: 318, width: 138, align: 'bottom left', bottom: 12, height: 26});
		dialog.ok.on('click', (e) => { this.choose(session); return true; });
		dialog.cancel = dialog.frame.button({class: 'game-popup-button', text: 'CANCEL', left: 470, width: 138, align: 'bottom left', bottom: 12, height: 26});
		dialog.cancel.on('click', (e) => { if (this.session != null && this.session.token == token) { this.cancel(); } return true; });
		dialog.frame.on('keydown', (e) => {
			if (this.session == null || this.session.token != token) { return true; }
			if (!this.resolve(session)) { this.cancel(); return true; }
			if (e.modifiers == {}) {
				if (e.code == 'ESCAPE') { this.cancel(); }
				else if (e.code == 'ENTER') { this.choose(session); }
				else if (dialog.choices != null && (e.code == 'UP' || e.code == 'DOWN')) {
					for (let index = 0; index < #sizeof(items); index++) {
						if (items[index][0] == dialog.choices.value) {
							const next = index + (e.code == 'UP' ? (0 - 1) : 1);
							if (next >= 0 && next < #sizeof(items)) { dialog.choices.value = items[next][0]; this.preview(session); }
							break;
						}
					}
				}
			}
			return true;
		});
		dialog.frame.on('remove', (e) => { if (this.dialog == dialog) { this.dialog = null; this.session = null; } });
		this.preview(session);
	},
};
