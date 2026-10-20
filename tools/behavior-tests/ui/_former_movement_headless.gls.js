const fixture = #include('./_former_work_fixture');
const move = #include('../default/game/event/move_unit');
const observe_case = (input) => {
	#print('MOVE_CASE|' + input.id);
	try {
		const f = fixture('road'); f.enable_movement(); const initial = f.game.get_turn();
		const observe = (index) => {
			const unit = f.game.um.get_unit(f.former.id); const state = unit.get_terraforming(); const tile = unit.get_tile();
			const order = unit.get_order(); const name = order == 'TERRAFORM' ? state.action : (order == 'HOLD' ? 'hold' : 'none');
			const data = f.game.tm.get_terraforming(tile.x, tile.y);
			#print('MOVE_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_turn() - initial) + '|' + name + '|' +
				#to_string(#round((1.0 - unit.movement) * 3.0)) + '|' + #to_string(state.work_units) + '|' +
				#to_string(data.road) + '|' + #to_string(data.farm) + '|' + #to_string(data.mine) + '|' + #to_string(data.forest) + '|' +
				#to_string(tile.x == 2 ? 0 : (0 - 1)));
		};
		observe(0); let index = 1;
		for (action of input.actions) {
			if (action == 'west' || action == 'east') {
				const e = {caller: f.owner.id}; e.game = f.game;
				e.data = {}; e.data.unit = f.game.um.get_unit(f.former.id); e.data.tile = f.game.tm.get_tile(action == 'west' ? 0 : 2, 2);
				const error = move.validate(e); if (#is_defined(error)) { throw Error(error); }
				f.with_write(() => { e.resolved = move.resolve(e); e.applied = move.apply(e); });
				if (e.resolved.is_movement_successful) { f.finish_unit_move(f.former.id); }
			} else { if (action == 'advance') { f.advance(); } else { f.command(action); } }
			observe(index); index++;
		}
		#print('MOVE_DONE');
	} catch { : (e) => { #print('MOVE_ERROR|' + #to_string(e)); } }
};
for (input of former_movement_inputs) { observe_case(input); }
