const source = #include('../../../game/research_dialog');
const science = #include('../../../game/research');
const categories = ['EXPLORE', 'DISCOVER', 'BUILD', 'CONQUER'];
return {
	init: (p) => {
		const state = {alive: true, active: true, definition: null};
		const owner = p.modules.popup.popups.research.el;
		owner.on('remove', () => { state.alive = false; });
		owner.listen(p.game, 'turn_status', (e) => { state.active = e.status == 'active' || e.status == 'turn_complete'; });
		const can_open = () => {
			if (!state.alive || !state.active || p.modules.popup.is_shown() || #typeof(p.game.get_research_state) != 'Callable') { return false; }
			const player = p.game.get_player();
			if (!p.game.is_started() || p.game.get_turn() < 1 || p.game.is_turn_complete(player.id)) { return false; }
			if (#typeof(p.game.get_opening_state) == 'Callable') {
				const phase = p.game.get_opening_state().phase; if (phase != 'none' && phase != 'map') { return false; }
			}
			return true;
		};
		this.open_laboratories = () => {
			if (!can_open() || #typeof(p.game.get_research_science) != 'Callable') { return false; }
			const player = p.game.get_player(); const research = p.game.get_research_state(player.id);
			let target = '';
			const definitions = p.game.get('technology_rules');
			if (#is_defined(definitions)) { for (entry of definitions) { if (entry.id == research.target_id) { target = entry.name + ''; } } }
			const data = {target: target, accumulated: p.game.get_research_science(player.id).accumulated, per_turn: science.income(p.game, player.id)};
			data.definition = source.load_laboratories(p.glsmac);
			p.modules.popup.set('laboratories', data); p.modules.popup.show('laboratories', (result) => {}); return true;
		};
		this.open = () => {
			if (!can_open()) { return false; }
			const player = p.game.get_player();
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
		owner.listen(p.root, 'keydown', (e) => {
			if (e.code == 'R' && e.modifiers == {shift: true}) { return this.open(); }
			if (e.code == 'F2' && e.modifiers == {}) { return this.open_laboratories(); }
			return false;
		});
	},
};
