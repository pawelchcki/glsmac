// Observe actual production popup controls and native units/controller.
const fixture = #include('./_unit_sentry_activation_fixture');
const run = (input) => {
	#print('SA_CASE|' + input.id); let f = null;
	try {
		f = fixture(input.profile, input.setup); const initial = f.game.get_turn();
		const origin = f.units[0].get_tile(); const owner = f.units[0].owner;
		const ids = {scout: f.units[0].id + 0, former: f.units[1].id + 0, colony: f.units[2].id + 0};
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (role of ['scout', 'former', 'colony']) { if (ids[role] == id) { return role; } }
			throw Error('Activation controls returned an unknown native unit');
		};
		const observe = (index) => {
			if (#sizeof(origin.get_units()) != 3) { throw Error('Sentry activation fixture must retain three stacked native units'); }
			const selected = f.selected_id();
			#print('SA_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_turn() - initial) + '|' + role_of(selected));
			if (f.popup.is_shown()) {
				#print('SA_PICKER|' + #uppercase(f.picker.header.text));
				let row_index = 0;
				for (id of f.picker.choices) {
					const unit = f.game.um.get_unit(id);
					#print('SA_CHOICE|' + role_of(id) + '|' + #uppercase(unit.get_def().name) + '|' + #uppercase(f.picker.rows[row_index].text)); row_index++;
				}
				const active_id = f.picker.choices[f.picker.selected];
				#print('SA_HIGHLIGHT|' + role_of(active_id));
			} else { #print('SA_CLOSED'); }
			for (role of ['scout', 'former', 'colony']) {
				const unit = f.game.um.get_unit(ids[role]); const tile = unit.get_tile();
				if (unit.owner != owner || unit.health != 1.0 || tile.x != origin.x || tile.y != origin.y) { throw Error('Sentry activation fixture ownership, health or position changed'); }
				if (unit.get_order() != 'NO_ORDERS' && unit.get_order() != 'HOLD' && unit.get_order() != 'SENTRY') { throw Error('Unexpected Sentry activation order'); }
				#print('SA_UNIT|' + role + '|' + (unit.get_order() == 'HOLD' ? '2' : (unit.get_order() == 'SENTRY' ? '1' : '0')) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
			}
			#print('SA_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) { f.action(action); observe(index); index++; }
		f.view.root.remove(); f = null; #print('SA_CASE_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('SA_ERROR|' + #to_string(error)); } }
};
for (input of sentry_activation_inputs) { run(input); }
