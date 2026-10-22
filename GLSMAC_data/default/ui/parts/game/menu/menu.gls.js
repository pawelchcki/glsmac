return {

	menu_width: 139,
	child_width: 320,
	item_height: 18,

	available_menus: [
		'left_menu',
		'left_menu_game',
		'right_menu',
	],

	init: (p) => {

		// Validate every required source before mounting any controls. The
		// native loader owns caching and errors; no labels are fabricated here.
		this.headers = #include('definitions')(p.glsmac);
		this.ui = p.ui;
		this.game = #is_defined(p.game) ? p.game : null;
		this.selected_unit_id = null;
		this.selected_tile = null;
		this.bottom_bar_height = #is_defined(p.modules) ? p.modules.bottom_bar.height : 256;
		this.menu_defs = {};
		this.menus = {};

		this.on_close_handlers = [];

		p.ui.class('game-menu').set({
			width: parent.menu_width,
			background: 'interface.pcx:crop(439, 64, 458, 83)',
		});
		p.ui.class('game-menu-top-border').set({
			align: 'top',
			left: 0,
			right: 0,
			top: -4,
			height: 5,
			background: 'console2_a.pcx:crop(0, 0, 138, 4)',
		});
		p.ui.class('game-menu-bottom-border').set({
			align: 'bottom',
			left: 0,
			right: 0,
			bottom: -4,
			height: 5,
			background: 'console2_a.pcx:crop(0, 0, 138, 4):flipv:fliph',
		});
		p.ui.class('game-menu-item').set({
			font: 'arialnb.ttf:17',
			color: 'rgb(176, 212, 235)',
			height: 17,
			_hover: {
				background: 'console_x2_a.pcx:crop(1, 219, 106, 228)',
				color: 'rgb(228, 104, 24)',
			},
			_active: {
				background: 'console_x2_a.pcx:crop(1, 249, 106, 258)',
				color: 'black',
			},
		});
		p.ui.class('game-menu-separator').set({
			left: 4,
			right: 4,
			height: 1,
			background: 'rgb(49, 78, 44)',
		});

		const controller = this;
		const row_height = this.item_height;
		const root_width = this.menu_width;
		const pp = {
			glsmac: p.glsmac,
			ui: p.ui,
			maybe_quit: p.maybe_quit,
			create: (entries, width) => {

				let top = 0;
				const items = [];
				const rows = [];

				const menu = p.ui.root.panel({
					class: 'game-menu',
					zindex: 0.9,
					width: #is_defined(width) ? width : root_width,
					height: #sizeof(entries) * row_height,
				});
				menu.hide();
				menu.surface({
					class: 'game-menu-top-border',
				});
				menu.surface({
					class: 'game-menu-bottom-border',
				});

				let active_entry = null;
				let active_item = null;

				for (e of entries) {
					const entry = e; // TODO: fix
					if (#is_defined(entry.separator) && entry.separator) {
						const separator = menu.surface({class: 'game-menu-separator', top: top + row_height / 2});
						const row = {}; row.entry = entry; row.el = separator; rows :+ row;
						top += row_height;
						continue;
					}
					const item = menu.button({
						class: 'game-menu-item',
						text: entry.label,
						top: top,
					});
					if (#is_defined(entry.dark) && entry.dark) { item.color = 'black'; }
					const control = {}; control.entry = entry; control.el = item; items :+ control;
					rows :+ control;
					item.on('click', (e) => {
						if (active_entry != null) {
							if (#is_defined(active_entry.close)) {
								active_entry.close();
							}
							active_item.active = false;
						}
						active_entry = entry;
						active_item = item;
						active_item.active = true;
						if (#is_defined(active_entry.open)) {
							active_entry.open();
						}
						return true;
					});

					top += row_height;
				}

				const clear_active = () => {
					if (active_entry != null) {
						if (#is_defined(active_entry.close)) {
							active_entry.close();
						}
						active_item.active = false;
						active_entry = null;
						active_item = null;
					}
				};
				const result = {is_open: false, on_close: clear_active, clear_active: clear_active};
				result.el = menu;
				result.items = items;
				result.rows = rows;
				return result;
			},
		};
		pp.menu = controller;
		this.create_menu = pp.create;

		for (m of this.available_menus) {
			this.menu_defs[m] = #include(m);
			this.menus[m] = this.menu_defs[m].init(pp);
		}
		for (id in this.menus) {
			// Object iteration currently ends on continue in GSE; keep this
			// bounded registration conditional instead of skipping iterations.
			if (id != 'left_menu' && id != 'right_menu') {
				this.bind_child(id, this.menus[id]);
			}
		}
		#include('unit_orders')(this, p);
		#include('terraform_orders')(this, p);
		#include('colony_orders')(this, p);
		if (this.game != null) {
			const frame = this.menus.left_menu.el;
			frame.listen(this.game, 'unit_select', (e) => {
				this.selected_unit_id = e.unit.id + 0; this.selected_tile = null;
				if (#is_defined(this.menus.left_menu_action) && this.menus.left_menu_action.is_open) { this.refresh_action(); }
				if (#is_defined(this.menus.left_menu_terraform) && this.menus.left_menu_terraform.is_open) { this.refresh_terrain(); }
			});
			frame.listen(this.game, 'tile_select', (e) => {
				this.selected_unit_id = null; this.selected_tile = e.tile;
				if (#is_defined(this.menus.left_menu_action) && this.menus.left_menu_action.is_open) { this.refresh_action(); }
				if (#is_defined(this.menus.left_menu_terraform) && this.menus.left_menu_terraform.is_open) { this.refresh_terrain(); }
			});
		}

	},

	bind_child: (id, child) => {
		const controller = this;
		child.el.on('keydown', (e) => {
			if (e.code != 'ESCAPE' || e.modifiers != {}) { return false; }
			controller.close(id);
			return true;
		});
	},

	open_child: (id) => {
		const root_menu = this.menus.left_menu;
		if (!root_menu.is_open) { return; }
		let child = this.menus[id];
		if (!#is_defined(child)) {
			// All definitions have already validated. Mount a list only when
			// selected, then retain those actual controls for subsequent visits.
			for (header of this.headers) {
				if (header.id == id) {
					child = this.create_menu(header.entries, this.child_width);
					this.menus[id] = child;
					this.bind_child(id, child);
				}
			}
		}
		if (!#is_defined(child)) { throw Error('Unknown in-game child menu: ' + id); }
		if (id == 'left_menu_action') { this.refresh_action(); }
		if (id == 'left_menu_terraform') { this.refresh_terrain(); }
		// Keep source-driven lists within the viewport. Exact artwork and
		// original menu geometry are outside the navigation contract.
		let top = this.ui.get_height() - root_menu.el.bottom - root_menu.el.height;
		const last_top = this.ui.get_height() - child.el.height - 4;
		if (top > last_top) { top = last_top; }
		if (top < 4) { top = 4; }
		const left = this.menu_width;
		this.open(id, {align: 'top left', left: left, top: top});
	},

	refresh_action: () => {
		let former = false;
		let colony = false;
		if (this.game != null && this.selected_unit_id != null) {
			const units = this.game.get_um();
			if (units.has_unit(this.selected_unit_id)) {
				const unit = units.get_unit(this.selected_unit_id);
				former = unit.def == 'Formers' && unit.is_land;
				colony = unit.def == 'ColonyPod' && unit.is_land;
			}
		}
		const child = this.menus.left_menu_action;
		// Keep separators only between groups with visible source entries.
		// The optional Colony group must not leave a leading blank Scout row.
		let separator = null; let has_visible = false;
		for (row of child.rows) {
			row.visible = false;
			if (#is_defined(row.entry.separator)) { separator = row; }
			else {
				const omit = (former && row.entry.omit_for_former) || (colony && row.entry.omit_for_colony) || (!colony && row.entry.only_for_colony);
				if (!omit) {
					row.visible = true;
					if (separator != null && has_visible) { separator.visible = true; }
					separator = null; has_visible = true;
				}
			}
		}
		let top = 0;
		for (row of child.rows) {
			if (!row.visible) { row.el.hide(); }
			else {
				row.el.top = top + (#is_defined(row.entry.separator) ? this.item_height / 2 : 0);
				row.el.show(); top += this.item_height;
			}
		}
		child.el.height = top;
	},

	refresh_terrain: () => {
		let tile = this.selected_tile;
		if (this.game != null && this.selected_unit_id != null) {
			const units = this.game.get_um();
			if (units.has_unit(this.selected_unit_id)) { tile = units.get_unit(this.selected_unit_id).get_tile(); }
		}
		const water = tile != null && tile.is_water;
		for (item of this.menus.left_menu_terraform.items) {
			if (#is_defined(item.entry.terrain_index)) { item.el.text = water ? item.entry.water_label : item.entry.land_label; }
		}
	},

	open: (id, style) => {
		const m = this.menus[id];
		if (!#is_defined(m)) {
			#print('WARNING: menu not found: ' + id);
			return;
		}
		if (!m.is_open) {
			m.is_open = true;
			if (#is_defined(m.on_open)) {
				m.on_open();
			}
			if (#is_defined(style)) {
				for (k in style) {
					m.el[k] = style[k];
				}
			}
			m.el.show();
		}
	},

	close: (id) => {
		const m = this.menus[id];
		if (!#is_defined(m)) {
			#print('WARNING: menu not found: ' + id);
			return;
		}
		if (m.is_open) {
			m.el.hide();
			if (#is_defined(m.on_close)) {
				m.on_close();
			}
			m.is_open = false;
			for ( cb of this.on_close_handlers ) {
				cb( id );
			}
		}
	},

	close_all: () => {
		for (id in this.menus) {
			const m = this.menus[id];
			if (m.is_open) {
				this.close(id);
			}
		}
	},

	on_close: (cb) => {
		this.on_close_handlers :+ cb;
	},

};
