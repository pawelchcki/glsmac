// Declared source rate1, terrain and actor inputs only. Production validators,
// work bookkeeping, events and native effect transactions supply all outcomes.
return (action,water) => {
	const f = #include('./_former_work_fixture')('arid');
	f.game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
	const document = test.parse_smac_text(#include('./_terraform_action_source'),'rules'); const rows = document.rows('TERRAIN');
	for (row of rows) { row[4] = '1'; }
	f.game.set('terraforming_rules',#include('../default/game/terraforming_rules').parse({rows:(block) => { return rows; }}));
	f.with_write(() => {
		if (water) {
			f.game.um.despawn_unit(f.former.id);
			f.game.get_tm().apply_terrain([{x:2,y:2,canonical:{elevation:(0-500),is_water:true}}],[]);
			f.game.um.define_unit('AUTHORED_SEA_WORKER',{name:'Authored sea worker',morale:'STANDARD',type:'static',movement_type:'water',movement_per_turn:4,can_terraform:true,
				combat:{kind:'civilian',offense:0,defense:1,reactor:1},render:{type:'sprite',file:'synthetic.pcx',x:0,y:0,w:1,h:1,cx:0,cy:0}});
			const actor = {def:'AUTHORED_SEA_WORKER',health:1.0,morale:2}; actor.owner = f.owner; actor.tile = f.game.tm.get_tile(2,2); f.former = f.game.um.spawn_unit(actor);
		}
		const state = f.game.get_tm().get_terrain_state(2,2); const patch = {x:2,y:2};
		if (action == 'soil_enricher') { state.terraforming.farm = true; patch.terraforming = state.terraforming; }
		if (action == 'mag_tube') { state.terraforming.road = true; patch.terraforming = state.terraforming; }
		if (action == 'remove_fungus') { state.features.xenofungus = true; patch.features = state.features; }
		if (action == 'level') { patch.rockiness = 3; }
		if (action == 'aquifer') { f.game.get_tm().apply_terrain([{x:0,y:2,canonical:{elevation:(0-500),is_water:true}}],[]); }
		if (action == 'soil_enricher' || action == 'mag_tube' || action == 'remove_fungus' || action == 'level') { f.game.get_tm().apply_terrain([patch],[]); }
	});
	return f;
};
