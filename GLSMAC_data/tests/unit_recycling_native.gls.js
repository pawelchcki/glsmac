// Native application pricing/atomicity invariants, beyond recorded recipes.
const behavior = #include('./_behavior');
const reject = (run) => { let caught = false; try { run(); } catch { : (e) => { caught = true; } } test.assert(caught); };
const fixture = (cost) => {
 const f = test.founding_fixture(); f.recycling_id = f.add_colony(0,0);
 f.with_write(() => {
  f.owner.add_production_choice('POD', {type:'unit',id:'ColonyPod',cost:cost,cost_rows:3,population_cost:1});
 });
 return f;
};
const price = (f) => { for (choice of f.owner.get_production_choices()) { if (choice.id == 'POD') { return choice.cost; } } throw Error('Missing native unit recipe'); };
const remove = (f) => { let receipt = null; f.with_write(() => { receipt = f.game.disband_unit(f.recycling_id, f.owner.id, f.game.get_turn()); }); return receipt; };
const undo = (f, receipt) => { f.with_write(() => { f.game.rollback_unit_disband(receipt); }); };
behavior.scenario('owned city credit derives from live native prices and exact undo restores production', () => {
 for (cost of [11,34]) {
  const f = fixture(cost); const before = f.snapshot(); const previous = f.base.get_production(); const minerals = price(f);
  test.assert(f.game.get_unit_disband_base(f.recycling_id, f.owner.id, f.game.get_turn()) == f.base.id);
  const receipt = remove(f); const state = f.base.get_production();
  test.assert(state.minerals == previous.minerals + minerals / 2 && state.choice_id == previous.choice_id && state.last_processed_turn == previous.last_processed_turn);
  test.assert(receipt.base_id == f.base.id && !f.game.um.has_unit(f.recycling_id));
  undo(f, receipt); test.assert(f.snapshot() == before);
 }
});
behavior.scenario('actual native rule and map pricing changes feed recycling without fixed credits', () => {
 for (level of [0,2,99]) {
  const f = fixture(31); f.game.get_settings().global.map.preset_level = level;
  f.game.get_settings().global.rules.set_mineral_cost_factor(7);
  const before = f.snapshot(); const previous = f.base.get_production().minerals; const minerals = price(f);
  const receipt = remove(f); test.assert(f.base.get_production().minerals == previous + minerals / 2);
  undo(f, receipt); test.assert(f.snapshot() == before);
 }
});
behavior.scenario('missing recipes allow retirement while conflicting and oversized prices still reject', () => {
 for (kind of ['missing','conflict','oversize']) {
  const f = fixture(kind == 'oversize' ? 1000001 : 30);
  f.with_write(() => {
   if (kind == 'missing') { f.owner.remove_production_choice('POD'); }
   else if (kind == 'conflict') { f.owner.add_production_choice('ALIAS', {type:'unit',id:'ColonyPod',cost:31,cost_rows:4,population_cost:1}); }
  });
  const before = f.snapshot();
  if (kind == 'missing') {
   const previous = f.base.get_production();
   test.assert(!#is_defined(f.game.validate_unit_disband(f.recycling_id,f.owner.id,f.game.get_turn())));
   const receipt = remove(f); test.assert(!f.game.um.has_unit(f.recycling_id) && f.base.get_production() == previous);
   undo(f,receipt); test.assert(f.snapshot() == before);
  } else {
   test.assert(#is_defined(f.game.validate_unit_disband(f.recycling_id,f.owner.id,f.game.get_turn())));
   reject(() => { remove(f); }); test.assert(f.snapshot() == before);
  }
 }
});
behavior.scenario('mineral store safety bound rejects overflow and permits the exact bound', () => {
 const f = fixture(30);
 f.with_write(() => { f.base.restore_production({choice_id:'',minerals:1000000,last_processed_turn:0},''); });
 let before = f.snapshot(); reject(() => { remove(f); }); test.assert(f.snapshot() == before);
 f.with_write(() => { f.base.restore_production({choice_id:'',minerals:999985,last_processed_turn:0},''); });
 before = f.snapshot(); const receipt = remove(f); test.assert(f.base.get_production().minerals == 1000000);
 undo(f,receipt); test.assert(f.snapshot() == before);
});
behavior.scenario('throwing and forbidden city listeners restore minerals membership queues and RNG atomically', () => {
 for (kind of ['throw','write']) {
  const f = fixture(30); const unit = f.game.um.get_unit(f.recycling_id); const previous = f.base.get_production().minerals; let saw_credit = false;
  f.game.um.on('unit_despawn', () => {
   saw_credit = f.base.get_production().minerals == previous + price(f) / 2;
   f.game.random.get_int(0,99);
   if (kind == 'write') { f.base.restore_production({choice_id:'',minerals:99,last_processed_turn:0},''); }
   else { throw AbortRecycling('controlled failure'); }
  });
  const before = f.snapshot(); const inspected = f.inspect(); reject(() => { remove(f); });
  test.assert(saw_credit && f.snapshot() == before && f.inspect() == inspected && f.game.um.get_unit(f.recycling_id) == unit);
 }
});
behavior.scenario('wrong base receipt or changed live city state cannot undo a recycling transaction', () => {
 const f = fixture(30); const before = f.snapshot(); const receipt = remove(f); const credited = f.base.get_production();
 const wrong = #clone(receipt); wrong.base_id = wrong.base_id + 1; const removed = f.snapshot();
 reject(() => { undo(f,wrong); }); test.assert(f.snapshot() == removed);
 f.with_write(() => { f.base.restore_production({choice_id:'',minerals:credited.minerals + 1,last_processed_turn:0},''); });
 const changed = f.snapshot(); reject(() => { undo(f,receipt); }); test.assert(f.snapshot() == changed);
 f.with_write(() => { f.base.restore_production(credited,''); }); undo(f,receipt); test.assert(f.snapshot() == before);
});
behavior.scenario('successful lifecycle random draws and native credited production undo together', () => {
 const f = fixture(30); f.game.um.on('unit_despawn', () => { f.game.random.get_int(0,99); });
 const before = f.snapshot(); const receipt = remove(f); undo(f,receipt); test.assert(f.snapshot() == before);
 reject(() => { undo(f,receipt); }); test.assert(f.snapshot() == before);
});
behavior.scenario('two credits in one live city undo in reverse order with exact intermediate production', () => {
 const f = fixture(30); const first_id = f.recycling_id + 0; const second_id = f.add_colony(0,0); const before = f.snapshot();
 const first = remove(f); const first_production = f.base.get_production(); f.recycling_id = second_id; const second = remove(f); const removed = f.snapshot();
 reject(() => { undo(f,first); }); test.assert(f.snapshot() == removed);
 undo(f,second); test.assert(f.base.get_production() == first_production && f.game.um.has_unit(second_id) && !f.game.um.has_unit(first_id));
 undo(f,first); test.assert(f.snapshot() == before);
});
behavior.scenario('removing the actual credited city invalidates its retained native undo receipt', () => {
 const f = fixture(30); const city_id = f.base.id + 0; const receipt = remove(f);
 f.with_write(() => { f.game.bm.despawn_base(city_id); });
 reject(() => { undo(f,receipt); });
 test.assert(!f.game.um.has_unit(f.recycling_id) && #sizeof(f.game.bm.get_bases()) == 0);
});
behavior.scenario('rollback notifies real base listeners after the forward credit update was delivered', () => {
 const f = fixture(30); const city_id = f.base.id + 0; const previous = f.base.get_production().minerals + 0;
 f.frontend_packets(); f.update_count(); const notifications = [];
 f.game.on('update_base', (e) => { notifications :+ {base_id:e.base.id + 0,minerals:e.base.get_production().minerals + 0}; });
 const receipt = remove(f); f.frontend_packets(); f.update_count();
 test.assert(notifications == [{base_id:city_id,minerals:previous + price(f) / 2}], 'Forward credit must reach the actual base listener');
 f.update_count(); test.assert(#sizeof(notifications) == 1, 'The forward trigger must be drained before rollback');
 undo(f,receipt); f.frontend_packets(); f.update_count();
 test.assert(f.base.get_production().minerals == previous, 'Native credit must be undone');
 test.assert(notifications == [{base_id:city_id,minerals:previous + price(f) / 2},{base_id:city_id,minerals:previous}], 'Rollback must deliver restored minerals through update_base');
});

// Only transport delivery is supplied: shipped validation/apply/rollback and
// real native acceptance/response queues own the transaction lifecycle.
const shipped_disband = #include('../default/game/event/unit_disband');
const event_fixture = () => {
 const f = fixture(30); f.receipt = null; f.results = [];
 f.game.register_event('unit_disband',{validate:shipped_disband.validate,apply:(e)=>{ f.receipt = shipped_disband.apply(e); return f.receipt; },rollback:shipped_disband.rollback});
 f.game.on('event_result',(e)=>{ f.results :+ e; });
 f.data = {unit_id:f.recycling_id,turn_id:f.game.get_turn(),request_token:1}; return f;
};
behavior.scenario('accepted local and remote master commands release only their real native receipt', () => {
 for (remote of [false,true]) {
  const f = event_fixture(); const previous = f.base.get_production().minerals + 0;
  if (remote) { f.remote_event('unit_disband',f.data); } else { f.game.event('unit_disband',f.data); }
  f.process_events();
  test.assert(!f.game.um.has_unit(f.recycling_id) && f.base.get_production().minerals == previous + price(f) / 2);
  test.assert(f.disband_journal_count() == 0 && #sizeof(f.results) == (remote ? 0 : 1));
  const removed = f.snapshot(); reject(()=>{ undo(f,f.receipt); }); test.assert(f.snapshot() == removed);
 }
});
behavior.scenario('server command accepted by a client releases its applied native receipt', () => {
 const f = event_fixture(); f.server_event('unit_disband',f.data); f.process_events();
 test.assert(!f.game.um.has_unit(f.recycling_id) && f.disband_journal_count() == 0 && #sizeof(f.results) == 0);
 const removed = f.snapshot(); reject(()=>{ undo(f,f.receipt); }); test.assert(f.snapshot() == removed);
});
for (accepted of [false,true]) {
 behavior.scenario('optimistic native journal remains pending then response accepted=' + #to_string(accepted) + ' releases or undoes', () => {
  const f = event_fixture(); const before = f.snapshot();
  const id = f.stage_response_event('unit_disband',f.data,true);
  test.assert(!f.game.um.has_unit(f.recycling_id) && f.disband_journal_count() == 1 && #sizeof(f.results) == 0);
  f.resolve_response_event(id,accepted);
  test.assert(f.disband_journal_count() == 0 && #sizeof(f.results) == 1 && f.results[0].success == accepted);
  test.assert(accepted ? !f.game.um.has_unit(f.recycling_id) : f.snapshot() == before);
  const resolved = f.snapshot(); reject(()=>{ undo(f,f.receipt); }); test.assert(f.snapshot() == resolved);
 });
 behavior.scenario('deferred response accepted=' + #to_string(accepted) + ' applies only on acceptance without retaining a journal', () => {
  const f = event_fixture(); const before = f.snapshot(); const id = f.stage_response_event('unit_disband',f.data,false);
  test.assert(f.snapshot() == before && f.disband_journal_count() == 0 && #sizeof(f.results) == 0);
  f.resolve_response_event(id,accepted);
  test.assert(f.disband_journal_count() == 0 && #sizeof(f.results) == 1 && f.results[0].success == accepted);
  test.assert(accepted ? !f.game.um.has_unit(f.recycling_id) : f.snapshot() == before);
  if (accepted) { const removed = f.snapshot(); reject(()=>{ undo(f,f.receipt); }); test.assert(f.snapshot() == removed); }
 });
}
behavior.scenario('explicit native receipts retain undo and acceptance leaves unrelated journals intact', () => {
 const f = event_fixture(); const before = f.snapshot(); const receipt = remove(f);
 test.assert(f.disband_journal_count() == 1); undo(f,receipt);
 test.assert(f.disband_journal_count() == 0 && f.snapshot() == before);
 const free_id = f.add_colony(0,2); let direct = null;
 f.with_write(()=>{ direct = f.game.disband_unit(free_id,f.owner.id,f.game.get_turn()); });
 f.game.event('unit_disband',f.data); f.process_events();
 test.assert(f.disband_journal_count() == 1 && !f.game.um.has_unit(free_id) && !f.game.um.has_unit(f.recycling_id));
 reject(()=>{ undo(f,f.receipt); }); test.assert(f.disband_journal_count() == 1);
});
