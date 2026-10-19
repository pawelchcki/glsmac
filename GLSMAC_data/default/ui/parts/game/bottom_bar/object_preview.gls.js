const colony = #include('../../../../game/colony');

return {

	get_order_unit: (activate) => {
		if (!this.is_turn_active || this.order_pending != null || this.founding_pending_id != null || this.p.modules.popup.is_shown()) { return null; }
		const id = activate && this.selected_unit_id == null ? this.order_focus_id : this.selected_unit_id;
		if (id == null || !this.um.has_unit(id)) { return null; }
		const unit = this.um.get_unit(id);
		if (unit.owner != this.p.game.get_player().id || unit.is_immovable || unit.health <= 0.0 || unit.get_tile().is_locked()) { return null; }
		return unit;
	},

	update_order_buttons: () => {
		this.hold_button.class = this.get_order_unit(false) == null ? 'unit-hold-button-disabled' : 'unit-hold-button-enabled';
		this.activate_button.class = this.get_order_unit(true) == null ? 'unit-activate-button-disabled' : 'unit-activate-button-enabled';
	},

	submit_unit_order: (name) => {
		const unit = name == 'unit_skip_turn' ? this.get_skip_unit() : this.get_order_unit(name == 'unit_activate');
		if (unit == null) { return name != 'unit_skip_turn' || this.selected_unit_id != null; }
		this.order_pending = { name: name, unit_id: unit.id };
		this.update_order_buttons(); this.update_skip_button(); this.update_found_button();
		this.p.game.event(name, { unit_id: unit.id });
		return true;
	},

	finish_unit_order: (e) => {
		if (this.order_pending == null || e.name != this.order_pending.name || e.caller != this.p.game.get_player().id || e.data.unit_id != this.order_pending.unit_id) { return false; }
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
		if (colony.validate(this.p.game, unit.id, player_id) != #undefined) { return null; }
		return unit;
	},

	found_selected_base: () => {
		const unit = this.get_found_unit();
		if (unit != null) {
			this.founding_pending_id = unit.id;
			this.update_found_button();
			// Only the authoritative event can consume the pod and create a base.
			this.p.game.event('found_base', { unit_id: unit.id });
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
			this.moralesets[type] = this.um.get_moraleset('NATIVE');
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

				if (def.id == 'ColonyPod') {
					f_line('Civilian', 12, 'left');
				} else {
					f_line(this.p.get_stats_str(object), 12, 'center');
					f_line(this.get_morale('NATIVE', object.morale), 12, 'left');
				}

				if (!object.is_immovable) {
					this.movement_label = f_line(object.movement > 0.0 ? 'Moves: ' + this.format_movement(object.movement) : 'ALREADY MOVED', 12, 'left');
				}
				if (this.rendered_order != 'NO_ORDERS' && this.rendered_order != 'HOLD') { throw Error('Unknown unit order: ' + this.rendered_order); }
				this.order_label = f_line(this.rendered_order == 'HOLD' ? 'HOLD' : 'NO ORDERS', 12, 'left');

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
		this.founding_pending_id = null;
		this.found_available = false;

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
				if (e.code == 'A') { return this.submit_unit_order('unit_activate'); }
				if (e.code == 'SPACE') { return this.submit_unit_order('unit_skip_turn'); }
			}
			if (e.code == 'B' && e.modifiers == {} && !this.p.modules.popup.is_shown()) {
				return this.found_selected_base();
			}
			return false;
		});
		this.frame.listen(p.game, 'event_result', (e) => {
			this.finish_unit_order(e);
			if (e.name == 'found_base' && e.caller == this.p.game.get_player().id && e.data.unit_id == this.founding_pending_id) {
				this.founding_pending_id = null;
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
