// Bounded installed definitions for the three basic, ability-free land units.
const field = (row, index) => {
	if (index >= #sizeof(row)) { throw Error('Incomplete SMAC unit component row'); }
	return #trim(row[index] + '');
};
const integer = (row, index, low, high) => {
	const text = field(row, index); let value = 0;
	try { value = #to_int(text); } catch { : (e) => { throw Error('SMAC unit component must be an integer'); } }
	if (#to_string(value) != text || value < low || value > high) { throw Error('Unsupported SMAC unit component value'); }
	return value;
};
const find = (rows, column, name) => {
	let result = null;
	for (row of rows) {
		if (field(row, column) == name) {
			if (result != null) { throw Error('Ambiguous SMAC unit component: ' + name); }
			result = row;
		}
	}
	if (result == null) { throw Error('Missing SMAC unit component: ' + name); }
	return result;
};

return {
	parse: (document) => {
		const rows = document.rows('UNITS');
		if (#sizeof(rows) < 4 || integer(rows[0], 0, 3, 128) != #sizeof(rows) - 1) { throw Error('Invalid SMAC predefined unit count'); }
		const chassis = document.rows('CHASSIS'); const weapons = document.rows('WEAPONS');
		const armors = document.rows('DEFENSES'); const reactors = document.rows('REACTORS');
		if (#sizeof(reactors) < 1) { throw Error('Missing SMAC fission reactor'); }
		integer(reactors[0], 2, 1, 1);
		const definitions = []; let ordinal = 1;
		for (entry of [{id: 'ColonyPod', choice: 'COLONY_POD', mode: 8, population: 1},
			{id: 'Formers', choice: 'FORMERS', mode: 9, population: 0},
			{id: 'ScoutPatrol', choice: 'SCOUT_PATROL', mode: 0, population: 0}]) {
			const row = rows[ordinal]; ordinal++;
			const c = find(chassis, 0, field(row, 1)); const w = find(weapons, 1, field(row, 2));
			const a = find(armors, 1, field(row, 3)); const name = field(row, 0); const prerequisite = field(row, 7);
			if (name == '' || prerequisite == '' || field(row, 9) != '00000000000000000000000000') { throw Error('Unsupported SMAC basic unit declaration'); }
			integer(row, 5, 0, 0); integer(row, 6, 0, 0); integer(row, 8, (0 - 1), (0 - 1));
			integer(c, 9, 0, 0); // land triad
			const mode = integer(w, 3, 0, 14);
			if (mode != entry.mode) { throw Error('SMAC basic unit weapon role changed'); }
			const offense = integer(w, 2, 0, 99); const defense = integer(a, 2, 1, 99);
			if ((mode == 0 && offense == 0) || (mode != 0 && offense != 0)) { throw Error('Invalid SMAC basic unit offense'); }
			definitions :+ {
				id: entry.id, choice: entry.choice, name: name, prerequisite: prerequisite, population: entry.population,
				movement: integer(c, 8, 1, 8), chassis_cost: integer(c, 12, 1, 32),
				weapon_mode: mode, weapon_cost: integer(w, 4, 1, 32), armor_cost: integer(a, 4, 1, 32),
				combat: {kind: mode == 0 ? 'conventional' : 'civilian', offense: offense, defense: defense, reactor: 1},
			};
		}
		const morale = document.rows('MORALE');
		if (#sizeof(morale) != 7) { throw Error('SMAC morale table requires seven levels'); }
		const standard = []; const native = [];
		for (row of morale) {
			const normal_name = field(row, 0); const native_name = field(row, 1);
			if (normal_name == '' || native_name == '') { throw Error('Missing SMAC morale name'); }
			standard :+ {name: normal_name}; native :+ {name: native_name};
		}
		return {definitions: definitions, standard_morale: standard, native_morale: native};
	},
	materialize: (um, rules) => {
		const result = [];
		for (entry of rules.definitions) {
			const row = #clone(entry);
			row.rows = um.get_prototype_base_cost(entry.chassis_cost, 0, false, entry.combat.offense,
				entry.weapon_mode, entry.weapon_cost, entry.armor_cost, entry.combat.reactor);
			result :+ row;
		}
		return result;
	},
};
