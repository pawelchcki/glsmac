return {
	init: (p) => {
		this.game = p.game;
		this.rows = []; this.frames = []; this.choices = []; this.selected = 0; this.generation = 0; this.active = false;
		const data = p.create(' ', 460, 210, (body, cb) => { this.body = body; this.finish = cb; });
		this.header = data.header_text;
		data.on_keydown = (e) => {
			if (!this.active || e.modifiers != {}) { return false; }
			if (e.code == 'UP') { if (this.selected > 0) { this.select(this.selected - 1); } return true; }
			if (e.code == 'DOWN') { if (this.selected + 1 < #sizeof(this.choices)) { this.select(this.selected + 1); } return true; }
			if (e.code == 'ENTER') { this.finish(this.choices[this.selected]); return true; }
			// Home/End and clicks on the unit-name text leave the draft unchanged.
			return false;
		};
		return data;
	},
	select: (index) => {
		this.selected = index; let n = 0;
		for (frame of this.frames) { frame.border = n == index ? 'rgb(120,164,212),2' : 'rgb(35,59,34),1'; n++; }
	},
	set: (data) => {
		this.generation = this.generation + 1; const generation = this.generation;
		this.body.clear(); this.rows = []; this.frames = []; this.choices = [];
		this.header.text = data.definition.caption;
		let index = 0;
		for (choice of data.choices) {
			this.choices :+ choice.id;
			// Static portraits match the current conventional-unit preview. Names
			// come from the actual installed native unit definitions.
			const frame = this.body.panel({left: 12, top: 12 + index * 42, width: 44, height: 38});
			const unit = this.game.get_um().get_unit(choice.id); const preview_data = {}; preview_data.unit = unit;
			frame.widget({type: 'unit-preview', left: 1, right: 1, top: 1, bottom: 1, data: preview_data});
			this.frames :+ frame;
			const row = this.body.text({class: 'game-popup-text', text: choice.name, left: 70, top: 20 + index * 42, font: 'arialnb.ttf:16'});
			this.rows :+ row; index++;
		}
		this.ok = this.body.button({class: 'game-popup-button', text: 'OK', left: 12, right: 236, top: 174, is_ok: true});
		this.cancel = this.body.button({class: 'game-popup-button', text: 'CANCEL', left: 236, right: 12, top: 174, is_cancel: true});
		this.ok.on('click', (e) => { if (this.active && this.generation == generation) { this.finish(this.choices[this.selected]); } return true; });
		this.cancel.on('click', (e) => { if (this.active && this.generation == generation) { this.finish(false); } return true; });
		this.select(0);
	},
	on_show: () => { this.active = true; },
	on_hide: () => { this.active = false; this.generation = this.generation + 1; },
};
