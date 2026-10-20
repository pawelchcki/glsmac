// GLSMAC conventional-strength checks. These do not establish original combat odds,
// terrain/base bonuses, reactor damage, promotions or conventional animations.
const behavior = #include('./_behavior');
const mocks = #include('./_gameplay_mocks');
const combat = #include('../default/game/event/attack_unit');

behavior.scenario('conventional attacks use actual offense and defense rather than the native land ratio', () => {
	const e = mocks.event([1.0, 2.0, 0.1]);
	e.data.attacker.definition.combat = {kind: 'conventional', offense: 1, defense: 1, reactor: 1};
	e.data.defender.definition.combat = {kind: 'conventional', offense: 1, defense: 3, reactor: 1};
	e.data.attacker.health = 0.1; e.data.defender.health = 0.1;
	e.data.attacker.morale = 6; e.data.defender.morale = 6;
	const result = combat.resolve(e);
	test.assert(result.attacker_dead && !result.defender_dead);
	test.assert(e.game.random.state.draws == [[0.0, 1.0], [0.0, 3.0], [0.1, 0.3]]);
});

behavior.scenario('encountering a psi unit retains the existing bounded psi strength policy', () => {
	const e = mocks.event([3.0, 0.0, 0.1]);
	e.data.attacker.definition.combat = {kind: 'conventional', offense: 1, defense: 9, reactor: 1};
	e.data.defender.definition.combat = {kind: 'psi', offense: 0, defense: 0, reactor: 1};
	e.data.attacker.health = 0.1; e.data.defender.health = 0.1;
	e.data.attacker.morale = 6; e.data.defender.morale = 6;
	const result = combat.resolve(e);
	test.assert(!result.attacker_dead && result.defender_dead);
	test.assert(e.game.random.state.draws == [[0.0, 3.0], [0.0, 2.0], [0.1, 0.3]]);
});

behavior.scenario('a civilian Former cannot initiate combat and rejection consumes no random draws', () => {
	const e = mocks.event([]);
	e.data.attacker.definition.id = 'Formers';
	e.data.attacker.definition.combat = {kind: 'civilian', offense: 0, defense: 1, reactor: 1};
	test.assert(#is_defined(combat.validate(e)));
	test.assert(e.game.random.state.draws == [] && e.data.attacker.health == 1.0 && e.data.attacker.movement == 1.0);
});
