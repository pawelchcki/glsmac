// GLSMAC reproduction regressions, not original-game parity. Real production
// event handlers, unit-turn rules and turn controls run against manager/display
// boundaries. The boundary supplies player flags, native turn notifications and
// the documented native unit-turn ordering; C++ lifecycle behavior is not tested.
const behavior = #include('./_behavior');
const ui = #include('./_ui_mocks');
const gameplay = #include('./_gameplay_mocks');
const handlers = {
	complete_turn: #include('../default/game/event/complete_turn'),
	uncomplete_turn: #include('../default/game/event/uncomplete_turn'),
	advance_turn: #include('../default/game/event/advance_turn'),
	unit_skip_turn: #include('../default/game/event/unit_skip_turn'),
	move_unit: #include('../default/game/event/move_unit'),
};

const fixture = (master) => {
	const f = {};
	f.state = { turn: 1, complete: [false, false], orders: [], rejected: [], confirmations: [], respond: null, advances: [] };
	f.view = ui.display();
	f.game = ui.events();
	f.um = ui.events();
	f.units = [];
	f.game.random = gameplay.random([]);
	f.game.get_um = () => { return f.um; };
	// This unit/turn-control boundary contains no cities or pending notices.
	f.game.get_bm = () => { return {get_bases: () => { return []; }}; };
	f.game.is_started = () => { return true; };
	f.um.has_unit = (id) => { return id > 0 && id <= #sizeof(f.units); };
	f.um.get_unit = (id) => { return f.units[id - 1]; };
	f.game.is_master = () => { return master; };
	f.game.get_players = () => { return [{ id: 0 }, { id: 1 }]; };
	f.game.get_turn = () => { return f.state.turn; };
	f.game.get_year = () => { return 2100 + f.state.turn; };
	// Declared display boundary only; native treasury authority has its own suite.
	f.game.get_player = () => { return {get_energy_state: () => { return {credits: 0}; }}; };
	f.game.is_turn_complete = (id) => { return f.state.complete[id]; };
	f.status = (status) => { f.game.emit('turn_status', { status: status }); };
	f.game.complete_turn = (id) => {
		f.state.complete[id] = true;
		if (id == 0) { f.status('waiting_for_players'); }
	};
	f.game.uncomplete_turn = (id) => {
		f.state.complete[id] = false;
		if (id == 0) { f.status('active'); }
	};
	f.game.advance_turn = (id) => {
		f.state.advances :+ id;
		f.state.turn = id;
		// This is the native manager boundary, in Game::AdvanceTurn order.
		for (unit of f.units) {
			const e = {}; e.unit = unit;
			f.um.emit('unit_turn', e);
			unit.moved_this_turn = false;
		}
		f.state.complete = [false, false];
		f.game.emit('turn', { year: 2100 + id });
		f.status('active');
	};
	f.dispatch = (name, caller, data) => {
		const e = { caller: caller, resolved: {}, applied: {} };
		e.data = data; e.game = f.game;
		const handler = handlers[name];
		const error = handler.validate(e);
		if (#is_defined(error)) {
			f.state.rejected :+ error;
			return error;
		}
		f.state.orders :+ [name, caller];
		if (#is_defined(handler.resolve)) { e.resolved = handler.resolve(e); }
		e.applied = handler.apply(e);
		return e;
	};
	f.game.event = (name, data) => { f.dispatch(name, 0, data); };
	const popup = {};
	popup.show = (name, respond) => {
		f.state.confirmations :+ name;
		f.state.respond = respond;
	};
	const p = { modules: {} };
	p.el = f.view.root; p.ui = f.view.ui; p.game = f.game;
	p.modules.popup = popup;
	#include('../default/ui/parts/game/bottom_bar/mini_map').init(p);
	#include('../default/units/turns').configure(f.game);
	f.button = f.view.find('button', 'text', 'TURN COMPLETE');
	f.sound = f.view.find('sound', 'sound', 'cpu turn complete.wav');
	f.add_unit = () => {
		const unit = gameplay.unit(gameplay.tile(0, 0));
		unit.id = #sizeof(f.units) + 1;
		unit.owner = 0;
		// Existing manager boundary for this turn-delivery fixture. Live native
		// identities and readiness are covered separately by the native suites.
		unit.needs_orders = () => { return unit.movement > 0.0; };
		unit.definition = { id: 'MindWorms', health_max: 1.0, health_per_turn: 0.1, movement_per_turn: 1.0, is_immovable: false };
		f.units :+ unit;
		return unit;
	};
	return f;
};

behavior.scenario('turn status change invalidates an open completion confirmation', () => {
	const f = fixture(true);
	f.button.emit('click', {});
	const respond = f.state.respond;
	f.status('please_wait');
	respond(true);
	test.assert(f.state.orders == [], 'A stale confirmation must not complete a waiting turn');
	test.assert(f.button.text == 'PLEASE WAIT');
});
behavior.scenario('next turn invalidates an open completion confirmation even when status stays active', () => {
	const f = fixture(true);
	f.button.emit('click', {});
	const respond = f.state.respond;
	f.game.advance_turn(2);
	respond(true);
	test.assert(f.state.orders == [], 'The previous turn confirmation must not complete the next turn');
	test.assert(!f.state.complete[0] && f.button.text == 'TURN COMPLETE');
});

behavior.scenario('advance rejects rewinding an established game to first turn', () => {
	const f = fixture(true);
	f.state.turn = 5;
	const result = f.dispatch('advance_turn', 0, { turn_id: 1 });
	test.assert(#typeof(result) == 'String', 'A first-turn request must not rewind an established game');
	test.assert(f.state.turn == 5 && f.state.advances == []);
});

behavior.scenario('three consecutive turns consume restore and reactivate movement through production events', () => {
	const f = fixture(true);
	const unit = f.add_unit();
	unit.health = 0.5;
	const destination = gameplay.tile(2, 0);
	const back = unit.get_tile();
	for (let turn = 1; turn <= 3; turn++) {
		test.assert(f.state.turn == turn && unit.movement == 1.0 && !unit.moved_this_turn);
		const data = {}; data.unit = unit; data.tile = turn == 2 ? back : destination;
		const moved = f.dispatch('move_unit', 0, data);
		test.assert(#typeof(moved) == 'Object' && unit.movement == 0.0 && unit.moved_this_turn);
		test.assert(unit.health == 0.5, 'Movement does not heal');
		f.status('turn_complete');
		f.button.emit('click', {});
		test.assert(f.state.complete[0] && !f.state.complete[1]);
		test.assert(f.button.text == 'WAITING FOR PLAYERS');
		const waiting_orders = #sizeof(f.state.orders);
		f.dispatch('complete_turn', 1, {});
		test.assert(#sizeof(f.state.orders) == waiting_orders + 2, 'Last completion dispatches one production advance event');
		test.assert(f.state.turn == turn + 1 && unit.movement == 1.0 && !unit.moved_this_turn);
		test.assert(unit.health == 0.5, 'A unit that moved does not heal at the next turn');
		test.assert(f.state.complete == [false, false] && f.button.text == 'TURN COMPLETE');
	}
	test.assert(f.state.advances == [2, 3, 4]);
	test.assert(f.game.random.state.draws == []);
});

behavior.scenario('skip rollback and next-turn reset preserve resting healing', () => {
	const f = fixture(true);
	const unit = f.add_unit();
	unit.health = 0.5;
	const data = { unit_id: unit.id };
	const skipped = f.dispatch('unit_skip_turn', 0, data);
	test.assert(unit.movement == 0.0 && !unit.moved_this_turn);
	handlers.unit_skip_turn.rollback(skipped);
	test.assert(unit.movement == 1.0 && !unit.moved_this_turn);
	f.dispatch('unit_skip_turn', 0, data);
	f.dispatch('complete_turn', 0, {});
	f.dispatch('complete_turn', 1, {});
	test.assert(unit.movement == 1.0 && unit.health == 0.5 + 0.1 && !unit.moved_this_turn);
	f.dispatch('complete_turn', 1, {});
	f.dispatch('complete_turn', 0, {});
	test.assert(unit.movement == 1.0 && unit.health == (0.5 + 0.1) + 0.1);
	test.assert(f.state.advances == [2, 3]);
});

behavior.scenario('stationary units heal up to maximum without gaining movement', () => {
	const f = fixture(true);
	const unit = f.add_unit();
	unit.definition.is_immovable = true;
	unit.movement = 0.0;
	unit.health = 0.95;
	f.game.advance_turn(2);
	test.assert(unit.health == 1.0 && unit.movement == 0.0);
	f.game.advance_turn(3);
	test.assert(unit.health == 1.0 && unit.movement == 0.0 && !unit.moved_this_turn);
});

behavior.scenario('completion uncompletion and cancellation keep the same turn actionable', () => {
	const f = fixture(true);
	const unit = f.add_unit();
	f.button.emit('click', {});
	f.state.respond(false);
	test.assert(f.state.orders == [] && f.state.turn == 1 && unit.movement == 1.0);
	f.button.emit('click', {});
	f.state.respond(true);
	test.assert(f.state.complete == [true, false] && f.button.text == 'WAITING FOR PLAYERS');
	f.button.emit('click', {});
	test.assert(f.state.complete == [false, false] && f.button.text == 'TURN COMPLETE');
	test.assert(f.state.turn == 1 && unit.movement == 1.0);
	f.button.emit('click', {});
	f.state.respond(true);
	f.dispatch('complete_turn', 1, {});
	test.assert(f.state.turn == 2 && f.state.complete == [false, false]);
	test.assert(f.state.orders == [['complete_turn', 0], ['uncomplete_turn', 0], ['complete_turn', 0], ['complete_turn', 1], ['advance_turn', 0]]);
});

behavior.scenario('duplicate completion and premature uncompletion reject without state changes', () => {
	const f = fixture(true);
	test.assert(f.dispatch('uncomplete_turn', 0, {}) == 'Turn not completed by this player');
	f.dispatch('complete_turn', 0, {});
	test.assert(f.dispatch('complete_turn', 0, {}) == 'Turn already completed by this player');
	test.assert(f.state.complete == [true, false] && f.state.advances == []);
	test.assert(f.state.orders == [['complete_turn', 0]]);
});

behavior.scenario('completion and uncompletion rollback restore player flags', () => {
	const f = fixture(false);
	const completed = f.dispatch('complete_turn', 0, {});
	test.assert(f.state.complete[0]);
	handlers.complete_turn.rollback(completed);
	test.assert(!f.state.complete[0]);
	f.dispatch('complete_turn', 0, {});
	const undone = f.dispatch('uncomplete_turn', 0, {});
	test.assert(!f.state.complete[0]);
	handlers.uncomplete_turn.rollback(undone);
	test.assert(f.state.complete[0] && f.state.advances == []);
});

behavior.scenario('non-master completion waits for host advance', () => {
	const f = fixture(false);
	f.dispatch('complete_turn', 0, {});
	f.dispatch('complete_turn', 1, {});
	test.assert(f.state.complete == [true, true] && f.state.advances == []);
	test.assert(f.state.orders == [['complete_turn', 0], ['complete_turn', 1]]);
});

for (id of [(0 - 1), 0, 3, 5, 8]) {
	behavior.scenario('established turn rejects nonsequential advance ' + #to_string(id), () => {
		const f = fixture(true);
		f.state.turn = 5;
		f.state.complete = [true, true];
		test.assert(f.dispatch('advance_turn', 0, { turn_id: id }) == 'Turn id is not next in sequence');
		test.assert(f.state.turn == 5 && f.state.complete == [true, true] && f.state.advances == []);
	});
}
behavior.scenario('advance rejects non-host before changing turn state', () => {
	const f = fixture(true);
	f.state.complete = [true, true];
	test.assert(f.dispatch('advance_turn', 1, { turn_id: 2 }) == 'Only host can advance turn');
	test.assert(f.state.turn == 1 && f.state.advances == []);
});
behavior.scenario('advance waits for every incomplete player', () => {
	for (flags of [[false, false], [true, false], [false, true]]) {
		const f = fixture(true);
		f.state.complete = flags;
		const id = flags[0] ? 1 : 0;
		test.assert(f.dispatch('advance_turn', 0, { turn_id: 2 }) == 'Can\'t advance turn because player ' + #to_string(id) + ' did not complete it');
		test.assert(f.state.turn == 1 && f.state.advances == [] && f.state.complete == flags);
	}
});
behavior.scenario('first-turn initialization remains accepted before player completion', () => {
	const f = fixture(true);
	test.assert(#typeof(f.dispatch('advance_turn', 0, { turn_id: 1 })) == 'Object');
	test.assert(f.state.advances == [1] && f.state.complete == [false, false]);
});

for (kind of ['owner', 'locked', 'zero', 'negative']) {
	behavior.scenario('invalid skip ' + kind + ' preserves movement and turn state', () => {
		const f = fixture(true);
		const unit = f.add_unit();
		if (kind == 'owner') { unit.owner = 1; }
		if (kind == 'locked') { const tile = unit.get_tile(); tile.locked = true; }
		if (kind == 'zero') { unit.movement = 0.0; }
		if (kind == 'negative') { unit.movement = 0.0 - 0.1; }
		const before = unit.movement;
		const data = { unit_id: unit.id };
		const result = f.dispatch('unit_skip_turn', 0, data);
		test.assert(#typeof(result) == 'String');
		test.assert(unit.movement == before && !unit.moved_this_turn);
		test.assert(f.state.orders == [] && f.state.turn == 1 && f.state.complete == [false, false]);
	});
}
behavior.scenario('duplicate active notifications keep a current confirmation valid', () => {
	const f = fixture(true);
	f.button.emit('click', {});
	const respond = f.state.respond;
	f.status('active'); f.status('active');
	respond(true); respond(true);
	test.assert(f.state.orders == [['complete_turn', 0]] && f.state.complete[0]);
});
behavior.scenario('waiting then active notifications cannot revive a stale confirmation', () => {
	const f = fixture(true);
	f.button.emit('click', {});
	const old = f.state.respond;
	f.status('please_wait'); f.status('active');
	old(true);
	test.assert(f.state.orders == []);
	f.button.emit('click', {});
	f.state.respond(true);
	test.assert(f.state.orders == [['complete_turn', 0]]);
});
behavior.scenario('new turn reannounces readiness once and disposes prior blinking', () => {
	const f = fixture(true);
	for (let turn = 1; turn <= 3; turn++) {
		f.status('turn_complete'); f.status('turn_complete');
		test.assert(f.sound.play_count() == turn && f.view.running_timers() == 1);
		f.button.emit('click', {});
		test.assert(f.view.running_timers() == 0);
		f.dispatch('complete_turn', 1, {});
		test.assert(f.state.turn == turn + 1 && f.button.text == 'TURN COMPLETE');
	}
});
