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
behavior.scenario('missing conflicting or oversized native prices reject before credit or removal', () => {
 for (kind of ['missing','conflict','oversize']) {
  const f = fixture(kind == 'oversize' ? 1000001 : 30);
  f.with_write(() => {
   if (kind == 'missing') { f.owner.remove_production_choice('POD'); }
   else if (kind == 'conflict') { f.owner.add_production_choice('ALIAS', {type:'unit',id:'ColonyPod',cost:31,cost_rows:4,population_cost:1}); }
  });
  const before = f.snapshot(); test.assert(#is_defined(f.game.validate_unit_disband(f.recycling_id,f.owner.id,f.game.get_turn())));
  reject(() => { remove(f); }); test.assert(f.snapshot() == before);
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
