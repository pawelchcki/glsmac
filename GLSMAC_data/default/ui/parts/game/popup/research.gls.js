return {
	init: (p) => {
		this.p = p; this.generation = #is_defined(this.generation) ? this.generation + 1 : 0;
		this.rows = []; this.texts = []; this.pending = null; this.caller = null;
		const data = p.create(' ', 650, 330, (body, finish) => { this.body = body; this.finish = finish; });
		this.data = data; this.header = data.header_text;
		data.on_keydown = (e) => {
			if (e.modifiers != {}) { return false; }
			if (e.code == 'ESCAPE' || e.code == 'ENTER') {
				if (this.pending != null || (!this.blind && #sizeof(this.rows) > 0)) { return true; }
				this.finish(true); return true;
			}
			return false;
		};
		data.el.on('remove', () => { this.generation = this.generation + 1; this.pending = null; });
		data.el.listen(p.game, 'event_result', (e) => {
			const pending = this.pending;
			if (pending == null || e.name != pending.name || e.caller != pending.caller || !#is_defined(e.data) || #typeof(e.data) != 'Object' || !#is_defined(e.success) || #typeof(e.success) != 'Bool') { return; }
			if (pending.name == 'set_research_target' && (!#is_defined(e.data.target_id) || e.data.target_id != pending.target)) { return; }
			if (pending.name == 'set_research_priority' && (!#is_defined(e.data.priority) || !#is_defined(e.data.enabled) || e.data.priority != pending.priority || e.data.enabled != pending.enabled)) { return; }
			this.pending = null;
			if (this.is_open()) {
				if (e.success && !this.blind && pending.generation == this.generation) { this.finish(true); }
				else { this.refresh(); this.error.text = e.success || pending.generation != this.generation ? '' : 'Research change was rejected. Try again.'; }
			}
		});
		return data;
	},
	is_open: () => { return this.p.modules.popup.popup == this.data && !this.p.modules.popup.popup_hiding; },
	refresh: () => {
		if (this.blind && this.caller != null) {
			const state = this.p.game.get_research_state(this.caller); let index = 0;
			for (row of this.rows) { row.check.text = state.priorities[index] ? 'X' : ''; index++; }
		}
	},
	submit: (index, generation) => {
		if (generation != this.generation || this.pending != null || !this.is_open() || this.p.game.get_player().id != this.caller) { return; }
		if (this.blind) {
			const state = this.p.game.get_research_state(this.caller); const enabled = !state.priorities[index];
			const error = this.p.game.validate_research_priority(this.caller, index);
			if (#is_defined(error)) { this.error.text = 'Research change is unavailable.'; return; }
			const caller = this.caller;
			this.pending = {name: 'set_research_priority', caller: caller, priority: index, enabled: enabled, generation: generation};
			this.p.game.event('set_research_priority', {priority: index, enabled: enabled});
		} else {
			const choice = this.rows[index]; const id = choice.id + 0;
			const error = this.p.game.validate_research_target(this.caller, id);
			if (#is_defined(error)) { this.error.text = 'Research target is unavailable.'; return; }
			const caller = this.caller;
			this.pending = {name: 'set_research_target', caller: caller, target: id, generation: generation};
			this.p.game.event('set_research_target', {target_id: id});
		}
	},
	set: (input) => {
		this.generation = this.generation + 1; const generation = this.generation;
		this.caller = input.caller; this.blind = input.blind;
		this.body.clear(); this.rows = []; this.texts = [];
		this.header.text = #uppercase(this.blind ? input.definition.priorities.caption : input.definition.directed.caption);
		if (this.blind) {
			let top = 8;
			for (line_index of [0, 1, 2]) {
				this.texts :+ this.body.text({class: 'game-popup-text', text: input.definition.priorities.lines[line_index], top: top, left: 10, font: 'arialnb.ttf:14'}); top += 20;
			}
			for (let index = 0; index < 4; index++) {
				const category = index;
				const button = this.body.button({class: 'game-popup-button', text: #uppercase(input.definition.priorities.lines[index + 3]), top: top + index * 38, left: 46, right: 15, height: 30, textalign: 'left center'});
				const check = this.body.button({class: 'game-popup-button', text: '', top: top + index * 38 + 4, left: 12, width: 25, height: 22});
				const row = {}; row.el = button; row.check = check; this.rows :+ row;
				button.on('click', (e) => { this.submit(category, generation); return true; });
				check.on('click', (e) => { this.submit(category, generation); return true; });
			}
		} else {
			const list = this.body.scrollview({left: 0, right: 0, top: 0, bottom: 40, has_hscroll: false, vscroll_class: 'default-scroll-v'});
			const grid = list.area({left: 0, top: 0, width: 640, height: ((#sizeof(input.choices) + 1) / 2) * 65 + 10});
			let index = 0;
			for (choice of input.choices) {
				const ordinal = index; const column = index % 2; const line = index / 2;
				const button = grid.button({class: 'game-popup-button', text: #uppercase(choice.name), top: 10 + line * 65, left: 10 + column * 315, width: 305, height: 35});
				const text = grid.text({class: 'game-popup-text', text: choice.category, top: 46 + line * 65, left: 15 + column * 315, font: 'arialnb.ttf:12'});
				const row = {id: choice.id}; row.el = button; row.category = text; this.rows :+ row;
				button.on('click', (e) => { this.submit(ordinal, generation); return true; }); index++;
			}
			if (#sizeof(input.choices) == 0) { this.texts :+ this.body.text({class: 'game-popup-text', text: 'No research targets are available.', top: 20, left: 15}); }
		}
		if (this.blind || #sizeof(input.choices) == 0) {
			this.ok = this.body.button({class: 'game-popup-button', text: #uppercase(input.definition.labels.ok), align: 'bottom center', bottom: 8, left: 200, right: 200, height: 25});
			this.ok.on('click', (e) => { if (generation == this.generation && this.pending == null && this.is_open()) { this.finish(true); } return true; });
		}
		this.error = this.body.text({class: 'game-popup-text', text: '', align: 'bottom left', bottom: 40, left: 10, font: 'arialnb.ttf:12'});
		this.refresh();
	},
	on_hide: () => { this.generation = this.generation + 1; },
};
