const grid_mocks = #include('./_ui_mocks');
const grid_texts = #include('./_large_map_text_fixture');
const grid_custom = #include('../default/ui/parts/mainmenu/steps/customize_mapsize');
const grid_source = grid_texts('default');
let grid_count = 0;
for (input of grid_inputs) {
	const f = grid_mocks.menu_popup(); const native = test.production_fixture();
	f.m.settings = native.game.get_settings(); f.m.smac_data = grid_source.bundle; f.m.popup = f.popup;
	f.m.settings.global.map.type = 'random';
	let advanced = false;
	f.m.steps = {select_difficulty_level: (i) => { advanced = true; }};
	f.popup.show({title: 'Map Size', width: 480, height: 180}); grid_custom(f.m);
	const fields = f.view.live('input'); test.assert(#sizeof(fields) == 2);
	fields[0].value = input.horizontal; fields[1].value = input.vertical;
	fields[1].emit('input', {});
	if (!advanced) { f.view.find('button', 'text', 'OK').emit('click', {}); }
	test.assert(advanced, 'The actual size controls and any warning must complete before constructing a native grid');
	const actual = native.map_grid_probe();
	test.assert(actual.links && actual.roundtrip, 'Actual native grid links and codec must be valid');
	#print('GRID_RESULT|' + input.id + '|' + #to_string(f.m.settings.global.map.preset_level) + '|' + #to_string(actual.width) + '|' + #to_string(actual.height) + '|' + #to_string(actual.half_width) + '|' + #to_string(actual.tile_count));
	f.view.root.remove(); grid_count++;
}
#print('GRID_DONE|' + #to_string(grid_count));
