return (i) => {
	const setup = i.smac_data.faction_setup();
	const definitions = {}; const defaults = {};
	for (faction of setup.factions) { definitions[faction.id] = faction; defaults[faction.id] = #clone(faction.values); }
	let roster = #is_defined(i.faction_roster) ? #clone(i.faction_roster) : #clone(setup.expansion);
	const remember_roster = () => { i.faction_roster = #clone(roster); }; let selected_slot = 0; let preview = 0; let random = false; let starting = false;
	let refresh = () => {};
	const available = (id) => {
		if (id == 'RANDOM') { return true; }
		for (faction of i.glsmac.game.get_fm().list()) { if (faction.id == id) { return true; } }
		return false;
	};
	const launch = (id, name) => {
		if (starting) { return true; }
		if (!available(id)) { i.popup.error('Choose an available faction.'); return true; }
		let previous_research_mode = null;
		try {
			if (#is_defined(i.pending_research_blind)) {
				previous_research_mode = i.settings.global.rules.get_blind_research();
				i.settings.global.rules.set_blind_research(i.pending_research_blind);
			}
			i.settings.local.player_name = name;
			if (id == 'RANDOM') { i.glsmac.start_game(id + ''); }
			else {
				const identity = []; const values = definitions[id].values;
				for (let index = 0; index < 6; index++) { identity :+ values[index] + ''; }
				identity[0] = name + '';
				i.glsmac.start_game(id + '', identity);
			}
			starting = true;
		} catch { GSEGameError: (error) => {
			if (previous_research_mode != null) { i.settings.global.rules.set_blind_research(previous_research_mode); }
			i.popup.error(error.reason);
		} }
		return true;
	};
	let customize = null;
	const choose_name = () => {
		if (starting) { return true; }
		if (random) { return launch('RANDOM', 'Player'); }
		const id = roster[selected_slot];
		if (id == 'RANDOM') { return launch(id, 'Player'); }
		if (!available(id)) { i.popup.error('Choose an available faction.'); return true; }
		const faction = definitions[id]; const values = faction.values;
		// The original name prompt follows the header's leader-gender flag;
		// editing the free-form Gender description does not change that flag.
		const dialog = setup.name[faction.leader_gender == 'M' ? 0 : 1];
		let name = values[0] + ''; let field = null;
		const submit = (e) => { return launch(id, field.value); };
		i.popup.show({
			title: dialog.caption, width: 660, height: 130,
			generator: (body) => {
				body.text({class: 'popup-text faction-editor-label', text: dialog.label, align: 'left top', left: 10, top: 12});
				field = body.input({class: 'popup-input', left: 150, right: 10, top: 8, height: 26, value: name});
				field.on('change', (e) => { field.value = (field.value + '')[0::23]; name = field.value; return true; });
				field.on('input', submit);
			},
			buttons: [
				{style: {text: dialog.button, align: 'left', width: 210}, onclick: (e) => { i.popup.complete(); customize(id); return true; }},
				{style: {text: setup.buttons[2] + '', align: 'center', width: 210, is_ok: true}, onclick: submit},
				{style: {text: setup.buttons[3] + '', align: 'right', width: 210, is_cancel: true}, onclick: (e) => { i.popup.back(); return true; }},
			],
		}); return true;
	};
	customize = (id) => {
		if (id == 'RANDOM' || starting) { return true; }
		const faction = definitions[id]; let values = #clone(faction.values); const fields = [null, null, null, null, null, null, null];
		const submit = (e) => { faction.values = #clone(values); i.popup.complete(); return true; };
		i.popup.show({
			title: setup.customize.caption, width: 660, height: 290,
			generator: (body) => {
				// The native UI focuses the first created editor. Keep visual order
				// independent so the original initial Gender focus is preserved.
				for (let index = 6; index >= 0; index--) {
					const ordinal = index;
					body.text({class: 'popup-text faction-editor-label', text: setup.labels[index] + '', align: 'left top', left: 10, top: 12 + index * 23});
					const field = body.input({class: 'popup-input', left: 150, right: 10, top: 8 + index * 23, height: 22, value: values[index] + ''});
					fields[index] = field;
					field.on('change', (e) => { const limit = ordinal == 1 ? 39 : 23; field.value = (field.value + '')[0::limit]; values[ordinal] = field.value; return true; });
					field.on('input', submit);
				}
			},
			buttons: [
				{style: {text: setup.customize.button, align: 'left', width: 210}, onclick: (e) => {
					values = #clone(defaults[id]); for (let index = 0; index < 7; index++) { fields[index].value = values[index] + ''; } return true;
				}},
				{style: {text: setup.buttons[2] + '', align: 'center', width: 210, is_ok: true}, onclick: submit},
				{style: {text: setup.buttons[3] + '', align: 'right', width: 210, is_cancel: true}, onclick: (e) => { i.popup.back(); return true; }},
			],
		}); return true;
	};
	const select_slot = (index) => { preview = index; if (!random) { selected_slot = index; } refresh(); return true; };
	const edit_roster = (index) => {
		select_slot(index);
		const items = [];
		for (faction of setup.factions) { items :+ [faction.id, definitions[faction.id].values[2] + '']; }
		items :+ ['RANDOM', setup.random];
		i.popup.show({
			title: setup.caption, width: 480, height: 450,
			generator: (body) => {
				const list = body.scrollview({left: 10, right: 10, top: 10, bottom: 10, has_hscroll: false, vscroll_class: 'default-scroll-v'});
				const choices = list.choicelist({left: 0, right: 0, top: 0, height: #sizeof(items) * 24 + 1, keyboard: true,
					itemclass: 'popup-list-button', itemheight: 23, itempadding: 1, items: items, value: roster[index] + ''});
				choices.on('select', (e) => {
					for (item of items) { if (item[0] == e.value) { roster[index] = e.value; remember_roster(); i.popup.complete(); return true; } }
					return true;
				});
			},
		}); return true;
	};
	i.popup.show({
		title: setup.caption, width: 800, height: 340, cancel_through: 'rules',
		on_keydown: (e) => {
			if (e.code == 'UP' || e.code == 'DOWN') {
				let next = preview;
				if (e.code == 'UP' && next > 0) { next--; }
				if (e.code == 'DOWN' && next < 6) { next++; }
				select_slot(next); return true;
			}
			return false;
		},
		generator: (body) => {
			const row_buttons = []; const roles = []; const mode_buttons = [];
			for (definition of [['base', setup.presets[0]], ['expansion', setup.presets[1]]]) {
				const preset = definition[0]; const button = body.button({class: 'popup-list-button faction-preset-' + preset,
					text: definition[1] + '', left: preset == 'base' ? 10 : 400, width: 380, top: 8, height: 28});
				button.on('click', (e) => { roster = #clone(setup[preset]); selected_slot = 0; preview = 0; remember_roster(); refresh(); return true; });
			}
			for (definition of [['selected', setup.modes[1]], ['random', setup.modes[0]]]) {
				const mode = definition[0]; const button = body.button({class: 'popup-list-button faction-mode-' + mode,
					text: definition[1] + '', left: 10, width: 240, top: mode == 'selected' ? 58 : 94, height: 28});
				button.on('click', (e) => { random = mode == 'random'; preview = random ? -1 : selected_slot; refresh(); return true; });
				mode_buttons :+ button;
			}
			for (let index = 0; index < 7; index++) {
				const slot = index;
				const row = body.button({class: 'popup-list-button faction-row', text: '', left: 260, right: 40, top: 50 + index * 27, height: 26, textalign: 'left center', textleft: 8});
				row.on('click', (e) => { return select_slot(slot); }); row_buttons :+ row;
				const role = body.text({class: 'popup-text faction-role', text: '', color: 'rgb(13,23,36)', font: 'arialnb.ttf:17', left: 540, top: 54 + index * 27}); roles :+ role;
				const arrow = body.button({class: 'popup-list-button faction-dropdown', text: 'v', align: 'right top', right: 10, width: 26, top: 50 + index * 27, height: 26});
				arrow.on('click', (e) => { return edit_roster(slot); });
			}
			refresh = () => {
				for (let index = 0; index < 7; index++) {
					const id = roster[index]; const is_random = id == 'RANDOM';
					row_buttons[index].text = (is_random ? setup.random : definitions[id].values[1]) + '';
					row_buttons[index].class = 'popup-list-button faction-row' + (preview == index ? ' faction-row-active popup-choice-active' : '');
					roles[index].text = is_random ? '' : definitions[id].role;
				}
				mode_buttons[0].class = 'popup-list-button faction-mode-selected' + (!random ? ' faction-mode-active popup-choice-active' : '');
				mode_buttons[1].class = 'popup-list-button faction-mode-random' + (random ? ' faction-mode-active popup-choice-active' : '');
			}; refresh();
		},
		buttons: [
			{style: {text: setup.buttons[0] + '', align: 'left', left: 0, width: 185}, onclick: (e) => {
				if (preview < 0 || roster[preview] == 'RANDOM') { return true; }
				const faction = definitions[roster[preview]];
				i.popup.show({title: setup.buttons[0] + '', width: 660, height: 290,
					generator: (body) => {
						for (let index = 0; index < 7; index++) { body.text({class: 'popup-text', text: setup.labels[index] + ' ' + faction.values[index], left: 10, top: 10 + index * 24}); }
					}, buttons: [{style: {text: setup.buttons[2] + '', align: 'center', width: 210, is_ok: true, is_cancel: true}, onclick: (e) => { i.popup.back(); return true; }}]}); return true;
			}},
			{style: {text: setup.buttons[1] + '', align: 'left', left: 195, width: 185}, onclick: (e) => { if (preview < 0) { preview = 6; } selected_slot = preview; random = false; refresh(); return customize(roster[preview]); }},
			{style: {text: setup.buttons[2] + '', align: 'right', right: 195, width: 185, is_ok: true}, onclick: (e) => { return choose_name(); }},
			{style: {text: setup.buttons[3] + '', align: 'right', right: 0, width: 185, is_cancel: true}, onclick: (e) => { i.popup.back(); return true; }},
		],
	});
};
