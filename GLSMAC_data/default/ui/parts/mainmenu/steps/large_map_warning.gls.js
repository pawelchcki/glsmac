// Recorded VERYLARGEMAP controls: selection clamps, Home/End leave it alone,
// clicks select, and Enter/Escape/OK confirm the current choice.
return (i, definition, next) => {
	let selected = 0;
	let finished = false;
	const rows = [];
	const select = (index) => {
		selected = index;
		let n = 0;
		for (row of rows) {
			row.removeclass('popup-choice-active');
			row.addclass('popup-choice');
			if (n == selected) { row.addclass('popup-choice-active'); }
			n++;
		}
	};
	const finish = () => {
		if (finished) { return true; }
		finished = true;
		const type = i.settings.global.map.type;
		if (selected == 0 && (type == 'random' || type == 'custom')) {
			i.popup.complete(); next();
		} else {
			i.popup.back();
		}
		return true;
	};
	const make_choice = (body, label, index) => {
		const row = body.button({
			class: 'popup-choice', text: label, top: 15 + #sizeof(definition.lines) * 20 + index * 24,
			left: 15, right: 15, height: 21, textalign: 'left', textleft: 4,
		});
		row.on('click', (e) => { if (!finished) { select(index); } return true; });
		rows :+ row;
	};
	i.popup.show({
		title: definition.caption,
		cancel_through: 'map_setup',
		width: 680,
		height: 140 + #sizeof(definition.lines) * 20,
		generator: (body) => {
			let index = 0;
			for (line of definition.lines) {
				if (line != '') { body.text({class: 'popup-warning-text', text: line, align: 'top left', top: 15 + index * 20, left: 15}); }
				index++;
			}
			make_choice(body, definition.choices[0], 0);
			make_choice(body, definition.choices[1], 1);
			select(0);
		},
		on_keydown: (e) => {
			switch (e.code) {
				case 'DOWN': { if (!finished && selected < 1) { select(selected + 1); } return true; }
				case 'UP': { if (!finished && selected > 0) { select(selected - 1); } return true; }
				case 'HOME': { return true; }
				case 'END': { return true; }
				case 'ENTER': { return finish(); }
				case 'ESCAPE': { return finish(); }
			}
			return false;
		},
		buttons: [{style: {text: 'OK', align: 'center', width: 656, is_ok: true, is_cancel: true}, onclick: (e) => { return finish(); }}],
	});
};
