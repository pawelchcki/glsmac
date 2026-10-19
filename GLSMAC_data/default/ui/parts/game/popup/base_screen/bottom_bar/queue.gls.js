return {

	init: (p) => {

		this.frame = p.body.panel({
			class: 'default-panel',
			align: 'top left',
			top: 59,
			bottom: 7,
			left: 137,
			width: 106,
		});

		this.status = this.frame.text({
			class: 'base-screen-frame-text', align: 'top center', top: 14,
		});

		this.frame.button({
			class: 'game-popup-button',
			text: 'CHANGE',
			align: 'bottom',
			bottom: 23,
			left: 2,
			right: 2,
		}).on('click', (e) => {
			p.utils.show_production_selection();
			return true;
		});

	},

	set: (data) => {

		const active = data.base.get_production().choice_id;
		this.status.text = 'No project';
		for (choice of data.base.get_owner().get_production_choices()) {
			if (choice.id == active) {
				this.status.text = choice.type == 'unit' ? 'Unit project' : 'Facility project';
			}
		}
	},

};
