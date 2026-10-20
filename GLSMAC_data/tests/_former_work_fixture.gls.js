// Synthetic installed inputs and native lifecycle only; no work policy here.
const unit_source = #include('./_startup_unit_rules_fixture');
const definitions = #include('../default/units/defs');
const turns = #include('../default/units/turns');
const terrain_rules = #include('../default/game/terraforming_rules');
const work = #include('../default/game/terraforming');
return (profile) => {
	const f = test.founding_fixture(); f.enable_economy(); f.configure('arid');
	f.with_write(() => {
		f.game.um.despawn_unit(f.unit_id);
		f.game.um.undefine_unit('ColonyPod'); f.game.um.undefine_unit('Scout');
	});
	const define = {event: (name, data) => {
		const handler = #include('../default/game/event/' + name);
		const e = {caller: 0}; e.game = f.game; e.data = data;
		if (#is_defined(handler.validate(e))) { throw Error('Invalid synthetic unit declaration'); }
		f.with_write(() => { handler.apply(e); });
	}};
	definitions.define(define, unit_source.parse());
	let source = '#TERRAIN\nFarm,None,Kelp Farm,None,4,Cultivate $STR0,f,F\n' +
		'Soil,None,Soil,Disable,8,Construct $STR0,f,F\nMine,None,Platform,None,8,Construct $STR0,M,M\n' +
		'Solar,None,Harness,None,4,Construct $STR0,S,S\nForest,None,...,Disable,4,Plant $STR0,F,Shift+F\n' +
		'Road,None,Road,Disable,1,Build $STR0,R,R\n#END\n';
	const document = test.parse_smac_text(source, 'rules'); const rows = document.rows('TERRAIN');
	if (profile == 'edited') {
		for (entry of [[0, '2'], [2, '3'], [4, '2'], [5, '3']]) { const row = rows[entry[0]]; row[4] = entry[1]; }
	}
	f.game.set('terraforming_rules', terrain_rules.parse({rows: (block) => { return rows; }}));
	turns.configure(f.game); work.configure(f.game);
	f.with_write(() => {
		const data = {def: 'Formers', health: 1.0, morale: 2}; data.owner = f.owner; data.tile = f.game.tm.get_tile(2, 2);
		f.former = f.game.um.spawn_unit(data);
	});
	f.command = (action) => {
		const handler = #include('../default/game/event/' + (action == 'cancel_work' ? 'unit_activate' : 'unit_terraform'));
		// The original work contract explicitly accepts replacement prompts.
		const e = {caller: f.owner.id, data: {unit_id: f.former.id, action: action, replace_existing: true}}; e.game = f.game;
		const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
		f.with_write(() => { e.applied = handler.apply(e); });
		return e;
	};
	f.advance = () => {
		f.with_write(() => {
			for (player of f.game.get_players()) { if (!f.game.is_turn_complete(player.id)) { f.game.complete_turn(player.id); } }
			const handler = #include('../default/game/event/advance_turn');
			const e = {caller: 0, data: {turn_id: f.game.get_turn() + 1}}; e.game = f.game;
			const error = handler.validate(e); if (#is_defined(error)) { throw Error(error); }
			handler.apply(e);
		});
	};
	return f;
};
