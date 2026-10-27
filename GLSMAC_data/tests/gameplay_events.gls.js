// Production GLSMAC event behavior, not original-game parity. Movement currently
// treats every unit as native; combat uses the production placeholder psi rules.
// Manager/animation boundaries below are controlled and have no asset dependency.
const mocks = #include('_gameplay_mocks');
const movement = #include('../default/game/event/move_unit');
const combat = #include('../default/game/event/attack_unit');
const spawn = #include('../default/game/event/spawn_unit');
const despawn = #include('../default/game/event/despawn_unit');
const behavior = #include('./_behavior');

// Validation failures must leave state and the random stream untouched. Combined
// invalid conditions also pin the observable first error shown to the player.
const validation_cases = [
	['wrong owner', 'owner', 'Unit can only be moved by it\'s owner', 'Unit can only be ordered to attack by it\'s owner'],
	['same tile', 'same', 'Source tile is same as destination tile', 'Attacker tile is same as defender tile'],
	['source locked', 'source_locked', 'Source tile is locked', 'Attacker tile is locked'],
	['destination locked', 'destination_locked', 'Destination tile is locked', 'Defender tile is locked'],
	['immovable', 'immovable', 'Unit is immovable', 'Attacker is immovable'],
	['zero moves', 'zero', 'Unit is out of moves', 'Attacker is out of moves'],
	['negative moves', 'negative', 'Unit is out of moves', 'Attacker is out of moves'],
	['nonadjacent', 'distant', 'Destination tile is not adjactent to source tile', 'Defender tile is not adjactent to attacker tile'],
	['land to sea', 'land_sea', 'Land units can\'t move to water tile', 'Land units can\'t attack water tiles'],
	['sea to land', 'sea_land', 'Water units can\'t move to land tile', 'Water units can\'t attack land tiles'],
];
for (c of validation_cases) {
	for (kind of ['move', 'attack']) {
		behavior.scenario(kind + ' rejects ' + c[0], () => {
			const e = mocks.event([]);
			const u = e.data.unit;
			const source = u.get_tile();
			const destination = e.data.tile;
			if (c[1] == 'owner') { e.caller = 9; source.locked = true; }
			if (c[1] == 'same') { e.data.tile = source; e.data.defender.tile = source; }
			if (c[1] == 'source_locked') { source.locked = true; destination.locked = true; }
			if (c[1] == 'destination_locked') { destination.locked = true; u.is_immovable = true; }
			if (c[1] == 'immovable') { u.is_immovable = true; u.movement = 0.0; }
			if (c[1] == 'zero') { u.movement = 0.0; source.adjacent = false; }
			if (c[1] == 'negative') { u.movement = 0.0 - 0.1; }
			if (c[1] == 'distant') { source.adjacent = false; }
			if (c[1] == 'land_sea') { destination.is_land = false; destination.is_water = true; }
			if (c[1] == 'sea_land') { u.is_land = false; u.is_water = true; }
			const before = u.movement;
			if (kind == 'move') { test.assert(movement.validate(e) == c[2]); }
			else { test.assert(combat.validate(e) == c[3]); }
			test.assert(u.movement == before && u.moved_this_turn == false);
			test.assert(u.moves == [] && e.game.random.state.draws == []);
		});
	}
}
for (c of [
	['same tile','same','Source tile is same as destination tile'],
	['source lock','source','Source tile is locked'],
	['destination lock','destination','Destination tile is locked'],
	['immovable','immovable','Unit is immovable'],
]) {
	behavior.scenario('manual movement preserves ' + c[0] + ' rejection before exhausted movement', () => {
		const e = mocks.event([]); const unit = e.data.unit; const source = unit.get_tile(); unit.movement = 0.0;
		if (c[1] == 'same') { e.data.tile = source; }
		if (c[1] == 'source') { source.locked = true; }
		if (c[1] == 'destination') { e.data.tile.locked = true; }
		if (c[1] == 'immovable') { unit.is_immovable = true; }
		test.assert(movement.validate(e) == c[2]);
		test.assert(unit.movement == 0.0 && unit.moves == [] && !unit.moved_this_turn && e.game.random.state.draws == []);
	});
}
behavior.scenario('route edge quote stays independent of manual remaining movement', () => {
	const e = mocks.event([]); const unit = e.data.unit; unit.movement = 0.0;
	test.assert(!#is_defined(movement.validate_at(e.game,unit,unit.get_tile(),e.data.tile)));
	test.assert(movement.validate(e) == 'Unit is out of moves');
	test.assert(unit.movement == 0.0 && unit.moves == [] && e.game.random.state.draws == []);
});
for (occupants of [[], [1], [1, 1], [1, 2], [2, 1]]) {
	behavior.scenario('movement occupants ' + #to_string(occupants), () => {
		const e = mocks.event([]);
		for (owner of occupants) { e.data.tile.units :+ { owner: owner }; }
		let foreign = false;
		for (owner of occupants) { if (owner != 1) { foreign = true; } }
		const error = movement.validate(e);
		if (foreign) { test.assert(error == 'Destination tile contains foreign units (combat not implemented yet)'); }
		else { test.assert(!#is_defined(error)); }
		test.assert(e.game.random.state.draws == []);
	});
}
behavior.scenario('artillery direct attack rejected', () => {
	const e = mocks.event([]);
	e.data.attacker.definition.id = 'SporeLauncher';
	test.assert(combat.validate(e) == 'Artillery units can\'t attack directly');
});
behavior.scenario('civilian colony pod cannot initiate combat', () => {
	const e = mocks.event([]);
	e.data.attacker.definition.id = 'ColonyPod';
	test.assert(combat.validate(e) == 'Civilian colony pods can\'t attack');
	test.assert(e.data.attacker.movement == 1.0 && !e.data.attacker.moved_this_turn);
	test.assert(e.game.random.state.draws == [] && e.data.attacker.moves == []);
});
for (domain of ['land', 'sea', 'air']) {
	behavior.scenario('valid ' + domain + ' attack', () => {
		const e = mocks.event([]);
		e.data.attacker.is_land = domain == 'land';
		e.data.attacker.is_water = domain == 'sea';
		e.data.tile.is_land = domain != 'sea';
		e.data.tile.is_water = domain == 'sea';
		test.assert(!#is_defined(combat.validate(e)));
	});
}

// [name, terrain, remaining, draws, success, remaining after apply]. The draw
// budget is explicit: affordable moves never call RNG; equality loses a partial
// move. Resolve uses entry cost, while apply also charges rough terrain aftercost.
const move_cases = [
	['plain exact', 'plain', 1.0, [], true, 0.0],
	['plain spare', 'plain', 2.5, [], true, 1.5],
	['partial zero roll', 'plain', 0.5, [0.0], true, 0.0],
	['partial just below', 'plain', 0.5, [0.499], true, 0.0],
	['partial equal roll', 'plain', 0.5, [0.5], false, 0.0],
	['partial upper roll', 'plain', 0.5, [1.0], false, 0.0],
	['river exact third', 'river', 1.0 / 3.0, [], true, 0.0],
	['river partial success', 'river', 0.2, [0.1], true, 0.0],
	['river partial failure', 'river', 0.2, [0.2], false, 0.0],
	['fungus land', 'fungus', 1.0, [], true, 1.0 - 1.0 / 3.0],
	['fungus cancels rocky aftercost', 'fungus_rough', 1.0, [], true, 1.0 - 1.0 / 3.0],
	['sea fungus remains full cost', 'sea_fungus', 0.5, [0.4], true, 0.0],
	['rough terrain spends aftercost', 'rough', 3.0, [], true, 1.0],
	['rough terrain clamps movement', 'rough', 1.0, [], true, 0.0],
	['river rough aftercost', 'river_rough', 2.0, [], true, 2.0 - (1.0 / 3.0 + 1.0)],
	['sea rough has no aftercost', 'sea_rough', 2.0, [], true, 1.0],
	['river into sea is full cost', 'river_sea', 2.0, [], true, 1.0],
];
for (c of move_cases) {
	behavior.scenario('move resolve apply rollback ' + c[0], () => {
		const e = mocks.event(c[3]);
		const u = e.data.unit;
		const source = u.get_tile();
		const destination = e.data.tile;
		u.movement = c[2];
		if (c[1] == 'river' || c[1] == 'river_rough' || c[1] == 'river_sea') {
			source.features.river = true; destination.features.river = true;
		}
		if (c[1] == 'fungus' || c[1] == 'fungus_rough' || c[1] == 'sea_fungus') { destination.features.xenofungus = true; }
		if (c[1] == 'rough' || c[1] == 'river_rough' || c[1] == 'fungus_rough' || c[1] == 'sea_rough') { destination.rockiness = 3; }
		if (c[1] == 'sea_fungus' || c[1] == 'sea_rough' || c[1] == 'river_sea') {
			destination.is_land = false; destination.is_water = true;
		}
		e.resolved = movement.resolve(e);
		test.assert(e.resolved.is_movement_successful == c[4]);
		test.assert(e.game.random.state.index == #sizeof(c[3]));
		if (#sizeof(c[3]) > 0) {
			const upper = c[1] == 'river' ? 1.0 / 3.0 : 1.0;
			test.assert(e.game.random.state.draws == [[0.0, upper]]);
		}
		test.assert(u.movement == c[2] && u.moves == []);
		e.applied = movement.apply(e);
		test.assert(u.movement == c[5] && u.moved_this_turn);
		if (c[4]) { test.assert(u.tile.x == 2 && u.moves == [[2, 0]]); }
		else { test.assert(u.tile.x == 0 && u.moves == []); }
		test.assert(e.applied.orig.tile.x == 0 && e.applied.orig.movement == c[2]);
		movement.rollback(e);
		test.assert(u.tile.x == 0 && u.movement == c[2] && !u.moved_this_turn);
		test.assert(e.game.random.state.index == #sizeof(c[3]));
	});
}
behavior.scenario('movement waits for animation completion and restores prior moved flag', () => {
	const e = mocks.event([]);
	const u = e.data.unit;
	u.movement = 2.0; u.moved_this_turn = true; u.delayed = true;
	e.resolved = movement.resolve(e);
	e.applied = movement.apply(e);
	test.assert(u.tile.x == 0 && u.movement == 2.0);
	u.pending();
	test.assert(u.tile.x == 2 && u.movement == 1.0);
	movement.rollback(e);
	test.assert(u.tile.x == 2 && u.movement == 1.0);
	u.pending();
	test.assert(u.tile.x == 0 && u.movement == 2.0 && u.moved_this_turn);
});

// Exact synthetic random streams expose tie handling, damage clamping, powers,
// stopping conditions, and draw consumption without copying a random algorithm.
const combat_cases = [
	['attacker wins', 0.1, 0.1, 6, 6, true, true, [3.0, 0.0, 0.3], [[true, 0.1]], false, true, 3.0, 2.0],
	['defender wins', 0.1, 0.1, 6, 6, true, true, [0.0, 2.0, 0.3], [[false, 0.1]], true, false, 3.0, 2.0],
	['equal rolls harm both', 0.1, 0.1, 6, 6, true, true, [0.0, 0.0, 0.1, 0.1], [[true, 0.1], [false, 0.1]], true, true, 3.0, 2.0],
	['low morale and sea powers', 0.1, 0.1, 0, 0, false, false, [1.0 / 7.0, 0.0, 0.2], [[true, 0.1]], false, true, 1.0 / 7.0, 1.0 / 7.0],
	['mixed domain powers', 0.1, 0.1, 6, 6, false, true, [1.0, 2.0, 0.1], [[false, 0.1]], true, false, 1.0, 2.0],
	['alternate exchanges stop at death', 0.2, 0.3, 6, 6, true, true, [3.0, 0.0, 0.1, 0.0, 2.0, 0.3], [[true, 0.1], [false, 0.2]], true, false, 3.0, 2.0],
	['dead attacker consumes no random', 0.0, 1.0, 6, 6, true, true, [], [], true, false, 3.0, 2.0],
	['dead defender consumes no random', 1.0, 0.0, 6, 6, true, true, [], [], false, true, 3.0, 2.0],
];
for (c of combat_cases) {
	behavior.scenario('combat resolve ' + c[0], () => {
		const e = mocks.event(c[7]);
		const a = e.data.attacker;
		const d = e.data.defender;
		a.health = c[1]; d.health = c[2]; a.morale = c[3]; d.morale = c[4];
		a.is_land = c[5]; d.is_land = c[6];
		const result = combat.resolve(e);
		test.assert(result.sequence == c[8]);
		test.assert(result.attacker_dead == c[9] && result.defender_dead == c[10]);
		test.assert(e.game.random.state.index == #sizeof(c[7]));
		if (#sizeof(c[7]) > 0) {
			test.assert(e.game.random.state.draws[0] == [0.0, c[11]]);
			test.assert(e.game.random.state.draws[1] == [0.0, c[12]]);
			test.assert(e.game.random.state.draws[2] == [0.1, 0.3]);
		}
		test.assert(a.health == c[1] && d.health == c[2] && a.movement == 1.0);
	});
}

const install_animations = (e) => {
	const state = { animations: [], events: [], stopped: [] };
	const manager = {};
	manager.show_animations = (animations) => { state.animations = animations; return 71; };
	manager.stop_animations = (id) => { state.stopped :+ id; };
	e.game.am = manager;
	e.game.event = (name, data) => { state.events :+ name; };
	return state;
};
behavior.scenario('combat animation sequence applies damage on completion and surviving rollback restores state', () => {
	const e = mocks.event([]);
	const state = install_animations(e);
	e.data.attacker.movement = 2.0;
	e.resolved = { sequence: [[true, 0.2], [false, 0.1], [true, 0.3]], attacker_dead: false, defender_dead: false };
	e.applied = combat.apply(e);
	test.assert(e.applied.animations_id == 71 && e.data.attacker.movement == 0.0);
	test.assert(e.data.attacker.health == 1.0 && e.data.defender.health == 1.0);
	test.assert(#sizeof(state.animations) == 3 && state.events == []);
	test.assert(state.animations[0].id == 'ATTACK_PSI' && state.animations[0].tile.x == 2);
	test.assert(state.animations[1].tile.x == 0 && state.animations[2].tile.x == 2);
	state.animations[0].oncomplete();
	test.assert(e.data.defender.health == 0.8 && e.data.attacker.health == 1.0);
	state.animations[1].oncomplete();
	test.assert(e.data.attacker.health == 0.9);
	state.animations[2].oncomplete();
	test.assert(e.data.defender.health == 0.5);
	combat.rollback(e);
	test.assert(state.stopped == [71] && state.events == []);
	test.assert(e.data.attacker.health == 1.0 && e.data.defender.health == 1.0 && e.data.attacker.movement == 2.0);
});
for (deaths of [[true, false], [false, true], [true, true]]) {
	behavior.scenario('combat death callbacks ' + #to_string(deaths), () => {
		const e = mocks.event([]);
		const state = install_animations(e);
		e.resolved = { sequence: [], attacker_dead: deaths[0], defender_dead: deaths[1] };
		e.applied = combat.apply(e);
		test.assert(state.events == []);
		let count = 0;
		for (animation of state.animations) {
			test.assert(animation.id == 'DEATH_PSI');
			animation.oncomplete(); count++;
			test.assert(#sizeof(state.events) == count);
			test.assert(state.events[count - 1] == 'despawn_unit');
		}
		test.assert(count == (deaths[0] ? 1 : 0) + (deaths[1] ? 1 : 0));
		// Casualty resurrection is covered by combat_rollback_regression.gls.js.
	});
}

for (caller of [0, 1, 2, 0 - 1]) {
	behavior.scenario('spawn and despawn authority caller ' + #to_string(caller), () => {
		const e = mocks.event([]); e.caller = caller;
		if (caller == 0) { test.assert(!#is_defined(spawn.validate(e)) && !#is_defined(despawn.validate(e))); }
		else {
			test.assert(spawn.validate(e) == 'Only master is allowed to spawn units');
			test.assert(despawn.validate(e) == 'Only master is allowed to despawn units');
		}
	});
}
behavior.scenario('spawn apply forwards descriptor and rollback despawns created unit', () => {
	const e = mocks.event([]);
	const state = { spawned: [], removed: [] };
	const created = { id: 77 };
	e.data.type = 'MindWorm'; e.data.owner = 4; e.data.morale = 3; e.data.health = 0.7;
	e.game.um = {
		spawn_unit: (data) => { state.spawned :+ data; return created; },
		despawn_unit: (unit) => { state.removed :+ unit.id; },
	};
	e.applied = spawn.apply(e);
	test.assert(e.applied.unit.id == 77 && #sizeof(state.spawned) == 1);
	test.assert(state.spawned[0].def == 'MindWorm' && state.spawned[0].owner == 4);
	test.assert(state.spawned[0].tile.x == 2 && state.spawned[0].morale == 3 && state.spawned[0].health == 0.7);
	spawn.rollback(e); test.assert(state.removed == [77]);
});
behavior.scenario('despawn rollback reconstructs manager descriptor and resolves owner and tile', () => {
	const e = mocks.event([]);
	const state = { spawned: [], removed: [], players: [], tiles: [] };
	e.data.unit = { id: 88, def: 'LocustsOfChiron', owner: 4, tile: { x: 8, y: 3 }, morale: 2, health: 0.6 };
	e.game.um = {
		spawn_unit: (data) => { state.spawned :+ data; },
		despawn_unit: (unit) => { state.removed :+ unit.id; },
	};
	e.game.get_player = (owner) => { state.players :+ owner; return { id: owner }; };
	e.game.tm = { get_tile: (x, y) => { state.tiles :+ [x, y]; return { x: x, y: y }; } };
	e.applied = despawn.apply(e);
	test.assert(state.removed == [88] && e.applied.unit.id == 88 && state.spawned == []);
	despawn.rollback(e);
	test.assert(state.players == [4] && state.tiles == [[8, 3]] && #sizeof(state.spawned) == 1);
	const descriptor = state.spawned[0];
	test.assert(descriptor.id == 88 && descriptor.def == 'LocustsOfChiron' && descriptor.owner.id == 4);
	test.assert(descriptor.tile.x == 8 && descriptor.tile.y == 3 && descriptor.morale == 2 && descriptor.health == 0.6);
});
