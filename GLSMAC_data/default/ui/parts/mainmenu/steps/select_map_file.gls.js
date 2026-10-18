return (i) => {
	const maps = i.glsmac.list_maps();
	if (#is_empty(maps)) {
		i.popup.error('No .MP or .GSM maps found in maps.');
		return;
	}
	let choices = null;
	let selection = null;
	const items = [];
	for (map of maps) {
		items :+ [map.filename, map.name];
	}
	i.popup.show({
		title: 'Load Map File',
		width: 620,
		height: 400,
		generator: (body) => {
			body.text({
				class: 'popup-text',
				align: 'top center',
				top: 10,
				text: 'Choose a map from your installation maps folder.',
			});
			const list = body.scrollview({
				left: 10,
				right: 10,
				top: 44,
				bottom: 34,
				has_hscroll: false,
				vscroll_class: 'default-scroll-v',
			});
			choices = list.choicelist({
				left: 0,
				right: 20,
				top: 0,
				height: #sizeof(items) * 22,
				keyboard: true,
				itemclass: 'popup-list-button',
				itemheight: 21,
				itempadding: 1,
				items: items,
			});
			choices.value = maps[0].filename;
			selection = body.text({
				class: 'popup-panel-text',
				align: 'bottom left',
				left: 10,
				bottom: 7,
				text: maps[0].name,
			});
			choices.on('select', (e) => {
				for (map of maps) {
					if (map.filename == e.value) {
						selection.text = map.name;
						break;
					}
				}
				return true;
			});
		},
		buttons: [
			{
				style: {
					text: 'Load Map',
					align: 'left',
					is_ok: true,
				},
				onclick: (e) => {
					i.settings.global.map.type = 'mapfile';
					i.settings.global.map.filename = choices.value;
					i.popup.back();
					i.steps.select_difficulty_level(i);
					return true;
				},
			},
			{
				style: {
					text: 'Cancel',
					align: 'right',
					is_cancel: true,
				},
				onclick: (e) => {
					i.popup.back();
					return true;
				},
			},
		],
	});
};
