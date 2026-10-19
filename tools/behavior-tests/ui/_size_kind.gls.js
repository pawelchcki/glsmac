const kind_texts = #include('./_dimension_text_fixture');
const kind_worlds = #include('../default/game/world_sizes');
// Matching functional labels and dimensions declare the pinned reference context.
const kind_world_source = '#WORLDSIZE\n5\nTiny Planet,24,48\nSmall Planet,32,64\nStandard Planet,40,80\nLarge Planet,44,90\nHuge Planet,64,128\n#END\n';
let kind_count = 0;
for (input of kind_inputs) {
	const f = fixture(); const native = test.production_fixture();
	f.i.settings.global = native.game.get_settings().global;
	const data = kind_texts.create('default', kind_world_source); f.i.smac_data = data.bundle;
	kind_worlds.apply(data.bundle.rules, f.i.settings.global.rules);
	const rules = f.i.settings.global.rules;
	rules.select_world_size(f.i.settings.global.map, 2);
	const sizes = rules.get_world_sizes();
	test.assert(sizes[0].size_x == 48 && sizes[2].size_x == 80 && sizes[4].size_y == 128);
	const emit_state = (stage) => {
		#print('SIZEKIND_BEGIN|' + input.id + '|' + stage + '|' + #to_string(f.i.settings.global.map.preset_level));
		const stack = f.manager.data_stack;
		if (stack[#sizeof(stack) - 1].type == 'popup') {
			const windows = f.view.live('window'); const fields = f.view.live('input');
			test.assert(#sizeof(windows) == 1 && #sizeof(fields) == 2, 'Actual custom-size controls must be present');
			#print('SIZEKIND_DIALOG|' + #uppercase(windows[0].title) + '|' + fields[0].value + '|' + fields[1].value);
		} else {
			const menu = f.active(); const selected = f.selected();
			const caption = #is_defined(menu.title) ? #uppercase(menu.title) : '';
			#print('SIZEKIND_MENU|' + caption);
			let index = 0;
			for (entry of menu.entries) {
				#print('SIZEKIND_ENTRY|' + #to_string(index) + '|' + #to_string(index == selected) + '|' + #uppercase(entry[0]));
				index++;
			}
		}
		#print('SIZEKIND_END');
	};
	steps.main(f.i); f.flush(); test.assert(f.choose('START GAME'));
	const route = input.route == 'random' ? 'MAKE RANDOM MAP' : 'CUSTOMIZE RANDOM MAP';
	test.assert(f.choose(route));
	if (input.prior_preset >= 0) {
		const label = #uppercase(sizes[input.prior_preset].name);
		test.assert(f.choose(label)); f.key('ESCAPE');
		if (input.route == 'random') { test.assert(f.choose(route)); }
	}
	test.assert(f.choose('CUSTOM SIZE')); emit_state('open');
	if (input.close != 'wait') {
		if (input.close == 'Enter') { const fields = f.view.live('input'); fields[0].emit('input', {}); }
		else {
			if (input.close == 'Escape') { const windows = f.view.live('window'); windows[0].emit('keydown', {code: 'ESCAPE', modifiers: {}}); }
			else { f.view.find('button', 'text', input.close).emit('click', {}); }
		}
		f.flush(); emit_state('close');
		if (input.reenter == 1) {
			if (input.close == 'Enter' || input.close == 'OK') { f.key('ESCAPE'); emit_state('back'); }
			const menu = f.active(); let has_route = false;
			for (entry of menu.entries) { if (#uppercase(entry[0]) == route) { has_route = true; } }
			if (has_route) { test.assert(f.choose(route)); emit_state('reentry'); }
		}
	}
	#print('SIZEKIND_DONE|' + input.id); f.view.root.remove(); kind_count = kind_count + 1;
}
#print('SIZEKIND_COMPLETE|' + #to_string(kind_count));
