// Recorded ordinary-land Terraform source identities. Labels remain installed
// data; the existing work controller and native command own all effects.
const commands = [[0, 'farm'], [2, 'mine'], [4, 'forest'], [5, 'road']];

return (menu, p) => {
	const root = menu.menus.left_menu;
	const state = {alive: true, pending: null};
	root.el.on('remove', () => { state.alive = false; state.pending = null; });
	// Closing or switching a header invalidates only presentation completion.
	// Already submitted work retains the existing controller's authority.
	menu.on_close(() => { state.pending = null; });
	if (#is_defined(p.game)) {
		root.el.listen(p.game, 'event_result', (e) => {
			const pending = state.pending;
			if (!state.alive || pending == null) { return; }
			if (!#is_defined(e.data) || #typeof(e.data) != 'Object' || !#is_defined(e.data.unit_id) || !#is_defined(e.data.action)) { return; }
			if (!#is_defined(e.success) || #typeof(e.success) != 'Bool') { return; }
			if (e.name != 'unit_terraform' || e.caller != pending.caller || e.data.unit_id != pending.unit_id || e.data.action != pending.action) { return; }
			state.pending = null;
			if (e.success && root.is_open && pending.child.is_open && !p.modules.popup.is_shown()) {
				root.clear_active();
			}
		});
	}
	for (header of menu.headers) {
		if (header.source == 'TERRAFORM') {
			const child_id = header.id;
			for (entry of header.entries) {
				if (#is_defined(entry.terrain_index)) {
					for (binding of commands) {
						if (entry.terrain_index == binding[0]) {
							const action = binding[1];
							entry.open = () => {
								if (!state.alive || state.pending != null || !root.is_open) { return; }
								const child = menu.menus[child_id];
								if (!#is_defined(child) || !child.is_open) { return; }
								if (!#is_defined(p.game) || !#is_defined(p.modules) || #typeof(p.game.get_player) != 'Callable') { return; }
								const bar = p.modules.bottom_bar;
								if (!#is_defined(bar) || !#is_defined(bar.pp) || !#is_defined(bar.pp.sections) || !#is_defined(bar.pp.sections.object_preview)) { return; }
								const preview = bar.pp.sections.object_preview;
								const unit = preview.get_work_unit(action);
								if (unit == null) { return; }
								const pending = {caller: p.game.get_player().id, unit_id: unit.id + 0, action: action};
								pending.child = child; state.pending = pending;
								if (!preview.submit_work(action)) { state.pending = null; }
							};
						}
					}
				}
			}
		}
	}
};
