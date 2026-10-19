// Functional GLSMAC expansion; native transaction and synthetic map only.
const behavior = #include('./_behavior');
const reject = (f) => {
	let caught = false;
	try { f(); } catch { : (e) => { caught = true; } }
	test.assert(caught, 'expected rejection');
};
const fixture = () => {
	const f = test.founding_fixture();
	f.game.bm.on('get_base_workable_tiles', (e) => { const tiles = []; const tile = f.worker_tile; tiles :+ tile; return tiles; });
	return f;
};
const worker_plan = (tile) => { const plan = { type: 'WORKER' }; plan.worked_tile = tile; return plan; };
const found = (f, chooser) => {
	let receipt = null;
	f.with_write(() => { receipt = f.game.found_base(f.unit_id, 1, chooser); });
	return receipt;
};

behavior.scenario('native eligibility API exists on actual game', () => {
	const f = test.production_fixture();
	test.assert(#typeof(f.game.validate_found_base) == 'Callable');
	test.assert(#typeof(f.game.found_base) == 'Callable' && #typeof(f.game.rollback_found_base) == 'Callable');
});

behavior.scenario('native founding consumes scalar live pod after one worker and no headquarters', () => {
	const f = fixture();
	const before = f.snapshot();
	test.assert(f.game.validate_found_base(f.unit_id, 1) == undefined);
	const receipt = found(f, (base) => { return worker_plan(f.worker_tile); });
	test.assert(!f.game.um.has_unit(f.unit_id));
	const base = f.tile.get_base();
	test.assert(f.tile.get_base().id == base.id && #sizeof(base.get_pops()) == 1);
	test.assert(base.get_facilities() == {} && base.get_production().choice_id == '');
	const pops = base.get_pops();
	const pop = pops[0];
	test.assert(pop.get_type() == 'WORKER' && pop.get_base().id == base.id);
	test.assert(pop.get('worked_tile') == f.worker_tile && f.worker_tile.get('working_pop').id == pop.id);
	const worked = base.get_worked_tiles(); test.assert(#sizeof(worked) == 1 && worked[0] == f.worker_tile);
	reject(() => { found(f, (b) => { return { type: 'DOCTOR' }; }); });
	f.with_write(() => { f.game.rollback_found_base(receipt); });
	test.assert(f.snapshot() == before, 'rollback restores codecs, RNG, names and ID bookkeeping');
	test.assert(f.tile.get_base() == null && !f.worker_tile.has('working_pop'));
	const restored = f.game.um.get_unit(f.unit_id);
	test.assert(restored.movement == 0.75 && restored.health == 0.625 && restored.morale == 3 && restored.moved_this_turn);
	reject(() => { f.with_write(() => { f.game.rollback_found_base(receipt); }); });
});

behavior.scenario('native founding supports immediate doctor fallback', () => {
	const f = fixture();
	const receipt = found(f, (b) => { return { type: 'DOCTOR' }; });
	const base = f.tile.get_base();
	const pops = base.get_pops();
	test.assert(#sizeof(pops) == 1 && pops[0].get_type() == 'DOCTOR');
	test.assert(base.get_worked_tiles() == [] && !f.worker_tile.has('working_pop'));
});

for (kind of ['no_moves', 'dead', 'wrong_def', 'water', 'locked', 'occupied', 'completed', 'inactive', 'animating']) {
	behavior.scenario('native founding rejects ' + kind + ' without mutation', () => {
		const f = fixture();
		f.configure(kind);
		const before = f.snapshot();
		test.assert(#typeof(f.game.validate_found_base(f.unit_id, 1)) == 'String');
		reject(() => { found(f, (b) => { return { type: 'DOCTOR' }; }); });
		test.assert(f.snapshot() == before);
	});
}

behavior.scenario('native founding rejects foreign caller unknown ID and read-only mutation', () => {
	const f = fixture();
	const before = f.snapshot();
	test.assert(#typeof(f.game.validate_found_base(f.unit_id, 0)) == 'String');
	test.assert(#typeof(f.game.validate_found_base(999999, 1)) == 'String');
	reject(() => { f.game.found_base(f.unit_id, 1, (b) => { return { type: 'DOCTOR' }; }); });
	reject(() => { f.with_write(() => { f.game.found_base(f.unit_id, 0, (b) => { return { type: 'DOCTOR' }; }); }); });
	test.assert(f.snapshot() == before);
});

for (kind of ['throw', 'unknown_type', 'missing_tile', 'center_tile', 'occupied_tile']) {
	behavior.scenario('native citizen plan rejects ' + kind + ' atomically', () => {
		const f = fixture();
		const before = f.snapshot();
		reject(() => { found(f, (b) => {
			if (kind == 'throw') { throw PlanError('abort chooser'); }
			if (kind == 'unknown_type') { return { type: 'MISSING' }; }
			if (kind == 'missing_tile') { return { type: 'WORKER' }; }
			return worker_plan(kind == 'center_tile' ? f.tile : f.base.get_tile());
		}); });
		test.assert(f.snapshot() == before && !f.worker_tile.has('working_pop'));
	});
}

for (event_name of ['base_spawn', 'unit_despawn']) {
	behavior.scenario('native lifecycle failure at ' + event_name + ' restores complete transaction', () => {
		const f = fixture();
		const manager = event_name == 'base_spawn' ? f.game.bm : f.game.um;
		manager.on(event_name, (e) => { throw LifecycleError('abort native lifecycle'); });
		const before = f.snapshot();
		reject(() => { found(f, (b) => { return worker_plan(f.worker_tile); }); });
		test.assert(f.snapshot() == before && f.game.um.has_unit(f.unit_id));
		test.assert(f.tile.get_base() == null && !f.worker_tile.has('working_pop'));
	});
}

behavior.scenario('native base despawn removes worker backrefs and pending update pointers', () => {
	const f = fixture();
	const receipt = found(f, (b) => { return worker_plan(f.worker_tile); });
	f.with_write(() => { f.game.bm.despawn_base(receipt.base_id); });
	test.assert(f.tile.get_base() == null && !f.worker_tile.has('working_pop'));
	test.assert(f.inspect().updates == 0);
});

behavior.scenario('rollback rejects stale changed base without undoing the change', () => {
	const f = fixture();
	const receipt = found(f, (b) => { return { type: 'DOCTOR' }; });
	f.with_write(() => { f.tile.get_base().select_production('RECYCLING_TANKS'); });
	const changed = f.snapshot();
	reject(() => { f.with_write(() => { f.game.rollback_found_base(receipt); }); });
	test.assert(f.snapshot() == changed && !f.game.um.has_unit(f.unit_id));
});

behavior.scenario('rollback enforces reverse order for two founding transactions', () => {
	const f = fixture();
	const second_id = f.add_colony(0, 2);
	const before = f.snapshot();
	const first = found(f, (b) => { return { type: 'DOCTOR' }; });
	let second = null;
	f.with_write(() => { second = f.game.found_base(second_id, 1, (b) => { return { type: 'DOCTOR' }; }); });
	const after = f.snapshot();
	reject(() => { f.with_write(() => { f.game.rollback_found_base(first); }); });
	test.assert(f.snapshot() == after);
	f.with_write(() => { f.game.rollback_found_base(second); f.game.rollback_found_base(first); });
	test.assert(f.snapshot() == before);
});

behavior.scenario('another native fixture advancing shared unit IDs makes old rollback stale', () => {
	const first = fixture();
	const receipt = found(first, (b) => { return { type: 'DOCTOR' }; });
	const second = fixture();
	const second_before = second.snapshot();
	reject(() => { first.with_write(() => { first.game.rollback_found_base(receipt); }); });
	test.assert(second.snapshot() == second_before && second.game.um.has_unit(second.unit_id));
});

behavior.scenario('native founding rejects foreign stack and preserves every unit', () => {
	const f = fixture();
	const foreign_id = f.add_scout(0);
	const before = f.snapshot();
	test.assert(#typeof(f.game.validate_found_base(f.unit_id, 1)) == 'String');
	reject(() => { found(f, (b) => { return { type: 'DOCTOR' }; }); });
	test.assert(f.snapshot() == before && f.game.um.has_unit(foreign_id));
});

behavior.scenario('native founding consumes only colony and preserves friendly stack through rollback', () => {
	const f = fixture();
	const friendly_id = f.add_scout(1);
	const before = f.snapshot();
	const receipt = found(f, (b) => { return { type: 'DOCTOR' }; });
	test.assert(!f.game.um.has_unit(f.unit_id) && f.game.um.has_unit(friendly_id));
	const units = f.tile.get_units();
	test.assert(#sizeof(units) == 1 && units[0].id == friendly_id);
	f.with_write(() => { f.game.rollback_found_base(receipt); });
	test.assert(f.snapshot() == before && #sizeof(f.tile.get_units()) == 2);
});

behavior.scenario('base despawn lifecycle refresh cannot retain freed native update pointer', () => {
	const f = fixture();
	const receipt = found(f, (b) => { return worker_plan(f.worker_tile); });
	f.game.bm.on('base_despawn', (e) => { e.base.select_production('RECYCLING_TANKS'); });
	f.with_write(() => { f.game.bm.despawn_base(receipt.base_id); });
	test.assert(f.inspect().updates == 0 && !f.worker_tile.has('working_pop'));
});

behavior.scenario('throwing despawn callback restores original pod scalar state as well as membership', () => {
	const f = fixture();
	f.game.um.on('unit_despawn', (e) => {
		e.unit.movement = 0.125;
		e.unit.health = 0.25;
		e.unit.morale = 5.0;
		e.unit.moved_this_turn = false;
		f.game.random.get_int(0, 10);
		throw LifecycleError('reject after scalar mutation');
	});
	const before = f.snapshot();
	reject(() => { found(f, (b) => { return { type: 'DOCTOR' }; }); });
	test.assert(f.snapshot() == before && f.game.um.has_unit(f.unit_id));
});

behavior.scenario('successful despawn callback RNG is captured before final pod consumption and rolls back', () => {
	const f = fixture();
	f.game.um.on('unit_despawn', (e) => { e.unit.movement = 0.125; f.game.random.get_int(0, 10); });
	const before = f.snapshot();
	const receipt = found(f, (b) => { return { type: 'DOCTOR' }; });
	test.assert(f.inspect().dangling_unit_updates == 0, 'despawn listener refresh cannot queue a deleted pod pointer');
	f.with_write(() => { f.game.rollback_found_base(receipt); });
	test.assert(f.snapshot() == before && f.game.um.has_unit(f.unit_id));
});
