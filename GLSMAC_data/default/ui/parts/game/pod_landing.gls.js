// UI-owned playback only. Native first-base-name authority remains pending at
// turn zero until its actual editor is shown and accepted after completion.
return (p, state, on_complete) => {
	const run = {active: true, index: 0, window: null, sprite: null, timer: null};
	const session = state.session; const base_id = state.base_id;
	const current = () => {
		const now = p.game.get_opening_state();
		if (now.session != session || now.phase != 'first-base-name' || now.base_id != base_id || p.game.get_turn() != 0) { return false; }
		for (base of p.game.get_bm().get_bases()) {
			if (base.id == base_id) { return base.get_owner().id == p.game.get_player().id; }
		}
		return false;
	};
	if (!current()) { throw Error('Landing requires the current owned first base at turn zero'); }
	const file = 'drop_pod.flc';
	const info = p.glsmac.load_flic_info(file);
	if (info.frames <= 0 || #sizeof(info.durations_ms) != info.frames || info.width <= 0 || info.height <= 0) { throw Error('Invalid landing animation metadata'); }
	for (duration of info.durations_ms) { if (duration <= 0 || duration > 60000) { throw Error('Invalid landing frame duration'); } }
	// The installed pod artwork uses a magenta background; choose its index from
	// the source palette instead of assuming a shared index or making black alpha.
	let transparent = (0 - 1);
	for (index in info.palette_rgb) { if (info.palette_rgb[index] == [255, 0, 255]) { transparent = #to_int(index); } }
	if (transparent < 0) { throw Error('Landing source lacks its magenta background color'); }
	const target = p.glsmac.focus_owned_base(base_id);
	const width = p.ui.get_width(); const height = p.ui.get_height();
	run.window = p.root.window({id: 'opening-landing', width: width, height: height, header_height: 0, zindex: 0.99, blocker: 'transparent'});
	for (event of ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'scroll']) { run.window.on(event, () => { return true; }); }
	run.sprite = run.window.surface({width: info.width, height: info.height});
	run.cancel = () => {
		if (run.active) {
			run.active = false;
			if (run.timer != null) { run.timer.stop(); }
			run.window.remove();
		}
	};
	run.window.on('remove', () => { run.cancel(); });
	const present = () => {
		if (!run.active) { return; }
		if (!current()) { run.cancel(); return; }
		// An incoming path toward the actual projected HQ. Exact original world
		// trajectory/camera geometry is outside the recorded direction contract.
		const remaining = #to_float(info.frames - 1 - run.index) / #to_float(info.frames);
		run.sprite.left = target.x - info.width / 2 + #round(#to_float(width) * 0.25 * remaining * remaining);
		run.sprite.top = target.y - info.height / 2 + #round(#to_float(height) * 0.35 * remaining * remaining);
		run.sprite.background = file + ':frame(' + #to_string(run.index) + ',' + #to_string(transparent) + '):stretch()';
		run.timer = run.window.timer(info.durations_ms[run.index], () => {
			if (!run.active) { return false; }
			if (!current()) { run.cancel(); return false; }
			run.index = run.index + 1;
			if (run.index == info.frames) { run.cancel(); on_complete(); }
			else { present(); }
			return false;
		});
	};
	present();
	return run;
};
