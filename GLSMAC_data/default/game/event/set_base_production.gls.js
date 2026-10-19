return {

	validate: (e) => {
		const base = e.data.base;
		const owner = base.get_owner();
		if (e.caller != owner.id) {
			return 'Only base owner can select production';
		}
		if (#typeof(e.data.choice_id) != 'String' || e.data.choice_id == '') {
			return 'Production choice must be a nonempty string';
		}
		for (choice of owner.get_production_choices()) {
			if (choice.id == e.data.choice_id) {
				if ((choice.type != 'facility' && choice.type != 'unit') || #typeof(choice.cost) != 'Int' || choice.cost < 0) {
					return 'Production choice is not a supported project';
				}
				if (choice.type == 'facility' && base.has_facility(choice.facility_id)) {
					return 'Base already has this facility';
				}
				let supported = true;
				try { base.get_production_switch_loss(choice.id); }
				catch { : (e) => { supported = false; } }
				if (!supported) { return 'Production switching is unsupported for this context'; }
				return;
			}
		}
		return 'Production choice is not available to this player';
	},

	apply: (e) => {
		return {
			previous: e.data.base.select_production(e.data.choice_id),
			added_facility: '',
		};
	},

	rollback: (e) => {
		e.data.base.restore_production(e.applied.previous, e.applied.added_facility);
	},

};
