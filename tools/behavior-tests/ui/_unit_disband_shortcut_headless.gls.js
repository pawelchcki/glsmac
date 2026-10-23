const prepare = #include('./_unit_disband_shortcut_fixture');
const run = (input) => {
	#print('DISBAND_CASE|' + input.id); let f = null;
	try {
		f = prepare(input); const base = f.base; const origin = base.get_tile(); const base_id = base.id + 0; const owner = base.get_owner().id + 0;
		const citizens = base.get_pops(); const doctor = citizens[0]; const nutrients = base.get('accumulated_nutrients'); const production = base.get_production();
		const roles = ['scout', 'former', 'colony']; const records = []; const year = f.game.get_year();
		for (unit of f.units) {
			const record = {id: unit.id + 0, def: unit.def + '', owner: unit.owner + 0, health: unit.health + 0.0}; record.unit = unit; record.tile = unit.get_tile(); records :+ record;
		}
		const role_of = (id) => { if (id == null) { return 'none'; } for (let index = 0; index < 3; index++) { if (records[index].id == id) { return roles[index]; } } throw Error('Unknown native Disband focus'); };
		const observe = (index) => {
			const pops = base.get_pops(); const bases = f.game.bm.get_bases();
			if (#sizeof(bases) != 1 || bases[0] != base || base.id != base_id || base.name != input.initial_base.name || base.get_owner().id != owner || base.get_tile() != origin || origin.get_base() != base ||
				base.get_size() != 1 || #sizeof(pops) != 1 || pops[0] != doctor || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile') || #sizeof(base.get_worked_tiles()) != 0 ||
				base.get('accumulated_nutrients') != nutrients || base.get_production() != production) { throw Error('Disband changed guarded native city/citizen/stores'); }
			const selected = f.native.selected_id();
			if (selected != null && (f.preview.selected_unit_id != selected || f.preview.rendered_unit_id != selected || f.menu.selected_unit_id != selected || f.objects.selected_type != 'Unit' || f.objects.selected_id != selected)) { throw Error('Disband mounted focus disagrees with native selection'); }
			if (selected == null && (f.preview.selected_unit_id != null || f.menu.selected_unit_id != null || f.objects.selected_type == 'Unit')) { throw Error('Disband mounted focus outlived native selection'); }
			let owned = 0; for (city of bases) { if (city.get_owner().id == owner) { owned++; } }
			#print('DISBAND_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_year() - year) + '|' + role_of(selected) + '|' + #to_string(owned));
			let survivors = 0;
			for (let unit_index = 0; unit_index < 3; unit_index++) {
				const record = records[unit_index];
				if (!f.game.um.has_unit(record.id)) { if (unit_index != 1 || #sizeof(record.tile.get_units()) != 0) { throw Error('Disband removed another unit or left stale membership'); } }
				else {
					const unit = f.game.um.get_unit(record.id); survivors++;
					if (unit != record.unit || unit.def != record.def || unit.owner != record.owner || unit.health != record.health || unit.get_tile() != record.tile) { throw Error('Disband changed surviving native unit identity/position/health'); }
					let code = (0 - 1); const order = unit.get_order(); if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
					if (code < 0) { throw Error('Unknown actual native Disband survivor order'); }
					#print('DISBAND_UNIT|' + roles[unit_index] + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
				}
			}
			if (#sizeof(f.native.inspect().unit_ids) != survivors) { throw Error('Disband changed unrelated native unit membership'); }
			const root = f.menu.menus.left_menu; let child = null;
			for (id in f.menu.menus) {
				const menu = f.menu.menus[id]; if (menu.el.is_removed() || menu.el.is_visible() != menu.is_open) { throw Error('Disband menu visibility disagrees with mounted nodes'); }
				if (id != 'left_menu' && menu.is_open) { if (!root.is_open || child != null || id != 'left_menu_action') { throw Error('Unexpected actual Disband child'); } child = 4; }
			}
			#print('DISBAND_MENU|' + #to_string(root.is_open) + '|' + (child == null ? 'none' : #to_string(child)));
			const dialog = f.dialog();
			if (dialog == null) { #print('DISBAND_NO_DIALOG'); }
			else {
				#print('DISBAND_CAPTION|' + dialog.caption); #print('DISBAND_BODY|' + dialog.body);
				for (choice of dialog.choices) { #print('DISBAND_CHOICE|' + choice); }
				#print('DISBAND_SELECTED|' + #to_string(dialog.selected)); #print('DISBAND_BUTTON|' + dialog.ok.text);
			}
			#print('DISBAND_STATE_DONE');
		};
		observe(0); let index = 1; for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('DISBAND_CASE_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('DISBAND_ERROR|' + #to_string(error)); } }
};
for (input of unit_disband_shortcut_inputs) { run(input); }
