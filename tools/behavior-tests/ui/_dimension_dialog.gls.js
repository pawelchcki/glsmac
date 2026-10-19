const dimension_text = #include('./_dimension_text_fixture');
const world_sizes = #include('../default/game/world_sizes');
let dimension_count = 0;
for (input of dimension_inputs) {
	const f = fixture(); const native = test.production_fixture();
	f.i.settings.global = native.game.get_settings().global;
	const data = dimension_text.create(input.text_profile, dimension_text.world_source);
	f.i.smac_data = data.bundle;
	const settings = f.i.settings.global; settings.map.type = input.route;
	world_sizes.apply(data.bundle.rules, settings.rules);
	settings.rules.select_world_size(settings.map, 2);
	const table = settings.rules.get_world_sizes();
	for (let n = 0; n < #sizeof(table); n++) {
		test.assert(table[n].size_x == dimension_context[n][0] && table[n].size_y == dimension_context[n][1], 'Candidate source context must match the declared reference profile');
	}
	steps.main(f.i); f.flush(); test.assert(f.choose('START GAME'));
	const route = input.route == 'random' ? 'MAKE RANDOM MAP' : 'CUSTOMIZE RANDOM MAP';
	test.assert(f.choose(route));
	if (input.prior_preset >= 0) {
		const menu = f.active(); const label = #uppercase(menu.entries[input.prior_preset][0]);
		test.assert(f.choose(label)); f.key('ESCAPE');
		if (input.route == 'random') { test.assert(f.choose(route)); }
	}
	test.assert(f.choose('CUSTOM SIZE'));
	const windows = f.view.live('window'); const fields = f.view.live('input');
	const labels = []; const buttons = [];
	for (label of f.view.live('text')) { if (label.class == 'popup-text') { labels :+ #uppercase(label.text); } }
	for (button of f.view.live('button')) { if (button.class == 'popup-button') { buttons :+ #uppercase(button.text); } }
	test.assert(#sizeof(windows) == 1 && #sizeof(fields) == 2 && #sizeof(labels) >= 2 && #sizeof(buttons) == 2, 'Actual dialog controls must be observable');
	#print('DIMENSION_RESULT|' + input.id + '|' + #uppercase(windows[0].title) + '|' + labels[0] + '|' + labels[1] + '|' + fields[0].value + '|' + fields[1].value + '|' + buttons[0] + '|' + buttons[1]);
	f.view.root.remove();
	dimension_count = dimension_count + 1;
}
#print('DIMENSION_DONE|' + #to_string(dimension_count));
