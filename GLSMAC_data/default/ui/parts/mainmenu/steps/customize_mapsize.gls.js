// GLSMAC dimension entry; the original dialog is outside the recorded contract.
return (i) => {
	let width_input = null;
	let height_input = null;
	let error_text = null;
	const parse_dimension = (value) => {
		const text = #trim(value);
		let dimension = 0;
		try {
			dimension = #to_int(text);
		} catch {
			: (e) => { return 0; }
		}
		if (#to_string(dimension) != text) {
			return 0;
		}
		return dimension;
	};
	i.popup.show({
		title: 'Custom Size',
		width: 480,
		height: 180,
		generator: (body) => {
			body.text({class: 'popup-text', text: 'Width:', align: 'left', top: 13, left: 15});
			width_input = body.input({
				class: 'popup-input', top: 12, left: 150, width: 310,
				value: #to_string(i.settings.global.map.size_x),
			});
			body.text({class: 'popup-text', text: 'Height:', align: 'left', top: 40, left: 15});
			height_input = body.input({
				class: 'popup-input', top: 39, left: 150, width: 310,
				value: #to_string(i.settings.global.map.size_y),
			});
			error_text = body.text({
				class: 'popup-text', align: 'left', top: 70, left: 15,
				text: 'Enter even dimensions (width 4-4096, height 2-4096).',
			});
		},
		buttons: [
			{
				style: {text: 'OK', align: 'left', is_ok: true},
				onclick: (e) => {
					const width = parse_dimension(width_input.value);
					const height = parse_dimension(height_input.value);
					if (width < 4 || height < 2 || width > 4096 || height > 4096 || width % 2 != 0 || height % 2 != 0) {
						error_text.text = 'Use even whole numbers within the displayed ranges.';
						return true;
					}
					i.settings.global.map.size_x = width;
					i.settings.global.map.size_y = height;
					i.popup.back();
					if (i.settings.global.map.type == 'random') {
						i.steps.select_difficulty_level(i);
					} else {
						i.steps.customize_ocean_coverage(i);
					}
					return true;
				},
			},
			{
				style: {text: 'Cancel', align: 'right', is_cancel: true},
				onclick: (e) => { i.popup.back(); return true; },
			},
		],
	});
};
