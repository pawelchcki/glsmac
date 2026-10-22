// Native world/graphics boundary only. Order effects and turn restoration run
// shipped handlers; selection runs the same C++ controller as the real frontend.
const source = #include('./_startup_unit_rules_fixture');
const definitions = #include('../default/units/defs');
const turns = #include('../default/units/turns');
return (profile, ids, initial_base_name, map_size, land_names) => {
	let f = null;
	if (#is_defined(land_names)) { f = test.selection_fixture(initial_base_name, map_size, land_names); }
	else if (#is_defined(map_size)) { f = test.selection_fixture(initial_base_name, map_size); }
	else if (#is_defined(initial_base_name)) { f = test.selection_fixture(initial_base_name); }
	else { f = test.selection_fixture(); }
	f.enable_economy();
	f.with_write(() => {
		// Existing constructor definitions are replaced with the actual shipped
		// basic land declarations on synthetic installed component inputs.
		for (id of f.inspect().unit_ids) { f.game.um.despawn_unit(id); }
		f.game.um.undefine_unit('ColonyPod'); f.game.um.undefine_unit('Scout');
	});
	definitions.define({event: (name, data) => {
		const handler = #include('../default/game/event/' + name);
		const e = {caller: 0}; e.game = f.game; e.data = data;
		const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
		f.with_write(() => { handler.apply(e); });
	}}, source.parse());
	turns.configure(f.game); f.units = [];
	let index = 0;
	const spread = profile == 'spread' || profile == 'spread-distant';
	for (spec of [['ScoutPatrol', 2, 2], ['Formers', spread ? 3 : 2, spread ? 3 : 2], ['ColonyPod', profile == 'spread-distant' ? 0 : (spread ? 1 : 2), profile == 'spread-distant' ? 4 : (spread ? 3 : 2)]]) {
		f.with_write(() => {
			const data = {def: spec[0], health: 1.0, morale: 2}; if (#is_defined(ids)) { data.id = ids[index]; }
			data.owner = f.owner; data.tile = f.game.tm.get_tile(spec[1], spec[2]);
			f.units :+ f.game.um.spawn_unit(data);
		}); index++;
	}
	f.selection_focus(f.units[0].id);
	f.action = (action) => {
		if (action == 'wait' || action == 'tab') { f.selection_next(true); return; }
		if (action == 'advance') {
			f.with_write(() => {
				for (player of f.game.get_players()) { if (!f.game.is_turn_complete(player.id)) { f.game.complete_turn(player.id); } }
				const handler = #include('../default/game/event/advance_turn');
				const e = {caller: 0, data: {turn_id: f.game.get_turn() + 1}}; e.game = f.game;
				const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
				handler.apply(e);
			});
			f.selection_reset(); f.selection_next(false); return;
		}
		const id = f.selected_id(); if (id == null) { return; }
		const handler = #include('../default/game/event/' + (action == 'hold' ? 'unit_hold' : 'unit_skip_turn'));
		const e = {caller: f.owner.id, data: {unit_id: id}}; e.game = f.game;
		const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
		f.with_write(() => { handler.apply(e); });
		f.selection_next(false);
	};
	return f;
};
