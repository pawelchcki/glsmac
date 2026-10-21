return {

	init: (p) => {
		const entries = [];
		for (definition of p.menu.headers) {
			const header = definition;
			entries :+ {
				label: header.label,
				open: () => { p.menu.open_child(header.id); },
				close: () => { p.menu.close(header.id); },
			};
		}
		const menu = p.create(entries);
		menu.el.align = 'bottom left';
		menu.el.left = 0;
		menu.el.bottom = p.menu.bottom_bar_height;
		menu.el.on('keydown', (e) => {
			if (e.code == 'TAB' && e.modifiers == {}) { p.menu.close('left_menu'); }
			// Native frontend Tab navigation still receives this key.
			return false;
		});
		return menu;
	},

};
