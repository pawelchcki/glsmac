// Source identity is stable under installed wording changes. Live controller
// and native validation own the selected unit and ordinary disband effect.
return (menu, p) => {
	const root = menu.menus.left_menu; const state = {alive: true};
	root.el.on('remove', () => { state.alive = false; });
	for (header of menu.headers) { if (header.source == 'ACTION') {
		const child_id = header.id;
		for (entry of header.entries) { if (#is_defined(entry.source_index) && entry.source_index == 9) {
			entry.open = () => {
				if (!state.alive || !root.is_open) { return; }
				const child = menu.menus[child_id]; if (!#is_defined(child) || !child.is_open) { return; }
				if (!#is_defined(p.modules) || !#is_defined(p.modules.bottom_bar)) { return; }
				const bar = p.modules.bottom_bar;
				if (!#is_defined(bar.pp) || !#is_defined(bar.pp.sections) || !#is_defined(bar.pp.sections.object_preview)) { return; }
				const preview = bar.pp.sections.object_preview;
				if (preview.disband.open()) { root.clear_active(); }
			};
		} }
	} }
};
