// Recorded owned-city Colony join source identity. The existing Colony
// controller and native join transaction own eligibility and every effect.

return (menu, p) => {
	const root = menu.menus.left_menu;
	const state = {alive: true, pending: null};
	root.el.on('remove', () => { state.alive = false; state.pending = null; });
	// Closing or switching a header invalidates only presentation completion.
	// An already submitted join retains the existing controller's authority.
	menu.on_close(() => { state.pending = null; });
	if (#is_defined(p.game)) {
		root.el.listen(p.game, 'event_result', (e) => {
			const pending = state.pending;
			if (!state.alive || pending == null) { return; }
			if (!#is_defined(e.data) || #typeof(e.data) != 'Object' || !#is_defined(e.data.unit_id) || !#is_defined(e.data.base_id)) { return; }
			if (!#is_defined(e.success) || #typeof(e.success) != 'Bool') { return; }
			if (e.name != 'join_base' || e.caller != pending.caller || e.data.unit_id != pending.unit_id || e.data.base_id != pending.base_id) { return; }
			state.pending = null;
			if (e.success && root.is_open && pending.child.is_open && !p.modules.popup.is_shown()) {
				root.clear_active();
			}
		});
	}
	for (header of menu.headers) {
		if (header.source == 'ACTION') {
			const child_id = header.id;
			for (entry of header.entries) {
				if (#is_defined(entry.source_index) && entry.source_index == 0) {
					entry.open = () => {
						if (!state.alive || state.pending != null || !root.is_open) { return; }
						const child = menu.menus[child_id];
						if (!#is_defined(child) || !child.is_open || !#is_defined(p.modules) || !#is_defined(p.modules.bottom_bar)) { return; }
						const bar = p.modules.bottom_bar;
						if (!#is_defined(bar.pp) || !#is_defined(bar.pp.sections) || !#is_defined(bar.pp.sections.object_preview)) { return; }
						const preview = bar.pp.sections.object_preview; const unit = preview.get_found_unit();
						if (unit == null || unit.get_tile().get_base() != null) { return; }
						preview.start_colony_action();
						if (preview.founding.dialog != null) { root.clear_active(); }
					};
				} else if (#is_defined(entry.source_index) && entry.source_index == 1) {
					entry.open = () => {
						if (!state.alive || state.pending != null || !root.is_open) { return; }
						const child = menu.menus[child_id];
						if (!#is_defined(child) || !child.is_open) { return; }
						if (!#is_defined(p.game) || !#is_defined(p.modules) || #typeof(p.game.get_player) != 'Callable') { return; }
						const bar = p.modules.bottom_bar;
						if (!#is_defined(bar) || !#is_defined(bar.pp) || !#is_defined(bar.pp.sections) || !#is_defined(bar.pp.sections.object_preview)) { return; }
						const preview = bar.pp.sections.object_preview;
						const unit = preview.get_found_unit();
						if (unit == null) { return; }
						const base = unit.get_tile().get_base();
						// This source binding covers joining an existing owned city.
						if (base == null || base.get_owner().id != p.game.get_player().id) { return; }
						const pending = {caller: p.game.get_player().id, unit_id: unit.id + 0, base_id: base.id + 0};
						pending.child = child; state.pending = pending;
						preview.found_selected_base();
					};
				}
			}
		}
	}
};
