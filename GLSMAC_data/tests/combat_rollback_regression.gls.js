// Keep the real combat -> spawn event chain so a recording-only event mock
// cannot conceal a malformed resurrection payload.
const behavior = #include('./_behavior');
const mocks = #include('./_gameplay_mocks');
const combat = #include('../default/game/event/attack_unit');
const spawn = #include('../default/game/event/spawn_unit');

const make_combat = (attacker_dead, defender_dead) => {
	const e = mocks.event([]);
	const state = { animations: [], spawned: [], restored: [], despawned: [], stopped: [], players: [] };
	e.data.attacker.id = 41; e.data.defender.id = 42;
	e.data.attacker.health = 0.2; e.data.defender.health = 0.1;
	e.data.attacker.morale = 3; e.data.attacker.definition.id = 'SeaLurk';
	e.data.attacker.movement = 2.5; e.data.defender.movement = 0.75;
	e.data.attacker.moved_this_turn = true; e.data.defender.moved_this_turn = false;
	e.game.get_player = (owner) => { state.players :+ owner; return { id: owner }; };
	e.game.am = {
		show_animations: (animations) => { state.animations = animations; return 71; },
		stop_animations: (id) => { state.stopped :+ id; },
	};
	e.game.um = {
		spawn_unit: (descriptor) => {
			test.assert(#is_defined(descriptor.id) && #typeof(descriptor.owner) == 'Object', 'Respawn must use an explicit ID and resolved player');
			test.assert(descriptor.health > 0.0, 'A casualty must respawn with living precombat health');
			state.spawned :+ descriptor;
			const unit = { id: descriptor.id, health: descriptor.health, movement: 99.0, moved_this_turn: false };
			state.restored :+ unit;
			return unit;
		},
	};
	e.game.event = (name, data) => {
		if (name == 'despawn_unit') {
			state.despawned :+ data.unit.id;
			// Native unit wrappers become invalid when despawn deletes the unit.
			data.unit.get_tile = () => { throw Error('Despawned unit tile was accessed'); };
			data.unit.get_def = () => { throw Error('Despawned unit definition was accessed'); };
			data.unit.owner = 0 - 1; data.unit.morale = 0 - 1;
		}
		if (name == 'spawn_unit') {
			const event = {};
			event.game = e.game;
			event.data = data;
			spawn.apply(event);
		}
	};
	e.resolved = { sequence: [], attacker_dead: attacker_dead, defender_dead: defender_dead };
	if (attacker_dead) { e.resolved.sequence :+ [false, 0.2]; }
	if (defender_dead) { e.resolved.sequence :+ [true, 0.1]; }
	e.applied = combat.apply(e);
	const result = {};
	result.event = e; result.state = state;
	return result;
};

for (c of [
	['combat casualty rollback restores a valid spawn descriptor', false, true, [42]],
	['attacker casualty rollback preserves identity and turn state', true, false, [41]],
	['mutual casualties each restore their original descriptor', true, true, [41, 42]],
]) {
	behavior.scenario(c[0], () => {
		const f = make_combat(c[1], c[2]);
		const e = f.event; const state = f.state;
		for (animation of state.animations) { animation.oncomplete(); }
		test.assert(state.despawned == c[3], 'Combat must complete each casualty before rollback');
		if (c[1]) { test.assert(e.data.attacker.health == 0.0); }
		if (c[2]) { test.assert(e.data.defender.health == 0.0); }
		combat.rollback(e);
		test.assert(state.stopped == [71] && #sizeof(state.spawned) == #sizeof(c[3]), 'Rollback must cancel animations and respawn each casualty once');
		for (let i = 0; i < #sizeof(state.spawned); i++) {
			const descriptor = state.spawned[i]; const unit = state.restored[i];
			const attacker = descriptor.id == 41;
			test.assert(descriptor.id == c[3][i], 'Resurrection must preserve the unit ID');
			test.assert(descriptor.def == (attacker ? 'SeaLurk' : 'MindWorm'), 'Resurrection must preserve the unit definition');
			test.assert(descriptor.owner.id == (attacker ? 1 : 2), 'Resurrection must resolve the original owner');
			test.assert(descriptor.tile.x == (attacker ? 0 : 2) && descriptor.tile.y == 0, 'Resurrection must preserve the tile');
			test.assert(descriptor.morale == (attacker ? 3 : 6) && descriptor.health == (attacker ? 0.2 : 0.1), 'Resurrection must restore morale and precombat health');
			test.assert(unit.movement == (attacker ? 2.5 : 0.75) && unit.moved_this_turn == attacker, 'Resurrection must restore movement and turn state');
		}
		if (!c[1]) { test.assert(e.data.attacker.health == 0.2 && e.data.attacker.movement == 2.5); }
		if (!c[2]) { test.assert(e.data.defender.health == 0.1 && e.data.defender.movement == 0.75); }
	});
}

for (completed_damage of [false, true]) {
	behavior.scenario('rollback before death callbacks, damage complete ' + #to_string(completed_damage), () => {
		const f = make_combat(true, true);
		if (completed_damage) {
			f.state.animations[0].oncomplete(); f.state.animations[1].oncomplete();
		}
		combat.rollback(f.event);
		test.assert(f.state.stopped == [71] && f.state.spawned == [] && f.state.despawned == [], 'Pending casualties must not be respawned');
		test.assert(f.event.data.attacker.health == 0.2 && f.event.data.attacker.movement == 2.5, 'Living attacker must return to its precombat state');
		test.assert(f.event.data.defender.health == 0.1 && f.event.data.defender.movement == 0.75, 'Living defender must return to its precombat state');
	});
}
behavior.scenario('rollback between casualty callbacks restores only the completed casualty', () => {
	const f = make_combat(true, true);
	for (let i = 0; i < 3; i++) { f.state.animations[i].oncomplete(); }
	combat.rollback(f.event);
	test.assert(f.state.despawned == [41] && #sizeof(f.state.spawned) == 1, 'Only the completed casualty must be recreated');
	test.assert(f.state.spawned[0].id == 41 && f.state.spawned[0].health == 0.2, 'Completed casualty must restore its original state');
	test.assert(f.event.data.defender.health == 0.1, 'Pending casualty must recover without respawning');
});
