// Declared source identities and roster choices enter the production initializer.
// No participant identity is repaired or assigned after native initialization.
return (input) => {
	const f = test.world_startup_fixture(40, 80);
	const sources = #include('./_startup_faction_sources_fixture')({});
	const catalog = {};
	#include('../default/factions').configure({
		add: (id, data) => {
			if (#is_defined(input.identities) && #is_defined(input.identities[id])) { data.identity = input.identities[id]; }
			f.fm.add(id, data); catalog[id] = #clone(data.identity);
		},
		import_colors: (name) => { return f.colors; },
		import_base_names: (name) => { return {land: ['Synthetic City'], water: ['Synthetic Port']}; },
	}, sources.glsmac);
	f.sources = catalog;
	const human = #is_defined(input.human) ? #clone(input.human) : #clone(catalog.GAIANS);
	const roster = #is_defined(input.roster) ? input.roster : ['GAIANS', 'GAIANS', 'UNIVERSITY', 'MORGANITES', 'SPARTANS', 'BELIEVERS', 'PEACEKEEPERS'];
	f.initialize_roster('GAIANS', {factions: roster, human_slot: 0, random_human: false}, human);
	f.assert_catalog = () => {
		for (faction of f.fm.list()) { test.assert(faction.identity == catalog[faction.id], 'Participant allocation must preserve every source template'); }
	};
	return f;
};
