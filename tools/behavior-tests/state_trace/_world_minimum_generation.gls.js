const minimum_mocks = #include('./_ui_mocks');
const minimum_text_fixture = #include('./_large_map_text_fixture');
const minimum_texts = minimum_text_fixture('default');
const minimum_custom = #include('../default/ui/parts/mainmenu/steps/customize_mapsize');
let minimum_count = 0;
for (input of grid_inputs) {
	const f = minimum_mocks.menu_popup(); const native = test.production_fixture();
	f.m.settings = native.game.get_settings(); f.m.smac_data = minimum_texts.bundle; f.m.popup = f.popup;
	f.m.settings.global.map.type = 'random';
	let advanced = false;
	f.m.steps = {select_difficulty_level: (i) => { advanced = true; }};
	f.popup.show({title: 'Map Size', width: 480, height: 180}); minimum_custom(f.m);
	const fields = f.view.live('input'); test.assert(#sizeof(fields) == 2);
	fields[0].value = input.horizontal; fields[1].value = input.vertical;
	fields[1].emit('input', {});
	if (!advanced) { f.view.find('button', 'text', 'OK').emit('click', {}); }
	test.assert(advanced, 'The production size controls must complete before native generation');
	const editable_x = f.m.settings.global.map.size_x;
	const editable_y = f.m.settings.global.map.size_y;
	const actual = native.generated_map_probe();
	test.assert(actual.links && actual.roundtrip, 'Real generated grid links and native codec must agree');
	test.assert(actual.settings_preserved && actual.rng_preserved && actual.fixture_preserved,
		'Generation must preserve editable settings and the live fixture');
	test.assert(actual.generation_consumed_rng, 'This probe must execute real terrain generation');
	test.assert(f.m.settings.global.map.size_x == editable_x && f.m.settings.global.map.size_y == editable_y);
	#print('GRID_RESULT|' + input.id + '|' + #to_string(f.m.settings.global.map.preset_level) + '|' + #to_string(actual.width) + '|' + #to_string(actual.height) + '|' + #to_string(actual.half_width) + '|' + #to_string(actual.tile_count));
	f.view.root.remove(); minimum_count++;
}
#print('GRID_DONE|' + #to_string(minimum_count));
// These are application boundary controls, outside original comparison totals.
const boundary = test.production_fixture(); const boundary_map = boundary.game.get_settings().global.map;
boundary_map.type = 'random'; boundary_map.size_x = 16; boundary_map.size_y = 16; boundary_map.preset_level = 2;
const named = boundary.generated_map_probe();
test.assert(named.width == 16 && named.height == 16 && named.settings_preserved && named.fixture_preserved,
	'Named-size provenance must not acquire custom minimum normalization');
boundary_map.type = 'mapfile'; boundary_map.size_x = 4; boundary_map.size_y = 2;
const imported = boundary.map_grid_probe();
test.assert(imported.width == 4 && imported.height == 2 && imported.roundtrip,
	'Imported native map geometry must remain unchanged');
let rejected = false;
try { boundary.generated_map_probe(); } catch { : (error) => { rejected = true; } }
test.assert(rejected, 'Imported maps must not enter the generated-map probe');
boundary_map.type = 'random'; boundary_map.size_x = 129;
rejected = false;
try { boundary.generated_map_probe(); } catch { : (error) => { rejected = true; } }
test.assert(rejected, 'The public probe must reject inputs outside its bounded generation scope');
