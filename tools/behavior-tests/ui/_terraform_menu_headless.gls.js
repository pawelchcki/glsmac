// Requested controls are delivered to mounted production nodes. This probe
// supplies no row effects, menu closure or result state.
const fixture = #include('./_terraform_menu_fixture');
for (input of terraform_menu_inputs) {
	#print('TMENU_CASE|' + input.id);
	try {
		const f = fixture(input);
		const observe = (index) => {
			const state = f.observe(); const terrain = state.terrain;
			#print('TMENU_STATE|' + #to_string(index) + '|' + #to_string(state.year_delta) + '|' +
				(state.selected == null ? 'none' : state.selected) + '|' + state.order + '|' +
				#to_string(state.movement_spent) + '|' + #to_string(state.work_units) + '|' +
				#to_string(terrain.road) + '|' + #to_string(terrain.farm) + '|' + #to_string(terrain.mine) + '|' +
				#to_string(terrain.forest) + '|' + #to_string(state.root_open) + '|' +
				(state.child_header == null ? 'none' : #to_string(state.child_header)));
		};
		observe(0); let index = 1;
		for (action of input.actions) {
			if (action == 'menu') { f.click_menu(); }
			else if (action == 'escape') { f.escape(); }
			else if (action == 'tab') { f.tab(); }
			else if (#typeof(action) == 'Object' && #is_defined(action.header)) { f.click_header(action.header); }
			else if (#typeof(action) == 'Object' && #is_defined(action.terrain_index)) { f.click_terrain(action.terrain_index); }
			else { throw Error('Unknown requested Terraform menu control'); }
			observe(index); index++;
		}
		#print('TMENU_DONE');
	} catch { : (error) => { #print('TMENU_ERROR|' + #to_string(error)); } }
}
