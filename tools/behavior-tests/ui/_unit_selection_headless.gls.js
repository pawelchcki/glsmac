// The fixture supplies native units and the production controller, never a
// selection heuristic or expected output. Display/transport are omitted.
const fixture = #include('./_unit_selection_fixture');
const observe_case = (input) => {
	#print('SELECT_CASE|' + input.id);
	try {
		const f = fixture(input.profile); const initial = f.game.get_turn();
		const origin = f.base.get_tile(); const ids = {};
		ids.scout = f.units[0].id + 0; ids.former = f.units[1].id + 0; ids.colony = f.units[2].id + 0;
		const observe = (index) => {
			const selected_id = f.selected_id(); let selected = 'none';
			for (role of ['scout', 'former', 'colony']) { if (ids[role] == selected_id) { selected = role; } }
			if (selected_id != null && selected == 'none') { throw Error('Selection controller returned an unknown unit'); }
			#print('SELECT_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_turn() - initial) + '|' + selected);
			if (input.kind == 'wait') {
				#print('SELECT_DEFER|' + #to_string(f.is_deferred(ids.scout)) + '|' + #to_string(f.is_deferred(ids.former)) + '|' + #to_string(f.is_deferred(ids.colony)));
			} else {
				for (role of ['scout', 'former', 'colony']) {
					const unit = f.game.um.get_unit(ids[role]); const tile = unit.get_tile();
					if (unit.get_order() != 'NO_ORDERS' && unit.get_order() != 'HOLD') { throw Error('Unexpected native selection order'); }
					#print('SELECT_UNIT|' + role + '|' + #to_string(tile.x - origin.x) + '|' + #to_string(tile.y - origin.y) + '|' +
						(unit.get_order() == 'HOLD' ? 'hold' : 'none') + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)));
				}
			}
			#print('SELECT_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) { f.action(action); observe(index); index++; }
		#print('SELECT_CASE_DONE');
	} catch { : (error) => { #print('SELECT_CASE_ERROR|' + #to_string(error)); } }
};
for (input of unit_selection_inputs) { observe_case(input); }
