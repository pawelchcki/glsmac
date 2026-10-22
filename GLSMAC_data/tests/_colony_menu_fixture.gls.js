// Declared initial native stack and mounted controls. No menu effects supplied.
const mounted = #include('./_unit_menu_orders_fixture');
return (input) => {
	const f = mounted('synthetic', input);
	f.action = (action) => {
		if (action == 'tab') { f.tab(); }
		else if (action == 'menu') { f.view.find('button', 'text', 'MENU').emit('click', {button: 'left'}); f.flush(); }
		else if (#typeof(action) == 'Object' && #is_defined(action.header) && action.header == 4) {
			const root = f.menu.menus.left_menu;
			if (!root.is_open || root.el.is_removed() || !root.el.is_visible()) { throw Error('MENU is not open'); }
			root.items[4].el.emit('click', {button: 'left'}); f.flush();
		} else if (#typeof(action) == 'Object' && #is_defined(action.row_source) && action.row_source == 1) {
			f.click_source(1); f.flush();
		} else { throw Error('Unknown Colony menu input'); }
	};
	return f;
};
