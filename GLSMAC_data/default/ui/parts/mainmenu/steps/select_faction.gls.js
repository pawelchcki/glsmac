return (i) => {
	const factions = i.glsmac.game.get_fm().list();
	let items = [['RANDOM', 'Random']];
	for (faction of factions) {
		items :+[faction.id, faction.name];
	}
	let choices = null;
	let selected = 'RANDOM';
	let starting = false;
	i.popup.show({
		title: 'Choose your faction',
		width: 480,
		height: 340,
		generator: (body) => {
			let selected_name = 'Random';
			for (item of items) {
				if (item[0] == selected) {
					selected_name = item[1];
				}
			}
			const selected_label = body.text({
				class: 'popup-text',
				text: 'Faction: ' + selected_name,
				align: 'top center',
				top: 6,
			});
			const list = body.scrollview({
				left: 10,
				right: 10,
				top: 34,
				bottom: 8,
				vscroll_class: 'default-scroll-v',
				has_hscroll: false,
			});
			choices = list.choicelist({
				left: 0,
				right: 0,
				top: 0,
				height: #sizeof(items) * 24 + 1,
				keyboard: true,
				itemclass: 'popup-list-button',
				itemheight: 23,
				itempadding: 1,
				items: items,
				value: selected,
			});
			choices.on('select', (e) => {
				for (item of items) {
					if (item[0] == e.value) {
						selected = e.value;
						selected_label.text = 'Faction: ' + item[1];
					}
				}
				return true;
			});
		},
		buttons: [
			{
				style: { text: 'Start', align: 'left', is_ok: true },
				onclick: (e) => {
					if (starting) {
						return true;
					}
					const faction_id = choices.value;
					let valid = faction_id == 'RANDOM';
					for (faction of factions) {
						if (faction.id == faction_id) {
							valid = true;
						}
					}
					if (!valid) {
						i.popup.error('Choose an available faction.');
						return true;
					}
					// Error popups rebuild this picker when dismissed.
					selected = faction_id;
					try {
						i.glsmac.start_game(selected);
						starting = true;
					} catch {
						GSEGameError: (error) => {
							i.popup.error(error.reason);
						}
					}
					return true;
				},
			},
			{
				style: { text: 'Cancel', align: 'right', is_cancel: true },
				onclick: (e) => {
					i.popup.back();
					return true;
				},
			},
		],
	});
};
