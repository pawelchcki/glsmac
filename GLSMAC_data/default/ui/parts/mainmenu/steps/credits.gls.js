return (i) => {
	i.popup.show({
		title: 'Credits',
		width: 620,
		height: 350,
		generator: (body) => {
			const rows = [
				[14, 'GLSMAC'],
				[42, 'Created by afwbkbc and contributors.'],
				[68, 'Browser port by contributors to this fork.'],
				[110, 'Original Sid Meier\'s Alpha Centauri'],
				[136, 'and Alien Crossfire by Firaxis Games.'],
				[178, 'GLSMAC code: GNU AGPL version 3.'],
				[204, 'Original game assets remain separately owned.'],
			];
			for (row of rows) {
				body.text({
					class: 'popup-text',
					align: 'top center',
					top: row[0],
					text: row[1],
				});
			}
		},
		buttons: [
			{
				style: {
					text: 'OK',
					align: 'center',
					is_ok: true,
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
