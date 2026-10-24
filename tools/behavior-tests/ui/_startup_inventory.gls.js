// Production startup callback and shipped unit definitions over actual native
// managers. Terrain, one selected owner, artwork and frontend delivery are
// controlled boundaries. Observe native units/projects after emitted events.
const definitions = #include('../default/units/defs');
const start = #include('../default/game/world/default');
const unit_rules = #include('../default/game/unit_rules');
const factions = #include('../default/factions');
const catalog = factions.source_catalog();
let completed = 0;
for (input of faction_inputs) {
	const f = test.founding_fixture();
	f.enable_economy();
	const sources = #include('./_startup_faction_sources_fixture')(input);
	const configured = {};
	factions.configure({add: (id, data) => { configured[id] = data; },
		import_colors: (name) => { return {}; }, import_base_names: (name) => { return {}; }}, sources.glsmac);
	const selected = (input.preset == 'base' ? 0 : 7) + input.slot;
	const selected_id = catalog[selected].id;
	f.apply_faction_starting_technologies(configured[selected_id].starting_technologies);
	f.apply_faction_ratings(configured[selected_id].social_ratings);
	const rules = #include('./_startup_unit_rules_fixture').parse();
	f.game.set('starting_unit_rules', unit_rules.materialize(f.game.um, rules));
	f.with_write(() => {
		f.game.um.despawn_unit(f.unit_id);
		f.game.um.undefine_unit('ColonyPod');
		f.game.um.undefine_unit('Scout');
		f.game.bm.despawn_base(f.base);
		for (id of ['HEADQUARTERS', 'RECYCLING_TANKS', 'STOCKPILE_ENERGY']) { f.owner.remove_production_choice(id); }
	});
	const game = {};
	// An explicit player boundary avoids storing native wrapper references in
	// a GSE-created array. Event payloads resolve it back to the actual owner.
	const owner = { id: f.owner.id, is_master: false, get_faction: () => { return f.owner.get_faction(); } };
	const players = []; players :+ owner;
	game.get_players = () => { return players; };
	game.get_tm = () => { return f.game.tm; };
	game.get = (key) => { return f.game.get(key); };
	game.random = { get_int: (low, high) => { return low; } };
	game.event = (name, data) => {
		if (#is_defined(data.player)) { data.player = f.owner; }
		if (#is_defined(data.owner)) { data.owner = f.owner; }
		const handler = #include('../default/game/event/' + name);
		const e = { caller: 0 }; e.game = f.game; e.data = data;
		const error = handler.validate(e);
		if (#is_defined(error)) { throw Error('Startup event rejected: ' + error); }
		f.with_write(() => { handler.apply(e); });
	};
	definitions.define(game, rules);
	start(game);
	#print('INVENTORY_CASE|' + input.id);
	for (id of f.inspect().unit_ids) {
		const unit = f.game.um.get_unit(id); const def = unit.get_def();
		test.assert(unit.owner == f.owner.id, 'Observed startup unit belongs to selected owner');
		#print('INVENTORY_ACTIVE|' + #uppercase(def.name));
	}
	for (base of f.game.bm.get_bases()) {
		const production = base.get_production();
		if (production.choice_id != '') {
			let found = false;
			for (choice of f.owner.get_production_choices()) {
				if (choice.id == production.choice_id) {
					found = true;
					if (choice.type == 'unit') { #print('INVENTORY_PRODUCTION|' + #uppercase(choice.name)); }
				}
			}
			test.assert(found, 'Queued native project must resolve to an actual production choice');
		}
	}
	#print('INVENTORY_END'); completed++;
}
#print('INVENTORY_DONE|' + #to_string(completed));
