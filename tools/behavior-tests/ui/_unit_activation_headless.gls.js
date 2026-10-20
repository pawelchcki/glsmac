// Observe actual production popup controls and native units/controller.
const fixture = #include('./_unit_activation_fixture');
const run = (input) => {
	#print('ACT_CASE|' + input.id);
	try {
		const f = fixture(input.profile); const initial = f.game.get_turn();
		const ids = {scout: f.units[0].id + 0, former: f.units[1].id + 0, colony: f.units[2].id + 0};
		const role_of = (id) => {
			if (id == null) { return 'none'; }
			for (role of ['scout', 'former', 'colony']) { if (ids[role] == id) { return role; } }
			throw Error('Activation controls returned an unknown native unit');
		};
		const observe = (index) => {
			const selected = f.selected_id();
			#print('ACT_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_turn() - initial) + '|' + role_of(selected));
			if (f.popup.is_shown()) {
				#print('ACT_PICKER|' + #uppercase(f.picker.header.text));
				let row_index = 0;
				for (id of f.picker.choices) {
					const unit = f.game.um.get_unit(id);
					#print('ACT_CHOICE|' + role_of(id) + '|' + #uppercase(unit.get_def().name) + '|' + #uppercase(f.picker.rows[row_index].text)); row_index++;
				}
				const active_id = f.picker.choices[f.picker.selected];
				#print('ACT_HIGHLIGHT|' + role_of(active_id));
			} else { #print('ACT_CLOSED'); }
			for (role of ['scout', 'former', 'colony']) {
				const unit = f.game.um.get_unit(ids[role]);
				if (unit.get_order() != 'NO_ORDERS' && unit.get_order() != 'HOLD') { throw Error('Unexpected activation order'); }
				#print('ACT_UNIT|' + role + '|' + (unit.get_order() == 'HOLD' ? 'hold' : 'none') + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
			}
			#print('ACT_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) { f.action(action); observe(index); index++; }
		#print('ACT_CASE_DONE');
	} catch { : (error) => { #print('ACT_ERROR|' + #to_string(error)); } }
};
for (input of activation_inputs) { run(input); }
