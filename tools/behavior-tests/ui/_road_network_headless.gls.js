const fixture = #include('./_road_network_fixture');
const observe_case = (input) => {
	#print('NETWORK_CASE|' + input.id);
	try {
		const parts = #split(input.profile, '-'); const f = fixture(parts[0] + '_' + parts[1]); const initial = f.game.get_turn();
		const observe = (index) => {
			const unit = f.current_unit(); const tile = unit.get_tile(); const data = f.game.tm.get_terraforming(tile.x, tile.y);
			const position = tile.x == 2 ? 0 : (input.profile == 'base-road' ? (0 - 1) : 1);
			#print('NETWORK_STATE|' + #to_string(index) + '|' + #to_string(f.game.get_turn() - initial) + '|' +
				#to_string(position) + '|' + #to_string(#round((1.0 - unit.movement) * 3.0)) + '|' +
				#to_string(tile.get_base() != null) + '|' + #to_string(data.road) + '|' + #to_string(data.forest) + '|' +
				#to_string(tile.moisture) + '|' + #to_string(tile.rockiness));
		};
		observe(0); let index = 1;
		for (action of input.actions) {
			if (action == 'advance') { f.advance(); } else {
				f.move(input.profile == 'base-road' ? action == 'west' : action == 'east');
			}
			observe(index); index++;
		}
		#print('NETWORK_DONE');
	} catch { : (error) => { #print('NETWORK_ERROR|' + #to_string(error)); } }
};
for (input of road_network_inputs) { observe_case(input); }
