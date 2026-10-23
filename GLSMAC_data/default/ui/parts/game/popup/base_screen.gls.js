return {

	available_sections: [
		'top_buttons',
		'nutrients',
		'economy',
		'game_state',
		'middle_area',
		'facilities',
		'resources',
		'energy',
		'buttons',
		'bottom_bar',
	],

	production_selection_no_hiding: {
		buttons: true,
		bottom_bar: true,
	},

	init: (p) => {

		this.sections = {};
		this.p = p;
		this.is_open = false;
		this.base_id = null;
		this.base = null;

		this.production_selection = null;
		this.production_choices = null;
		this.production_switch_preview = null;
		this.production_selection_base_id = null;
		this.citizen_job = null;
		this.rename_dialog = null; this.rename_controller = null;

		p.ui.class('base-screen-frame').set({
			border: 'rgb(35,59,34),2',
		});
		p.ui.class('base-screen-block').extend('default-panel-inner').set({
			top: 3,
			left: 3,
			bottom: 3,
			right: 3,
		});

		p.ui.class('base-screen-header').extend('base-screen-block').set({
			align: 'top',
			height: 20,
		});
		p.ui.class('base-screen-body').extend('base-screen-block').set({
			align: 'top',
			top: 24,
		});

		p.ui.class('base-screen-side-frame').extend('base-screen-frame').set({
			width: 132,
		});
		p.ui.class('base-screen-side-middle-frame').extend('base-screen-frame').set({
			width: 539,
		});

		p.ui.class('base-screen-frame-title').set({
			align: 'center',
			font: 'arialnb.ttf:16',
			color: 'rgb(53,61,115)',
		});
		p.ui.class('base-screen-frame-text').set({
			font: 'arialnb.ttf:14', // TODO: investigate why non-bold fonts look bad (LOD settings?)
			color: 'rgb(59,111,128)',
		});

		p.ui.class('base-screen-frame-info-text').set({
			font: 'arialnb.ttf:14',
			color: 'rgb(42,101,120)',
		});

		p.ui.class('base-screen-frame-text-important').extend('base-screen-frame-text').set({
			color: 'rgb(120,164,212)',
		});

		p.ui.class('base-screen-side-header').extend('base-screen-body').set({
			left: 3,
			width: 127,
			height: 20,
		});

		p.ui.class('base-screen-side-header-text').set({
			font: 'arialnb.ttf:15',
			align: 'center',
		});

		return p.create('', 680, 442, (body, cb) => {

			this.body = body;
			const screen = this;
			this.rename_controller = #include('base_screen/rename');
			this.rename_controller.init({owner: body, ui: p.ui, game: p.game, glsmac: p.glsmac,
				is_open: () => { return screen.is_open; }, get_base: () => { return screen.base; },
				set_dialog: (dialog) => { screen.rename_dialog = dialog; },
			});
			body.on('remove', (e) => { this.rename_controller.cancel(); });
			this.citizen_job = #include('base_screen/citizen_job');
			this.citizen_job.init({
				ui: p.ui, game: p.game,
				is_open: () => { return screen.is_open; },
				get_base: () => { return screen.base; },
			});
			body.on('remove', (e) => { this.hide_citizen_selection(); });

			body.listen(p.game, 'update_base', (e) => {
				if (this.is_open && e.base.id == this.base_id) {
					this.set({
						base: e.base,
					});
				}
			});

			const pp = {
				body: body,
				ui: p.ui,
				game: p.game,
				hide: p.hide,
				modules: p.modules,
				utils: {
					set_cells: parent.parent.set_cells,
					show_production_selection: parent.parent.show_production_selection,
					hide_production_selection: parent.parent.hide_production_selection,
					update_production_selection: parent.parent.update_production_selection,
					show_citizen_selection: parent.parent.show_citizen_selection,
					show_rename: parent.parent.show_rename,
				},
			};

			for (s of this.available_sections) {
				this.sections[s] = #include('base_screen/' + s);
				this.sections[s].body = this.sections[s].init(pp);
			}

		});

	},

	set: (data) => {

		const game = this.p.game;
		const base = data.base;
		const owner = base.get_owner();
		const faction = owner.get_faction();

		this.base_id = base.id;
		this.base = base;
		if (#is_defined(this.rename_controller) && this.rename_controller != null) { this.rename_controller.refresh(); }

		const intake = base.get_intake();
		const consumption = base.get_consumption();

		this.hide_production_selection();
		this.hide_citizen_selection();

		this.sections.nutrients.set({
			rows: base.get_size() + 1,
			columns: game.get('f_base_get_nutrient_factor')(base),
			filled: base.get('accumulated_nutrients'),
			pending: game.get('f_base_get_pending_growth')(base),
		});

		if (faction.is_progenitor) {
			this.sections.economy.set_energy_grid({
				// TODO
			});
		} else {
			this.sections.economy.set_commerce({
				// TODO
			});
		}

		this.sections.game_state.set({
			year: game.get_year(),
			energy: 0, // TODO
			ecodamage: 0, // TODO
		});

		let facilities = [];
		const ff = base.get_facilities();
		for (f in ff) {
			facilities :+ff[f].name;
		}

		this.sections.facilities.set(facilities);

		const resource_data = {
			nutrients: {
				profit: intake.NUTRIENTS,
				loss: consumption.NUTRIENTS,
			},
			minerals: {
				profit: intake.MINERALS,
				loss: consumption.MINERALS,
			},
			energy: {
				profit: intake.ENERGY,
				loss: consumption.ENERGY,
			},
		};
		this.sections.resources.set(resource_data);

		const total_energy = resource_data.energy.profit - resource_data.energy.loss;
		const energy_data = #include('../../../../game/base_energy_allocation').get(base, total_energy);
		this.sections.energy.set(energy_data);

		this.sections.middle_area.set({
			base: base,
		});

		this.sections.bottom_bar.set({
			base: base,
		});
	},

	on_hide: () => {
		if (#is_defined(this.rename_controller) && this.rename_controller != null) { this.rename_controller.cancel(); }
		this.hide_citizen_selection();
		this.sections.bottom_bar.frame.hide();
		this.hide_production_selection();
		this.is_open = false;
	},

	on_show: () => {
		this.is_open = true;
		this.sections.bottom_bar.frame.show();
	},

	set_cells: (total_width, total_height, columns, rows, filled, pending, cells_el, cell_baseclass, label_el, f_label) => {
		cells_el.clear();
		// A valid zero nutrient factor or project price has no cell geometry. Keep
		// the caller's existing label policy, with exactly zero progress.
		if (columns == 0 || rows == 0) {
			label_el.text = f_label(0);
			return;
		}

		const width = #floor(#to_float(total_width) / #to_float(columns));
		const height = #floor(#to_float(total_height) / #to_float(rows));

		this.p.ui.class(cell_baseclass).set({
			width: width - 1,
			height: height - 1,
		});

		const offset_left = (total_width - (columns * width)) / 2;
		let left = offset_left;
		let top = (total_height - (rows * height)) / 2;

		let i = 0;
		let cls = '';

		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < columns; x++) {
				if (i < filled) {
					if (pending < 0 && i >= filled + pending) {
						cls = 'deficit';
					} else {
						cls = 'full';
					}
				} else if (i < filled + pending) {
					cls = 'pending';
				} else {
					cls = 'empty';
				}
				i++;
				cells_el.panel({
					class: cell_baseclass + '-' + cls,
					left: left + 1,
					top: top + 1,
				});
				left += width;
			}
			top += height;
			left = offset_left;
		}

		let progress_in = 0;
		if (pending > 0) {
			progress_in = #ceil(#to_float(rows * columns - filled) / #to_float(pending));
		}
		label_el.text = f_label(progress_in);
	},

	hide_production_selection: () => {
		if (this.production_selection != null) {
			this.production_selection.remove();
			this.production_selection = null;
			this.production_choices = null;
			this.production_switch_preview = null;
			this.production_selection_base_id = null;
			this.sections.buttons.show_default();
			for (s in this.sections) {
				if (!#is_defined(this.production_selection_no_hiding[s])) {
					this.sections[s].body.show();
				}
			}
		}
	},

	get_production_choices: () => {
		const choices = [];
		if (this.base == null || this.base.get_owner().id != this.p.game.get_player().id) {
			return choices;
		}
		for (choice of this.base.get_owner().get_production_choices()) {
			if (choice.cost >= 0 && (choice.type == 'unit' || (choice.type == 'facility' && !this.base.has_facility(choice.facility_id)))) {
				choices :+choice;
			}
		}
		return choices;
	},

	hide_citizen_selection: () => {
		if (#is_defined(this.citizen_job) && this.citizen_job != null) { this.citizen_job.cancel(); }
	},

	show_citizen_selection: (base_id, pop_id, base_identity, pop_identity) => {
		if (#is_defined(this.rename_controller) && this.rename_controller != null) { this.rename_controller.cancel(); }
		if (!this.is_open || !#is_defined(this.citizen_job) || this.citizen_job == null) { return; }
		this.hide_production_selection();
		this.citizen_job.open(base_id, pop_id, base_identity, pop_identity);
	},

	update_production_switch_preview: () => {
		if (this.production_switch_preview != null && this.production_choices != null) {
			let text = 'Switch unavailable for this context';
			try {
				const loss = this.base.get_production_switch_loss(this.production_choices.value);
				text = 'Switch loss: ' + #to_string(loss) + ' minerals';
			} catch { : (e) => {} }
			this.production_switch_preview.text = text;
		}
	},

	show_production_selection: () => {
		if (#is_defined(this.rename_controller) && this.rename_controller != null) { this.rename_controller.cancel(); }
		this.hide_citizen_selection();
		if (this.production_selection == null && this.is_open && this.base != null && this.base.get_owner().id == this.p.game.get_player().id) {
			this.production_selection_base_id = this.base_id;
			for (s in this.sections) {
				if (!#is_defined(this.production_selection_no_hiding[s])) {
					this.sections[s].body.hide();
				}
			}
			this.production_selection = this.body.panel({
				class: 'default-panel',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
			});
			const choices = this.get_production_choices();
			const items = [];
			let selected = '';
			const active = this.base.get_production().choice_id;
			for (choice of choices) {
				items :+[choice.id, choice.name + ' (' + #to_string(choice.cost) + ' minerals)'];
				if (selected == '' || choice.id == active) { selected = choice.id; }
			}
			this.production_selection.text({
				class: 'base-screen-frame-title',
				align: 'top center',
				top: 18,
				text: 'CHOOSE PRODUCTION',
			});
			this.production_selection.text({
				class: 'base-screen-frame-text',
				align: 'top center',
				top: 52,
				text: 'Build one project, then stop. Colony Pods use 1 citizen (size 2 required).',
			});
			this.production_switch_preview = this.production_selection.text({
				class: 'base-screen-frame-text', align: 'top center', top: 73,
				text: '',
			});
			if (#sizeof(items) > 0) {
				const list = this.production_selection.scrollview({
					left: 24, right: 24, top: 90, bottom: 110,
					has_hscroll: false, vscroll_class: 'default-scroll-v',
				});
				this.production_choices = list.choicelist({
					left: 0, right: 0, top: 0, height: #sizeof(items) * 29,
					itemclass: 'popup-list-button', itemheight: 27, itempadding: 2,
					items: items, value: selected,
					// Native keyboard=true consumes Escape/Enter too. The pane
					// routes those keys and arrow navigation explicitly below.
					keyboard: false,
				});
				this.production_choices.on('select', (e) => { this.update_production_switch_preview(); return true; });
				this.update_production_switch_preview();
			} else {
				this.production_selection.text({
					class: 'base-screen-frame-text', align: 'center',
					text: 'No projects available to build.',
				});
			}
			this.production_selection.on('keydown', (e) => {
				if (e.modifiers == {}) {
					if (e.code == 'ESCAPE') { this.hide_production_selection(); return true; }
					if (e.code == 'ENTER') { this.update_production_selection(); return true; }
					if (this.production_choices != null && (e.code == 'UP' || e.code == 'DOWN')) {
						for (let i = 0; i < #sizeof(items); i++) {
							if (items[i][0] == this.production_choices.value) {
								const next = i + (e.code == 'UP' ? 0 - 1 : 1);
								if (next >= 0 && next < #sizeof(items)) { this.production_choices.value = items[next][0]; this.update_production_switch_preview(); }
								break;
							}
						}
					}
				}
				return true;
			});
			this.sections.buttons.show_production_selection();
		}
	},

	update_production_selection: () => {
		if (this.production_selection != null) {
			const base = this.base;
			const same_base = base != null && base.id == this.production_selection_base_id;
			const selected = this.production_choices == null ? '' : this.production_choices.value;
			let valid = false;
			if (same_base && this.is_open) {
				for (choice of this.get_production_choices()) {
					if (choice.id == selected) { valid = true; }
				}
				if (valid) {
					try { base.get_production_switch_loss(selected); }
					catch { : (e) => { valid = false; } }
				}
			}
			// Remove the draft before an event can synchronously refresh the
			// screen or a second click can submit its old controls.
			this.hide_production_selection();
			if (valid && base.get_production().choice_id != selected) {
				this.p.game.event('set_base_production', { base: base, choice_id: selected });
			}
		}
	},

	show_rename: () => {
		if (!this.is_open || !#is_defined(this.rename_controller) || this.rename_controller == null || this.production_selection != null) { return; }
		this.hide_citizen_selection(); this.rename_controller.open();
	},

};
