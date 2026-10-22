// Observe actual native identities, city membership and mounted controls only.
const fixture = #include('./_colony_found_menu_fixture');
const run = (input) => {
	#print('FOUND_CASE|' + input.id); let f = null;
	try {
		f = fixture(input); const year = f.game.get_year(); const base = f.base; const base_id = base.id + 0;
		const origin = base.get_tile(); const owner = base.get_owner().id + 0;
		const population = base.get_pops(); const doctor = population[0]; const production = base.get_production();
		const nutrients = base.get('accumulated_nutrients'); const colony_tile = f.units[2].get_tile();
		const roles = ['scout', 'former', 'colony']; const records = [];
		for (unit of f.units) {
			const record = {id: unit.id + 0, def: unit.def + '', owner: unit.owner + 0, health: unit.health + 0.0,
				movement: unit.movement + 0.0, order: unit.get_order()}; record.unit = unit; record.tile = unit.get_tile(); records :+ record;
		}
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (let i = 0; i < 3; i++) { if (records[i].id == id) { return roles[i]; } }
			throw Error('Unknown actual founding selection');
		};
		const observe = (index) => {
			const current = base.get_pops();
			if (base.id != base_id || base.name != input.initial_base.name || base.get_owner().id != owner || base.get_tile() != origin || origin.get_base() != base ||
				base.get_size() != 1 || #sizeof(current) != 1 || current[0] != doctor || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile') ||
				#sizeof(base.get_worked_tiles()) != 0 || base.get('accumulated_nutrients') != nutrients || base.get_production() != production) {
				throw Error('Founding changed the guarded initial city/citizen/stores');
			}
			let owned = 0; let created = null; let retained = false;
			for (city of f.game.bm.get_bases()) {
				if (city.get_owner().id != owner) { throw Error('Unexpected foreign native city'); }
				owned++;
				if (city == base) { retained = true; }
				else {
					if (created != null || city.get_tile() != colony_tile || colony_tile.get_base() != city) { throw Error('Unexpected new city identity/position/membership'); }
					created = city;
				}
			}
			if (!retained) { throw Error('Initial native city disappeared'); }
			const selected = f.native.selected_id();
			if (selected != null && (f.preview.selected_unit_id != selected || f.preview.rendered_unit_id != selected || f.menu.selected_unit_id != selected ||
				f.objects.selected_type != 'Unit' || f.objects.selected_id != selected)) { throw Error('Mounted founding selection disagrees with native focus'); }
			if (selected == null && (f.preview.selected_unit_id != null || f.menu.selected_unit_id != null || f.objects.selected_type == 'Unit')) {
				throw Error('Mounted founding selection outlived native focus');
			}
			#print('FOUND_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_year() - year) + '|' + role_of(selected) + '|' + #to_string(owned));
			if (created == null) { #print('FOUND_NO_BASE'); }
			else {
				let workers = 0; let doctors = 0;
				for (pop of created.get_pops()) {
					if (pop.get_type() == 'WORKER') { workers++; }
					else if (pop.get_type() == 'DOCTOR') { doctors++; }
					else { throw Error('Unexpected native founding citizen type'); }
				}
				#print('FOUND_BASE|' + created.name + '|' + #to_string(created.get_size()) + '|' + #to_string(workers) + '|' + #to_string(doctors) + '|' + #to_string(#sizeof(created.get_worked_tiles())));
			}
			let survivors = 0;
			for (let i = 0; i < 3; i++) {
				const record = records[i];
				if (!f.game.um.has_unit(record.id)) { if (i != 2) { throw Error('Founding consumed a guarded companion'); } }
				else {
					survivors++; const unit = f.game.um.get_unit(record.id);
					if (unit != record.unit || unit.def != record.def || unit.owner != record.owner || unit.health != record.health || unit.get_tile() != record.tile) {
						throw Error('Founding changed a native unit identity/position/health');
					}
					if (i != 2 && (unit.get_order() != record.order || unit.movement != record.movement)) { throw Error('Founding changed a guarded companion order/movement'); }
					let code = (0 - 1); const order = unit.get_order();
					if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
					if (code < 0) { throw Error('Unknown native founding unit order'); }
					#print('FOUND_UNIT|' + roles[i] + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
				}
			}
			if (#sizeof(f.native.inspect().unit_ids) != survivors) { throw Error('Unexpected global founding unit membership'); }
			const root = f.menu.menus.left_menu; let child = null;
			for (id in f.menu.menus) {
				const menu = f.menu.menus[id];
				if (menu.el.is_removed() || menu.is_open != menu.el.is_visible()) { throw Error('Actual founding menu visibility disagrees'); }
				if (id != 'left_menu' && menu.is_open) {
					if (!root.is_open || child != null || id != 'left_menu_action') { throw Error('Unexpected actual founding child menu'); }
					child = 4;
				}
			}
			#print('FOUND_MENU|' + #to_string(root.is_open) + '|' + (child == null ? 'none' : #to_string(child)));
			const dialog = f.dialog();
			if (dialog == null) { #print('FOUND_NO_DIALOG'); }
			else {
				#print('FOUND_CAPTION|' + dialog.texts[0].text); #print('FOUND_LABEL|' + dialog.texts[1].text);
				// The public visible-text projection normalizes letter case; the
				// native editor/raw-city-name authorities remain unchanged.
				#print('FOUND_VALUE|' + #uppercase(dialog.input.input_state.get_value()));
				for (button of dialog.buttons) { #print('FOUND_BUTTON|' + button.text); }
			}
			#print('FOUND_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('FOUND_CASE_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('FOUND_ERROR|' + #to_string(error)); } }
};
for (input of colony_found_menu_inputs) { run(input); }
