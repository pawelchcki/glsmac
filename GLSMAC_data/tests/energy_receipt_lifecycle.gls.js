// Actual native accepted-income undo lifetime; no original economy claim.
const behavior = #include('./_behavior');
const shipped = #include('../default/game/event/credit_energy_income');
const income = #include('../default/game/energy_income');
const fixture = () => {
 const f = test.natural_startup_fixture(16,16,'flat-arid'); const game = f.game;
 #include('./_natural_startup_mechanics')(f);
 game.on('configure',(e) => { game.get_tm().on('get_tile_resources',(tile) => { return {NUTRIENTS:2,MINERALS:1,ENERGY:7}; }); });
 f.initialize_single_player('GAIANS','Citizen'); f.start_world();
 test.assert(#sizeof(game.get_players()) == 7 && #sizeof(game.get_bm().get_bases()) == 7);
 f.receipt = null; f.results = [];
 game.register_event('energy_journal_income',{validate:shipped.validate,apply:(e) => { f.receipt = shipped.apply(e); return f.receipt; },rollback:shipped.rollback});
 game.on('event_result',(e) => { if (e.name == 'energy_journal_income') { f.results :+ {name:e.name + '',success:e.success == true}; } });
 f.with_write(() => { for (player of game.get_players()) { if (!game.is_turn_complete(player.id)) { game.complete_turn(player.id); } } });
 return f;
};
behavior.scenario('accepted genuine completed-turn income retires its native undo authority',() => {
 const f = fixture(); const game = f.game; const player = game.get_player(); const before = player.get_energy_state();
 const amount = income.income(game,player.id);
 test.assert(amount > 0 && before.last_income_turn < game.get_turn());
 game.event('energy_journal_income',{player_id:player.id + 0,turn_id:game.get_turn() + 0,income:amount,expected_balance:before.credits}); f.process_events();
 const after = player.get_energy_state();
 test.assert(f.results == [{name:'energy_journal_income',success:true}]);
 test.assert(after.credits == before.credits + amount && after.last_income_turn == game.get_turn());
 let usable = true; try { player.validate_energy_rollback(f.receipt.token); } catch { : (error) => { usable = false; } }
 #print('ENERGY_RECEIPT_PROOF|' + #json_text_exact({owner:player.id + 0,turn:game.get_turn() + 0,before:before,after:after,amount:amount,receipt:f.receipt.token + 0,accepted:true,receipt_usable_after_acceptance:usable}));
 // This old-API assertion proves a retained accepted record before any new
 // count seam is accessed; missing observation APIs cannot supply the red.
 test.assert(!usable,'An accepted income event no longer owns reversible treasury history');
 const counts = f.energy_journal_counts(); test.assert(#sizeof(counts) == 7);
 for (row of counts) { test.assert(row.retained == 0,'Accepted opening initialization and collection retain no undo history'); }
});
const rejected = (callback) => { let caught = false; try { callback(); } catch { : (error) => { caught = true; } } return caught; };
const count = (f,owner) => {
 for (row of f.energy_journal_counts()) { if (row.owner == owner) { return row.retained + 0; } }
 throw Error('Missing canonical energy owner');
};
const ledger = (f) => {
 const rows = [];
 for (player of f.game.get_players()) { rows :+ {owner:player.id + 0,state:player.get_energy_state(),revision:player.get_energy_revision()}; }
 return #json_text_exact(rows);
};
const small = () => {
 const f = test.founding_fixture(); f.enable_economy();
 // Explicit finite city resource inputs enter the real native Base getters
 // and shipped allocation calculator, not a substituted income result.
 f.game.get_bm().on('get_base_intake',(e) => { return {NUTRIENTS:2,MINERALS:1,ENERGY:14}; });
 f.game.get_bm().on('get_base_consumption',(e) => { return {NUTRIENTS:0,MINERALS:0,ENERGY:0}; });
 f.receipt = null; f.results = [];
 f.game.register_event('energy_journal_income',{validate:shipped.validate,apply:(e) => { f.receipt = shipped.apply(e); return f.receipt; },rollback:shipped.rollback});
 f.game.on('event_result',(e) => { if (e.name == 'energy_journal_income') { f.results :+ {success:e.success == true}; } });
 f.with_write(() => { for (player of f.game.get_players()) { if (!f.game.is_turn_complete(player.id)) { f.game.complete_turn(player.id); } } });
 f.data = {player_id:f.owner.id + 0,turn_id:f.game.get_turn() + 0,income:income.income(f.game,f.owner.id),expected_balance:f.owner.get_energy_state().credits};
 return f;
};
behavior.scenario('twelve genuine completed turns collect all seven incomes without retaining accepted history or opening receipts',() => {
 const f = fixture(); const game = f.game;
 for (let cycle = 0; cycle < 12; cycle++) {
  const planned = income.plan(game); test.assert(#sizeof(planned) == 7);
  for (row of planned) { game.event('credit_energy_income',row); }
  f.process_events();
  const counts = f.energy_journal_counts(); test.assert(#sizeof(counts) == 7);
  for (row of planned) {
   const player = income.resolve(game,row.player_id);
   test.assert(player.get_energy_state().credits == row.expected_balance + row.income && player.get_energy_state().last_income_turn == row.turn_id);
   test.assert(count(f,row.player_id) == 0,'Accepted initialization and income history stays flat for every canonical player');
  }
  if (cycle < 11) {
   f.with_write(() => { game.advance_turn(game.get_turn()+1); }); f.process_events();
   f.with_write(() => { for (player of game.get_players()) { if (!game.is_turn_complete(player.id)) { game.complete_turn(player.id); } } });
  }
 }
 #print('ENERGY_RECEIPT_HISTORY|' + #json_text_exact({completed_collections:12,players:7,counts:f.energy_journal_counts()}));
});
behavior.scenario('acceptance for one live owner preserves an unrelated direct native receipt',() => {
 const f = small(); const other = f.game.get_player(); const original = other.get_energy_state(); let raw = 0;
 f.with_write(() => { raw = other.change_energy(3,original.credits,f.game.get_turn()); });
 test.assert(other.id != f.owner.id && count(f,other.id) == 1);
 f.game.event('energy_journal_income',f.data); f.process_events();
 test.assert(f.results == [{success:true}] && count(f,f.owner.id) == 0 && count(f,other.id) == 1);
 other.validate_energy_rollback(raw); f.with_write(() => { other.rollback_energy(raw); });
 test.assert(other.get_energy_state() == original && count(f,other.id) == 0);
});
behavior.scenario('accepted replicated income retires its actual client-side energy receipt',() => {
 const f = small(); f.server_event('energy_journal_income',f.data); f.process_events();
 test.assert(f.owner.get_energy_state().credits == f.data.income && count(f,f.owner.id) == 0 && #sizeof(f.results) == 0);
});
for (optimistic of [false,true]) {
 for (accepted of [false,true]) {
  behavior.scenario('energy native response preserves pending undo then finalizes optimistic=' + #to_string(optimistic) + ' accepted=' + #to_string(accepted),() => {
   const f = small(); const before = ledger(f); const graph = f.snapshot();
   const id = f.stage_response_event('energy_journal_income',f.data,optimistic);
   test.assert(count(f,f.owner.id) == (optimistic ? 1 : 0));
   if (optimistic) { f.owner.validate_energy_rollback(f.receipt.token); }
   f.resolve_response_event(id,accepted);
   test.assert(count(f,f.owner.id) == 0 && f.results == [{success:accepted}]);
   if (accepted) { test.assert(f.owner.get_energy_state().credits == f.data.income && rejected(() => { f.owner.validate_energy_rollback(f.receipt.token); })); }
   else { test.assert(ledger(f) == before && f.snapshot() == graph); }
   const settled = ledger(f); f.resolve_response_event(id,!accepted);
   test.assert(ledger(f) == settled && count(f,f.owner.id) == 0,'A stale response cannot revive accepted or rejected cash authority');
  });
 }
}
behavior.scenario('failed compound native cash apply retains logical LIFO cleanup until every operation is undone',() => {
 const f = small(); const before = ledger(f); const graph = f.snapshot();
 f.game.register_event('energy_compound_failure',{validate:(e) => {},apply:(e) => {
  const player = f.owner; const start = player.get_energy_state().credits;
  const first = player.change_energy(10,start,f.game.get_turn());
  const second = player.change_energy((0-3),start+10,f.game.get_turn());
  test.assert(count(f,player.id) == 2);
  const intermediate = ledger(f);
  test.assert(rejected(() => { player.rollback_energy_sequence([second,first+9999]); }) && ledger(f) == intermediate && count(f,player.id) == 2,
   'A bad middle receipt rejects before restoring any cash state');
  let failed = false;
  try { player.change_energy((0-1000),start+7,f.game.get_turn()); }
  catch { : (error) => { failed = true; player.validate_energy_rollback_sequence([second,first]); player.rollback_energy_sequence([second,first]); } }
  test.assert(failed && ledger(f) == before && count(f,player.id) == 0);
  throw ApplyError('Controlled unaffordable compound cash operation after complete LIFO cleanup');
 },rollback:(e) => {}});
 f.game.event('energy_compound_failure',{}); f.process_events();
 test.assert(ledger(f) == before && f.snapshot() == graph && count(f,f.owner.id) == 0);
});
behavior.scenario('standalone debit and credit receipts retain same-turn LIFO ABA fences and received ledger bytes',() => {
 const f = small(); const player = f.owner; const before = ledger(f); let first = 0; let second = 0;
 f.with_write(() => { first = player.change_energy(10,0,f.game.get_turn()); second = player.change_energy((0-3),10,f.game.get_turn()); });
 const pending = ledger(f);
 test.assert(count(f,player.id) == 2 && rejected(() => { f.with_write(() => { player.rollback_energy(first); }); }) && ledger(f) == pending);
 const codec = f.energy_codec_probe(); test.assert(codec.copy && codec.roundtrip && codec.lifetime && codec.unchanged);
 f.with_write(() => { player.rollback_energy_sequence([second,first]); }); test.assert(ledger(f) == before && count(f,player.id) == 0);
 let next = 0; f.with_write(() => { next = player.change_energy(10,0,f.game.get_turn()); });
 test.assert(next > second && rejected(() => { player.validate_energy_rollback(first); }) && count(f,player.id) == 1);
 f.with_write(() => { player.rollback_energy(next); }); test.assert(ledger(f) == before && count(f,player.id) == 0);
});
