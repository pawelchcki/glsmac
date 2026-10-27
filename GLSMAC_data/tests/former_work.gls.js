const behavior = #include('./_behavior');
const fixture = #include('./_former_work_fixture');

behavior.scenario('edited mine declaration drives native work and next-turn completion', () => {
	const f = fixture('edited'); const unit = f.former;
	f.command('mine');
	test.assert(unit.get_order() == 'TERRAFORM' && unit.get_terraforming().work_units == 2 && unit.movement == 0.0);
	f.advance(); test.assert(unit.get_terraforming().work_units == 4 && unit.moved_this_turn);
	f.advance(); test.assert(unit.get_order() == 'NO_ORDERS' && unit.get_terraforming().work_units == 0 && unit.movement == 0.0);
	test.assert(f.game.tm.get_terraforming(2, 2).mine);
	f.advance(); test.assert(unit.movement == 1.0 && !unit.moved_this_turn);
});

behavior.scenario('farm cancellation restores only the current tick and resumes in the same native turn', () => {
	const f = fixture('normal'); const unit = f.former;
	f.command('farm'); f.advance(); test.assert(unit.get_terraforming().work_units == 4);
	f.command('cancel_work');
	test.assert(unit.get_order() == 'NO_ORDERS' && unit.get_terraforming().work_units == 2 && unit.movement == 1.0 && !unit.moved_this_turn);
	f.command('farm'); test.assert(unit.get_terraforming().work_units == 4 && unit.movement == 0.0);
	f.advance(); test.assert(unit.get_terraforming().work_units == 6);
	f.advance(); test.assert(f.game.tm.get_terraforming(2, 2).farm && unit.get_terraforming().work_units == 0);
});

for (action of ['farm', 'mine', 'forest', 'road']) {
	behavior.scenario('native work command and rollback restore exact unit and terrain snapshots for ' + action, () => {
		const f = fixture('normal'); const before = f.snapshot(); const terrain = f.terrain_snapshot();
		const e = f.command(action); const handler = #include('../default/game/event/unit_terraform');
		f.with_write(() => { handler.rollback(e); });
		test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
	});
}

behavior.scenario('cancelling active farm work rolls back the complete native progress movement and terrain', () => {
	const f = fixture('normal'); f.command('farm'); f.advance();
	const before = f.snapshot(); const work = f.former.get_terraforming(); const terrain = f.terrain_snapshot();
	const e = f.command('cancel_work'); const handler = #include('../default/game/event/unit_activate');
	f.with_write(() => { handler.rollback(e); });
	test.assert(f.snapshot() == before && f.former.get_terraforming() == work && f.terrain_snapshot() == terrain);
});

const reject = (f, change) => {
	const handler = #include('../default/game/event/unit_terraform');
	const e = {caller: f.owner.id, data: {unit_id: f.former.id, action: 'farm'}}; e.game = f.game;
	change(e);
	const before = f.snapshot(); const terrain = f.terrain_snapshot(); const work = f.former.get_terraforming();
	test.assert(#is_defined(handler.validate(e)));
	let denied = false;
	try { f.with_write(() => { handler.apply(e); }); } catch { : (error) => { denied = true; } }
	test.assert(denied && f.snapshot() == before && f.terrain_snapshot() == terrain && f.former.get_terraforming() == work);
};

for (kind of ['wrong-owner', 'missing-unit', 'unknown-action', 'excess-moves', 'dead', 'injured', 'wrong-definition', 'completed-turn', 'existing-improvement', 'missing-prerequisite', 'disabled-action']) {
	behavior.scenario('invalid native work command preserves every snapshot for ' + kind, () => {
		const f = fixture('normal');
		reject(f, (e) => {
			if (kind == 'wrong-owner') { e.caller = 0; }
			if (kind == 'missing-unit') { e.data.unit_id = f.former.id + 100; }
			if (kind == 'unknown-action') { e.data.action = 'unknown_terraform_action'; }
			f.with_write(() => {
				if (kind == 'excess-moves') { f.former.movement = 2.0; }
				if (kind == 'dead') { f.former.health = 0.0; }
				if (kind == 'injured') { f.former.health = 0.5; }
				if (kind == 'wrong-definition') { e.data.unit_id = f.game.um.spawn_unit({def: 'ScoutPatrol', owner: f.owner, tile: f.former.get_tile(), morale: 2, health: 1.0}).id; }
				if (kind == 'completed-turn') { f.game.complete_turn(f.owner.id); }
				if (kind == 'existing-improvement') { f.game.tm.set_terraforming(2, 2, {road: false, farm: true, mine: false, forest: false}); }
			});
			if (kind == 'missing-prerequisite' || kind == 'disabled-action') {
				const rules = f.game.get('terraforming_rules'); const farm = rules.farm; farm.prerequisite = kind == 'disabled-action' ? 'Disable' : 'SyntheticTech';
			}
		});
	});
}

behavior.scenario('duplicate active command cannot grant another work tick or restore movement', () => {
	const f = fixture('normal'); f.command('farm'); reject(f, (e) => {});
});

behavior.scenario('recorded cancelled Mine work immediately completes the edited Farm in the same turn', () => {
	const f = fixture('edited'); f.command('mine'); f.advance(); f.command('cancel_work');
	test.assert(f.former.get_terraforming().work_units == 2 && f.former.movement == 1.0);
	f.command('farm');
	test.assert(f.former.get_order() == 'NO_ORDERS' && f.former.get_terraforming().work_units == 0 && f.former.movement == 0.0);
	test.assert(f.game.tm.get_terraforming(2, 2).farm && !f.game.tm.get_terraforming(2, 2).mine);
});

behavior.scenario('recorded accepted Forest work retains its Farm until completion', () => {
	const f = fixture('edited'); f.command('farm'); f.advance(); f.advance();
	f.command('forest');
	test.assert(f.former.get_terraforming().work_units == 2 && f.game.tm.get_terraforming(2, 2).farm && !f.game.tm.get_terraforming(2, 2).forest);
	f.advance();
	test.assert(f.former.get_order() == 'NO_ORDERS' && !f.game.tm.get_terraforming(2, 2).farm && f.game.tm.get_terraforming(2, 2).forest);
});

for (confirmation of [null, false, 1, 'true']) {
	behavior.scenario('native replacement requires explicit boolean consent ' + #to_string(confirmation), () => {
		const f = fixture('edited');
		f.with_write(() => { f.game.tm.set_terraforming(2, 2, {road: false, farm: true, mine: false, forest: false}); });
		reject(f, (e) => { e.data.action = 'forest'; if (confirmation != null) { e.data.replace_existing = confirmation; } });
	});
}

behavior.scenario('cancelling the first confirmed replacement tick retains work and the existing Farm', () => {
	const f = fixture('edited');
	f.with_write(() => { f.game.tm.set_terraforming(2, 2, {road: true, farm: true, mine: false, forest: false}); });
	f.command('forest'); f.command('cancel_work');
	test.assert(f.former.movement == 0.0 && f.former.get_terraforming().work_units == 2 && f.game.tm.get_terraforming(2, 2).farm && f.game.tm.get_terraforming(2, 2).road);
	f.command('forest'); f.advance();
	test.assert(f.game.tm.get_terraforming(2, 2).forest && !f.game.tm.get_terraforming(2, 2).farm && f.game.tm.get_terraforming(2, 2).road);
});

behavior.scenario('immediate replacement completion and receipt rollback restore exact native snapshots', () => {
	const f = fixture('edited'); const rules = f.game.get('terraforming_rules'); const forest = rules.forest; forest.turns = 1;
	f.with_write(() => { f.game.tm.set_terraforming(2, 2, {road: false, farm: true, mine: false, forest: false}); });
	const before = f.snapshot(); const terrain = f.terrain_snapshot();
	const e = f.command('forest');
	test.assert(f.game.tm.get_terraforming(2, 2).forest && !f.game.tm.get_terraforming(2, 2).farm);
	const handler = #include('../default/game/event/unit_terraform');
	f.with_write(() => { handler.rollback(e); });
	test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
});

behavior.scenario('completion reaches native tile state before the base-turn income callback', () => {
	const f = fixture('normal'); let observed = false;
	f.game.bm.on('base_turn', (e) => { observed = f.game.tm.get_terraforming(2, 2).farm; });
	f.command('farm'); f.advance(); f.advance(); test.assert(!observed);
	f.advance(); test.assert(observed && f.former.moved_this_turn && f.former.movement == 0.0);
});

behavior.scenario('concrete native faction technology unlocks an installed action prerequisite', () => {
	const f = fixture('normal'); const rules = f.game.get('terraforming_rules'); const farm = rules.farm; farm.prerequisite = 'SyntheticTech';
	f.apply_faction_starting_technologies(['SyntheticTech']);
	f.command('farm'); test.assert(f.former.get_terraforming().work_units == 2);
});

behavior.scenario('another active native Former on this tile blocks unsupported cooperative work', () => {
	const f = fixture('normal');
	f.with_write(() => {
		const data = {def: 'Formers', morale: 2, health: 1.0}; data.owner = f.owner; data.tile = f.former.get_tile();
		const other = f.game.um.spawn_unit(data);
		other.set_terraforming({action: 'farm', work_units: 2, required_work: 8, last_turn: f.game.get_turn(),
			previous_work_units: 0, previous_movement: 1.0, previous_moved: false, tile_x: 2, tile_y: 2, active: true});
	});
	reject(f, (e) => {});
});

behavior.scenario('native work mutation outside the authoritative write scope leaves the unit and terrain untouched', () => {
	const f = fixture('normal'); const before = f.snapshot(); const terrain = f.terrain_snapshot();
	const e = {caller: f.owner.id, data: {unit_id: f.former.id, action: 'farm'}}; e.game = f.game;
	const handler = #include('../default/game/event/unit_terraform'); let denied = false;
	try { handler.apply(e); } catch { : (error) => { denied = true; } }
	test.assert(denied && f.snapshot() == before && f.terrain_snapshot() == terrain && f.former.get_order() == 'NO_ORDERS');
});
