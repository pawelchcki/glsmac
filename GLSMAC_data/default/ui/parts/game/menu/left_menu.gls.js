return {

	init: (p) => {
		const entries = [];
		for (definition of p.menu.headers) {
			const header = definition;
			entries :+ {
				label: header.label,
				toggle: true,
				open: () => { p.menu.open_child(header.id); },
				close: () => { p.menu.close(header.id); },
			};
		}
		const menu = p.create(entries);
		menu.el.align = 'bottom left';
		menu.el.left = 0;
		menu.el.bottom = p.menu.bottom_bar_height;
		menu.el.on('keydown', (e) => {
			if (e.code == 'TAB' && e.modifiers == {}) {
				let child_open = false;
				for (id in p.menu.menus) {
					if (id != 'left_menu' && p.menu.menus[id].is_open) { child_open = true; }
				}
				// Escape already closed the child: retain that header when Tab
				// hides the root, so its next click toggles the retained choice.
				p.menu.close('left_menu', !child_open);
			}
			// Native frontend Tab navigation still receives this key.
			return false;
		});
		return menu;
	},

};
