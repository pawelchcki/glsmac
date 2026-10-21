// Observed Action source identities. Wording and shortcut hints remain data;
// native order handlers and the existing order controller own all effects.
const commands = [[26, 'unit_sentry'], [29, 'unit_hold'], [30, 'unit_skip_turn']];

return (menu, p) => {
	const root = menu.menus.left_menu;
	const state = {alive: true, pending: null};
	root.el.on('remove', () => { state.alive = false; state.pending = null; });
	// A header switch or closure invalidates presentation completion, while
	// any already queued backend command retains its own authority/lifetime.
	menu.on_close(() => { state.pending = null; });
	if (#is_defined(p.game)) {
		root.el.listen(p.game, 'event_result', (e) => {
			const pending = state.pending;
			if (!state.alive || pending == null) { return; }
			if (!#is_defined(e.data) || #typeof(e.data) != 'Object' || !#is_defined(e.data.unit_id)) { return; }
			if (!#is_defined(e.success) || #typeof(e.success) != 'Bool') { return; }
			if (e.name != pending.name || e.caller != pending.caller || e.data.unit_id != pending.unit_id) { return; }
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
				if (#is_defined(entry.source_index)) {
					for (binding of commands) {
						if (entry.source_index == binding[0]) {
							const command = binding[1];
							entry.open = () => {
								if (!state.alive || state.pending != null || !root.is_open) { return; }
								const child = menu.menus[child_id];
								if (!#is_defined(child) || !child.is_open) { return; }
								if (!#is_defined(p.game) || !#is_defined(p.modules) || #typeof(p.game.get_player) != 'Callable') { return; }
								const bar = p.modules.bottom_bar;
								if (!#is_defined(bar) || !#is_defined(bar.pp) || !#is_defined(bar.pp.sections) || !#is_defined(bar.pp.sections.object_preview)) { return; }
								const preview = bar.pp.sections.object_preview;
								const unit = command == 'unit_skip_turn' ? preview.get_skip_unit() : preview.get_order_unit(false);
								if (unit == null) { return; }
								const pending = {name: command, caller: p.game.get_player().id, unit_id: unit.id + 0};
								pending.child = child; state.pending = pending;
								if (!preview.submit_unit_order(command)) { state.pending = null; }
							};
						}
					}
				}
			}
		}
	}
};
