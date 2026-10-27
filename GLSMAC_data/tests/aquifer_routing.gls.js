const behavior = #include('./_behavior'); const effects = #include('../default/game/terraforming_effects');
// Count actual native reads without supplying or replacing any terrain answer.
const counted = (native_tm) => {
 const reads = {}; const full_reads = {};
 const tm = {get_terrain_geometry:(x,y) => {
  const key = #to_string(x) + ':' + #to_string(y); reads[key] = #is_defined(reads[key]) ? reads[key] + 1 : 1;
  return native_tm.get_terrain_geometry(x,y);
 },get_terrain_state:(x,y) => {
  const key = #to_string(x) + ':' + #to_string(y); full_reads[key] = #is_defined(full_reads[key]) ? full_reads[key] + 1 : 1;
  return native_tm.get_terrain_state(x,y);
 }};
 tm.validate_terrain = native_tm.validate_terrain; tm.get_tile = native_tm.get_tile;
 const game = {get_tm:() => { return tm; }};
 const result = {}; result.game = game; result.reads = reads; result.full_reads = full_reads; return result;
};
behavior.scenario('short aquifer planning preserves exact native features Float bits graph and true undo with fewer repeated reads',() => {
 const f = #include('./_terraform_primitives_fixture')('aquifer',false); const tm = f.game.get_tm();
 // Author inputs through a fresh native wrapper; keep the observed wrapper
 // read-only so assignment's cached scalar cannot hide later native debit.
 f.with_write(() => { const edit = f.game.get_um().get_unit(f.former.id); edit.movement = 1.0 / 3.0; });
 const before = f.snapshot(); const terrain = f.terrain_snapshot(); const bits = #float_bits(f.former.movement);
 const proxy = counted(tm); const original = tm.get_terrain_state(2,2); original.features.river = true;
 const expected = [{x:2,y:2,features:#clone(original.features)}];
 const plan = effects.plan(proxy.game,f.former,'aquifer');
 test.assert(plan == expected && #json_text_exact(plan) == #json_text_exact(expected),'The ordered complete native feature plan is unchanged');
 let read_count = 0; for (key in proxy.reads) { read_count++; }
 test.assert(proxy.reads['2:2'] == 2 && proxy.reads['0:2'] == 2 && read_count == 2 && proxy.full_reads['2:2'] == 1,
  'Each of the two pure route calls reads each compact coordinate once; only eligibility reads the full origin record');
 test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain && #float_bits(f.former.movement) == bits);
 f.with_write(() => { const edit = f.game.get_um().get_unit(f.former.id); edit.movement = 1.0; });
 const ready = f.snapshot(); const receipt = f.command('aquifer');
 test.assert(tm.get_terrain_state(2,2).features.river && f.former.movement == 0.0 && !f.former.get_terraforming().active);
 f.with_write(() => { #include('../default/game/event/unit_terraform').rollback(receipt); });
 test.assert(f.snapshot() == ready && f.terrain_snapshot() == terrain,'The normal native river effect and true undo remain exact');
 #print('AQUIFER_CACHE_SHORT|' + #json_text_exact({reads:proxy.reads,full_reads:proxy.full_reads,movement_bits:bits,ordered_plan:plan}));
});
behavior.scenario('an uphill rejection is reconsidered from a valid parent and terrain reads never persist into another plan',() => {
 const f = #include('./_aquifer_capacity_fixture')('alternate-parent'); const tm = f.game.get_tm();
 const before = f.audit_snapshot(); const inventory = f.audit_inspect(); const proxy = counted(tm);
 const expected = [];
 for (point of [[0,0],[1,1],[2,2]]) {
  const state = tm.get_terrain_state(point[0],point[1]); state.features.river = true;
  expected :+ {x:point[0] + 0,y:point[1] + 0,features:#clone(state.features)};
 }
 test.assert(tm.get_terrain_state(0,2).elevation.center < tm.get_terrain_state(0,0).elevation.center &&
  tm.get_terrain_state(1,1).elevation.center >= tm.get_terrain_state(0,0).elevation.center);
 const plan = effects.plan(proxy.game,f.former,'aquifer');
 test.assert(plan == expected && #json_text_exact(plan) == #json_text_exact(expected),'BFS retains its exact alternate-parent route and reverse patch ordering');
 test.assert(proxy.reads['0:0'] == 2,'The initially rejected native square is reused within each call, not marked visited');
 test.assert(f.audit_snapshot() == before && f.audit_inspect() == inventory);
 let receipt = 0;
 f.with_write(() => { receipt = tm.apply_terrain([{x:0,y:0,canonical:{elevation:600,is_water:false}}],[]); });
 const changed = f.audit_snapshot(); const changed_inventory = f.audit_inspect();
 test.assert(#is_defined(effects.validate(proxy.game,f.former,'aquifer')),'A later call rereads the newly uphill native terrain instead of retaining the previous route');
 test.assert(f.audit_snapshot() == changed && f.audit_inspect() == changed_inventory);
 f.with_write(() => { tm.rollback_terrain(receipt); });
 test.assert(f.audit_snapshot() == before && f.audit_inspect() == inventory);
 #print('AQUIFER_CACHE_ALTERNATE|' + #json_text_exact({reads:proxy.reads,ordered_plan:plan,inventory:inventory}));
});
