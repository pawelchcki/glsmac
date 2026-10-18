return (i) => {
	const factions = i.glsmac.game.get_fm().list();
	let items = [['RANDOM', 'Random']];
	for (faction of factions) {
		items :+[faction.id, faction.name];
	}
	let choices = null;
	let starting = false;
	i.popup.show({
		title: 'Choose your faction',
		width: 480,
		height: 340,
		generator: (body) => {
			const selected_label = body.text({
				class: 'popup-text',
				text: 'Faction: Random',
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
				value: 'RANDOM',
			});
			choices.on('select', (e) => {
				for (item of items) {
					if (item[0] == e.value) {
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
					const selected = choices.value;
					let valid = selected == 'RANDOM';
					for (faction of factions) {
						if (faction.id == selected) {
							valid = true;
						}
					}
					if (!valid) {
						i.popup.error('Choose an available faction.');
						return true;
					}
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
