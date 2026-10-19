return (i) => {

	const glsmac = i.glsmac;
	const game = glsmac.game;
	const settings = game.get_settings().global;

	const readonly = game.is_slave();
	const planets = settings.rules.get_world_sizes();
	const planet_choices = [];
	const planet_ids = {};
	for (planet of planets) {
		const id = #to_string(planet.level);
		planet_choices :+ [id, planet.name];
		planet_ids[id] = planet;
	}
	const selected_planet = () => {
		const id = #to_string(settings.map.preset_level);
		if (#is_defined(planet_ids[id])) {
			const planet = planet_ids[id];
			if (settings.map.size_x == planet.size_x && settings.map.size_y == planet.size_y) { return id; }
		}
		return 'custom';
	};
	const imported = () => { return settings.map.type != 'random' && settings.map.type != 'custom'; };

	return i.make_section(settings.game_name, {
		width: 296,
		height: 358,
	}, (body, lobby) => {

		let lines = [];
		let line_keys = {};
		const make_line = (key, label, choices, initial_choice, converter) => {
			line_keys[key] = #sizeof(lines);
			lines :+{
				key: key,
				label: label,
				choices: choices,
				initial_choice: initial_choice,
				converter: converter,
			};
		};
		const make_empty_line = () => {
			lines :+[];
		};

		make_line('difficulty', 'Difficulty Level', [
			// TODO
			/*['0', 'Citizen'],
			['1', 'Specialist'],
			['2', 'Talent'],
			['3', 'Librarian'],
			['4', 'Thinker'],*/
			['5', 'Transcend'],
		], '5', (v) => {
			return #to_int(v);
		});

		make_line('timer', 'Time Controls', [
			['none', 'None'],
			// TODO
			/*['5', '5 min'],
			['15', '15 min'],*/
		], 'none', (v) => {
			return v;
		});

		make_empty_line();

		make_line('game_type', 'Type of Game', [
			['new', 'Random map'],
			//['load', 'Load game'],
		], 'new', (v) => {
			return v;
		});

		const initial_planet = selected_planet();
		make_line('planet_size', 'Planet Size', planet_choices + (initial_planet == 'custom' ? [['custom', 'Custom size']] : []), initial_planet, (v) => {
			return v; // parsed in event
		});

		make_line('ocean_coverage', 'Ocean Coverage', [
			['0.4', '30-50% of surface'],
			['0.6', '50-70% of surface'],
			['0.8', '70-90% of surface'],
		], #to_string(settings.map.ocean_coverage), (v) => {
			return #to_float(v);
		});

		make_line('erosive_forces', 'Erosive Forces', [
			['0.5', 'Strong'],
			['0.75', 'Average'],
			['1.0', 'Weak'],
		], #to_string(settings.map.erosive_forces), (v) => {
			return #to_float(v);
		});

		make_line('native_lifeforms', 'Native Lifeforms', [
			['0.25', 'Rare'],
			['0.5', 'Average'],
			['0.75', 'Abundant'],
		], #to_string(settings.map.native_lifeforms), (v) => {
			return #to_float(v);
		});

		make_line('cloud_cover', 'Cloud Cover', [
			['0.25', 'Sparse'],
			['0.5', 'Average'],
			['0.75', 'Dense'],
		], #to_string(settings.map.cloud_cover), (v) => {
			return #to_float(v);
		});

		const line_height = 28;

		body.listen(game, 'game_settings', (e) => {
			let planet_changed = false;
			for (s of e.settings) {
				if (s[0] == 'planet_size' || s[0] == 'preset_level' || s[0] == 'size_x' || s[0] == 'size_y' || s[0] == 'type') {
					planet_changed = true;
				} else if (#is_defined(line_keys[s[0]])) {
					lines[line_keys[s[0]]].select.value = #to_string(s[1]);
				}
			}
			if (planet_changed) {
				const id = selected_planet();
				const select = lines[line_keys.planet_size].select;
				select.items = planet_choices + (id == 'custom' ? [['custom', 'Custom size']] : []);
				select.value = id;
				select.readonly = readonly || imported();
			}
		});

		let top = line_height / 2;
		let sz = #sizeof(lines);
		for (let idx = 0; idx < sz; idx++) {
			let line = lines[idx];
			if (!#is_empty(line)) {
				body.text({
					class: 'popup-panel-text',
					top: top + 3,
					text: line.label + ':',
					left: 10,
				});
				line.select = body.select({
					top: top,
					class: 'popup-list-select',
					width: 140,
					align: 'right',
					right: 10,
					items: line.choices,
					value: line.initial_choice,
					readonly: readonly || (line.key == 'planet_size' && imported()),
				});
				line.select.on('select', (e) => {
					if (readonly || (line.key == 'planet_size' && imported())) { return true; }
					const changes = [];
					if (line.key == 'planet_size') {
						if (e.value == 'custom') { return true; }
						if (!#is_defined(planet_ids[e.value])) { throw Error('Unknown world-size choice'); }
						const planet = planet_ids[e.value];
						changes :+['planet_size', #to_string(planet.size_x) + 'x' + #to_string(planet.size_y)];
						changes :+['preset_level', planet.level];
					} else {
						changes :+[line.key, line.converter(e.value)];
					}
					game.event('game_settings', { changes: changes });
					return true;
				});
			}
			top += line_height;
		}
	});

};
