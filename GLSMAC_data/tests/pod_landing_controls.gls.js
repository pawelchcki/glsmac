// Explicit isolated-human fixture: this suite covers bounded mechanics, not the production opponent roster.
// Asset-free controller tests: native opening authority and timers/display at
// the existing unrendered UI boundary, with explicitly synthetic source frames.
const behavior = #include('./_behavior');
const begin = #include('../default/ui/parts/game/pod_landing');
const make = () => {
	const f = test.natural_startup_fixture(16, 16, 'flat-arid');
	#include('./_natural_startup_mechanics')(f);
	f.initialize_isolated_player('GAIANS'); f.start_world(true);
	const game = f.game; const state = game.get_opening_state();
	game.event('opening_command', {session: state.session, action: 'planetfall', base_id: 0, previous_name: '', name: ''}); f.process_events();
	const display = #include('./_ui_mocks').display();
	display.ui.get_width = () => { return 1024; };
	const counts = {completed: 0, focused: 0, requested: ''};
	const info = {width: 5, height: 3, frames: 3, durations_ms: [7, 11, 13], palette_rgb: [[1, 2, 3], [255, 0, 255], [0, 0, 0]]};
	const glsmac = {};
	glsmac.load_flic_info = (file) => { counts.requested = file; return info; };
	glsmac.focus_owned_base = (id) => { test.assert(id == game.get_opening_state().base_id); counts.focused = counts.focused + 1; return {x: 512, y: 256}; };
	const p = {}; p.game = game; p.glsmac = glsmac; p.ui = display.ui; p.root = display.root;
	const result = {}; result.f = f; result.game = game; result.display = display; result.counts = counts; result.info = info; result.p = p;
	result.start = () => { return begin(p, game.get_opening_state(), () => { counts.completed = counts.completed + 1; }); };
	return result;
};
behavior.scenario('Real pending HQ stays at native zero while every synthetic source frame and delay is presented', () => {
	const t = make(); const run = t.start(); const first_x = run.sprite.left;
	test.assert(run.sprite.left == 624 && run.sprite.top == 374, 'Nonintegral source path coordinates round to native UI integers');
	test.assert(t.counts.requested == 'drop_pod.flc' && t.counts.focused == 1);
	test.assert(run.sprite.background == 'drop_pod.flc:frame(0,1):stretch()' && run.timer.interval == 7);
	test.assert(t.game.get_turn() == 0 && t.game.get_opening_state().phase == 'first-base-name');
	run.timer.tick(); test.assert(run.sprite.background == 'drop_pod.flc:frame(1,1):stretch()' && run.timer.interval == 11);
	test.assert(run.sprite.left < first_x && t.counts.completed == 0);
	run.timer.tick(); test.assert(run.sprite.background == 'drop_pod.flc:frame(2,1):stretch()' && run.timer.interval == 13);
	test.assert(t.game.get_turn() == 0 && t.counts.completed == 0);
	const final_timer = run.timer; final_timer.tick(); final_timer.tick();
	test.assert(t.counts.completed == 1 && !run.active && run.window.is_removed());
	test.assert(t.game.get_turn() == 0 && t.game.get_opening_state().phase == 'first-base-name');
});
behavior.scenario('Modal input cannot skip playback and explicit cancellation retires all callbacks', () => {
	const t = make(); const run = t.start(); const timer = run.timer;
	for (event of ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'scroll']) { test.assert(run.window.emit(event, {code: 'ENTER', modifiers: {}})); }
	test.assert(run.index == 0 && t.counts.completed == 0 && t.game.get_turn() == 0);
	run.cancel(); run.cancel(); timer.tick();
	test.assert(!run.active && !timer.running && t.counts.completed == 0);
});
behavior.scenario('Removing the UI owner stops playback without completing the opening', () => {
	const t = make(); const run = t.start(); const timer = run.timer;
	t.display.root.remove(); timer.tick();
	test.assert(!run.active && !timer.running && run.window.is_removed() && t.counts.completed == 0);
	test.assert(t.game.get_turn() == 0);
});
behavior.scenario('Retired native sessions and despawned Headquarters cannot complete stale playback', () => {
	for (mode of ['retire', 'despawn']) {
		const t = make(); const run = t.start();
		if (mode == 'retire') { t.f.retire(); }
		else { const bases = t.game.get_bm().get_bases(); const base = bases[0]; t.f.with_write(() => { t.game.get_bm().despawn_base(base); }); }
		run.timer.tick(); test.assert(!run.active && t.counts.completed == 0 && t.game.get_turn() == 0);
	}
});
behavior.scenario('An independently accepted native name cancels obsolete playback without another transition', () => {
	const t = make(); const run = t.start(); const state = t.game.get_opening_state(); const bases = t.game.get_bm().get_bases(); const base = bases[0];
	t.game.event('opening_command', {session: state.session, action: 'name', base_id: base.id, previous_name: base.name + '', name: 'Synthetic Arrival'}); t.f.process_events();
	run.timer.tick(); test.assert(!run.active && t.counts.completed == 0 && t.game.get_opening_state().phase == 'starting');
	test.assert(t.game.get_turn() == 0); t.f.opening_tick(); test.assert(t.game.get_turn() == 1);
});
behavior.scenario('Malformed declared metadata fails before presenting an animation or focusing the world', () => {
	for (mode of ['zero-delay', 'count', 'key']) {
		const t = make();
		if (mode == 'zero-delay') { t.info.durations_ms[0] = 0; }
		if (mode == 'count') { t.info.frames = 4; }
		if (mode == 'key') { t.info.palette_rgb = [[0, 0, 0]]; }
		let rejected = false; try { t.start(); } catch { : (error) => { rejected = true; } }
		test.assert(rejected && t.counts.focused == 0 && t.counts.completed == 0 && t.game.get_turn() == 0);
	}
});
