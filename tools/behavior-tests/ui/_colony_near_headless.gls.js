const fixture = #include('./_colony_near_fixture');
const run = (input) => {
	#print('NEAR_CASE|' + input.id); let f = null;
	try {
		f = fixture(input); const year = f.game.get_year(); const base = f.base; const base_id = base.id + 0;
		const origin = base.get_tile(); const owner = base.get_owner().id + 0; const pops = base.get_pops(); const doctor = pops[0];
		const nutrients = base.get('accumulated_nutrients'); const production = base.get_production(); const units = []; const roles = ['scout', 'former', 'colony'];
		for (unit of f.units) { const record = {id: unit.id + 0, def: unit.def + '', owner: unit.owner + 0, health: unit.health + 0.0}; record.unit = unit; record.tile = unit.get_tile(); units :+ record; }
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (let i = 0; i < 3; i++) { if (units[i].id == id) { return roles[i]; } }
			throw Error('Unknown actual adjacent-menu selection');
		};
		const observe = (index) => {
			const current = base.get_pops();
			if (#sizeof(f.game.bm.get_bases()) != 1 || base.id != base_id || base.name != input.initial_base.name || base.get_owner().id != owner || base.get_tile() != origin ||
				origin.get_base() != base || base.get_size() != 1 || #sizeof(current) != 1 || current[0] != doctor || doctor.get_type() != 'DOCTOR' || doctor.has('worked_tile') ||
				#sizeof(base.get_worked_tiles()) != 0 || base.get('accumulated_nutrients') != nutrients || base.get_production() != production) { throw Error('Adjacent action changed guarded native city/citizen/stores'); }
			let owned = 0; for (city of f.game.bm.get_bases()) { if (city.get_owner().id == owner) { owned++; } }
			const selected = f.native.selected_id();
			if (selected != null && (f.preview.selected_unit_id != selected || f.preview.rendered_unit_id != selected || f.menu.selected_unit_id != selected || f.objects.selected_type != 'Unit' || f.objects.selected_id != selected)) {
				throw Error('Mounted adjacent-menu selection disagrees with native authority');
			}
			if (selected == null && (f.preview.selected_unit_id != null || f.menu.selected_unit_id != null || f.objects.selected_type == 'Unit')) { throw Error('Mounted adjacent-menu selection outlived native focus'); }
			#print('NEAR_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_year() - year) + '|' + role_of(selected) + '|' + #to_string(owned));
			if (#sizeof(f.native.inspect().unit_ids) != 3) { throw Error('Adjacent action changed native unit membership'); }
			for (let i = 0; i < 3; i++) {
				const record = units[i]; if (!f.game.um.has_unit(record.id)) { throw Error('Adjacent action removed a guarded unit'); }
				const unit = f.game.um.get_unit(record.id);
				if (unit != record.unit || unit.def != record.def || unit.owner != record.owner || unit.health != record.health || unit.get_tile() != record.tile) { throw Error('Adjacent action changed a guarded unit identity/position/health'); }
				let code = (0 - 1); const order = unit.get_order();
				if (order == 'NO_ORDERS') { code = 0; } else if (order == 'SENTRY') { code = 1; } else if (order == 'HOLD') { code = 2; }
				if (code < 0) { throw Error('Unrecognized native adjacent-menu unit order'); }
				#print('NEAR_UNIT|' + roles[i] + '|' + #to_string(code) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
			}
			const root = f.menu.menus.left_menu; let child = null;
			for (id in f.menu.menus) {
				const menu = f.menu.menus[id]; if (menu.el.is_removed() || menu.is_open != menu.el.is_visible()) { throw Error('Native menu visibility disagrees with mounted node'); }
				if (id != 'left_menu' && menu.is_open) { if (!root.is_open || child != null || id != 'left_menu_action') { throw Error('Unexpected adjacent-menu child'); } child = 4; }
			}
			let dialog_open = false;
			for (node of f.view.live('input')) { if (node.is_visible()) { if (!#is_defined(node.input_state) || node.value != node.input_state.get_value()) { throw Error('Adjacent editor lacks actual native state'); } dialog_open = true; } }
			let message_node = null;
			for (node of f.view.live('text')) {
				if (#is_defined(node.left) && node.left == 228 && #is_defined(node.top) && node.top == 10 && #is_defined(node.font) && node.font == 'arialnb.ttf:18') {
					if (message_node != null || !node.is_visible()) { throw Error('Ambiguous actual message node'); } message_node = node;
				}
			}
			if (message_node == null) { throw Error('Actual mounted HUD message node is missing'); }
			#print('NEAR_MENU|' + #to_string(root.is_open) + '|' + (child == null ? 'none' : #to_string(child)) + '|' + #to_string(dialog_open));
			if (!#is_defined(message_node.text) || message_node.text == '') { #print('NEAR_NO_MESSAGE'); }
			else { if (#typeof(message_node.text) != 'String') { throw Error('Invalid actual HUD message'); } #print('NEAR_MESSAGE|' + message_node.text); }
			#print('NEAR_STATE_DONE');
		};
		observe(0); let index = 1; for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('NEAR_CASE_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('NEAR_ERROR|' + #to_string(error)); } }
};
for (input of colony_near_inputs) { run(input); }
