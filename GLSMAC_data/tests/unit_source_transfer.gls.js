// Synthetic source mutations exercise shipped consumers and actual native
// definitions. This is integration coverage, not additional original evidence.
const behavior = #include('./_behavior');
const consumer = #include('../default/game/unit_rules');
const definitions = #include('../default/units/defs');
const start_world = #include('../default/game/world/default');
const fixture = #include('./_startup_unit_rules_fixture');

const source = () => {
	const parsed = test.parse_smac_text(fixture.source, 'rules');
	const table = {};
	for (name of ['UNITS', 'CHASSIS', 'WEAPONS', 'DEFENSES', 'REACTORS', 'MORALE']) { table[name] = parsed.rows(name); }
	const result = {}; result.table = table;
	result.document = {rows: (name) => { return table[name]; }};
	return result;
};
const change = (input, block, row, column, value) => {
	const rows = input.table[block]; const fields = rows[row]; fields[column] = value;
};
const install = (input) => {
	const f = test.founding_fixture();
	f.game.get_settings().global.rules.set_terraforming_ignore_technologies(false);
	f.enable_economy();
	const rules = consumer.parse(input.document);
	f.with_write(() => {
		f.game.um.despawn_unit(f.unit_id);
		f.game.um.undefine_unit('ColonyPod');
		f.game.um.undefine_unit('Scout');
	});
	const game = {};
	game.event = (name, data) => {
		const handler = #include('../default/game/event/' + name);
		const event = {caller: 0}; event.game = f.game; event.data = data;
		test.assert(!#is_defined(handler.validate(event)), 'Production definition event accepts the source');
		f.with_write(() => { handler.apply(event); });
	};
	definitions.define(game, rules);
	f.spawn = (id) => {
		let unit = null;
		f.with_write(() => {
			unit = f.game.um.spawn_unit({def: id, owner: f.owner, tile: f.base.get_tile(), morale: 1, health: 1.0});
		});
		return unit;
	};
	f.rules = rules;
	f.start = (technologies) => {
		f.apply_faction_starting_technologies(technologies);
		f.game.set('starting_unit_rules', consumer.materialize(f.game.um, rules));
		f.game.set('energy_rules', {starting_credits:0});
		f.with_write(() => {
			f.game.bm.despawn_base(f.base);
			for (id of ['HEADQUARTERS', 'RECYCLING_TANKS', 'STOCKPILE_ENERGY']) { f.owner.remove_production_choice(id); }
		});
		const owner = {id: f.owner.id, is_master: false, get_faction: () => { return f.owner.get_faction(); },
			validate_initial_energy:(amount) => { return f.owner.validate_initial_energy(amount); }};
		const players = []; players :+ owner;
		const world = {get_settings:() => { return f.game.get_settings(); },get_players: () => { return players; }, get_tm: () => { return f.game.tm; },
			get: (key) => { return f.game.get(key); }, random: {get_int: (low, high) => { return low; }}};
		world.event = (name, data) => {
			if (#is_defined(data.player)) { data.player = f.owner; }
			if (#is_defined(data.owner)) { data.owner = f.owner; }
			const handler = #include('../default/game/event/' + name);
			const event = {caller: 0}; event.game = f.game; event.data = data;
			test.assert(!#is_defined(handler.validate(event)), 'Production startup event accepts the source');
			f.with_write(() => { handler.apply(event); });
		};
		start_world(world);
	};
	return f;
};

for (entry of [{row: 1, id: 'ColonyPod'}, {row: 2, id: 'Formers'}, {row: 3, id: 'ScoutPatrol'}]) {
	behavior.scenario('installed source name reaches native definition and its codec for ' + entry.id, () => {
		const input = source(); const name = 'Synthetic ' + entry.id;
		change(input, 'UNITS', entry.row, 0, name);
		const f = install(input); const unit = f.spawn(entry.id);
		test.assert(unit.get_def().name == name && unit.get_def().id == entry.id);
		test.assert(unit.owner == f.owner.id && unit.is_land && !unit.is_water && !unit.is_air);
		const codec = f.unit_definition_codec_probe(entry.id);
		test.assert(codec.roundtrip && codec.source_unchanged);
	});
}

for (movement of [2, 4, 8]) {
	behavior.scenario('installed chassis movement reaches all three native land units ' + #to_string(movement), () => {
		const input = source(); change(input, 'CHASSIS', 0, 8, #to_string(movement));
		const f = install(input);
		for (id of ['ColonyPod', 'Formers', 'ScoutPatrol']) {
			const unit = f.spawn(id); const def = unit.get_def();
			test.assert(def.movement_per_turn == #to_float(movement));
			test.assert(unit.movement == #to_float(movement) && unit.needs_orders());
		}
	});
}

for (strength of [2, 9, 99]) {
	behavior.scenario('installed weapon strength reaches Scout without arming civilians ' + #to_string(strength), () => {
		const input = source(); change(input, 'WEAPONS', 0, 2, #to_string(strength));
		const f = install(input); const scout = f.spawn('ScoutPatrol');
		test.assert(scout.get_def().combat == {kind: 'conventional', offense: strength, defense: 1, reactor: 1});
		for (id of ['ColonyPod', 'Formers']) {
			const unit = f.spawn(id);
			test.assert(unit.get_def().combat == {kind: 'civilian', offense: 0, defense: 1, reactor: 1});
		}
	});
}

for (strength of [2, 7, 99]) {
	behavior.scenario('installed armor strength reaches every native basic unit ' + #to_string(strength), () => {
		const input = source(); change(input, 'DEFENSES', 0, 2, #to_string(strength));
		const f = install(input);
		for (id of ['ColonyPod', 'Formers', 'ScoutPatrol']) {
			const unit = f.spawn(id);
			test.assert(unit.get_def().combat.defense == strength && unit.get_def().combat.reactor == 1);
		}
	});
}

behavior.scenario('all seven installed morale labels reach native standard and wildlife sets independently', () => {
	const input = source(); const standard = []; const native = [];
	for (let level = 0; level < 7; level++) {
		const suffix = #to_string(level);
		change(input, 'MORALE', level, 0, 'Human ' + suffix);
		change(input, 'MORALE', level, 1, 'Wild ' + suffix);
		standard :+ 'Human ' + suffix; native :+ 'Wild ' + suffix;
	}
	const f = install(input);
	test.assert(f.game.um.get_moraleset('STANDARD') == standard);
	test.assert(f.game.um.get_moraleset('NATIVE') == native);
	const exported = f.game.um.get_moraleset('STANDARD'); exported[0] = 'Changed';
	test.assert(f.game.um.get_moraleset('STANDARD') == standard, 'Exported labels cannot mutate native morale data');
	for (id of ['ColonyPod', 'Formers', 'ScoutPatrol']) { const unit = f.spawn(id); test.assert(unit.get_def().morale == 'STANDARD'); }
	const worm = f.spawn('MindWorms'); test.assert(worm.get_def().morale == 'NATIVE');
});

behavior.scenario('component aliases resolve source references without depending on table order or English names', () => {
	const input = source();
	change(input, 'CHASSIS', 0, 0, 'Synthetic chassis');
	change(input, 'DEFENSES', 0, 1, 'Synthetic armor');
	for (let row = 1; row <= 3; row++) {
		change(input, 'UNITS', row, 1, 'Synthetic chassis');
		change(input, 'UNITS', row, 3, 'Synthetic armor');
	}
	change(input, 'WEAPONS', 0, 1, 'Synthetic weapon'); change(input, 'UNITS', 3, 2, 'Synthetic weapon');
	const weapons = input.table.WEAPONS; const first = weapons[0]; weapons[0] = weapons[2]; weapons[2] = first;
	const f = install(input); const scout = f.spawn('ScoutPatrol');
	test.assert(scout.get_def().combat == {kind: 'conventional', offense: 1, defense: 1, reactor: 1});
	test.assert(scout.get_def().name == 'Scout Patrol');
});

for (component of [{block: 'CHASSIS', row: 0, column: 12}, {block: 'WEAPONS', row: 2, column: 4}, {block: 'DEFENSES', row: 0, column: 4}]) {
	behavior.scenario('installed ' + component.block + ' cost uses native prototype helper without mutating parsed source', () => {
		const input = source(); change(input, component.block, component.row, component.column, '4');
		const f = install(input); const before = #clone(f.rules);
		const units = consumer.materialize(f.game.um, f.rules);
		if (component.block == 'CHASSIS') { for (unit of units) { test.assert(unit.chassis_cost == 4); } }
		if (component.block == 'WEAPONS') { test.assert(units[1].weapon_cost == 4); }
		if (component.block == 'DEFENSES') { for (unit of units) { test.assert(unit.armor_cost == 4); } }
		for (unit of units) {
			const expected = f.game.um.get_prototype_base_cost(unit.chassis_cost, 0, false, unit.combat.offense,
				unit.weapon_mode, unit.weapon_cost, unit.armor_cost, unit.combat.reactor);
			test.assert(unit.rows == expected && unit.rows > 0);
		}
		units[0].combat.defense = 42;
		test.assert(f.rules == before, 'Cost materialization owns its result and leaves parsed input intact');
	});
}

for (entry of [
	{prerequisite: 'None', technologies: [], available: true},
	{prerequisite: 'Ecology', technologies: [], available: false},
	{prerequisite: 'Ecology', technologies: ['Ecology'], available: true},
	{prerequisite: 'SyntheticTech', technologies: ['Ecology'], available: false},
	{prerequisite: 'SyntheticTech', technologies: ['Physic', 'SyntheticTech'], available: true},
	{prerequisite: 'Ecology', technologies: ['ecology'], available: false},
]) {
	const label = entry.prerequisite + ':' + #to_string(entry.technologies);
	behavior.scenario('source prerequisite controls actual native choices and opening project ' + label, () => {
		const input = source(); change(input, 'UNITS', 2, 7, entry.prerequisite);
		change(input, 'UNITS', 2, 0, 'Synthetic Terraformer');
		const f = install(input); f.start(entry.technologies);
		let former = null; let pod = null; let scout = null;
		for (choice of f.owner.get_production_choices()) {
			if (choice.id == 'FORMERS') { former = choice; }
			if (choice.id == 'COLONY_POD') { pod = choice; }
			if (choice.id == 'SCOUT_PATROL') { scout = choice; }
		}
		test.assert((former != null) == entry.available);
		test.assert(pod != null && scout != null, 'Gating the Former preserves other available native choices');
		if (former != null) { test.assert(former.name == 'Synthetic Terraformer' && former.type == 'unit'); }
		const bases = f.game.bm.get_bases(); test.assert(#sizeof(bases) == 1);
		const base = bases[0];
		test.assert(base.get_production().choice_id == (entry.available ? 'FORMERS' : 'COLONY_POD'));
		test.assert(base.get_production().minerals == 0, 'Selecting a project grants no free minerals');
	});
}
