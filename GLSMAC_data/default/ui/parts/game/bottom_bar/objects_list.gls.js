// Monotonic across panel removal/recreation: an old acknowledgement cannot
// collide with a successor panel's first request.
let next_management_request = 0;
return {

	resolve_object: (type, id) => {
		if (type == 'Unit') {
			const um = this.p.game.get_um();
			return um.has_unit(id) ? um.get_unit(id) : null;
		}
		if (type == 'Base') {
			for (base of this.p.game.get_bm().get_bases()) {
				if (base.id == id) { return base; }
			}
		}
		return null;
	},

	get_selected_object: () => {
		return this.selected_type == null ? null : this.resolve_object(this.selected_type, this.selected_id);
	},

	clear_selection: () => {
		this.selected_type = null;
		this.selected_id = null;
		this.set_active_item(null);
	},

	bind_object_input: (item, type, id) => {
		// Delayed input retains scalar identity, never an entity wrapper that
		// native despawn or rollback can invalidate between frames.
		item.on('mousedown', (e) => {
			const object = this.resolve_object(type, id);
			if (object != null) {
				this.set_active_item(null);
				if (type == 'Unit') {
					this.p.modules.popup.hide('base_screen');
					this.p.game.select_unit(object);
				} else if (this.selected_type != type || this.selected_id != id) {
					this.p.game.select_base(object);
				}
			}
			return true;
		});
		item.on('mouseover', (e) => {
			this.p.sections.object_preview.show(this.resolve_object(type, id));
			return true;
		});
		item.on('mouseout', (e) => {
			this.p.sections.object_preview.show(this.get_selected_object());
			return true;
		});
	},

	base_close_callback: (unit_id, base_id) => {
		return (result) => {
			this.clear_selection();
			const unit = unit_id == null ? null : this.resolve_object('Unit', unit_id);
			const base = this.resolve_object('Base', base_id);
			if (unit != null && base != null && unit.owner == this.p.game.get_player().id && unit.get_tile() == base.get_tile()) {
				this.p.game.select_unit(unit);
			} else if (base != null) {
				this.p.game.select_tile(base.get_tile());
			} else if (this.selected_tile != null) {
				this.p.game.select_tile(this.selected_tile);
			}
		};
	},

	schedule_base_selection: (id, continuation) => {
		// Only ordinary-to-ordinary repeats share a command. A report
		// continuation belongs to its own UI session; entering or leaving that
		// intent needs a fresh token so an old response cannot consume it.
		if (!#is_defined(continuation) && this.management_pending != null && !#is_defined(this.management_pending.continuation) && this.management_pending.base_id == id && this.management_pending.turn_id == this.p.game.get_turn()) { return; }
		this.selection_epoch = this.selection_epoch + 1;
		this.management_pending = null;
		const epoch = this.selection_epoch;
		this.management_scheduled_epoch = epoch;
		let previous_unit_id = this.selected_type == 'Unit' ? this.selected_id : null;
		if (previous_unit_id == null && #is_defined(this.p.sections.object_preview.order_focus_id)) {
			previous_unit_id = this.p.sections.object_preview.order_focus_id;
		}
		this.set_active_item(null);
		// Own the deferred callback so removed panels cannot open old dialogs.
		this.frame.timer(0, () => {
			if (epoch != this.selection_epoch) { return false; }
			this.management_scheduled_epoch = null;
			const base = this.resolve_object('Base', id);
			if (base == null || (#is_defined(continuation) && !continuation.can_open(base))) {
				if (#is_defined(continuation)) { continuation.rejected(); }
				return false;
			}
			if (base.get_owner().id != this.p.game.get_player().id) {
				this.open_base_selection(base, previous_unit_id);
				return false;
			}
			next_management_request++;
			const turn = this.p.game.get_turn();
			const request = {base_id: id, turn_id: turn, request_token: next_management_request};
			const pending = {base_id: id, turn_id: request.turn_id, request_token: request.request_token, epoch: epoch, previous_unit_id: previous_unit_id};
			pending.base = base; this.management_pending = pending;
			if (#is_defined(continuation)) { pending.continuation = continuation; }
			this.p.game.event('reconcile_base_citizens', request);
			return false;
		});
	},

	open_base_selection: (base, previous_unit_id, continuation) => {
		this.refresh_tile(base.get_tile());
		const key = #to_string(base.id);
		if (#is_defined(this.bases[key])) { this.set_active_item(this.bases[key].item); }
		this.selected_type = 'Base'; this.selected_id = base.id;
		const data = {}; data.base = base;
		this.p.modules.popup.set('base_screen', data);
		const restore = this.base_close_callback(previous_unit_id, base.id);
		if (#is_defined(continuation)) {
			this.p.modules.popup.show('base_screen', (result) => { restore(result); continuation.closed(); });
		} else { this.p.modules.popup.show('base_screen', restore); }
	},

	finish_base_management: (e) => {
		const pending = this.management_pending;
		if (pending == null || e.name != 'reconcile_base_citizens' || e.caller != this.p.game.get_player().id || e.data.base_id != pending.base_id || e.data.turn_id != pending.turn_id || e.data.request_token != pending.request_token) { return; }
		this.management_pending = null;
		const rejected = () => { if (#is_defined(pending.continuation)) { pending.continuation.rejected(); } };
		if (!e.success || pending.epoch != this.selection_epoch || pending.turn_id != this.p.game.get_turn()) { rejected(); return; }
		// A new modal owns input while this command was in flight. Existing
		// base management may remain shown during deliberate base navigation.
		const popup = this.p.modules.popup;
		if (popup.is_shown() && (!#is_defined(popup.popup) || popup.popup == null || popup.popup.id != 'base_screen')) { rejected(); return; }
		const base = this.resolve_object('Base', pending.base_id);
		if (base == null || base != pending.base || base.get_owner().id != this.p.game.get_player().id ||
			(#is_defined(pending.continuation) && !pending.continuation.can_open(base))) { rejected(); return; }
		if (#is_defined(pending.continuation)) { this.open_base_selection(base, pending.previous_unit_id, pending.continuation); }
		else { this.open_base_selection(base, pending.previous_unit_id); }
	},

	set_active_item: (item) => {
		if (this.active_item == item) {
			return;
		}
		if (this.active_item != null) {
			this.active_item.active = false;
		}

		this.active_item = item;

		if (this.active_item != null) {
			this.active_item.active = true;
		}
	},

	add_object: (object, left) => {
		const cls = #classof(object);
		let type = null;
		let data = {};
		let top = 0;
		switch (cls) {
			case 'Unit': {
				type = 'unit-preview';
				data.unit = object;
				top = -2;
				break;
			}
			case 'Base': {
				type = 'base-preview';
				data.base = object;
				top = 2;
				break;
			}
			default: {
				throw Error('Unknown object type: ' + #classof(object));
			}
		}

		let item = this.list.panel({
			class: 'bottombar-objects-list-item',
			id: 'item_' + cls,
			left: left,
		});
		item.widget({
			type: type,
			data: data,
			class: 'bottombar-objects-list-item-preview',
			top: top,
		});
		const key = #to_string(object.id);
		const entry = { id: object.id };
		entry.item = item;
		switch (cls) {
			case 'Unit': {
				this.units[key] = entry;
				item.text({
					class: 'bottombar-objects-list-item-text',
					text: parent.p.get_stats_str(object),
				});
				break;
			}
			case 'Base': {
				this.bases[key] = entry;
				break;
			}
		}
		this.bind_object_input(item, cls, object.id);
		if (cls == this.selected_type && object.id == this.selected_id) {
			this.set_active_item(item);
		}
	},

	refresh_tile: (tile) => {
		let changed = tile != this.selected_tile;
		const base = tile.get_base();
		let previous_bases = 0;
		for (key in this.bases) { previous_bases++; }
		if (base == null) {
			if (previous_bases != 0) { changed = true; }
		} else {
			const key = #to_string(base.id);
			if (previous_bases != 1 || !#is_defined(this.bases[key])) { changed = true; }
		}
		let current_units = 0;
		for (unit of tile.get_units()) {
			current_units++;
			const key = #to_string(unit.id);
			if (!#is_defined(this.units[key])) { changed = true; }
		}
		let previous_units = 0;
		for (key in this.units) { previous_units++; }
		if (current_units != previous_units) { changed = true; }
		if (changed) { this.update_tile(tile); }
	},

	update_tile: (tile) => {

		this.set_active_item(null);

		if (#is_defined(this.list)) {
			this.list.remove();
			this.set_active_item(null);
			this.units = {};
			this.bases = {};
		}
		this.list = this.frame.scrollview({
			left: 2,
			right: 2,
			top: 1,
			bottom: -8,
			padding: 2,
			has_hscroll: true,
			has_vscroll: false,
		});

		this.list_width = 0;

		const base = tile.get_base();

		if (base != null) {
			this.add_object(base, this.list_width);
			this.list_width = this.list_width + this.object_width;
		}

		for (unit of tile.get_units()) {
			this.add_object(unit, this.list_width);
			this.list_width = this.list_width + this.object_width;
		}

		this.selected_tile = tile;
	},

	init: (p) => {

		this.selected_tile = null;
		this.selected_type = null;
		this.selected_id = null;
		this.selection_epoch = 0;
		this.management_pending = null;
		this.management_scheduled_epoch = null;
		this.units = {};
		this.bases = {};
		this.active_item = null;
		this.is_turn_active = true;
		this.turn_status = 'active';

		this.p = p;

		this.object_width = 57;

		p.ui.class('bottombar-objects-list-item').set({
			width: parent.object_width,
			height: 46,
			_hover: {
				border: 'rgb(14,40,49),1',
			},
			_active: {
				border: 'rgb(28,80,99),1',
			},
		});

		p.ui.class('bottombar-objects-list-item-preview').set({
			width: parent.object_width,
			height: 40,
		});

		p.ui.class('bottombar-objects-list-item-text').set({
			font: 'arialnb.ttf:12',
			color: 'rgb(235,235,235)',
			align: 'bottom center',
			bottom: 4,
		});

		const frame_outer = p.el.panel({
			class: 'bottombar-panel',
			align: 'bottom',
			bottom: 7,
			left: 245,
			right: 258,
			height: 58,
		});
		this.frame = frame_outer.panel({
			class: 'bottombar-panel-inner',
		});
		this.frame.on('remove', (e) => { this.selection_epoch = this.selection_epoch + 1; this.management_pending = null; this.management_scheduled_epoch = null; });
		this.frame.listen(p.game, 'event_result', (e) => { this.finish_base_management(e); });

		this.frame.listen(p.map, 'unit_preview', (e) => {
			if (e.unit != null) {
				const tile = e.unit.get_tile();
				this.refresh_tile(tile);
			}
		});

		this.frame.listen(p.map, 'base_preview', (e) => {
			const tile = e.base.get_tile();
			this.refresh_tile(tile);
		});

		this.frame.listen(p.map, 'tile_preview', (e) => {
			this.refresh_tile(e.tile);
		});

		this.frame.listen(p.game, 'unit_select', (e) => {
			this.selection_epoch = this.selection_epoch + 1;
			this.management_pending = null;
			this.management_scheduled_epoch = null;
			this.p.modules.popup.hide('base_screen');
			this.refresh_tile(e.unit.get_tile());
			const key = #to_string(e.unit.id);
			if (#is_defined(this.units[key])) { this.set_active_item(this.units[key].item); }
			this.selected_type = 'Unit'; this.selected_id = e.unit.id;
		});

		this.frame.listen(p.game, 'base_select', (e) => {
			this.schedule_base_selection(e.base.id);
		});

		this.frame.listen(p.game, 'tile_select', (e) => {
			this.selection_epoch = this.selection_epoch + 1;
			this.management_pending = null;
			this.management_scheduled_epoch = null;
			this.clear_selection();
		});

		this.frame.listen(p.game, 'turn', (e) => {
			this.selection_epoch = this.selection_epoch + 1;
			this.management_pending = null;
			this.management_scheduled_epoch = null;
			this.clear_selection();
		});

		this.frame.listen(p.game, 'turn_status', (e) => {
			this.turn_status = e.status;
			this.is_turn_active = e.status == 'active' || e.status == 'turn_complete';
		});

		this.frame.on('keydown', (e) => {
			if (e.code == 'ESCAPE' && e.modifiers == {} && (this.management_pending != null || this.management_scheduled_epoch != null)) {
				this.selection_epoch = this.selection_epoch + 1; this.management_pending = null; this.management_scheduled_epoch = null; return true;
			}
			if (
				!this.p.modules.popup.is_shown() && // TODO: make universal key overrides in popups
				this.is_turn_active && // TODO: override by turn complete button
				e.modifiers == {} &&
				(e.code == 'ENTER' || e.code == 'SPACE')
			) {
				// Enter at the paused ready boundary belongs to the real turn
				// control. Space with no command-selected unit opens its base.
				if (e.code == 'ENTER' && this.turn_status == 'turn_complete') { return false; }
				if (e.code == 'SPACE' && this.p.sections.object_preview.selected_unit_id != null) { return false; }
				// open base screen if base is present
				for (base of this.bases) {
					const current = this.resolve_object('Base', base.id);
					if (current != null && (e.code != 'SPACE' || current.get_owner().id == this.p.game.get_player().id)) { this.set_active_item(null); this.p.game.select_base(current); return true; }
				}
				if (e.code == 'SPACE') { return true; }
				if (this.get_selected_object() == null) {
					// select first unit if nothing is selected
					for (unit of this.units) {
						const current = this.resolve_object('Unit', unit.id);
						if (current != null) { this.set_active_item(null); this.p.game.select_unit(current); return true; }
					}
				}
				return true;
			}
			return false;
		});

	},

};
