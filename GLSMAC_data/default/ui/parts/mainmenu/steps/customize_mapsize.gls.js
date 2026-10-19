// Original dialog observations cover raw defaults and source-driven text.
// Validation and conversion to backend parity coordinates are application rules.
return (i) => {
	const definition = i.smac_data.dimension_dialog();
	i.settings.global.map.preset_level = 99;
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
	const submit = (e) => {
		const horizontal = parse_dimension(width_input.value);
		const height = parse_dimension(height_input.value);
		if (i.settings.global.map.type != 'random' && i.settings.global.map.type != 'custom') {
			error_text.text = 'Choose a random or customized map before setting its size.';
			return true;
		}
		if (horizontal < 2 || horizontal > 2048 || height < 2 || height > 4096 || height % 2 != 0) {
			error_text.text = 'Use whole horizontal and even vertical sizes within the displayed ranges.';
			return true;
		}
		i.settings.global.map.size_x = horizontal * 2;
		i.settings.global.map.size_y = height;
		i.settings.global.map.preset_level = 99;
		i.popup.complete();
		if (i.settings.global.map.type == 'random') {
			i.steps.select_difficulty_level(i);
		} else {
			i.steps.customize_ocean_coverage(i);
		}
		return true;
	};
	i.popup.show({
		title: definition.caption,
		cancel_through: 'map_setup',
		width: 480,
		height: 180,
		generator: (body) => {
			body.text({class: 'popup-text', text: definition.horizontal, align: 'left', top: 13, left: 15});
			width_input = body.input({
				class: 'popup-input', top: 12, left: 150, width: 310,
				value: '40',
			});
			width_input.on('input', submit);
			body.text({class: 'popup-text', text: definition.vertical, align: 'left', top: 40, left: 15});
			height_input = body.input({
				class: 'popup-input', top: 39, left: 150, width: 310,
				value: '80',
			});
			height_input.on('input', submit);
			error_text = body.text({
				class: 'popup-text', align: 'left', top: 70, left: 15,
				text: 'Horizontal: 2-2048. Vertical: even values 2-4096.',
			});
		},
		buttons: [
			{
				style: {text: 'OK', align: 'left', is_ok: true},
				onclick: submit,
			},
			{
				style: {text: 'Cancel', align: 'right', is_cancel: true},
				onclick: (e) => { i.popup.back(); return true; },
			},
		],
	});
};
