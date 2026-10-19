return {

	cell_columns: 8,

	init: (p) => {

		this.p = p;

		this.frame = p.body.panel({
			class: 'base-screen-frame',
			align: 'top left',
			top: 59,
			bottom: 7,
			left: 6,
			width: 129,
		});

		const body = this.frame.panel({
			class: 'default-panel-inner',
		});
		this.body = body;

		this.production_title = body.text({
			class: 'base-screen-frame-title',
			font: 'arialnb.ttf:14',
			align: 'top center',
			top: 10,
		});
		this.production_amount = body.text({ class: 'base-screen-frame-text', align: 'top center', top: 36 });
		this.production_pending = body.text({ class: 'base-screen-frame-text', font: 'arialnb.ttf:11', align: 'top center', top: 57 });

		p.ui.class('base-screen-bottombar-production-cell');
		p.ui.class('base-screen-bottombar-production-cell-empty').extend('base-screen-bottombar-production-cell').set({
			background: 'interface.pcx:crop(397,43,416,62)',
		});
		p.ui.class('base-screen-bottombar-production-cell-pending').extend('base-screen-bottombar-production-cell-empty').set({
			border: 'rgb(231,235,231),0',
		});
		p.ui.class('base-screen-bottombar-production-cell-full').extend('base-screen-bottombar-production-cell').set({
			background: 'interface.pcx:crop(418,43,437,62)',
		});

		this.production_cells = body.area({
			align: 'top center',
			left: 6,
			right: 6,
			top: 82,
		});

		this.production_label = body.text({
			class: 'base-screen-frame-text',
			align: 'bottom center',
			bottom: 20,
		});

		body.on('mousedown', (e) => {
			this.p.utils.show_production_selection();
			return true;
		});
	},

	set: (data) => {
		const base = data.base;
		const state = base.get_production();
		let choice = null;
		for (candidate of base.get_owner().get_production_choices()) {
			if (candidate.id == state.choice_id && (candidate.type == 'facility' || candidate.type == 'unit')) { choice = candidate; }
		}
		if (choice == null) {
			this.production_title.text = 'IDLE';
			this.production_amount.text = 'Stored: ' + #to_string(state.minerals) + ' minerals';
			this.production_pending.text = '';
			this.production_label.text = 'NO PROJECT';
			this.production_cells.clear();
			return;
		}
		const pending = this.p.game.get('f_base_get_pending_production')(base);
		this.production_title.text = choice.name;
		this.production_amount.text = #to_string(state.minerals) + ' / ' + #to_string(choice.cost) + ' minerals';
		this.production_pending.text = '+' + #to_string(pending) + ' minerals / turn';
		const rows = #ceil(#to_float(choice.cost) / #to_float(this.cell_columns));

		this.p.utils.set_cells(
			108,
			60,
			this.cell_columns,
			rows,
			state.minerals,
			pending,
			this.production_cells,
			'base-screen-bottombar-production-cell',
			this.production_label,
			(progress_in) => {
				if (choice.type == 'unit' && state.minerals >= choice.cost && base.get_size() <= choice.population_cost) { return 'NEEDS POPULATION'; }
				if (state.minerals >= choice.cost) { return '1 TURN'; }
				if (pending == 0) { return 'NO SURPLUS'; }
				const turns = #max(1, #ceil(#to_float(choice.cost - state.minerals) / #to_float(pending)));
				return #to_string(turns) + (turns == 1 ? ' TURN' : ' TURNS');
			},
		);

	},

};
