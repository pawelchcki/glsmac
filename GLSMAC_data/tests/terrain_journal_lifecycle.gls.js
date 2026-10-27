// Candidate receipt lifetime at actual native event acceptance boundaries.
const behavior = #include('./_behavior');
const shipped = #include('../default/game/event/unit_terraform');
const fixture = (rate) => {
 const f = #include('./_former_work_fixture')('arid');
 // EnableEconomy deliberately selects native player0, while the inherited
 // manual-work fixture's actor belongs to player1. Author this event actor
 // for the actual controlled owner; never bypass the shipped owner guard.
 const actor_tile = f.former.get_tile(); const old_id = f.former.id + 0;
 f.owner = f.game.get_player();
 f.with_write(() => {
  f.game.get_um().despawn_unit(old_id);
  const data = {def:'Formers',health:1.0,morale:2}; data.owner = f.owner; data.tile = actor_tile;
  f.former = f.game.get_um().spawn_unit(data);
 });
 f.game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
 const rows = test.parse_smac_text(#include('./_terraform_action_source'),'rules').rows('TERRAIN');
 for (row of rows) { row[4] = #to_string(rate); }
 f.game.set('terraforming_rules',#include('../default/game/terraforming_rules').parse({rows:(name) => { return rows; }}));
 f.receipt = null; f.results = [];
 f.game.register_event('unit_terraform',{validate:(e) => { const error = shipped.validate(e); if (#is_defined(error)) { #print('JOURNAL_VALIDATE|' + error); } return error; },apply:(e) => { f.receipt = shipped.apply(e); return f.receipt; },rollback:shipped.rollback});
 f.game.on('event_result',(e) => { f.results :+ {name:e.name + '',success:e.success == true}; });
 f.data = {unit_id:f.former.id + 0,action:'farm',replace_existing:true};
 return f;
};
const rejected = (callback) => {
 let caught = false; try { callback(); } catch { : (error) => { caught = true; } } return caught;
};
const patch = (f,x,y,road) => {
 const flags = f.game.get_tm().get_terraforming(x,y); flags.road = road;
 return f.game.get_tm().apply_terrain([{x:x,y:y,terraforming:flags}],[]);
};
behavior.scenario('accepted real terraforming commands retire only their no-longer-reversible native journal',() => {
 const f = fixture(1); f.game.event('unit_terraform',f.data); f.process_events();
 #print('JOURNAL_STATE|' + #json_text_exact({flags:f.game.get_tm().get_terraforming(2,2),results:f.results,owner:f.owner.id + 0,controlled:f.game.get_player().id + 0,worker_owner:f.former.owner + 0,order:f.former.get_order(),mp:f.former.movement + 0.0,work:f.former.get_terraforming(),rule:f.game.get('terraforming_rules').farm}));
 test.assert(f.game.get_tm().get_terraforming(2,2).farm && f.results == [{name:'unit_terraform',success:true}]);
 // This assertion executes on the old runtime before the new count seam is
 // needed: the old accepted command incorrectly leaves this receipt usable.
 test.assert(f.receipt.terrain_receipt > 0 && rejected(() => { f.game.get_tm().validate_terrain_rollback(f.receipt.terrain_receipt); }));
 test.assert(f.terrain_journal_count() == 0);
});
behavior.scenario('repeated accepted native jobs retain a flat journal while an unrelated direct receipt remains reversible',() => {
 const f = fixture(1); let direct = 0;
 f.with_write(() => { direct = patch(f,0,2,true); }); test.assert(f.terrain_journal_count() == 1);
 for (let index = 0; index < 24; index++) {
  f.with_write(() => { const worker = f.game.get_um().get_unit(f.former.id); worker.movement = 1.0; });
  f.data.action = index % 2 == 0 ? 'farm' : 'forest';
  f.game.event('unit_terraform',f.data); f.process_events();
  const flags = f.game.get_tm().get_terraforming(2,2);
  test.assert(flags[f.data.action] && f.terrain_journal_count() == 1,'Accepted history cannot accumulate native undo payloads');
  f.game.get_tm().validate_terrain_rollback(direct);
 }
 test.assert(#sizeof(f.results) == 24);
 for (result of f.results) { test.assert(result.success); }
 f.with_write(() => { f.game.get_tm().rollback_terrain(direct); }); test.assert(f.terrain_journal_count() == 0);
});
behavior.scenario('a replicated accepted server event releases its native terrain journal on the client',() => {
 const f = fixture(1); f.server_event('unit_terraform',f.data); f.process_events();
 test.assert(f.game.get_tm().get_terraforming(2,2).farm && f.terrain_journal_count() == 0 && #sizeof(f.results) == 0);
});
for (optimistic of [false,true]) {
 for (accepted of [false,true]) {
  behavior.scenario('native response retains pending undo and then finalizes exactly once optimistic=' + #to_string(optimistic) + ' accepted=' + #to_string(accepted),() => {
   const f = fixture(1); const before = f.snapshot(); const terrain = f.terrain_snapshot();
   const id = f.stage_response_event('unit_terraform',f.data,optimistic);
   test.assert(f.terrain_journal_count() == (optimistic ? 1 : 0));
   if (optimistic) { f.game.get_tm().validate_terrain_rollback(f.receipt.terrain_receipt); }
   f.resolve_response_event(id,accepted);
   test.assert(f.terrain_journal_count() == 0 && f.results == [{name:'unit_terraform',success:accepted}]);
   if (accepted) { test.assert(f.game.get_tm().get_terraforming(2,2).farm); }
   else { test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain); }
   const completed = f.snapshot(); const tiles = f.terrain_snapshot();
   f.resolve_response_event(id,!accepted);
   test.assert(f.terrain_journal_count() == 0 && f.snapshot() == completed && f.terrain_snapshot() == tiles,'A stale response cannot revive retired authority');
  });
 }
}
behavior.scenario('inline completion belongs to the accepted parent native turn event',() => {
 const f = fixture(2); f.game.event('unit_terraform',f.data); f.process_events();
 test.assert(f.former.get_terraforming().active && f.terrain_journal_count() == 0);
 // The fixture owns slot1. This adapter supplies host authority for a parent
 // event while actual Game.AdvanceTurn and shipped ready-work listeners run.
 f.game.register_event('journal_advance',{validate:(e) => {},apply:(e) => {
  for (player of f.game.get_players()) { if (!f.game.is_turn_complete(player.id)) { f.game.complete_turn(player.id); } }
  f.game.advance_turn(f.game.get_turn()+1);
  test.assert(f.game.get_tm().get_terraforming(2,2).farm && f.terrain_journal_count() == 1,'Journal survives until the whole parent apply succeeds');
 },rollback:(e) => {}});
 f.game.event('journal_advance',{}); f.process_events();
 test.assert(f.game.get_tm().get_terraforming(2,2).farm && f.terrain_journal_count() == 0);
 test.assert(f.results == [{name:'unit_terraform',success:true},{name:'journal_advance',success:true}]);
});
behavior.scenario('failed compound apply retains both receipts through true LIFO cleanup and restores native terrain exactly',() => {
 const f = fixture(1); const before = f.snapshot(); const terrain = f.terrain_snapshot();
 f.game.register_event('journal_failure',{validate:(e) => {},apply:(e) => {
  const first = patch(f,0,2,true); const second = patch(f,2,0,true);
  test.assert(f.terrain_journal_count() == 2);
  let failed = false;
  try { f.game.get_tm().apply_terrain([{x:0,y:2,rockiness:99}],[]); }
  catch { : (error) => {
   failed = true; f.game.get_tm().validate_terrain_rollback(first); f.game.get_tm().validate_terrain_rollback(second);
   f.game.get_tm().rollback_terrain(second); f.game.get_tm().rollback_terrain(first);
  } }
  test.assert(failed && f.terrain_journal_count() == 0 && f.terrain_snapshot() == terrain);
  throw ApplyError('Controlled native invalid-patch failure after complete receipt cleanup');
 },rollback:(e) => {}});
 f.game.event('journal_failure',{}); f.process_events();
 test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain && f.terrain_journal_count() == 0);
 test.assert(f.results == [{name:'journal_failure',success:false}]);
});
behavior.scenario('standalone raw native receipts preserve same-tile LIFO undo and reject stale and reused tokens',() => {
 const f = fixture(1); const terrain = f.terrain_snapshot(); let first = 0; let second = 0;
 f.with_write(() => { first = patch(f,0,2,true); second = patch(f,0,2,false); });
 test.assert(f.terrain_journal_count() == 2);
 test.assert(rejected(() => { f.with_write(() => { f.game.get_tm().rollback_terrain(first); }); }) && f.terrain_journal_count() == 2);
 f.with_write(() => { f.game.get_tm().rollback_terrain(second); f.game.get_tm().rollback_terrain(first); });
 test.assert(f.terrain_snapshot() == terrain && f.terrain_journal_count() == 0);
 for (token of [first,second]) { test.assert(rejected(() => { f.with_write(() => { f.game.get_tm().rollback_terrain(token); }); })); }
});
