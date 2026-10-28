// Actual native seven-owner cooperation, not original-game cooperation parity.
// Every observation is a full v4 snapshot; no expected outputs enter the world.
const behavior = #include('./_behavior');
const scene = {f:null,observer:null,last:'',inventory:'',closed:false};
const command = (name,unit,data) => {
 const event = {caller:unit.owner + 0}; event.game = scene.f.game; event.data = data;
 const handler = #include('../default/game/event/' + name); const reason = handler.validate(event);
 if (#is_defined(reason)) { throw Error(reason); }
 scene.f.with_write(() => { event.applied = handler.apply(event); });
};
test.stage_cleanup('cooperative-observer-model',() => { scene.observer = null; scene.closed = true; });
test.after_stages('cooperative-observer-complete',() => {
 test.assert(scene.closed && scene.f.audit_snapshot() == scene.last && #json_text_exact(scene.f.audit_inspect()) == scene.inventory,
  'Native cleanup and Finish preserve the last observed seven-owner world');
 #print('TERRAIN_COOPERATIVE_COMPLETE');
});
const setup = () => {
 scene.f = #include('./_terraform_cooperation_owners_fixture')();
 scene.observer = #include('./_terrain_trace_observer')(scene.f.game);
};
const observe = (stage,total,has_paused,has_stale) => {
 const f = scene.f; const before = f.audit_snapshot(); const inventory = #json_text_exact(f.audit_inspect());
 const snapshot = scene.observer.read(); const trace = snapshot.terrain_trace;
 test.assert(#sizeof(snapshot.players) == 7 && #sizeof(snapshot.bases) == 7 && #sizeof(snapshot.units) == 22 && trace.coverage.cooperative_work && !trace.coverage.ui);
 for (pair of f.cooperation_pairs) {
  for (unit_id of [pair.first.id + 0,pair.second.id + 0]) {
   const unit = f.game.get_um().get_unit(unit_id);
   let row = null;
   for (candidate of snapshot.units) { if (candidate.raw_id == unit.id) { row = candidate; } }
   test.assert(row != null && #float_bits(row.movement) == #float_bits(unit.movement));
   const detail = trace.unit_details[row.id]; const actual = unit.get_terraforming();
   test.assert(detail.work == actual && detail.cooperative_work.supported && detail.cooperative_work.native_schema_version == unit.get_terraforming_schema_version());
   test.assert(actual.work_units == 2 && actual.job.owner == pair.owner);
   const observed = detail.cooperative_work.state;
   if (has_stale && pair.owner == 2) { test.assert(observed == null && #is_defined(actual.job),'A fresh observation keeps stale native work but reports no valid cohort'); }
   else {
    test.assert(observed != null && observed.own_work_units == actual.work_units && observed.cohort_work_units == (pair.owner == 1 ? total : 4));
    let previous = 0; let sum = 0; let saw_paused = false;
    for (participant of observed.participants) {
     test.assert(participant.unit_id > previous); previous = participant.unit_id;
     const peer = f.game.get_um().get_unit(participant.unit_id); const peer_work = peer.get_terraforming();
     test.assert(peer.owner == pair.owner && peer_work.work_units == participant.work_units && peer_work.active == participant.active);
     sum = sum + peer_work.work_units;
     if (!peer_work.active) { saw_paused = true; }
    }
    test.assert(sum == observed.cohort_work_units && saw_paused == (has_paused && pair.owner == 1),
     'Own counters and genuine paused contributions remain separate from the cohort total');
   }
  }
 }
 test.assert(f.audit_snapshot() == before && #json_text_exact(f.audit_inspect()) == inventory,
  'Full native cooperation observations preserve all players terrain RNG and queues');
 #print('TERRAIN_COOPERATIVE_NATIVE|' + stage + '|' + inventory);
 #print('TERRAIN_COOPERATIVE_JSON|' + stage + '|' + #json_text_exact(snapshot));
};
const first = () => { observe('partial-all-owners',4,false,false); };
const pause = () => {
 for (pair of scene.f.cooperation_pairs) {
  if (pair.owner == 1) { command('unit_activate',pair.second,{unit_id:pair.second.id + 0}); }
 }
};
const paused = () => { observe('paused-opponent',4,true,false); };
const contribute = () => {
 const unit = scene.f.cooperation_third;
 command('unit_terraform',unit,{unit_id:unit.id + 0,action:'farm',replace_existing:true});
};
const fresh = () => { observe('fresh-peer-contribution',6,true,false); };
const alter = () => {
 const f = scene.f; const tm = f.game.get_tm();
 for (pair of f.cooperation_pairs) {
  if (pair.owner == 2) {
   const tile = pair.first.get_tile(); const state = tm.get_terrain_state(tile.x,tile.y);
   f.with_write(() => { tm.apply_terrain([{x:tile.x + 0,y:tile.y + 0,moisture:state.moisture == 1 ? 2 : 1}],[]); });
  }
 }
};
const stale = () => {
 observe('stale-after-terrain',6,true,true); scene.last = scene.f.audit_snapshot(); scene.inventory = #json_text_exact(scene.f.audit_inspect());
};
behavior.scenario_staged('full terrain v4 observes partial local and six opponent cohorts and genuine paused work',[
 {label:'shared-native-setup',run:setup},{label:'partial-all-owners',run:first},
 {label:'pause-real-opponent',run:pause},{label:'paused-opponent',run:paused},
 {label:'real-peer-contribution',run:contribute},{label:'fresh-peer-contribution',run:fresh},
 {label:'real-native-terrain-change',run:alter},{label:'stale-after-terrain',run:stale},
]);
