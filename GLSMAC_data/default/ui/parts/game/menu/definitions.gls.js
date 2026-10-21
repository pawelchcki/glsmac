// Installed menu declarations are data. Importing a row does not bind its
// shortcut, establish availability or implement a gameplay command.
const header_sources = [
	['GAME', 'left_menu_game', 'GAME', 13],
	['HQ', 'left_menu_hq', 'HQ', 17],
	['NETWORK', 'left_menu_network', 'NETWORK', 9],
	['MAP', 'left_menu_map', 'MAP', 21],
	['ACTION', 'left_menu_action', 'ACTION', 31],
	['TERRAFORM', 'left_menu_terraform', 'TERRAFORM', 10],
	['SCENARIO', 'left_menu_scenario', 'SCENARIO', 28],
	['EDITOR', 'left_menu_editor', 'EDIT MAP', 29],
	['HELP', 'left_menu_help', 'HELP', 22],
];

const label = (value) => {
	if (#typeof(value) != 'String' || #trim(value) == '') { throw Error('Empty installed in-game menu label'); }
	let result = '';
	for (part of #split(value, '&')) { result += part; }
	if (#trim(result) == '') { throw Error('Empty installed in-game menu display label'); }
	return result;
};

return (glsmac) => {
	const document = glsmac.load_smac_text('menu.txt', 'menus');
	const terrain_rows = glsmac.load_smac_text('alphax.txt', 'rules').rows('TERRAIN');
	const format_order = #include('../../../../game/terraforming_rules').format_order;
	if (#sizeof(terrain_rows) != 20) { throw Error('Wrong installed TERRAIN action count for in-game menu'); }
	const terrain = []; let terrain_index = 0;
	for (row of terrain_rows) {
		if (#sizeof(row) < 8) { throw Error('Incomplete installed TERRAIN menu declaration'); }
		const land = label(row[0]); const water = label(row[2]);
		const land_label = format_order(row[5], land); const water_label = format_order(row[5], water);
		terrain :+ {label: land_label, land_label: land_label,
			water_label: water_label, terrain_index: terrain_index, dark: true};
		terrain_index++;
	}
	const project = #include('presentation');
	const headers = [];
	for (source of header_sources) {
		const definition = document.menu(source[0]);
		const title = label(definition.title);
		if (#sizeof(definition.items) == 0) { throw Error('Empty installed in-game menu: ' + source[0]); }
		const entries = []; let source_index = 0;
		for (item of definition.items) {
			if (#typeof(item.separator) != 'Bool') { throw Error('Invalid installed in-game menu separator'); }
			if (item.separator) { entries :+ {separator: true}; }
			else {
				if (#typeof(item.shortcut) != 'String') { throw Error('Invalid installed in-game menu shortcut'); }
				entries :+ {label: label(item.label), shortcut: item.shortcut, source_index: source_index};
				source_index++;
			}
		}
		if (source_index != source[3]) { throw Error('Wrong installed in-game action count: ' + source[0]); }
		headers :+ {source: source[0], id: source[1], label: #uppercase(title), title: title, entries: project(source[0], entries, terrain)};
	}
	return headers;
};
