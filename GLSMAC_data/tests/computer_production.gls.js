// Application invariants around the bounded observed opening choice. These
// synthetic controls are not additional original-game comparison cases.
const behavior = #include('./_behavior');
const fixture = #include('./_computer_production_fixture');
const policy = #include('../default/game/computer_production');
const event = #include('../default/game/event/computer_base_production');
const rejected = (callback) => {
	let caught = false; try { callback(); } catch { : (error) => { caught = true; } }
	test.assert(caught, 'Expected an authoritative rejection');
};
const apply = (f, e) => {
	const error = event.validate(e); test.assert(!#is_defined(error), #is_defined(error) ? error : '');
	f.with_write(() => { e.applied = event.apply(e); }); return e;
};
const has_choice = (player, id) => {
	for (choice of player.get_production_choices()) { if (choice.id == id) { return true; } }
	return false;
};

behavior.scenario('Ordinary offline turn selects unlocked support after crediting both owners income', () => {
	const f = fixture(true); const before = f.snapshot();
	test.assert(f.base.get_production() == {choice_id: 'COLONY_POD', minerals: 3, last_processed_turn: 1});
	test.assert(!has_choice(f.computer, 'FORMERS') && #sizeof(before.players) == 2 && #sizeof(before.bases) == 2);
	f.advance(); const after = f.snapshot();
	test.assert(f.failures == [] && f.game.get_turn() == 2 && #sizeof(f.receipts) == 1);
	test.assert(f.base.get_production() == {choice_id: 'FORMERS', minerals: 4, last_processed_turn: 2}, 'The new choice retains current-turn mineral income');
	test.assert(f.human_base.get_production() == {choice_id: 'COLONY_POD', minerals: 4, last_processed_turn: 2}, 'Human project stays under human control');
	test.assert(after.players == before.players && after.units == before.units && after.research == before.research);
	for (base of after.bases) { test.assert(base.population == 1 && base.jobs == {workers: 0, doctors: 1} && base.resources.minerals == 4); }
	f.advance(); test.assert(f.failures == [] && f.game.get_turn() == 3 && #sizeof(f.receipts) == 2);
	test.assert(f.base.get_production() == {choice_id: 'FORMERS', minerals: 5, last_processed_turn: 3}, 'Already-selected support does not reset next-turn income');
});

behavior.scenario('Source token ownership unlocks edited Formers recipe without relying on faction starting tokens', () => {
	const f = fixture(true); const rules = f.game.get('starting_unit_rules');
	for (rule of rules) {
		if (rule.id == 'Formers') { rule.choice = 'EDITED_SUPPORT'; rule.rows = 7; rule.prerequisite = 'Physic'; }
	}
	f.game.set('starting_unit_rules', rules);
	// The native faction still starts Ecology, while the authoritative current
	// table owns Physic only. Availability must use the latter.
	f.set_declared_research(1, [1], (0 - 1), 0); f.advance();
	test.assert(f.failures == [] && f.base.get_production().choice_id == 'EDITED_SUPPORT');
	let cost = 0; for (choice of f.computer.get_production_choices()) { if (choice.id == 'EDITED_SUPPORT') { cost = choice.cost; } }
	test.assert(cost == 70 && f.game.technologies.has_tech(1, 2) && !f.game.technologies.has_tech(0, 2));
	test.assert(f.base.get_production().minerals == 4 && f.base.get_size() == 1);
});

for (reason of ['no-technology', 'disabled', 'larger-city', 'charged-switch', 'existing-unit', 'existing-project', 'human-unit-only']) {
	const guard = reason;
	behavior.scenario('Computer opening policy guards ' + guard, () => {
		const f = fixture(true);
		if (guard == 'no-technology') { f.set_declared_research(1, [], (0 - 1), 0); }
		if (guard == 'disabled') {
			const rules = f.game.get('starting_unit_rules'); for (rule of rules) { if (rule.id == 'Formers') { rule.prerequisite = 'Disable'; } }
			f.game.set('starting_unit_rules', rules);
		}
		if (guard == 'larger-city') { f.with_write(() => { f.base.create_pop({type: 'DOCTOR'}); f.base.set('accumulated_nutrients', 10); }); }
		if (guard == 'charged-switch') { f.with_write(() => { f.base.restore_production({choice_id: 'COLONY_POD', minerals: 11, last_processed_turn: 1}, ''); }); }
		if (guard == 'existing-unit' || guard == 'human-unit-only') {
			f.with_write(() => { f.game.um.spawn_unit({owner: guard == 'existing-unit' ? f.computer : f.human, tile: f.game.tm.get_tile(14, 12), def: 'Formers', health: 1.0, morale: 2}); });
		}
		if (guard == 'existing-project') {
			f.add_former_choice(); f.with_write(() => {
				const other = f.game.bm.spawn_base(f.computer, f.game.tm.get_tile(14, 12), {name: 'Another support city', facilities: ['HEADQUARTERS']});
				other.create_pop({type: 'DOCTOR'}); other.set('accumulated_nutrients', 0);
				other.restore_production({choice_id: 'FORMERS', minerals: 0, last_processed_turn: 1}, '');
			});
		}
		f.advance(); test.assert(f.failures == [] && f.game.get_turn() == 2);
		test.assert(f.base.get_production().choice_id == (guard == 'human-unit-only' ? 'FORMERS' : 'COLONY_POD'));
		test.assert(f.human_base.get_production().choice_id == 'COLONY_POD');
	});
}

behavior.scenario('At most one eligible city per participant switches by persistent native identity', () => {
	const f = fixture(true); let other = null;
	f.with_write(() => {
		other = f.game.bm.spawn_base(f.computer, f.game.tm.get_tile(14, 12), {name: 'Other Colony project', facilities: ['HEADQUARTERS']});
		other.create_pop({type: 'DOCTOR'}); other.set('accumulated_nutrients', 0);
		other.restore_production({choice_id: 'COLONY_POD', minerals: 3, last_processed_turn: 1}, '');
	});
	f.advance(); test.assert(f.failures == [] && f.base.id < other.id);
	test.assert(f.base.get_production().choice_id == 'FORMERS' && other.get_production().choice_id == 'COLONY_POD');
	test.assert(f.base.get_production().minerals == 4 && other.get_production().minerals == 4);
});

behavior.scenario('Host event rejects human foreign stale malformed and duplicate requests without changing native world', () => {
	const f = fixture(false); f.advance(); const before = f.snapshot();
	for (invalid of ['foreign', 'human', 'missing', 'old-turn', 'future-turn', 'wrong-type']) {
		const e = f.request();
		if (invalid == 'foreign') { e.caller = 1; }
		if (invalid == 'human') { e.data.player_id = 0; }
		if (invalid == 'missing') { e.data.player_id = 7; }
		if (invalid == 'old-turn') { e.data.turn_id = 1; }
		if (invalid == 'future-turn') { e.data.turn_id = 3; }
		if (invalid == 'wrong-type') { e.data.player_id = '1'; }
		test.assert(#is_defined(event.validate(e))); rejected(() => { f.with_write(() => { event.apply(e); }); });
		test.assert(f.snapshot() == before && !has_choice(f.computer, 'FORMERS'));
	}
	const accepted = apply(f, f.request()); const selected = f.snapshot();
	test.assert(#is_defined(event.validate(f.request()))); rejected(() => { f.with_write(() => { event.apply(f.request()); }); });
	test.assert(f.snapshot() == selected && accepted.applied.base == f.base);
});

behavior.scenario('Network scenario and client modes cannot submit or plan offline computer choices', () => {
	const f = fixture(false); f.advance(); const before = f.snapshot(); const local = f.game.get_settings().local;
	for (mode of ['multi', 'scenario']) {
		local.game_mode = mode;
		test.assert(policy.proposal(f.game, f.computer) == null && #is_defined(event.validate(f.request())));
		rejected(() => { f.with_write(() => { event.apply(f.request()); }); });
	}
	local.game_mode = 'single'; local.network_type = 'simple_tcpip';
	test.assert(policy.proposal(f.game, f.computer) == null && #is_defined(event.validate(f.request())));
	local.network_type = 'none'; local.network_role = 'client';
	test.assert(policy.proposal(f.game, f.computer) == null && #is_defined(event.validate(f.request())));
	local.network_role = 'none';
	test.assert(f.snapshot() == before && !has_choice(f.computer, 'FORMERS') && !#is_defined(f.game.get(policy.key(1))));
});

behavior.scenario('Switch receipt restores project income availability and permits retry while old receipt stays stale', () => {
	const f = fixture(false); f.advance(); const before = f.snapshot(); const choices = f.computer.get_production_choices();
	const first = apply(f, f.request());
	f.with_write(() => { event.rollback(first); });
	test.assert(f.snapshot() == before && f.computer.get_production_choices() == choices && !#is_defined(f.game.get(policy.key(1))));
	rejected(() => { f.with_write(() => { event.rollback(first); }); });
	const second = apply(f, f.request()); const after = f.snapshot();
	test.assert(second.applied.token > first.applied.token);
	rejected(() => { f.with_write(() => { event.rollback(first); }); }); test.assert(f.snapshot() == after);
	f.with_write(() => { event.rollback(second); }); test.assert(f.snapshot() == before && f.computer.get_production_choices() == choices);
});

behavior.scenario('Changed production makes saved switch receipt reject before restoring any state', () => {
	const f = fixture(false); f.advance(); const e = apply(f, f.request());
	f.with_write(() => { f.base.restore_production({choice_id: 'FORMERS', minerals: 8, last_processed_turn: 2}, ''); });
	const changed = f.snapshot(); rejected(() => { f.with_write(() => { event.rollback(e); }); });
	test.assert(f.snapshot() == changed && has_choice(f.computer, 'FORMERS'));
});

behavior.scenario('Another city using a newly available recipe makes rollback reject atomically', () => {
	const f = fixture(false); f.advance(); const e = apply(f, f.request());
	f.with_write(() => {
		const other = f.game.bm.spawn_base(f.computer, f.game.tm.get_tile(14, 12), {name: 'New support consumer', facilities: ['HEADQUARTERS']});
		other.create_pop({type: 'DOCTOR'}); other.select_production('FORMERS');
	});
	const changed = f.snapshot(); const marker = #clone(f.game.get(policy.key(1)));
	rejected(() => { f.with_write(() => { event.rollback(e); }); });
	test.assert(f.snapshot() == changed && f.game.get(policy.key(1)) == marker && has_choice(f.computer, 'FORMERS'));
});

behavior.scenario('Computer native switch authority allows zero-loss land units and rejects charged or facility switches', () => {
	const f = fixture(false); f.add_former_choice();
	for (minerals of [0, 4, 10]) {
		f.with_write(() => { f.base.restore_production({choice_id: 'COLONY_POD', minerals: minerals, last_processed_turn: 1}, ''); });
		test.assert(f.base.get_production_switch_loss('FORMERS') == 0);
		let prior = null; f.with_write(() => { prior = f.base.select_production('FORMERS'); });
		test.assert(f.base.get_production().minerals == minerals && f.base.get_production().choice_id == 'FORMERS');
		f.with_write(() => { f.base.restore_production(prior, ''); });
		test.assert(f.base.get_production() == {choice_id: 'COLONY_POD', minerals: minerals, last_processed_turn: 1});
	}
	f.with_write(() => { f.base.restore_production({choice_id: 'COLONY_POD', minerals: 11, last_processed_turn: 1}, ''); f.computer.add_production_choice('RECYCLING_TANKS', {type: 'facility', id: 'RECYCLING_TANKS'}); });
	const before = f.snapshot();
	for (id of ['FORMERS', 'RECYCLING_TANKS']) {
		rejected(() => { f.base.get_production_switch_loss(id); });
		rejected(() => { f.with_write(() => { f.base.select_production(id); }); });
		test.assert(f.snapshot() == before);
	}
});

