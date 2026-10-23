const source = #include('../../../game/research_dialog');
const categories = ['EXPLORE', 'DISCOVER', 'BUILD', 'CONQUER'];
return {
	init: (p) => {
		const state = {alive: true, active: true, definition: null};
		const owner = p.modules.popup.popups.research.el;
		owner.on('remove', () => { state.alive = false; });
		owner.listen(p.game, 'turn_status', (e) => { state.active = e.status == 'active' || e.status == 'turn_complete'; });
		this.open = () => {
			if (!state.alive || !state.active || p.modules.popup.is_shown() || #typeof(p.game.get_research_state) != 'Callable') { return false; }
			const player = p.game.get_player();
			if (!p.game.is_started() || p.game.get_turn() < 1 || p.game.is_turn_complete(player.id)) { return false; }
			if (#typeof(p.game.get_opening_state) == 'Callable') {
				const phase = p.game.get_opening_state().phase; if (phase != 'none' && phase != 'map') { return false; }
			}
			if (state.definition == null) { state.definition = source.load(p.glsmac); }
			const blind = p.game.get_settings().global.rules.get_blind_research(); const choices = [];
			if (!blind) {
				const definitions = p.game.get('technology_rules');
				if (!#is_defined(definitions)) { return false; }
				for (let category = 0; category < 4; category++) {
					for (entry of definitions) {
						if (p.game.technologies.category(entry.id) == category && p.game.technologies.available(entry.id, player.id + 1, true)) {
							const root = entry.prerequisites == [(0 - 1), (0 - 1)];
							choices :+ {id: entry.id + 0, name: entry.name + '', category: categories[category] + (root ? ' 1' : '')};
						}
					}
				}
			}
			const data = {caller: player.id + 0, blind: blind}; data.definition = state.definition; data.choices = choices;
			p.modules.popup.set('research', data); p.modules.popup.show('research', (result) => {}); return true;
		};
		owner.listen(p.root, 'keydown', (e) => { if (e.code == 'R' && e.modifiers == {shift: true}) { return this.open(); } return false; });
	},
};
