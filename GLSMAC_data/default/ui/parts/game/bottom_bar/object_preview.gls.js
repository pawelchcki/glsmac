const colony = #include('../../../../game/colony');
const work = #include('../../../../game/terraforming');
const work_dialog = #include('../../../../game/terraforming_dialog');
const activation_dialog = #include('../../../../game/unit_activation_dialog');

return {

	get_order_unit: (activate) => {
		if (!this.is_turn_active || this.order_pending != null || this.founding_pending_id != null || this.p.modules.popup.is_shown()) { return null; }
		const id = activate && this.selected_unit_id == null ? this.order_focus_id : this.selected_unit_id;
		if (id == null || !this.um.has_unit(id)) { return null; }
		const unit = this.um.get_unit(id);
		if (unit.owner != this.p.game.get_player().id || unit.is_immovable || unit.health <= 0.0 || unit.get_tile().is_locked()) { return null; }
		return unit;
	},

	activation_choices: (focus) => {
		const result = [];
		// Retain the current command focus first, then the native tile's unit
		// order. Original ordering evidence is bounded to the recorded stack.
		const candidates = [focus];
		for (unit of focus.get_tile().get_units()) { if (unit.id != focus.id) { candidates :+ unit; } }
		for (unit of candidates) {
			if (unit.owner == this.p.game.get_player().id && !unit.is_immovable && unit.health > 0.0) {
				result :+ {id: unit.id, name: unit.get_def().name, order: unit.get_order(), movement: unit.movement + 0.0};
			}
		}
		return result;
	},

	queue_unit_order: (name, id) => {
		this.order_pending = { name: name, unit_id: id };
		this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
		this.p.game.event(name, { unit_id: id });
		return true;
	},

	activate_unit: () => {
		const focus = this.get_order_unit(true); if (focus == null) { return true; }
		const choices = this.activation_choices(focus);
		if (#sizeof(choices) < 2) { return this.queue_unit_order('unit_activate', focus.id); }
		// Validate source before opening or changing authoritative game state.
		const definition = activation_dialog.parse(this.p.glsmac.load_smac_text('xscript.txt', 'dialogs'));
		const tile = focus.get_tile();
		const selected = this.selected_unit_id; const turn = this.p.game.get_turn();
		const request = {focus: focus.id, selected: selected, owner: focus.owner,
			x: tile.x, y: tile.y, turn: turn};
		this.activation_token = this.activation_token + 1; const token = this.activation_token;
		this.p.modules.popup.set('unit_activation', {definition: definition, choices: choices});
		this.p.modules.popup.show('unit_activation', (id) => {
			if (token != this.activation_token) { return; }
			this.activation_token = this.activation_token + 1;
			if (#typeof(id) == 'Int' && this.is_turn_active && this.order_pending == null && this.founding_pending_id == null &&
				!this.p.modules.popup.is_shown() && this.p.game.get_turn() == request.turn && this.p.game.get_player().id == request.owner &&
				this.selected_unit_id == request.selected && this.order_focus_id == request.focus && this.um.has_unit(id)) {
				const unit = this.um.get_unit(id); const position = unit.get_tile();
				if (unit.owner == request.owner && !unit.is_immovable && unit.health > 0.0 && !position.is_locked() && position.x == request.x && position.y == request.y) {
					for (choice of choices) {
						if (choice.id == id && unit.get_order() == choice.order && unit.movement == choice.movement) {
							this.order_focus_id = id; this.queue_unit_order('unit_activate', id); break;
						}
					}
				}
			}
			this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
		});
		this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
		return true;
	},

	update_order_buttons: () => {
		this.hold_button.class = this.get_order_unit(false) == null ? 'unit-hold-button-disabled' : 'unit-hold-button-enabled';
		this.activate_button.class = this.get_order_unit(true) == null ? 'unit-activate-button-disabled' : 'unit-activate-button-enabled';
		for (action of ['farm', 'mine', 'forest', 'road']) {
			const button = this.work_buttons[action];
			button.class = 'unit-work-' + action + (this.get_work_unit(action) == null ? '-disabled' : '-enabled');
		}
	},

	get_work_unit: (action) => {
		const unit = this.get_order_unit(false);
		if (unit == null || unit.def != 'Formers') { return null; }
		const player = this.p.game.get_player();
		const e = {caller: player.id, data: {unit_id: unit.id, action: action, replace_existing: true}}; e.game = this.p.game;
		return #is_defined(work.validate(e)) ? null : unit;
	},

	queue_work: (unit, action, confirmed) => {
		this.order_pending = {name: 'unit_terraform', unit_id: unit.id, action: action};
		this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
		const data = {unit_id: unit.id, action: action}; if (confirmed) { data.replace_existing = true; }
		this.p.game.event('unit_terraform', data);
		return true;
	},

	submit_work: (action) => {
		const unit = this.get_work_unit(action); if (unit == null) { return false; }
		if (!work.needs_confirmation(this.p.game, unit, action)) { return this.queue_work(unit, action, false); }
		const tile = unit.get_tile(); const turn = this.p.game.get_turn();
		const request = {id: unit.id, tile_x: tile.x, tile_y: tile.y, turn: turn,
			movement: unit.movement + 0.0, moved: unit.moved_this_turn == true}; request.unit = unit;
		const document = this.p.glsmac.load_smac_text('xscript.txt', 'dialogs');
		const rules = this.p.game.get('terraforming_rules');
		const definition = work_dialog.render(work_dialog.parse(document), rules.farm.name);
		this.work_request_token = this.work_request_token + 1; const token = this.work_request_token;
		this.p.modules.popup.set('terraforming_replacement', {definition: definition});
		this.p.modules.popup.show('terraforming_replacement', (confirmed) => {
			if (this.work_request_token != token) { return; }
			this.work_request_token = this.work_request_token + 1;
			if (confirmed) {
				const current = this.get_work_unit(action);
				if (current != null && current == request.unit && this.p.game.get_turn() == request.turn &&
					current.movement == request.movement && current.moved_this_turn == request.moved) {
					const position = current.get_tile();
					if (position.x == request.tile_x && position.y == request.tile_y && work.needs_confirmation(this.p.game, current, action)) { this.queue_work(current, action, true); }
				}
			}
			this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
		});
		this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
		return true;
	},

	submit_unit_order: (name) => {
		if (name == 'unit_activate') { return this.activate_unit(); }
		const unit = name == 'unit_skip_turn' ? this.get_skip_unit() : this.get_order_unit(name == 'unit_activate');
		if (unit == null) { return name != 'unit_skip_turn' || this.selected_unit_id != null; }
		return this.queue_unit_order(name, unit.id);
	},

	finish_unit_order: (e) => {
		if (this.order_pending == null || e.name != this.order_pending.name || e.caller != this.p.game.get_player().id) { return false; }
		if (!#is_defined(e.data) || #typeof(e.data) != 'Object' || !#is_defined(e.data.unit_id) || e.data.unit_id != this.order_pending.unit_id) { return false; }
		if (this.order_pending.name == 'unit_terraform' &&
			(!#is_defined(e.data.action) || #typeof(e.data.action) != 'String' || e.data.action != this.order_pending.action)) { return false; }
		if (!#is_defined(e.success) || #typeof(e.success) != 'Bool') { return false; }
		const pending = this.order_pending; this.order_pending = null;
		if (e.success && this.um.has_unit(pending.unit_id)) {
			const unit = this.um.get_unit(pending.unit_id);
			if (this.rendered_unit_id == unit.id) { this.set_lines(unit); }
			if (pending.name == 'unit_activate') {
				if (this.selected_unit_id == unit.id || (this.selected_unit_id == null && this.order_focus_id == unit.id)) { this.p.game.select_unit(unit); }
			} else if (this.selected_unit_id == unit.id) {
				this.selected_unit_id = null;
				// Retain the real frontend's next-unit selection when other units
				// need orders. With none left, explicitly select this actual tile.
				if (!this.um.has_ready_unit(this.p.game.get_player().id)) { this.p.game.select_tile(unit.get_tile()); }
			}
		}
		this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
	},

	get_found_unit: () => {
		if (this.selected_unit_id == null || this.founding_pending_id != null || this.order_pending != null || !this.is_turn_active || this.p.modules.popup.is_shown()) {
			return null;
		}
		if (!this.um.has_unit(this.selected_unit_id)) {
			this.selected_unit_id = null;
			return null;
		}
		const unit = this.um.get_unit(this.selected_unit_id);
		const player_id = this.p.game.get_player().id;
		if (unit.owner != player_id || unit.def != 'ColonyPod') { return null; }
		if (colony.validate_action(this.p.game, unit.id, player_id) != #undefined) { return null; }
		return unit;
	},

	found_selected_base: () => {
		const unit = this.get_found_unit();
		if (unit != null) {
			this.founding_pending_id = unit.id;
			this.update_found_button();
			const base = unit.get_tile().get_base();
			this.founding_pending_name = base == null ? 'found_base' : 'join_base';
			if (base == null) { this.p.game.event('found_base', { unit_id: unit.id }); }
			else { this.p.game.event('join_base', { unit_id: unit.id, base_id: base.id }); }
		}
		return true;
	},

	update_found_button: () => {
		const available = this.get_found_unit() != null;
		if (available != this.found_available) {
			this.found_available = available;
			this.found_button.class = available ? 'unit-found-button-enabled' : 'unit-found-button-disabled';
		}
	},

	get_skip_unit: () => {
		if (this.selected_unit_id == null || this.selected_unit_id == this.founding_pending_id || this.order_pending != null || !this.is_turn_active || this.p.modules.popup.is_shown()) {
			return null;
		}
		if (!this.um.has_unit(this.selected_unit_id)) {
			this.selected_unit_id = null;
			return null;
		}
		const unit = this.um.get_unit(this.selected_unit_id);
		if (unit.owner != this.p.game.get_player().id || unit.is_immovable || unit.health <= 0.0 || !unit.needs_orders() || unit.get_tile().is_locked()) {
			return null;
		}
		return unit;
	},

	update_skip_button: () => {
		const available = this.get_skip_unit() != null;
		if (available != this.skip_available) {
			this.skip_available = available;
			this.skip_button.class = available ? 'unit-skip-button-enabled' : 'unit-skip-button-disabled';
		}
	},

	get_morale: (type, value) => {
		if (!#is_defined(this.moralesets[type])) {
			this.moralesets[type] = this.um.get_moraleset(type);
		}
		if (value >= #sizeof(this.moralesets[type])) {
			#print('Morale not found: ' + type + '/' + #to_string(value));
			return '(???)';
		}
		return this.moralesets[type][value];
	},

	format_movement: (movement) => {
		const rounded = #to_float(#round(movement * 100.0)) / 100.0;
		const integral = #round(rounded);
		return rounded == #to_float(integral) ? #to_string(integral) : #to_string(rounded);
	},

	set_image: (object) => {
		if (object == null) {
			if (this.last_object_class != null) {
				this.preview.remove();
				this.preview = null;
			}
			this.last_object_class = null;
			return;
		}
		const cls = #classof(object);
		if (this.last_object_class != cls) {
			if (this.last_object_class != null) {
				this.preview.remove();
				this.preview = null;
			}
			this.last_object_class = cls;
		}
		let type = '';
		let data = {};
		switch (cls) {
			case 'Unit': {
				type = 'unit-preview';
				data.unit = object;
				break;
			}
			case 'Base': {
				type = 'base-preview';
				data.base = object;
				break;
			}
			default: {
				throw Error('Unknown object class: ' + cls);
			}
		}
		if (this.preview == null) {
			this.preview = this.frame.widget({
				class: 'bottombar-object-preview',
				type: type,
				data: data,
			});
		} else {
			this.preview.data = data;
		}
	},

	set_lines: (object) => {
		this.rendered_unit_id = null;
		this.movement_label = null;
		this.order_label = null;

		if (#is_defined(this.lines)) {
			this.lines.remove(); // TODO: fix this.lines.clear();
		}

		if (object == null) {
			this.lines = #undefined;
			return;
		}

		this.lines = this.frame.listview({
			left: 3,
			right: 3,
			top: 75,
			bottom: 48,
			itemsize: 13,
		});

		const f_line = (text, size, align) => {
			let left = #undefined;
			if (align == 'left') {
				left = 3;
			}
			return this.lines.text({
				align: 'top ' + align,
				color: 'rgb(116,156,56)',
				font: 'arialnb.ttf:' + #to_string(size),
				text: text,
				left: left,
			});
		};

		switch (#classof(object)) {
			case 'Unit': {
				const def = object.get_def();
				this.rendered_unit_id = object.id;
				this.rendered_movement = object.movement + 0.0;
				this.rendered_order = object.get_order();

				f_line(def.name, 13, 'center');

				if (def.id == 'ColonyPod' || (#is_defined(def.combat) && def.combat.kind == 'civilian')) {
					f_line('Civilian', 12, 'left');
				} else {
					f_line(this.p.get_stats_str(object), 12, 'center');
					f_line(this.get_morale(#is_defined(def.morale) ? def.morale : 'NATIVE', object.morale), 12, 'left');
				}

				if (!object.is_immovable) {
					this.movement_label = f_line(object.movement > 0.0 ? 'Moves: ' + this.format_movement(object.movement) : 'ALREADY MOVED', 12, 'left');
				}
				if (this.rendered_order != 'NO_ORDERS' && this.rendered_order != 'HOLD' && this.rendered_order != 'SENTRY' && this.rendered_order != 'TERRAFORM') { throw Error('Unknown unit order: ' + this.rendered_order); }
				let label = this.rendered_order == 'SENTRY' ? 'SENTRY' : (this.rendered_order == 'HOLD' ? 'HOLD' : 'NO ORDERS');
				if (this.rendered_order == 'TERRAFORM') {
					const state = object.get_terraforming(); const rules = this.p.game.get('terraforming_rules'); const rule = rules[state.action];
					label = rule.order;
				}
				this.order_label = f_line(label, 12, 'left');

				break;
			}
			case 'Base': {

				f_line(object.name, 14, 'center');

				f_line('Producing:', 14, 'left'); // TODO

				break;
			}
			default: {
				throw Error('Unknown object class: ' + #classof(object));
			}
		}
	},

	show: (object) => {
		this.set_image(object);
		this.set_lines(object);
	},

	init: (p) => {

		this.preview = null;
		this.last_object_class = null;
		this.moralesets = {};
		this.selected_unit_id = null;
		this.order_focus_id = null;
		this.order_pending = null;
		this.rendered_unit_id = null;
		this.is_turn_active = true;
		this.skip_available = false;
		this.founding_pending_id = null; this.founding_pending_name = null;
		this.found_available = false;
		this.work_request_token = #is_defined(this.work_request_token) ? this.work_request_token + 1 : 0;
		this.activation_token = #is_defined(this.activation_token) ? this.activation_token + 1 : 0;

		this.p = p;
		this.um = p.game.get_um();

		p.ui.class('bottombar-object-preview').set({
			align: 'top center',
			top: 1,
			width: 100,
			height: 75,
		});

		const frame_outer = p.el.panel({
			class: 'bottombar-panel',
			align: 'top left',
			top: 59,
			bottom: 7,
			left: 6,
			width: 129,
		});
		this.frame = frame_outer.panel({
			class: 'bottombar-panel-inner',
		});
		this.frame.on('remove', (e) => { this.work_request_token = this.work_request_token + 1; });
		this.frame.on('remove', (e) => {
			this.activation_token = this.activation_token + 1;
			if (#is_defined(p.modules.popup.popups) && #is_defined(p.modules.popup.popups.unit_activation)) { p.modules.popup.hide('unit_activation'); }
		});

		p.ui.class('unit-skip-button').set({
			left: 63,
			right: 3,
			bottom: 3,
			height: 21,
			align: 'bottom',
			font: 'arialnb.ttf:11',
			border: 'rgb(49,78,44),1',
		});
		p.ui.class('unit-skip-button-enabled').extend('unit-skip-button').set({
			color: 'rgb(164,196,132)',
			background: 'interface.pcx:crop(47,587,70,610)',
			sound: 'ok.wav',
			volume: 0.5,
			_hover: { border: 'rgb(120,164,212),1' },
			_active: { color: 'white' },
		});
		p.ui.class('unit-skip-button-disabled').extend('unit-skip-button').set({
			color: 'rgb(80,95,90)',
			background: 'rgb(22,36,30)',
		});
		this.skip_button = this.frame.button({
			class: 'unit-skip-button-disabled',
			text: 'SKIP TURN',
		});
		this.skip_button.on('click', (e) => { this.submit_unit_order('unit_skip_turn'); return true; });
		for (name of ['hold', 'activate']) {
			const command = name;
			const left = command == 'hold';
			const cls = 'unit-' + command + '-button';
			p.ui.class(cls + '-enabled').extend('unit-skip-button-enabled').set({ bottom: 27, height: 18, font: 'arialnb.ttf:10', left: left ? 3 : 63, right: left ? 63 : 3 });
			p.ui.class(cls + '-disabled').extend('unit-skip-button-disabled').set({ bottom: 27, height: 18, font: 'arialnb.ttf:10', left: left ? 3 : 63, right: left ? 63 : 3 });
			const button = this.frame.button({ class: cls + '-disabled', text: #uppercase(command) });
			button.on('click', (e) => { this.submit_unit_order('unit_' + command); return true; });
			if (left) { this.hold_button = button; } else { this.activate_button = button; }
		}
		this.work_buttons = {}; let work_index = 0;
		for (name of ['farm', 'mine', 'forest', 'road']) {
			const action = name; const cls = 'unit-work-' + action;
			for (state of ['enabled', 'disabled']) {
				p.ui.class(cls + '-' + state).extend('unit-skip-button-' + state).set({bottom: 46, height: 14,
					left: 2 + work_index * 30, right: 92 - work_index * 30, font: 'arialnb.ttf:8'});
			}
			const button = this.frame.button({class: cls + '-disabled', text: #uppercase(action)});
			button.on('click', (e) => { this.submit_work(action); return true; });
			this.work_buttons[action] = button; work_index++;
		}
		p.ui.class('unit-found-button').extend('unit-skip-button').set({
			left: 3,
			right: 63,
		});
		p.ui.class('unit-found-button-enabled').extend('unit-found-button').set({
			color: 'rgb(164,196,132)',
			background: 'interface.pcx:crop(47,587,70,610)',
			sound: 'ok.wav', volume: 0.5,
			_hover: { border: 'rgb(120,164,212),1' },
			_active: { color: 'white' },
		});
		p.ui.class('unit-found-button-disabled').extend('unit-found-button').set({
			color: 'rgb(80,95,90)', background: 'rgb(22,36,30)',
		});
		this.found_button = this.frame.button({ class: 'unit-found-button-disabled', text: 'FOUND BASE' });
		this.found_button.on('click', (e) => { return this.found_selected_base(); });
		// A panel-local listener is removed with this DOM owner. Child-first
		// routing lets modal windows consume keys before this command panel.
		this.frame.on('keydown', (e) => {
			if (e.modifiers == {} && !this.p.modules.popup.is_shown() && this.is_turn_active) {
				if (e.code == 'H') { return this.submit_unit_order('unit_hold'); }
				if (e.code == 'L') { return this.submit_unit_order('unit_sentry'); }
				if (e.code == 'A') { return this.submit_unit_order('unit_activate'); }
				if (e.code == 'SPACE') { return this.submit_unit_order('unit_skip_turn'); }
				if (e.code == 'F') { return this.submit_work('farm'); }
				if (e.code == 'M') { return this.submit_work('mine'); }
				if (e.code == 'R') { return this.submit_work('road'); }
			}
			if (e.code == 'F' && e.modifiers == {shift: true} && !this.p.modules.popup.is_shown() && this.is_turn_active) { return this.submit_work('forest'); }
			if (e.code == 'B' && e.modifiers == {} && !this.p.modules.popup.is_shown()) {
				return this.found_selected_base();
			}
			return false;
		});
		this.frame.listen(p.game, 'event_result', (e) => {
			this.finish_unit_order(e);
			if (e.name == this.founding_pending_name && e.caller == this.p.game.get_player().id && e.data.unit_id == this.founding_pending_id) {
				this.founding_pending_id = null; this.founding_pending_name = null;
				this.update_found_button();
				this.update_skip_button();
			}
		});

		this.frame.listen(p.game, 'unit_select', (e) => {
			this.selected_unit_id = e.unit.id;
			this.order_focus_id = e.unit.id;
			this.update_order_buttons();
			this.update_skip_button();
			this.update_found_button();
		});
		for (event of ['tile_select', 'base_select', 'turn']) {
			const kind = event;
			this.frame.listen(p.game, event, (e) => {
				this.selected_unit_id = null;
				let tile = null;
				if (kind == 'tile_select' && #is_defined(e.tile)) { tile = e.tile; }
				if (kind == 'base_select' && #is_defined(e.base)) { tile = e.base.get_tile(); }
				if (tile != null && this.order_focus_id != null && this.um.has_unit(this.order_focus_id)) {
					if (this.um.get_unit(this.order_focus_id).get_tile() != tile) { this.order_focus_id = null; }
				}
				this.update_order_buttons();
				this.update_skip_button();
				this.update_found_button();
			});
		}
		this.frame.listen(p.game, 'turn_status', (e) => {
			this.is_turn_active = e.status == 'active' || e.status == 'turn_complete';
			this.update_order_buttons();
			this.update_skip_button();
			this.update_found_button();
		});
		// Movement and temporary tile locks change without a scripted UI update
		// event. This timer belongs to the panel and stops when the UI is removed.
		this.frame.timer(100, () => {
			this.update_order_buttons();
			this.update_skip_button();
			this.update_found_button();
			if (this.rendered_unit_id != null && this.um.has_unit(this.rendered_unit_id)) {
				const unit = this.um.get_unit(this.rendered_unit_id);
				if (unit.movement != this.rendered_movement || unit.get_order() != this.rendered_order) { this.set_lines(unit); }
			}
			return true;
		});

		this.frame.listen(p.map, 'unit_preview', (e) => {
			this.show(e.unit);
		});
		this.frame.listen(p.map, 'base_preview', (e) => {
			this.show(e.base);
		});

	},

};
