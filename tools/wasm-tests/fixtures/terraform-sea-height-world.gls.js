// Declared candidate inputs only. No work/payment effect is applied here.
// This is NOT the restricted land-only initial_production opening API.
return (game) => {
 let project = null;
 for (rule of game.get('starting_unit_rules')) {
  if (rule.weapon_mode == 9 && rule.prerequisite != 'Disable' && (!#is_defined(rule.movement_type) || rule.movement_type == 'land')) {
   if (project != null) { throw Error('Ambiguous source land worker project'); } project = rule;
  }
 }
 const sea = game.get('sea_former_rule');
 if (project == null || !#is_defined(sea) || sea == null) { throw Error('Installed land/Sea Former recipe is missing'); }
 if (sea.weapon_mode != 9 || sea.movement_type != 'water' || sea.application_recipe != 'foil-terraform-module-v1' || sea.source_components.chassis != 3 || sea.source_components.prototype != null) { throw Error('Unexpected installed Foil composition'); }
 const declared = {version:2,recipe:#clone(sea),resumed_choice:project.choice + '',port:{x:10,y:8},launch:{x:8,y:8},
  production_input:'existing native restore_production during queued startup at current turn1, before ordinary production; actual source sea price plus3; real turn event supplies current intake',
  stock_extra:3,restored:null};
 game.set('sea_browser_setup',declared);
 let home = null;
 game.get_bm().on('base_spawn',(e) => {
  const base = e.base;
  if (base.get_size() == 0) { base.create_pop({type:'DOCTOR'}); }
  if (base.get_owner().id == game.get_player().id) {
   if (home != null || base.get_tile().x != 10 || base.get_tile().y != 8) { throw Error('Ambiguous authored coastal producer'); }
   home = base;
   let choice = null;
   for (row of base.get_owner().get_production_choices()) { if (row.id == sea.choice) { if (choice != null) { throw Error('Duplicate Sea production choice'); } choice = row; } }
   if (choice == null || choice.type != 'unit' || choice.unit_id != sea.id || choice.population_cost != 0 || #typeof(choice.cost) != 'Int' || choice.cost <= 0) { throw Error('Native source Sea production choice unavailable'); }
   const cost = choice.cost; const stock = cost + 3;
   #print('TH_SEA_DECLARED|' + #json_text_exact({version:2,base_id:base.id + 0,owner:base.get_owner().id + 0,
    recipe:#clone(sea),choice_id:choice.id,population_cost:choice.population_cost,cost:cost,stock:stock,
    population:#sizeof(base.get_pops()),turn:game.get_turn() + 0}));
   // Explicit authored input, before ordinary production and live observation. No treasury,
   // technology, generated map, production cost or completion guard is changed.
   base.restore_production({choice_id:sea.choice,minerals:stock,last_processed_turn:0},'');
   const prefill = base.get_production();
   #print('TH_SEA_ACCOUNTING|' + #json_text_exact({version:2,base_id:base.id + 0,owner:base.get_owner().id + 0,
    choice_id:choice.id,observed_choice_cost:cost,requested_stock:stock,actual_prefill:prefill,
    source_recipe:#clone(sea),population_cost:choice.population_cost,population:#sizeof(base.get_pops()),turn:game.get_turn() + 0}));
   if (sea.rows != 5 || cost != 40 || stock != 43 || prefill.choice_id != sea.choice || prefill.minerals != 43 || prefill.last_processed_turn != 0) { throw Error('Native Sea accounting differs from the declared v2 profile'); }
   declared.restored = {choice_id:prefill.choice_id,cost:cost,minerals:prefill.minerals,last_processed_turn:prefill.last_processed_turn,population:#sizeof(base.get_pops())};
   game.set('sea_browser_setup',declared);
  }
 });
 let index = 0;
 for (player of game.get_players()) {
  const local = player.id == game.get_player().id;
  const tile = game.get_tm().get_tile(local ? 10 : index * 2,local ? 8 : 2);
  const funding = game.get('energy_rules').starting_credits + player.get_faction().economy_bonuses.starting_energy;
  game.event('initialize_energy',{player_id:player.id + 0,credits:funding});
  game.event('add_production_choice',{player:player,id:project.choice,data:{type:'unit',id:project.id,cost:project.rows * 10,cost_rows:project.rows,population_cost:project.population}});
  if (local) {
   game.event('add_production_choice',{player:player,id:sea.choice,data:{type:'unit',id:sea.id,cost:sea.rows * 10,cost_rows:sea.rows,population_cost:sea.population}});
   game.event('spawn_base',{owner:player,tile:tile,facilities:['HEADQUARTERS']});
  } else { game.event('spawn_base',{owner:player,tile:tile,facilities:['HEADQUARTERS'],production_choice:project.choice}); }
  game.event('spawn_unit',{type:'ScoutPatrol',owner:player,tile:tile,morale:2,health:1.0}); index++;
 }
 if (index != 7) { throw Error('Seven native participants are required'); }
 // create_world precedes Trigger(start): registering turn directly here
 // would run BEFORE the shipped bases start callback installs production.
 // Register this later start callback now; bases.gls already owns the earlier
 // start callback, so its ordinary turn production listener is installed first.
 game.on('start',() => {
  game.on('turn',() => {
   if (game.get_turn() == 1) {
    if (home == null || declared.restored == null) { throw Error('Authored Sea producer did not initialize'); }
    const states = [];
    for (base of game.get_bm().get_bases()) {
     const state = base.get_production();
     states :+ {base_id:base.id + 0,owner:base.get_owner().id + 0,x:base.get_tile().x + 0,y:base.get_tile().y + 0,
      population:#sizeof(base.get_pops()),production:state,intake:base.get_intake(),consumption:base.get_consumption(),
      eligible:state.choice_id != '' && state.last_processed_turn < game.get_turn()};
    }
    #print('TH_SEA_PRETURN|' + #json_text_exact({version:2,turn:game.get_turn() + 0,home_id:home.id + 0,bases:states}));
    game.event('set_base_production',{base:home,choice_id:project.choice});
   }
  });
 });
 // Read-only birth witness inside the actual native production publication.
 // No native field/custom setter/event is called under its mutation guard.
 game.get_um().on('unit_spawn',(e) => {
  const unit = e.unit;
  if (unit.get_def().id == sea.id) {
   if (home == null || unit.owner != game.get_player().id || unit.get_terraform_home() != home.id) { throw Error('Unexpected Sea production origin'); }
   const movement = unit.movement; const health = unit.health;
   #print('TH_SEA_BIRTH|' + #json_text_exact({unit_id:unit.id + 0,owner:unit.owner + 0,definition:unit.get_def().id,
    is_water:unit.is_water,can_terraform:unit.get_def().can_terraform,x:unit.get_tile().x + 0,y:unit.get_tile().y + 0,
    movement:movement,health:health,home_id:unit.get_terraform_home(),home_population:#sizeof(home.get_pops()),
    production:home.get_production(),turn:game.get_turn() + 0}));
  }
 });
};
