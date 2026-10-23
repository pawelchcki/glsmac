const prepare = #include('./_unit_recycling_fixture');
const run = (input) => {
	#print('RECYCLING_CASE|' + input.id); let f = null;
	try {
		f = prepare(input); const base = f.base; const origin = base.get_tile(); const base_id = base.id + 0; const owner = base.get_owner().id + 0;
		const citizens = base.get_pops(); const doctor = citizens[0]; const nutrients = base.get('accumulated_nutrients'); const production = base.get_production();
		const mineral_baseline = production.minerals + 0;
		const roles = ['scout', 'former', 'colony']; const records = []; const year = f.game.get_year();
		for (unit of f.units) {
			const record = {id: unit.id + 0, def: unit.def + '', owner: unit.owner + 0, health: unit.health + 0.0, movement: unit.movement + 0.0, order: unit.get_order() + ''}; record.unit = unit; record.tile = unit.get_tile(); records :+ record;
		}
		const role_of = (id) => { if (id == null) { return 'none'; } for (let index = 0; index < 3; index++) { if (records[index].id == id) { return roles[index]; } } throw Error('Unknown native Recycling focus'); };
		const observe = (index) => {
			const pops = base.get_pops(); const bases = f.game.bm.get_bases(); const current_production = base.get_production();
			if (#sizeof(bases) != 1 || bases[0] != base || base.id != base_id || base.name != input.initial_base.name || base.get_owner().id != owner || base.get_tile() != origin || origin.get_base() != base ||
				base.get_size() != 1 || #sizeof(pops) != 1 || pops[0] != doctor || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile') || #sizeof(base.get_worked_tiles()) != 0 ||
				base.get('accumulated_nutrients') != nutrients || current_production.choice_id != production.choice_id || current_production.last_processed_turn != production.last_processed_turn) { throw Error('Recycling changed guarded native city/citizen/stores'); }
			const selected = f.native.selected_id();
			if (selected != null && (f.preview.selected_unit_id != selected || f.preview.rendered_unit_id != selected || f.menu.selected_unit_id != selected || f.objects.selected_type != 'Unit' || f.objects.selected_id != selected)) { throw Error('Recycling mounted focus disagrees with native selection'); }
			if (selected == null && (f.preview.selected_unit_id != null || f.menu.selected_unit_id != null || f.objects.selected_type == 'Unit')) { throw Error('Recycling mounted focus outlived native selection'); }
			let owned = 0; for (city of bases) { if (city.get_owner().id == owner) { owned++; } }
			#print('RECYCLING_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_year() - year) + '|' + role_of(selected) + '|' + #to_string(owned) + '|' + #to_string(current_production.minerals - mineral_baseline));
			let survivors = 0;
			for (let unit_index = 0; unit_index < 3; unit_index++) {
				const record = records[unit_index];
				if (!f.game.um.has_unit(record.id)) { if (unit_index != 0 || #sizeof(record.tile.get_units()) != 0) { throw Error('Recycling removed another unit or left stale membership'); } }
				else {
					const unit = f.game.um.get_unit(record.id); survivors++;
					if (unit != record.unit || unit.def != record.def || unit.owner != record.owner || unit.health != record.health || unit.get_tile() != record.tile || unit.movement != record.movement || unit.get_order() != record.order) { throw Error('Recycling changed surviving native unit identity/position/health'); }
					let code = (0 - 1); const order = unit.get_order(); if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
					if (code < 0) { throw Error('Unknown actual native Recycling survivor order'); }
					#print('RECYCLING_UNIT|' + roles[unit_index] + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
				}
			}
			if (#sizeof(f.native.inspect().unit_ids) != survivors) { throw Error('Recycling changed unrelated native unit membership'); }
			const root = f.menu.menus.left_menu; let child = null;
			for (id in f.menu.menus) {
				const menu = f.menu.menus[id]; if (menu.el.is_removed() || menu.el.is_visible() != menu.is_open) { throw Error('Recycling menu visibility disagrees with mounted nodes'); }
				if (id != 'left_menu' && menu.is_open) { if (!root.is_open || child != null || id != 'left_menu_action') { throw Error('Unexpected actual Recycling child'); } child = 4; }
			}
			#print('RECYCLING_MENU|' + #to_string(root.is_open) + '|' + (child == null ? 'none' : #to_string(child)));
			const dialog = f.dialog();
			if (dialog == null) { #print('RECYCLING_NO_DIALOG'); }
			else {
				#print('RECYCLING_CAPTION|' + dialog.caption); #print('RECYCLING_BODY|' + dialog.body);
				for (choice of dialog.choices) { #print('RECYCLING_CHOICE|' + choice); }
				#print('RECYCLING_SELECTED|' + #to_string(dialog.selected)); #print('RECYCLING_BUTTON|' + dialog.ok.text);
			}
			#print('RECYCLING_STATE_DONE');
		};
		observe(0); let index = 1; for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('RECYCLING_CASE_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('RECYCLING_ERROR|' + #to_string(error)); } }
};
for (input of unit_recycling_inputs) { run(input); }
