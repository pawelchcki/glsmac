// Project mounted controls only. Native setup/history/immutable guards are shared
// with the already bounded Terraform work fixture; no rows or effects supplied.
const fixture = #include('./_terraform_menu_fixture');
for (input of terraform_presentation_inputs) {
	#print('TPRESENT_CASE|' + input.id); let f = null;
	try {
		f = fixture(input); const initial_work = f.observe();
		const observe = (index) => {
			const state = f.observe();
			if (state.order != initial_work.order || state.movement_spent != initial_work.movement_spent ||
				state.work_units != initial_work.work_units || state.terrain != initial_work.terrain || #sizeof(f.pending.requests) != 0) {
				throw Error('Presentation-only navigation changed native work state');
			}
			#print('TPRESENT_STATE|' + #to_string(index) + '|' + #to_string(state.year_delta) + '|' +
				(state.selected == null ? 'none' : state.selected) + '|' + #to_string(state.root_open));
			if (state.root_open) {
				const root = f.menu.menus.left_menu; let header_index = 0;
				for (node of root.el.children) {
					if (!node.is_removed() && node.is_visible() && node.kind == 'button') {
						#print('TPRESENT_HEADER|' + #to_string(header_index) + '|' + #to_string(node.active) + '|' + node.text);
						header_index++;
					}
				}
				if (header_index != 9) { throw Error('Missing nine actual mounted headers'); }
				if (state.child_header != null) {
					if (state.child_header != 5) { throw Error('Unexpected actual menu child'); }
					const child = f.menu.menus.left_menu_terraform;
					#print('TPRESENT_CHILD|' + #to_string(state.child_header));
					for (node of child.el.children) {
						if (!node.is_removed() && node.is_visible()) {
							if (node.kind == 'button') { #print('TPRESENT_ROW|' + f.color(node) + '|' + node.text); }
							else if (#is_defined(node.class) && node.class == 'game-menu-separator') { #print('TPRESENT_SEPARATOR'); }
							else if (!#is_defined(node.class) || (node.class != 'game-menu-top-border' && node.class != 'game-menu-bottom-border')) {
								throw Error('Unrecognized actual Terraform child node');
							}
						}
					}
				}
			}
			#print('TPRESENT_STATE_DONE');
		};
		observe(0); let index = 1;
		for (action of input.actions) {
			if (action == 'menu') { f.click_menu(); }
			else if (action == 'escape') { f.escape(); }
			else if (action == 'tab') { f.tab(); }
			else if (#typeof(action) == 'Object' && #is_defined(action.header)) { f.click_header(action.header); }
			else { throw Error('Unknown Terraform presentation input'); }
			observe(index); index++;
		}
		f.view.root.remove(); f = null; #print('TPRESENT_DONE');
	} catch { : (error) => { if (f != null) { f.view.root.remove(); } #print('TPRESENT_ERROR|' + #to_string(error)); } }
}
