// Declared tutorial/label inputs, real native opening lifecycle, and the
// established explicit display boundary. No graphics or installed assets.
const prepare = #include('./_interface_tour_fixture');
const run = (input) => {
	#print('TOUR_CASE|' + input.id); let f = null;
	try {
		f = prepare();
		const documents = [];
		for (source of input.sources) { const item = {name: source.name}; item.document = test.parse_smac_text(source.source, 'dialogs'); documents :+ item; }
		// Prelude bodies are unmeasured fixture inputs. The recorded profile
		// overrides only tutorial records and four label ordinals on both apps.
		const prelude = test.parse_smac_text('#PLANETFALL\n#caption Unmeasured arrival\nUnmeasured prelude body.\n#FIRSTBASE\n#caption Unmeasured editor\nName:\n#END\n', 'dialogs');
		const fallback = f.p.glsmac.load_smac_text;
		f.p.glsmac.load_smac_text = (name, format) => {
			for (item of documents) { if (item.name == name) { return item.document; } }
			if (name == 'script.txt') { return prelude; }
			return fallback(name, format);
		};
		f.opening.close(); f.opening.init(f.p);
		let completed = false; let failure = false;
		const limit = input.finish == 'early' ? 3 : 15;
		for (let step = 0; step < limit; step++) {
			const guided = f.guided; const opening = f.opening;
			const frame = guided.active ? guided.frame : opening.frame;
			const stage = guided.active ? 'guided' : opening.visible_phase;
			const left = f.menu.menus.left_menu; const right = f.menu.menus.right_menu;
			#print('TOUR_FRAME|' + #to_string(step) + '|' + stage + '|' + #to_string(f.game.get_turn()) + '|' + #to_string(left.is_open && left.el.is_visible()) + '|' + #to_string(right.is_open && right.el.is_visible()));
			let body = ''; const buttons = [];
			if (frame != null && !frame.is_removed() && frame.is_visible()) {
				// Enumerate the actual mounted children, independently of retained
				// page IDs, parsed paragraph definitions or controller text caches.
				for (node of frame.children) {
					if (!node.is_removed() && node.is_visible()) {
						if (node.kind == 'text' && node.class == 'popup-text' && node.text != '') { if (body != '') { body += ' '; } body += node.text; }
						if (node.kind == 'button') { buttons :+ node; #print('TOUR_BUTTON|' + #to_string(node.left) + '|' + node.text); }
					}
				}
			}
			#print('TOUR_BODY|' + body);
			let heading = '';
			if (right.is_open && right.el.is_visible() && #is_defined(right.empty_label) && !right.empty_label.is_removed() && right.empty_label.is_visible()) { heading = right.empty_label.text; }
			#print('TOUR_COMMLINK|' + heading);
			const units = f.base.get_tile().get_units(); let unit_name = '';
			for (unit of units) { if (unit.owner == f.game.get_player().id && unit_name == '') { unit_name = unit.get_def().name + ''; } }
			#print('TOUR_BINDINGS|' + f.base.name + '|' + unit_name);
			const tm = f.game.get_tm();
			for (let y = 0; y < tm.get_map_height(); y++) {
				for (let x = y % 2; x < tm.get_map_width(); x += 2) {
					for (unit of tm.get_tile(x, y).get_units()) { if (unit.owner == f.game.get_player().id) {
						#print('TOUR_UNIT|' + #to_string(unit.id) + '|' + unit.def + '|' + #to_string(x) + '|' + #to_string(y) + '|' + #to_string(unit.health) + '|' + #to_string(unit.movement) + '|' + unit.get_order() + '|' + #to_string(unit.moved_this_turn));
					} }
				}
			}
			#print('TOUR_FRAME_DONE');
			if (stage == 'map' && frame == null) { completed = true; break; }
			let label = input.controls.tour;
			if (step > 0) { label = input.finish == 'early' ? input.controls.end : input.controls.next; }
			let chosen = null;
			for (button of buttons) { if (button.text == label || (step > 0 && input.finish == 'full' && button.text == input.controls.close)) { if (chosen != null) { throw Error('Ambiguous mounted Tour action'); } chosen = button; } }
			if (chosen == null) { #print('TOUR_MISSING|' + #to_string(step) + '|Declared action is absent from mounted controls'); failure = true; break; }
			if (step == 0 || input.finish == 'early') { chosen.emit('click', {}); }
			else { frame.emit('keydown', {code: 'ENTER', modifiers: {}}); }
			f.f.process_events(); f.tick();
		}
		if (!completed && !failure) { #print('TOUR_MISSING|' + #to_string(limit - 1) + '|Actual Tour did not reach its playable map'); }
		#print('TOUR_DONE|' + #to_string(completed));
		f.view.root.remove(); f.f.retire(); f = null;
	} catch { : (error) => { if (f != null) { f.view.root.remove(); f.f.retire(); } #print('TOUR_ERROR|' + #to_string(error)); } }
};
for (input of interface_tour_inputs) { run(input); }
