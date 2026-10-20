const fixture = #include('./_former_work_fixture');
const observe_case = (input) => {
	#print('WORK_CASE|' + input.id);
	try {
		const f = fixture(input.profile); const initial = f.game.get_turn();
		const observe = (index) => {
			const unit = f.former; const state = unit.get_terraforming();
			const order = unit.get_order(); const name = order == 'TERRAFORM' ? state.action : (order == 'HOLD' ? 'hold' : 'none');
			const data = f.game.tm.get_terraforming(2, 2);
			#print('WORK_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_turn() - initial) + '|' + name + '|' +
				#to_string(#round((1.0 - unit.movement) * 3.0)) + '|' + #to_string(state.work_units) + '|' +
				#to_string(data.road) + '|' + #to_string(data.farm) + '|' + #to_string(data.mine) + '|' + #to_string(data.forest));
		};
		observe(0); let index = 1;
		for (action of input.actions) {
			if (action == 'advance') { f.advance(); } else { f.command(action); }
			observe(index); index++;
		}
		#print('WORK_DONE');
	} catch { : (e) => { #print('WORK_ERROR|' + #to_string(e)); } }
};
for (input of former_inputs) { observe_case(input); }
