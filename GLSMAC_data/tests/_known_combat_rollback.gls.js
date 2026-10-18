// Known production regression. Keep the real combat -> spawn event chain so a
// recording-only event mock cannot conceal a malformed resurrection payload.
const behavior = #include('./_behavior');
const mocks = #include('./_gameplay_mocks');
const combat = #include('../default/game/event/attack_unit');
const spawn = #include('../default/game/event/spawn_unit');

behavior.scenario('combat casualty rollback restores a valid spawn descriptor', () => {
	const e = mocks.event([]);
	const state = { animations: [], spawned: [], despawned: [], stopped: [] };
	e.data.defender.health = 0.1;
	e.game.am = {
		show_animations: (animations) => { state.animations = animations; return 71; },
		stop_animations: (id) => { state.stopped :+ id; },
	};
	e.game.um = {
		spawn_unit: (descriptor) => {
			state.spawned :+ descriptor;
			return descriptor;
		},
	};
	e.game.event = (name, data) => {
		if (name == 'despawn_unit') { state.despawned :+ data.unit.owner; }
		if (name == 'spawn_unit') {
			const event = {};
			event.game = e.game;
			event.data = data;
			spawn.apply(event);
		}
	};
	e.resolved = { sequence: [[true, 0.1]], attacker_dead: false, defender_dead: true };
	e.applied = combat.apply(e);
	for (animation of state.animations) { animation.oncomplete(); }
	test.assert(e.data.defender.health == 0.0 && state.despawned == [2], 'Combat must complete the defender casualty before rollback');
	combat.rollback(e);
	test.assert(state.stopped == [71] && #sizeof(state.spawned) == 1, 'Rollback must cancel animations and respawn the casualty once');
	const descriptor = state.spawned[0];
	test.assert(descriptor.def == 'MindWorm', 'Resurrection must preserve the unit definition');
	test.assert(descriptor.owner == 2 && descriptor.tile.x == 2 && descriptor.tile.y == 0, 'Resurrection must preserve the owner and tile');
	test.assert(descriptor.morale == 6 && descriptor.health == 0.1, 'Resurrection must restore morale and precombat health');
});
