// Application/native invariants; the independent original replay lives in the
// UI contract. Initial city declaration is not natural startup evidence.
const behavior = #include('./_behavior');
const make = #include('./_colony_join_fixture');
const fixture = (setup) => {
	return make({profile: 'stacked', initial_base: {workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9}, setup: setup});
};
const reject = (callback) => {
	let caught = false;
	try { callback(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'expected authoritative rejection');
};
const join = (f, id) => {
	let receipt = null;
	f.native.with_write(() => { receipt = f.game.join_base(id, f.base.id, f.native.owner.id); });
	return receipt;
};
const citizen_state = (f, size) => {
	test.assert(f.base.get_size() == size && f.base.get('accumulated_nutrients') == 0 && f.base.get_production().minerals == 9);
	test.assert(f.base.get_worked_tiles() == [] && #sizeof(f.game.bm.get_bases()) == 1);
};

for (setup of [['wait', 'wait'], ['skip', 'skip'], ['hold', 'hold'], ['sleep', 'sleep'], ['wait', 'skip'], ['skip', 'wait'], ['wait', 'hold'], ['hold', 'wait'], ['wait', 'sleep'], ['sleep', 'wait']]) {
	behavior.scenario('real B preserves city and companions after ' + setup[0] + '/' + setup[1], () => {
		const f = fixture(setup); const pops = f.base.get_pops(); const doctor = pops[0];
		const ids = f.native.inspect().base_ids; const before = [];
		for (i of [0, 1]) { before :+ [f.units[i].id, f.units[i].get_order(), f.units[i].movement]; }
		const colony_id = f.units[2].id; const callable = f.units[2].needs_orders;
		test.assert(f.selected_id() == colony_id && f.preview.selected_unit_id == colony_id);
		citizen_state(f, 1);
		let unit_notifications = 0; let tile_notifications = 0;
		f.events.on('unit_select', (e) => { unit_notifications++; });
		f.events.on('tile_select', (e) => { tile_notifications++; test.assert(e.tile == f.base.get_tile()); });
		f.action('join'); citizen_state(f, 2);
		test.assert(!f.game.um.has_unit(colony_id) && f.native.inspect().base_ids == ids);
		const joined = f.base.get_pops();
		test.assert(joined[0] == doctor && doctor.get_type() == 'DOCTOR' && joined[1].get_type() == 'WORKER');
		test.assert(!joined[1].has('worked_tile') && joined[1].get_base() == f.base);
		for (i of [0, 1]) { test.assert([f.units[i].id, f.units[i].get_order(), f.units[i].movement] == before[i]); }
		reject(() => { callable(); });
		let expected = null;
		if (setup[0] == 'wait') { expected = f.units[0].id; }
		else if (setup[1] == 'wait') { expected = f.units[1].id; }
		test.assert(f.selected_id() == expected && f.preview.selected_unit_id == expected);
		test.assert(tile_notifications == (expected == null ? 1 : 0));
		const snapshot = f.native.snapshot();
		f.action('wait');
		const after_wait = setup == ['wait', 'wait'] ? f.units[1].id : expected;
		test.assert(f.selected_id() == after_wait && f.preview.selected_unit_id == after_wait);
		f.action('tab');
		test.assert(f.native.snapshot() == snapshot && f.game.get_turn() == 1);
		test.assert(f.selected_id() == expected && f.preview.selected_unit_id == expected);
		test.assert(unit_notifications == (expected == null ? 0 : 3) && tile_notifications == (expected == null ? 1 : 0));
		test.assert(f.preview.founding_pending_id == null && f.state.queued[f.state.delivered - 1].name == 'join_base');
		f.view.root.remove();
	});
}

behavior.scenario('native join undo restores pod codec RNG counters and existing Doctor identity', () => {
	const f = fixture(['wait', 'wait']); const pops = f.base.get_pops(); const doctor = pops[0];
	const id = f.units[2].id; const before = f.native.snapshot(); const counts = f.native.next_ids();
	const receipt = join(f, id); citizen_state(f, 2);
	f.native.with_write(() => { f.game.rollback_join_base(receipt); });
	test.assert(f.native.snapshot() == before && f.native.next_ids() == counts);
	const restored_pops = f.base.get_pops(); test.assert(restored_pops[0] == doctor);
	test.assert(f.game.um.has_unit(id) && f.game.um.get_unit(id).needs_orders());
	reject(() => { f.native.with_write(() => { f.game.rollback_join_base(receipt); }); });
	f.view.root.remove();
});

for (kind of ['no_moves', 'dead', 'water', 'locked', 'completed', 'inactive', 'animating']) {
	behavior.scenario('native join rejects ' + kind + ' atomically', () => {
		const f = fixture(['wait', 'wait']); const id = f.units[2].id;
		f.native.configure_unit(id, kind); const before = f.native.snapshot(); const inspected = f.native.inspect();
		test.assert(#typeof(f.game.validate_join_base(id, f.base.id, f.native.owner.id)) == 'String');
		reject(() => { join(f, id); });
		test.assert(f.native.snapshot() == before && f.native.inspect() == inspected);
		f.view.root.remove();
	});
}

behavior.scenario('scalar identity caller prototype read-only and foreign stack guards precede mutation', () => {
	const f = fixture(['wait', 'wait']); const id = f.units[2].id; const owner = f.native.owner.id;
	const before = f.native.snapshot();
	for (args of [[id, f.base.id, 0], [999999, f.base.id, owner], [id, f.base.id + 1, owner], [f.units[0].id, f.base.id, owner]]) {
		test.assert(#typeof(f.game.validate_join_base(args[0], args[1], args[2])) == 'String');
		reject(() => { f.native.with_write(() => { f.game.join_base(args[0], args[1], args[2]); }); });
	}
	reject(() => { f.game.join_base(id, f.base.id, owner); });
	test.assert(f.native.snapshot() == before);
	let foreign = null;
	f.native.with_write(() => {
		const data = {def: 'ScoutPatrol', health: 1.0, morale: 2}; data.owner = f.game.get_player(0); data.tile = f.base.get_tile();
		foreign = f.game.um.spawn_unit(data).id;
	});
	const changed = f.native.snapshot();
	reject(() => { join(f, id); }); test.assert(f.native.snapshot() == changed && f.game.um.has_unit(foreign));
	f.view.root.remove();
});

for (kind of ['throw', 'base', 'unit', 'event']) {
	behavior.scenario('join callback ' + kind + ' rejection restores entire native transaction', () => {
		const f = fixture(['wait', 'wait']); const id = f.units[2].id;
		f.game.um.on('unit_despawn', (e) => {
			test.assert(f.base.get_size() == 2 && !f.game.um.has_unit(id));
			f.game.random.get_int(0, 10);
			if (kind == 'base') { f.base.set('accumulated_nutrients', 999); }
			else if (kind == 'unit') { f.units[0].movement = 0.0; }
			else if (kind == 'event') { f.game.event('unit_hold', {unit_id: f.units[0].id}); }
			else { throw AbortJoin('controlled listener failure'); }
		});
		const before = f.native.snapshot(); const inspected = f.native.inspect();
		reject(() => { join(f, id); });
		test.assert(f.native.snapshot() == before && f.native.inspect() == inspected && f.game.um.has_unit(id));
		f.view.root.remove();
	});
}

behavior.scenario('native join is independent of population one and preserves assigned citizen links', () => {
	const f = fixture(['wait', 'wait']); const original_pops = f.base.get_pops(); const doctor = original_pops[0]; const tile = f.native.tile_at(0, 2);
	let worker = null;
	f.native.with_write(() => {
		worker = f.base.create_pop({type: 'WORKER'}); worker.set('worked_tile', tile); tile.set('working_pop', worker); f.base.add_worked_tile(tile);
	});
	const before = f.native.snapshot(); const receipt = join(f, f.units[2].id);
	const joined_pops = f.base.get_pops(); test.assert(f.base.get_size() == 3 && joined_pops[0] == doctor && joined_pops[1] == worker);
	test.assert(worker.get('worked_tile') == tile && tile.get('working_pop') == worker && f.base.is_tile_worked(tile));
	f.native.with_write(() => { f.game.rollback_join_base(receipt); });
	test.assert(f.native.snapshot() == before && worker.get('worked_tile') == tile && tile.get('working_pop') == worker);
	f.view.root.remove();
});

behavior.scenario('stale changed city receipt is rejected without consuming another unit', () => {
	const f = fixture(['wait', 'wait']); const receipt = join(f, f.units[2].id);
	f.native.with_write(() => { f.base.set('accumulated_nutrients', 1); }); const before = f.native.snapshot();
	reject(() => { f.native.with_write(() => { f.game.rollback_join_base(receipt); }); });
	test.assert(f.native.snapshot() == before); f.view.root.remove();
});

behavior.scenario('copied frontend packets retain changed existing population and consumed Pod id', () => {
	const f = fixture(['wait', 'wait']); const id = f.units[2].id;
	f.native.frontend_packets();
	const receipt = join(f, id); const packets = f.native.frontend_packets();
	test.assert(packets.bases == [{id: f.base.id, pops: ['DOCTOR', 'WORKER']}] && packets.removed_units == [id]);
	test.assert(packets.spawned_bases == 0 && packets.removed_bases == 0 && f.native.inspect().dangling_unit_updates == 0);
	f.native.with_write(() => { f.game.rollback_join_base(receipt); });
	const undo = f.native.frontend_packets();
	test.assert(undo.bases == [{id: f.base.id, pops: ['DOCTOR']}] && undo.removed_units == []);
	f.view.root.remove();
});

behavior.scenario('two Pods join and undo in reverse order with no citizen replacement', () => {
	const f = fixture(['wait', 'wait']); const second_id = f.native.add_colony(2, 2);
	const before = f.native.snapshot(); const first = join(f, f.units[2].id); const second = join(f, second_id);
	test.assert(f.base.get_size() == 3); const after = f.native.snapshot();
	reject(() => { f.native.with_write(() => { f.game.rollback_join_base(first); }); });
	test.assert(f.native.snapshot() == after);
	f.native.with_write(() => { f.game.rollback_join_base(second); f.game.rollback_join_base(first); });
	test.assert(f.native.snapshot() == before); f.view.root.remove();
});

behavior.scenario('join pending action ignores unrelated acknowledgements and stale callbacks', () => {
	const f = fixture(['wait', 'wait']); const flush = f.flush; f.flush = () => {};
	const before = f.native.snapshot(); f.action('join');
	test.assert(f.preview.founding_pending_id == f.units[2].id && f.state.queued == [{name: 'join_base', data: {unit_id: f.units[2].id, base_id: f.base.id}}]);
	f.events.emit('event_result', {name: 'found_base', caller: f.native.owner.id, data: {unit_id: f.units[2].id}, success: false});
	f.action('join'); test.assert(#sizeof(f.state.queued) == 1 && f.native.snapshot() == before);
	f.view.root.remove(); f.action('join'); test.assert(#sizeof(f.state.queued) == 1);
	f.flush = flush;
});

behavior.scenario('joining receipt cannot undo a later turn even when city state matches', () => {
	const f = fixture(['wait', 'wait']); const receipt = join(f, f.units[2].id);
	f.native.set_turn(2); const before = f.native.snapshot();
	reject(() => { f.native.with_write(() => { f.game.rollback_join_base(receipt); }); });
	test.assert(f.native.snapshot() == before && f.base.get_size() == 2); f.view.root.remove();
});

behavior.scenario('visible colony button and B share guarded join pending action and acknowledgements', () => {
	const f = fixture(['wait', 'wait']); f.flush = () => {};
	const button = f.view.find('button', 'text', 'FOUND BASE'); const id = f.units[2].id; const owner = f.native.owner.id;
	const before = f.native.snapshot(); let modal = true;
	f.p.modules.popup.is_shown = () => { return modal; };
	button.emit('click', {}); f.action('join'); test.assert(f.state.queued == []);
	modal = false; button.emit('click', {});
	test.assert(f.state.queued == [{name: 'join_base', data: {unit_id: id, base_id: f.base.id}}]);
	test.assert(f.preview.founding_pending_id == id && f.preview.founding_pending_name == 'join_base');
	for (ack of [
		{name: 'found_base', caller: owner, data: {unit_id: id}, success: false},
		{name: 'join_base', caller: 0, data: {unit_id: id}, success: false},
		{name: 'join_base', caller: owner, data: {unit_id: id + 1}, success: false},
	]) {
		f.events.emit('event_result', ack); button.emit('click', {}); f.action('join');
		test.assert(#sizeof(f.state.queued) == 1 && f.preview.founding_pending_id == id);
	}
	f.events.emit('event_result', {name: 'join_base', caller: owner, data: {unit_id: id, base_id: f.base.id}, success: false});
	test.assert(f.preview.founding_pending_id == null && f.preview.founding_pending_name == null);
	f.action('join'); button.emit('click', {});
	test.assert(#sizeof(f.state.queued) == 2 && f.native.snapshot() == before);
	f.view.root.remove(); button.emit('click', {}); f.action('join'); test.assert(#sizeof(f.state.queued) == 2);
});

behavior.scenario('sole Pod joins assigned Worker base and clears focus before Base preview', () => {
	const f = fixture(['wait', 'wait']); const initial = f.base.get_pops(); const worker = initial[0]; const tile = f.native.tile_at(0, 2);
	const id = f.units[2].id;
	// A separately declared application state exercises zero survivors and an
	// existing assigned Worker; it adds no original-game parity observation.
	f.native.with_write(() => {
		worker.set_type('WORKER'); worker.set('worked_tile', tile); tile.set('working_pop', worker); f.base.add_worked_tile(tile);
		f.game.um.despawn_unit(f.units[0].id); f.game.um.despawn_unit(f.units[1].id);
	});
	let tile_notifications = 0;
	f.events.on('tile_select', (e) => { tile_notifications++; test.assert(e.tile == f.base.get_tile()); });
	const callable = f.units[2].get_order;
	f.action('join');
	test.assert(f.native.inspect().unit_ids == [] && !f.game.um.has_unit(id));
	test.assert(f.selected_id() == null && f.preview.selected_unit_id == null && tile_notifications == 1);
	test.assert(f.base.get_size() == 2 && f.base.get_worked_tiles() == [tile]);
	test.assert(tile.get('working_pop') == worker && worker.get('worked_tile') == tile);
	reject(() => { callable(); });
	// Rendering-free delivery of the real frontend's next base_preview packet.
	const e = {}; e.base = f.base; f.map.emit('base_preview', e);
	test.assert(f.preview.last_object_class == 'Base' && f.preview.rendered_unit_id == null);
	for (action of ['wait', 'tab']) { f.action(action); test.assert(f.selected_id() == null && tile_notifications == 1); }
	f.view.root.remove(); test.assert(f.view.running_timers() == 0);
});

behavior.scenario('pending keyboard join requires its actual city and complete receipt before retry', () => {
	const f = fixture(['wait', 'wait']); const id = f.units[2].id + 0; const owner = f.native.owner.id + 0; const base = f.base.id + 0;
	f.preview.frame.emit('keydown', {code: 'B', modifiers: {}});
	test.assert(#sizeof(f.state.queued) == 1 && f.preview.founding_pending_id == id);
	for (event of [{name: 'join_base', caller: owner}, {name: 'join_base', caller: owner, data: 'bad', success: true},
		{name: 'join_base', caller: owner, data: {unit_id: id, base_id: base}},
		{name: 'join_base', caller: owner, data: {unit_id: id, base_id: base}, success: 'yes'},
		{name: 'join_base', caller: owner, data: {unit_id: id}, success: true},
		{name: 'join_base', caller: owner, data: {unit_id: id, base_id: base + 1}, success: true},
		{name: 'join_base', caller: owner + 1, data: {unit_id: id, base_id: base}, success: true},
		{name: 'join_base', caller: owner, data: {unit_id: f.units[0].id, base_id: base}, success: true}]) {
		f.events.emit('event_result', event);
		test.assert(f.preview.founding_pending_id == id, 'Incomplete or unrelated receipt cannot release pending Colony join');
	}
	f.preview.frame.emit('keydown', {code: 'B', modifiers: {}});
	test.assert(#sizeof(f.state.queued) == 1); citizen_state(f, 1);
	// The rejected first request was not applied; only the retry reaches native state.
	f.state.delivered = 1;
	f.events.emit('event_result', {name: 'join_base', caller: owner, data: {unit_id: id, base_id: base}, success: false});
	test.assert(f.preview.founding_pending_id == null && f.preview.founding_pending_base_id == null);
	f.action('join'); citizen_state(f, 2);
	test.assert(#sizeof(f.state.queued) == 2 && !f.game.um.has_unit(id) && f.preview.founding_pending_id == null);
	f.view.root.remove();
});
