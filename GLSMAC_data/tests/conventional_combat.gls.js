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

const native = #include('./_combat_native_fixture');
const conventional_fixture = () => {
	const fixture = native.create(); const f = fixture.f;
	const declare = (id, model) => {
		const data = {name: id, morale: 'SYNTHETIC', type: 'static', movement_type: 'land', movement_per_turn: 1,
			render: {type: 'sprite', file: 'synthetic.pcx', x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0}};
		data.combat = model;
		f.game.um.define_unit(id, data);
	};
	f.with_write(() => {
		declare('COVERAGE_ATTACKER', {kind: 'conventional', offense: 3, defense: 1, reactor: 1});
		declare('COVERAGE_DEFENDER', {kind: 'conventional', offense: 1, defense: 2, reactor: 1});
		declare('COVERAGE_CIVILIAN', {kind: 'civilian', offense: 0, defense: 1, reactor: 1});
		const attacker = f.game.um.spawn_unit({def: 'COVERAGE_ATTACKER', owner: f.owner, tile: f.tile_at(0, 2), morale: 6, health: 0.25});
		const defender = f.game.um.spawn_unit({def: 'COVERAGE_DEFENDER', owner: f.game.get_player(0), tile: f.tile_at(2, 2), morale: 6, health: 0.25});
		attacker.movement = 1.5; defender.movement = 0.75;
		fixture.attacker_id = attacker.id + 0; fixture.defender_id = defender.id + 0;
	});
	return fixture;
};

for (row of [
	{name: 'attacker victory', draws: [3.0, 0.0, 0.3], sequence: [[true, 0.25]], attacker_dead: false, defender_dead: true},
	{name: 'defender victory', draws: [0.0, 2.0, 0.3], sequence: [[false, 0.25]], attacker_dead: true, defender_dead: false},
	{name: 'equal-roll mutual casualties', draws: [1.0, 1.0, 0.3, 0.3], sequence: [[true, 0.25], [false, 0.25]], attacker_dead: true, defender_dead: true},
]) {
	behavior.scenario('native definition-backed conventional resolution preserves the complete world for ' + row.name, () => {
		const fixture = conventional_fixture(); const f = fixture.f;
		const controller = native.event(fixture, row.draws); const e = controller.event;
		const before = f.snapshot(); const context = native.context(f); const tiles = native.tile_membership(f);
		const spectators = native.bystanders(f, fixture.attacker_id, fixture.defender_id);
		test.assert(#sizeof(context.players) == 2 && #sizeof(spectators) == 5);
		test.assert(!#is_defined(combat.validate(e)), 'Actual native land units on adjacent tiles validate');
		const result = combat.resolve(e);
		test.assert(result.sequence == row.sequence && result.attacker_dead == row.attacker_dead && result.defender_dead == row.defender_dead);
		test.assert(e.game.random.state.index == #sizeof(row.draws));
		const expected_draws = [[0.0, 3.0], [0.0, 2.0], [0.1, 0.3]];
		if (#sizeof(row.draws) == 4) { expected_draws :+ [0.1, 0.3]; }
		test.assert(e.game.random.state.draws == expected_draws, 'The production policy reads the actual native offense/defense and clamps damage to native health');
		test.assert(f.snapshot() == before && native.context(f) == context && native.tile_membership(f) == tiles);
		test.assert(native.bystanders(f, fixture.attacker_id, fixture.defender_id) == spectators && controller.state.events == [] && controller.state.animations == []);
	});
}

for (kind of ['wrong owner', 'exhausted', 'civilian']) {
	behavior.scenario('native conventional attack rejects ' + kind + ' without changing any player or unit', () => {
		const fixture = conventional_fixture(); const f = fixture.f;
		const controller = native.event(fixture, []); const e = controller.event;
		let expected = '';
		if (kind == 'wrong owner') { e.caller = 0; expected = 'Unit can only be ordered to attack by it\'s owner'; }
		if (kind == 'exhausted') {
			f.with_write(() => { e.data.attacker.movement = 0.0; });
			expected = 'Attacker is out of moves';
		}
		if (kind == 'civilian') {
			f.with_write(() => {
				e.data.attacker = f.game.um.spawn_unit({def: 'COVERAGE_CIVILIAN', owner: f.owner, tile: f.tile_at(0, 2), morale: 6, health: 1.0});
			});
			expected = 'Civilian units can\'t attack';
		}
		const before = f.snapshot(); const context = native.context(f); const tiles = native.tile_membership(f);
		test.assert(combat.validate(e) == expected);
		test.assert(f.snapshot() == before && native.context(f) == context && native.tile_membership(f) == tiles);
		test.assert(e.game.random.state.draws == [] && controller.state.events == [] && controller.state.animations == []);
	});
}
