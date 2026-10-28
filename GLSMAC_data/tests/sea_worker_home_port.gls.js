// Application SeaFormer production, receiving codec, and port/home acceptance.
// No original naval construction, territory, artwork or route policy claimed.
const behavior = #include('./_behavior');
const movement = #include('../default/game/event/move_unit');
const recipe = #include('../default/game/unit_rules');
const sea_rules = () => {
 const document = test.parse_smac_text(#include('./_startup_unit_rules_fixture').source,'rules');
 const chassis = document.rows('CHASSIS');
 // Declared installed-equivalent Foil components enter the shipped parser and
 // calculator. The disabled predefined UNITS template is never enabled.
 chassis :+ ['Speeder','M1','M1','M1','M1','M1','M1','M1','2','0','0','0','2','1','None'];
 chassis :+ ['Hovertank','M1','M1','M1','M1','M1','M1','M1','3','0','0','0','3','1','None'];
 chassis :+ ['Foil','M1','M1','M1','M1','M1','M1','M1','4','1','0','0','4','1','None'];
 return recipe.parse({rows:(block) => { return block == 'CHASSIS' ? chassis : document.rows(block); }});
};
const define_sea = (f) => {
 const rules = sea_rules(); const naval = recipe.materialize_sea_former(f.game.get_um(),rules);
 const definition_rules = {definitions:[],sea_former:rules.sea_former,standard_morale:rules.standard_morale,native_morale:rules.native_morale};
 #include('../default/units/defs').define({event:(name,data) => {
  if (name == 'define_unit' && data.id == 'SeaFormers') {
   const handler = #include('../default/game/event/define_unit'); const event = {caller:0}; event.game = f.game; event.data = data;
   const error = handler.validate(event); if (#is_defined(error)) { throw Error(error); }
   f.with_write(() => { handler.apply(event); });
  }
 }},definition_rules);
 f.with_write(() => { f.owner.add_production_choice('SEA_FORMERS',{type:'unit',id:'SeaFormers',cost:naval.rows * 10,cost_rows:naval.rows,population_cost:0}); });
 return naval;
};
behavior.scenario('a genuinely produced SeaFormer origin survives an independent receiving native unit codec',() => {
 const f = test.founding_fixture(); f.add_worker(0); f.configure('flat_arid_world');
 // The founding fixture provides SYNTHETIC morale; the existing production
 // fixture defines this minimal source-capable worker in its native manager.
 f.with_write(() => {
  f.game.get_um().define_unit('SeaFormers',{name:'Foil Formers',morale:'SYNTHETIC',type:'static',movement_type:'water',movement_per_turn:4,can_terraform:true,
   combat:{kind:'civilian',offense:0,defense:1,reactor:1},render:{type:'sprite',file:'synthetic.pcx',x:0,y:0,w:1,h:1,cx:0,cy:0}});
  f.owner.add_production_choice('SEA_FORMERS',{type:'unit',id:'SeaFormers',cost:40,cost_rows:4,population_cost:0});
 }); f.configure('sea_worker_coast');
 let announced_home = 0; f.game.get_um().on('unit_spawn',(e) => { announced_home = e.unit.get_terraform_home(); });
 f.with_write(() => { f.base.select_production('SEA_FORMERS'); }); const id = f.inspect().next_unit_id;
 f.set_turn(2); f.with_write(() => { f.base.process_production(2,43); });
 const ship = f.game.get_um().get_unit(id); const before = f.snapshot(); const codec = f.unit_order_codec_probe(id);
 test.assert(ship.is_water && ship.get_def().can_terraform && ship.get_terraform_home() == f.base.id && announced_home == f.base.id);
 test.assert(codec.roundtrip && codec.receiving_owner && codec.source_unchanged && codec.receiver_unchanged && f.snapshot() == before,
  'Full produced unit serialization, including persisted home, round-trips in an independent receiving world');
});
behavior.scenario('seven-owner normal native world produces a SeaFormer then enters exits rejects ports and returns to persisted production home',() => {
 const f = #include('./_normal_worker_route_fixture')(); const game = f.game; const tm = game.get_tm();
 const naval = define_sea(f); let row = 0;
 for (let y = 10; y < 70; y += 2) {
  let clear = true;
  for (let dy = (0 - 4); dy <= 4; dy++) {
   for (let x = 6 + (y + dy) % 2; x <= 18; x += 2) {
    const tile = tm.get_tile(x,y+dy); if (tile.get_base() != null || #sizeof(tile.get_units()) > 0) { clear = false; }
   }
  }
  if (clear && row == 0) { row = y; }
 }
 test.assert(row > 0); let home = null; let near = null; let foreign = null;
 const players = game.get_players(); const other = players[1];
 f.with_write(() => {
  const patches = [];
  for (x of [10,12]) {
   const flags = tm.get_terraforming(x,row); flags.farm = true; flags.solar = true;
   patches :+ {x:x,y:row,canonical:{elevation:(0-500),is_water:true},terraforming:flags};
  }
  tm.apply_terrain(patches,[]);
  home = game.get_bm().spawn_base(f.owner,tm.get_tile(14,row),{facilities:[]});
  near = game.get_bm().spawn_base(f.owner,tm.get_tile(8,row),{facilities:[]});
  foreign = game.get_bm().spawn_base(other,tm.get_tile(12,row+2),{facilities:[]});
 }); f.process_events();
 // A newly authored native city starts empty. Give the producer its real
 // initial citizen through the shipped allocation event before the baseline;
 // the native nonempty-population production requirement stays unchanged.
 const initial_pop = {caller:0,data:{automatic_growth:true}}; initial_pop.game = game; initial_pop.data.base = home;
 const add_pop = #include('../default/game/event/add_base_pop');
 test.assert(!#is_defined(add_pop.validate(initial_pop)));
 f.with_write(() => { add_pop.apply(initial_pop); });
 test.assert(#sizeof(home.get_pops()) == 1);
 let announced_home = 0; game.get_um().on('unit_spawn',(e) => { if (e.unit.get_def().id == 'SeaFormers') { announced_home = e.unit.get_terraform_home(); } });
 // The new city's zero-credit project is an explicit initial input. Use the
 // native restore API before the baseline so this one real production tick is
 // legal in the current turn, without editing a turn or a resource balance.
 f.with_write(() => { home.restore_production({choice_id:'SEA_FORMERS',minerals:0,last_processed_turn:game.get_turn()-1},''); });
 const ids = f.audit_inspect(); let produced = null;
 f.with_write(() => { produced = home.process_production(game.get_turn(),naval.rows * 10 + 3); }); f.process_events();
 const population = #sizeof(home.get_pops()); const actual_project = home.get_production();
 #print('SEA_PRODUCTION_DIAGNOSTIC|' + #json_text_exact({population:population,expected_unit_id:ids.next_unit_id,rows:naval.rows,project:actual_project,result:produced,inventory:f.audit_inspect()}));
 const ship_id = ids.next_unit_id; let ship = game.get_um().get_unit(ship_id);
 test.assert(ship.get_def().id == 'SeaFormers' && ship.is_water && ship.get_def().can_terraform && ship.movement == 4.0);
 test.assert(ship.get_tile() == tm.get_tile(12,row) && ship.get_terraform_home() == home.id && announced_home == home.id);
 test.assert(home.get_production().minerals == 3 && #typeof(produced.unit_receipt) == 'Int');
 f.checkpoint('sea-produced'); const terrain = f.map_view();
 const make_move = (x,y) => {
  const event = {caller:f.owner.id + 0}; event.game = game; event.data = {}; event.data.unit = game.get_um().get_unit(ship_id); event.data.tile = tm.get_tile(x,y); return event;
 };
 const apply_move = (event) => {
  const error = movement.validate(event); if (#is_defined(error)) { throw Error(error); }
  f.with_write(() => { event.resolved = movement.resolve(event); event.applied = movement.apply(event); });
  test.assert(event.resolved.is_movement_successful && game.get_um().get_unit(ship_id).get_tile().is_locked());
  f.finish_unit_move(ship_id); return event;
 };
 const unchanged = f.audit_snapshot(); const quote_event = make_move(14,row); const quote = movement.observe_cost(quote_event);
 test.assert(!#is_defined(movement.validate(quote_event)) && quote.total_cost == 1.0 && f.audit_snapshot() == unchanged,'Owned port quote is pure and finite');
 for (target of [[12,row-2],[12,row+2]]) {
  const event = make_move(target[0],target[1]); test.assert(#is_defined(movement.validate(event)) && f.audit_snapshot() == unchanged,'Inland and foreign port entry reject before mutation');
 }
 const before_mp = game.get_um().get_unit(ship_id).movement + 0.0;
 const entry = apply_move(quote_event); ship = game.get_um().get_unit(ship_id);
 test.assert(ship.get_tile() == home.get_tile() && ship.movement == before_mp - quote.total_cost);
 f.with_write(() => { movement.rollback(entry); }); f.finish_unit_move(ship_id);
 test.assert(f.audit_snapshot() == unchanged,'Real completed naval port movement undo restores full native world state');
 const unrelated = f.unrelated(ship_id);
 apply_move(make_move(14,row)); apply_move(make_move(12,row)); apply_move(make_move(10,row));
 ship = game.get_um().get_unit(ship_id);
 test.assert(ship.get_terraform_home() == home.id && tm.get_distance(ship.get_tile(),near.get_tile()) < tm.get_distance(ship.get_tile(),home.get_tile()),'Produced origin persists even after a nearer owned port exists');
 test.assert(f.unrelated(ship_id) == unrelated,'Same-turn naval movement changes no unrelated player or entity');
 f.checkpoint('sea-away'); const started = f.begin(ship_id,'auto_home_base'); const plan = game.get_um().get_unit(ship_id).get_automation();
 test.assert(plan.origin_x == 14 && plan.origin_y == row && plan.phase == 0 && game.get_um().get_unit(ship_id).get_terraform_home() == home.id);
 let turns = 0; let visited_home = false; let total_moves = 0;
 while (game.get_um().get_unit(ship_id).get_automation().command != '') {
  const before = f.unrelated(ship_id); const records = f.drain(ship_id,8); total_moves += #sizeof(records);
  for (record of records) { if (record.x == 14 && record.y == row) { visited_home = true; } }
  test.assert(f.unrelated(ship_id) == before); f.checkpoint('sea-home-settled');
  if (game.get_um().get_unit(ship_id).get_automation().command != '') { test.assert(turns < 3); f.advance(); turns++; f.checkpoint('sea-home-next-turn'); }
 }
 ship = game.get_um().get_unit(ship_id);
 test.assert(visited_home && total_moves >= 2 && ship.get_tile() == home.get_tile() && ship.get_terraform_home() == home.id);
 test.assert(!game.has_pending_actions(f.owner.id) && !ship.get_tile().is_locked() && f.map_view() == terrain);
 #print('NORMAL_ROUTE_RESULT|' + #json_text_exact({sea_produced:true,home:home.id + 0,nearer:near.id + 0,home_moves:total_moves,turns:turns,remaining_mp:ship.movement + 0.0}));
});
