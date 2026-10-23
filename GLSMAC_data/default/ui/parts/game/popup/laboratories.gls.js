// Read-only ledger and city allocation report. Cost and acquisition are separate
// policies; this view does not infer either from owned technology counts.
return {
	init: (p) => {
		this.active = false; this.generation = 0;
		const data = p.create(' ', 500, 220, (body, finish) => { this.body = body; this.finish = finish; });
		this.header = data.header_text;
		data.on_keydown = (e) => {
			if (this.active && e.modifiers == {} && (e.code == 'ENTER' || e.code == 'ESCAPE')) { this.finish(true); return true; }
			return false;
		};
		data.el.on('remove', () => { this.active = false; this.generation = this.generation + 1; });
		return data;
	},
	set: (input) => {
		this.generation = this.generation + 1; const generation = this.generation;
		this.body.clear(); this.header.text = #uppercase(input.definition.caption);
		this.summary = this.body.text({class: 'game-popup-text', text: #uppercase(input.definition.summary), left: 15, top: 15});
		this.target = this.body.text({class: 'game-popup-text', text: input.target, left: 15, top: 50});
		this.accumulated = this.body.text({class: 'game-popup-text', text: input.definition.accumulated + ': ' + #to_string(input.accumulated), left: 15, top: 88});
		this.per_turn = this.body.text({class: 'game-popup-text', text: input.definition.per_turn + ': ' + #to_string(input.per_turn), left: 15, top: 120});
		this.ok = this.body.button({class: 'game-popup-button', text: #uppercase(input.definition.ok), align: 'bottom center', bottom: 10, left: 180, right: 180, height: 25});
		this.ok.on('click', (e) => { if (this.active && generation == this.generation) { this.finish(true); } return true; });
	},
	on_show: () => { this.active = true; },
	on_hide: () => { this.active = false; this.generation = this.generation + 1; },
};
