return {
	init: (p) => {
		this.rows = []; this.texts = []; this.generation = 0; this.selected = 0;
		const data = p.create(' ', 500, 160, (body, cb) => { this.body = body; this.finish = cb; });
		this.header = data.header_text;
		data.on_keydown = (e) => {
			if (e.modifiers != {}) { return false; }
			if (e.code == 'UP') { this.select(0); return true; }
			if (e.code == 'DOWN') { this.select(1); return true; }
			if (e.code == 'ENTER') { this.finish(this.selected == 1); return true; }
			return false;
		};
		return data;
	},
	select: (index) => {
		this.selected = index; let n = 0;
		for (row of this.rows) {
			row.removeclass('popup-choice-active'); row.addclass('popup-choice');
			if (n == index) { row.addclass('popup-choice-active'); }
			n++;
		}
	},
	set: (data) => {
		this.generation = this.generation + 1; const generation = this.generation;
		for (node of this.texts) { node.remove(); } this.texts = [];
		for (node of this.rows) { node.remove(); } this.rows = [];
		if (#is_defined(this.ok)) { this.ok.remove(); }
		this.header.text = data.definition.caption;
		let top = 10;
		for (line of data.definition.lines) {
			this.texts :+ this.body.text({class: 'game-popup-text', text: line, top: top, left: 10, font: 'arialnb.ttf:14'}); top += 18;
		}
		let index = 0;
		for (label of data.definition.choices) {
			const choice = index;
			const row = this.body.button({class: 'popup-choice', text: label, top: top + index * 24, left: 10, right: 10, height: 22, textalign: 'left'});
			row.on('click', (e) => { if (this.generation == generation) { this.select(choice); } return true; });
			this.rows :+ row; index++;
		}
		this.ok = this.body.button({class: 'game-popup-button', text: 'OK', top: 133, left: 10, right: 10, is_ok: true});
		this.ok.on('click', (e) => { if (this.generation == generation) { this.finish(this.selected == 1); } return true; });
		this.select(0);
	},
};
