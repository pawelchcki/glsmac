// Installed component and concrete starting-technology import prerequisites.
const behavior = #include('./_behavior');
const consumer = #include('../default/game/unit_rules');
const technology = #include('../default/game/faction_starting_technologies');
const fixture = #include('./_startup_unit_rules_fixture');
const definitions = #include('../default/units/defs');
const declared = (rules) => {
	const result = {};
	definitions.define({event: (name, payload) => {
		if (name == 'define_unit') { result[payload.id] = #clone(payload.data); }
	}}, rules);
	return result;
};
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

behavior.scenario('stock Former component uses installed geometry with source provenance and existing combat', () => {
	const rules = fixture.parse(); const actual = declared(rules);
	#print('CVR_DEFINITION|Formers|' + actual.Formers.render.file);
	test.assert(actual.Formers.render.file == 'VT.cvr', 'Former must use its authentic installed component rather than the citizen portrait');
	test.assert(rules.definitions[1].source_components == {prototype: 1, chassis: 0, weapon: 2, armor: 0, reactor: 0});
	test.assert(actual.Formers.morale == 'STANDARD' && actual.Formers.combat == {kind: 'civilian', offense: 0, defense: 1, reactor: 1});
	test.assert(actual.Formers.movement_per_turn == 1);
	test.assert(actual.ScoutPatrol.render.file == 'newicons.pcx' && actual.ColonyPod.render.file == 'newicons.pcx', 'Unverified roles retain their existing fallback');
});

behavior.scenario('component provenance survives authored display names without mutating source rows', () => {
	const input = blocks(); set(input, 'UNITS', 2, 0, 'Authored Terraformer');
	set(input, 'CHASSIS', 0, 0, 'Authored Foot');
	for (row of [1,2,3]) { set(input, 'UNITS', row, 1, 'Authored Foot'); }
	const before = #clone(input.table); const rules = consumer.parse(input.document); const actual = declared(rules);
	test.assert(actual.Formers.name == 'Authored Terraformer' && actual.Formers.render.file == 'VT.cvr');
	test.assert(rules.definitions[1].source_components.chassis == 0 && input.table == before);
});

behavior.scenario('unobserved authored chassis and armor variants retain functional fallback', () => {
	for (kind of ['chassis','armor']) {
		const input = blocks();
		if (kind == 'chassis') {
			const extra = #clone(input.table.CHASSIS[0]); extra[0] = 'Authored Rover'; extra[8] = '2';
			input.table.CHASSIS :+ extra; set(input, 'UNITS', 2, 1, 'Authored Rover');
		} else {
			const extra = #clone(input.table.DEFENSES[0]); extra[0] = 'Authored Armor'; extra[1] = 'ExtraArmor'; extra[2] = '2';
			input.table.DEFENSES :+ extra; set(input, 'UNITS', 2, 3, 'ExtraArmor');
		}
		const rules = consumer.parse(input.document); const actual = declared(rules);
		test.assert(actual.Formers.render.file == 'newicons.pcx', 'Unobserved component assemblies must not acquire a stock-model claim');
		test.assert(kind == 'chassis' ? actual.Formers.movement_per_turn == 2 : actual.Formers.combat.defense == 2);
	}
	const legacy = fixture.parse(); legacy.definitions[1].source_components = #undefined;
	test.assert(declared(legacy).Formers.render.file == 'newicons.pcx', 'Unproven caller-authored definitions keep their previous fallback');
});

behavior.scenario('CVR-backed Former keeps native definition wire format and civilian identity', () => {
	const f = #include('./_former_work_fixture')('arid');
	const def = f.former.get_def(); const codec = f.unit_definition_codec_probe('Formers');
	test.assert(def.id == 'Formers' && def.morale == 'STANDARD' && def.combat.kind == 'civilian');
	test.assert(codec.roundtrip && codec.legacy_default && codec.invalid_rejected && codec.source_unchanged);
});

let index = 0;
for (change of [
	['UNITS', 0, 0, '4'],
	['UNITS', 3, 2, 'MissingGun'],
	['WEAPONS', 2, 3, '8'],
	['WEAPONS', 0, 2, '1.0'],
	['UNITS', 1, 9, '10000000000000000000000000'],
	['UNITS', 1, 5, '101'],
	['UNITS', 2, 5, '-1'],
	['UNITS', 2, 5, '9223372036854775808'],
	['UNITS', 2, 5, '4.0'],
]) {
	behavior.scenario('unsupported basic-unit source rejects before definitions or costs are installed ' + #to_string(index), () => {
		let caught = false;
		const input = blocks(); set(input, change[0], change[1], change[2], change[3]);
		try { consumer.parse(input.document); } catch { : (e) => { caught = true; } }
		test.assert(caught);
	}); index++;
}

behavior.scenario('positive declared prototype rows take precedence while zero keeps component pricing', () => {
	const f = test.founding_fixture();
	for (rows of [4, 8]) {
		const input = blocks(); set(input, 'UNITS', 2, 5, #to_string(rows));
		// A different component price must not overwrite an explicit declaration.
		set(input, 'WEAPONS', 2, 4, '12');
		const units = consumer.materialize(f.game.um, consumer.parse(input.document));
		test.assert(units[1].declared_rows == rows && units[1].rows == rows);
		test.assert(units[0].declared_rows == 0 && units[0].rows == 3);
	}
});

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
