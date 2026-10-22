// Observe live native city/units and the shared production selection controller.
const fixture = #include('./_colony_menu_fixture');
const run = (input) => {
	#print('JOIN_CASE|' + input.id); let f = null;
	try {
		f = fixture(input); const initial = f.game.get_year(); const origin = f.base.get_tile();
		const initial_pops = f.base.get_pops(); const doctor = initial_pops[0];
		const owner = f.units[0].owner; const base_id = f.base.id + 0; const base_count = #sizeof(f.game.bm.get_bases());
		const ids = {scout: f.units[0].id + 0, former: f.units[1].id + 0, colony: f.units[2].id + 0};
		const defs = {scout: 'ScoutPatrol', former: 'Formers', colony: 'ColonyPod'};
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (role of ['scout', 'former', 'colony']) { if (ids[role] == id) { return role; } }
			throw Error('Unknown selected join identity');
		};
		const observe = (index) => {
			#print('JOIN_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_year() - initial) + '|' + role_of(f.native.selected_id()));
			if (#sizeof(f.game.bm.get_bases()) != base_count) { throw Error('Join changed global base count'); }
			let count = 0;
			for (base of f.game.bm.get_bases()) {
				if (base.get_owner().id != owner) { continue; }
				count++; const tile = base.get_tile();
				if (base.id != base_id || tile.x != origin.x || tile.y != origin.y) { throw Error('Join replaced/moved existing base'); }
				if (base.name != input.initial_base.name || base.get_owner().id != owner || origin.get_base() != base) { throw Error('Changed native city identity'); }
				let retained_doctor = false;
				let workers = 0; let doctors = 0;
				for (pop of base.get_pops()) {
					if (pop.get_type() == 'WORKER') { workers++; }
					else if (pop.get_type() == 'DOCTOR') { doctors++; if (pop == doctor) { retained_doctor = true; } }
					else { throw Error('Unexpected join specialist'); }
				}
				if (!retained_doctor || doctor.has('worked_tile')) { throw Error('Changed initial Doctor identity/job'); }
				#print('JOIN_BASE|' + #to_string(base.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(base.get_worked_tiles())) + '|' + #to_string(base.get('accumulated_nutrients')) + '|' + #to_string(base.get_production().minerals));
			}
			#print('JOIN_OWNED|' + #to_string(count));
			const found = {};
			for (unit of origin.get_units()) {
				const role = role_of(unit.id);
				if (unit.def != defs[role] || unit.owner != owner || unit.health != 1.0 || #is_defined(found[role])) { throw Error('Changed join unit identity/ownership/health'); }
				found[role] = unit.id + 0;
			}
			if (#sizeof(f.native.inspect().unit_ids) != #sizeof(origin.get_units())) { throw Error('Changed native unit membership or position'); }
			for (role of ['scout', 'former', 'colony']) {
				if (!#is_defined(found[role])) {
					if (f.game.um.has_unit(ids[role])) { throw Error('Join moved a live unit out of its declared stack'); }
					continue;
				}
				const unit = f.game.um.get_unit(found[role]); const order = unit.get_order(); let code = (0 - 1);
				if (order == 'NO_ORDERS') { code = 0; }
				if (order == 'SENTRY') { code = 1; }
				if (order == 'HOLD') { code = 2; }
				if (code < 0) { throw Error('Unexpected join order'); }
				#print('JOIN_UNIT|' + role + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
			}
			const root = f.menu.menus.left_menu; let child = null;
			for (id in f.menu.menus) {
				const current = f.menu.menus[id];
				if (current.is_open != current.el.is_visible() || current.el.is_removed()) { throw Error('Invalid actual menu lifecycle'); }
				if (id != 'left_menu' && current.is_open) {
					if (child != null || !root.is_open || id != 'left_menu_action') { throw Error('Unexpected menu child'); }
					child = 4;
				}
			}
			const selected = f.native.selected_id();
			if (selected != null && (f.preview.selected_unit_id != selected || f.preview.rendered_unit_id != selected ||
				f.menu.selected_unit_id != selected || f.objects.selected_type != 'Unit' || f.objects.selected_id != selected)) {
				throw Error('Mounted UI disagrees with native selection');
			}
			#print('JOIN_MENU|' + #to_string(root.is_open) + '|' + (child == null ? 'none' : #to_string(child)));
			#print('JOIN_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('JOIN_CASE_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('JOIN_ERROR|' + #to_string(error)); } }
};
for (input of colony_menu_inputs) { run(input); }
