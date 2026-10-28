// Actual native route/validation outputs, not an expected routing algorithm.
// The same probe can run with frozen old/new candidate modules; retained JSON
// strings compare exact ordered patches and cooperative identity across them.
const behavior = #include('./_behavior');
const effects = #include('../default/game/terraforming_effects');
const cooperation = #include('../default/game/terraforming_cooperation');
const efficiencies = [];
const measured = (tm) => {
 const counters = {geometry:0,tiles:0,full:0,validation:0,validated:null};
 const reads = {
  get_distance:tm.get_distance,
  get_terrain_geometry:(x,y) => { counters.geometry = counters.geometry + 1; return tm.get_terrain_geometry(x,y); },
  get_tile:(x,y) => { counters.tiles = counters.tiles + 1; return tm.get_tile(x,y); },
  get_terrain_state:(x,y) => { counters.full = counters.full + 1; return tm.get_terrain_state(x,y); },
  validate_terrain:(patches,participants) => {
   counters.validation = counters.validation + 1;
   const result = tm.validate_terrain(patches,participants); counters.validated = patches; return result;
  },
 };
 const packet = {}; packet.counts = counters; packet.game = {get_tm:() => { return reads; }}; return packet;
};
for (outlet of ['west','north']) {
 behavior.scenario('one validated native aquifer plan is reused without changing ordered patches or identity for ' + outlet,() => {
  const f = #include('./_terraform_cooperation_fixture')('aquifer',false,2); const tm = f.game.get_tm();
  if (outlet == 'north') {
   f.with_write(() => { tm.apply_terrain([{x:0,y:2,canonical:{elevation:500,is_water:false}},{x:2,y:0,canonical:{elevation:(0-500),is_water:true}}],[]); });
  }
  const before = f.snapshot(); const terrain = f.terrain_snapshot(); const inventory = #json_text_exact(f.inspect());
  const baseline = measured(tm); const reason = effects.validate(baseline.game,f.former,'aquifer');
  test.assert(!#is_defined(reason) && baseline.counts.validation == 1 && #sizeof(baseline.counts.validated) > 0);
  const expected_patches = #json_text_exact(baseline.counts.validated);
  test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain && #json_text_exact(f.inspect()) == inventory);
  const current = measured(tm); const plan = effects.plan(current.game,f.former,'aquifer');
  const actual_patches = #json_text_exact(plan);
  test.assert(actual_patches == expected_patches && #json_text_exact(current.counts.validated) == expected_patches);
  test.assert(current.counts.validation == 1 && current.counts.full == baseline.counts.full);
  const group = measured(tm); const job = cooperation.prepare(group.game,f.former,'aquifer',4);
  test.assert(#json_text_exact(job.patches) == expected_patches && group.counts.validation == 1);
  #print('AQUIFER_PLAN_PARITY|' + #json_text_exact({version:1,outlet:outlet,validation_patch_json:expected_patches,plan_patch_json:actual_patches,job_identity:job.job.terrain_identity,
   baseline_geometry:baseline.counts.geometry,baseline_features:baseline.counts.tiles,plan_geometry:current.counts.geometry,plan_features:current.counts.tiles,plan_validations:current.counts.validation}));
  efficiencies :+ {outlet:outlet,baseline_geometry:baseline.counts.geometry,baseline_features:baseline.counts.tiles,plan_geometry:current.counts.geometry,plan_features:current.counts.tiles};
  test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain && #json_text_exact(f.inspect()) == inventory);
  const state = tm.get_terrain_state(2,2); state.features.river = true;
  f.with_write(() => { tm.apply_terrain([{x:2,y:2,features:state.features}],[]); });
  const invalid_before = f.snapshot(); const rejected = measured(tm); const invalid = effects.validate(rejected.game,f.former,'aquifer');
  test.assert(invalid == 'A river already exists' && rejected.counts.validation == 0 && rejected.counts.geometry == 0);
  let denied = false;
  try { effects.plan(rejected.game,f.former,'aquifer'); } catch { : (error) => { denied = error.reason == invalid; } }
  test.assert(denied && f.snapshot() == invalid_before && rejected.counts.validation == 0);
 });
}
// Keep both actual old/new byte records before the efficiency failure boundary.
behavior.scenario('planning never repeats the route already checked by native validation',() => {
 test.assert(#sizeof(efficiencies) == 2);
 for (result of efficiencies) {
  test.assert(result.plan_geometry == result.baseline_geometry && result.plan_features == result.baseline_features,
   'Planning performs the same one route search and feature materialization as standalone native validation');
 }
});
