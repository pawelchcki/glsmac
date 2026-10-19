const work = #include('../../../../../game/base_work');
const bonus = #include('../../../../../game/base_specialist_bonus');

return {
	window: null,
	session: null,
	next_token: 0,

	init: (p) => { this.cancel(); this.p = p; },

	cancel: () => {
		const window = this.window;
		this.window = null; this.session = null;
		if (window != null) { window.remove(); }
	},

	resolve: (session) => {
		if (this.session == null || this.session.token != session.token || !this.p.is_open()) { return null; }
		for (base of this.p.game.get_bm().get_bases()) {
			if (base.id == session.base_id && base == session.base && base == this.p.get_base()) {
				if (base.get_owner().id != this.p.game.get_player().id) { return null; }
				for (pop of base.get_pops()) {
					if (pop.id == session.pop_id && pop == session.pop && work.valid_pop_links(this.p.game, base, pop)) {
						const result = {}; result.base = base; result.pop = pop; return result;
					}
				}
			}
		}
		return null;
	},

	worker_tile: (base) => {
		const eligible = [];
		for (tile of base.get_unworked_tiles()) {
			if (work.workable_tile(this.p.game, base, tile) && !tile.has('working_pop') && !base.is_tile_worked(tile)) { eligible :+ tile; }
		}
		// GLSMAC's existing worker heuristic; original job observations do not
		// specify which square a returning Worker must receive.
		const best = this.p.game.get('f_base_find_best_or_worst_tiles')(base, eligible, 1, 1);
		if (#sizeof(best) == 0) { return null; }
		const tile = best[0]; return tile;
	},

	refresh: (session) => {
		// A queued callback from a removed dialog cannot invalidate its successor.
		if (this.session == null || this.session.token != session.token) { return false; }
		const current = this.resolve(session);
		if (current == null || current.pop.get_type() != session.original_type || current.pop.get('worked_tile') != session.original_tile) { this.cancel(); return false; }
		const selected = this.choices.value;
		let available = selected == 'WORKER' || selected == 'DOCTOR';
		let message = '';
		if (selected == 'WORKER' && current.pop.get_type() != 'WORKER' && this.worker_tile(current.base) == null) {
			available = false; message = 'No unworked squares available';
		}
		this.message.text = message;
		this.confirm_button.is_ok = available;
		this.confirm_button.color = available ? 'black' : 'rgb(100,100,100)';
		return available;
	},

	commit: (session) => {
		if (!this.refresh(session)) { return; }
		const current = this.resolve(session);
		if (current == null) { this.cancel(); return; }
		const selected = this.choices.value;
		const data = {}; data.base = current.base;
		let command = '';
		if (selected != current.pop.get_type()) {
			if (selected == 'DOCTOR') {
				const tile = current.pop.get('worked_tile');
				if (!#is_defined(tile)) { this.cancel(); return; }
				command = 'unwork_base_tile'; data.tile = tile;
			} else {
				const tile = this.worker_tile(current.base);
				if (tile == null) { this.refresh(session); return; }
				command = 'work_base_tile'; data.tile = tile; data.pop = current.pop;
			}
		}
		// Remove the draft before delivery can synchronously refresh the base,
		// or an old OK control can submit the same citizen twice.
		this.cancel();
		if (command != '') { this.p.game.event(command, data); }
	},

	open: (base_id, pop_id, base_identity, pop_identity) => {
		this.cancel(); this.next_token = this.next_token + 1;
		const token = this.next_token;
		const session = { token: token, base_id: base_id, pop_id: pop_id };
		session.base = base_identity; session.pop = pop_identity; this.session = session;
		const current = this.resolve(session);
		if (current == null) { this.cancel(); return; }
		const type = current.pop.get_type();
		if (type != 'WORKER' && type != 'DOCTOR') { this.cancel(); return; }
		session.original_type = type; session.original_tile = current.pop.get('worked_tile');
		this.p.ui.class('base-screen-citizen-job').extend('default-panel').set({});
		this.p.ui.class('base-screen-citizen-job-choices').set({});
		this.p.ui.class('base-screen-citizen-job-doctor-effect').extend('base-screen-frame-text').set({});
		this.p.ui.class('base-screen-citizen-job-confirm').extend('game-popup-button').set({});
		this.p.ui.class('base-screen-citizen-job-cancel').extend('game-popup-button').set({});
		const window = this.p.ui.root.window({
			class: 'base-screen-citizen-job', width: 340, height: 230,
			align: 'center', zindex: 0.95, blocker: 'rgba(0,0,0,120)', header_height: 0,
		});
		this.window = window;
		window.on('remove', (e) => { if (this.window == window) { this.window = null; this.session = null; } });
		window.text({ class: 'base-screen-frame-title', align: 'top center', top: 18, text: 'Citizen job' });
		// Window forwards panel factories, while ChoiceList belongs to an inner
		// Container. Keep the same list bounds and the explicit title above it.
		const list = window.panel({ left: 20, right: 20, top: 48, height: 60 });
		this.choices = list.choicelist({
			class: 'base-screen-citizen-job-choices', left: 0, right: 0, top: 0, height: 60,
			itemclass: 'popup-list-button', itemheight: 27, itempadding: 2,
			items: [['WORKER', 'Worker'], ['DOCTOR', 'Doctor']], value: type, keyboard: false,
		});
		this.doctor_effect = window.text({
			class: 'base-screen-citizen-job-doctor-effect', align: 'top center', top: 118,
			text: '+' + #to_string(bonus.for_job('DOCTOR').psych) + ' PSYCH',
		});
		this.message = window.text({ class: 'base-screen-frame-text', align: 'top center', top: 145, text: '' });
		this.confirm_button = window.button({
			class: 'base-screen-citizen-job-confirm', text: 'OK', align: 'bottom left', left: 20, bottom: 16, width: 140, height: 24,
		});
		const cancel = window.button({
			class: 'base-screen-citizen-job-cancel', text: 'CANCEL', align: 'bottom right', right: 20, bottom: 16, width: 140, height: 24,
		});
		this.choices.on('select', (e) => { this.refresh(session); return true; });
		this.confirm_button.on('click', (e) => { this.commit(session); return true; });
		cancel.on('click', (e) => { if (this.session != null && this.session.token == session.token) { this.cancel(); } return true; });
		window.on('keydown', (e) => {
			if (this.session == null || this.session.token != session.token) { return true; }
			if (e.modifiers == {}) {
				if (e.code == 'ESCAPE') { this.cancel(); return true; }
				if (e.code == 'ENTER') { this.commit(session); return true; }
				if (e.code == 'UP') { this.choices.value = 'WORKER'; this.refresh(session); }
				if (e.code == 'DOWN') { this.choices.value = 'DOCTOR'; this.refresh(session); }
				// Recorded Home/End do not change the draft choice.
			}
			return true;
		});
		this.refresh(session);
	},
};
