// Declared input world, not an expected-output oracle. All seven owners have
// nonempty native cities and units. The human Scout prevents automatic turn end.
return (game) => {
 // This controlled world bypasses the normal opening placement. Declare a
 // real source-backed worker project for each city, as world/default does;
 // the strict economy observer deliberately rejects empty project identity.
 let project = null;
 for (rule of game.get('starting_unit_rules')) {
  if (rule.weapon_mode == 9 && rule.prerequisite != 'Disable' && (!#is_defined(rule.movement_type) || rule.movement_type == 'land')) { if (project != null) { throw Error('Ambiguous source worker project'); } project = rule; }
 }
 if (project == null) { throw Error('Missing installed worker production rule'); }
 game.get_bm().on('base_spawn',(e) => { if (e.base.get_size() == 0) { e.base.create_pop({type:'DOCTOR'}); } });
 let index = 0;
 for (player of game.get_players()) {
  const tile = game.get_tm().get_tile(index * 2,2);
  const funding = game.get('energy_rules').starting_credits + player.get_faction().economy_bonuses.starting_energy;
  game.event('initialize_energy',{player_id:player.id + 0,credits:funding});
  game.event('add_production_choice',{player:player,id:project.choice,
   data:{type:'unit',id:project.id,cost:project.rows * 10,cost_rows:project.rows,population_cost:project.population}});
  game.event('spawn_base',{owner:player,tile:tile,facilities:['HEADQUARTERS'],production_choice:project.choice});
  game.event('spawn_unit',{type:'ScoutPatrol',owner:player,tile:tile,morale:2,health:1.0}); index++;
 }
 if (index != 7) { throw Error('Terraform controls require seven actual participants'); }
 const water_actor = __WATER_ACTOR__;
 let actor_id = 'Formers';
 if (water_actor) {
  const recipe = game.get('sea_former_rule');
  if (!#is_defined(recipe) || recipe == null) { throw Error('Native/source Sea Former recipe is unavailable'); }
  actor_id = recipe.id + '';
 }
 game.event('spawn_unit',{type:actor_id,owner:game.get_player(),tile:game.get_tm().get_tile(8,8),morale:2,health:1.0});
};
