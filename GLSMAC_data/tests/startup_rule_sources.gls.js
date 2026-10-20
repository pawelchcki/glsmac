// Installed component and concrete starting-technology import prerequisites.
const behavior = #include('./_behavior');
const consumer = #include('../default/game/unit_rules');
const technology = #include('../default/game/faction_starting_technologies');
const fixture = #include('./_startup_unit_rules_fixture');
const blocks = () => {
	const parsed = test.parse_smac_text(fixture.source, 'rules'); const table = {};
	for (name of ['UNITS', 'CHASSIS', 'WEAPONS', 'DEFENSES', 'REACTORS', 'MORALE']) { table[name] = parsed.rows(name); }
	const result = {}; result.table = table;
	result.document = {rows: (name) => { return table[name]; }};
	return result;
};
const set = (input, block, row, column, value) => {
	const rows = input.table[block]; const fields = rows[row]; fields[column] = value;
};

behavior.scenario('basic component sources supply actual names strength movement and recorded mineral rows', () => {
	const f = test.founding_fixture(); const rules = fixture.parse(); const units = consumer.materialize(f.game.um, rules);
	test.assert(#sizeof(units) == 3);
	test.assert(units[0].id == 'ColonyPod' && units[0].rows == 3 && units[0].combat.kind == 'civilian');
	test.assert(units[1].id == 'Formers' && units[1].rows == 2 && units[1].prerequisite == 'Ecology');
	test.assert(units[2].id == 'ScoutPatrol' && units[2].rows == 1 && units[2].name == 'Scout Patrol');
	test.assert(units[2].combat == {kind: 'conventional', offense: 1, defense: 1, reactor: 1});
	test.assert(units[2].movement == 1 && rules.standard_morale[0].name == 'Very Green');
});

behavior.scenario('controlled source names and component costs propagate without fixed unit-answer tables', () => {
	const f = test.founding_fixture();
	const input = blocks();
	set(input, 'UNITS', 3, 0, 'Synthetic Guard'); set(input, 'WEAPONS', 2, 4, '12');
	const units = consumer.materialize(f.game.um, consumer.parse(input.document));
	test.assert(units[2].name == 'Synthetic Guard' && units[1].weapon_cost == 12 && units[1].rows == 4);
});

let index = 0;
for (change of [
	['UNITS', 0, 0, '4'],
	['UNITS', 3, 2, 'MissingGun'],
	['WEAPONS', 2, 3, '8'],
	['WEAPONS', 0, 2, '1.0'],
	['UNITS', 1, 9, '10000000000000000000000000'],
	['UNITS', 1, 5, '7'],
]) {
	behavior.scenario('unsupported basic-unit source rejects before definitions or costs are installed ' + #to_string(index), () => {
		let caught = false;
		const input = blocks(); set(input, change[0], change[1], change[2], change[3]);
		try { consumer.parse(input.document); } catch { : (e) => { caught = true; } }
		test.assert(caught);
	}); index++;
}

behavior.scenario('concrete starting technologies deduplicate independently of numeric free research choices', () => {
	const document = test.parse_smac_text('#SYNTHETIC\nHeader\nTECH,Ecology,TECH,Physic,TECH,Ecology,TECH,1,SOCIAL,+GROWTH\n#END\n', 'dialogs');
	test.assert(technology.parse(document, 'SYNTHETIC') == ['Ecology', 'Physic']);
	const f = test.production_fixture(); const input = ['Ecology', 'Physic'];
	const faction = f.apply_faction_starting_technologies(input); input[0] = 'Changed'; faction.starting_technologies[1] = 'Changed';
	test.assert(f.owner.get_faction().starting_technologies == ['Ecology', 'Physic']);
	const codec = f.faction_identity_codec(); test.assert(codec.received && codec.roundtrip && codec.independent);
	const wire = f.state_rules_wire_probe(); test.assert(wire.starting_technologies_received && wire.roundtrip && wire.independent);
});

let invalid_number = 0;
for (input of [[true], ['Same', 'Same'], ['bad token'], [''], ['bad|token']]) {
	behavior.scenario('invalid native starting-technology payload preserves previous faction state ' + #to_string(invalid_number), () => {
		const f = test.production_fixture(); f.apply_faction_starting_technologies(['Original']); let caught = false;
		try { f.apply_faction_starting_technologies(input); } catch { : (e) => { caught = true; } }
		test.assert(caught && f.owner.get_faction().starting_technologies == ['Original']);
	}); invalid_number++;
}
