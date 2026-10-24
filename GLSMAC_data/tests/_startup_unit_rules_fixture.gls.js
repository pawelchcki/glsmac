// Minimal equivalent component inputs; no recorded output values are stored.
const source_for = (former_rows) => { return '#UNITS\n3\n' +
	'Colony Pod,Infantry,Module,Scout,8,0,0,None,-1,00000000000000000000000000\n' +
	'Formers,Infantry,Terraformer,Scout,9,' + #to_string(former_rows) + ',0,Ecology,-1,00000000000000000000000000\n' +
	'Scout Patrol,Infantry,Gun,Scout,3,0,0,None,-1,00000000000000000000000000\n' +
	'#CHASSIS\nInfantry,M1,Squad,M1,Sentinels,M2,Garrison,M1,1,0,0,0,1,1,None\n' +
	'#WEAPONS\nHand Weapons,Gun,1,0,1,-1,None\nColony Module,Module,0,8,10,-1,None\nTerraforming Unit,Terraformer,0,9,6,-1,Ecology\n' +
	'#DEFENSES\nNo Armor,Scout,1,0,1,None\n#REACTORS\nFission Plant,Fission,1,None\n' +
	'#MORALE\nVery Green,Hatchling\nGreen,Larval Mass\nDisciplined,Pre-Boil\nHardened,Boil\nVeteran,Mature Boil\nCommando,Great Boil\nElite,Demon Boil\n#END\n'; };
const source = source_for(0);
return {
	source: source,
	parse: (former_rows) => {
		const input = #is_defined(former_rows) ? former_rows : 0;
		return #include('../default/game/unit_rules').parse(test.parse_smac_text(source_for(input), 'rules'));
	},
};
