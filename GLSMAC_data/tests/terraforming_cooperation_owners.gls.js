// Same live seven-owner application world. These are authored workers/rates,
// actual native transactions and pure observation, not original AI/UI parity.
const behavior = #include('./_behavior'); const work = #include('../default/game/terraforming');
const command = #include('../default/game/event/unit_terraform');
const scene = {f:null,pairs:[],third:null,last:'',inventory:''};
const order = (unit) => {
 const e = {caller:unit.owner + 0,data:{unit_id:unit.id + 0,action:'farm',replace_existing:true}}; e.game = scene.f.game;
 const error = command.validate(e); if (#is_defined(error)) { throw Error(error); }
 scene.f.with_write(() => { e.applied = command.apply(e); }); return e;
};
const setup = () => {
 scene.f = #include('./_terraform_cooperation_owners_fixture')();
 scene.pairs = scene.f.cooperation_pairs; scene.third = scene.f.cooperation_third;
};
const read = (label,total,stale_owner) => {
 const f = scene.f; const before = f.audit_snapshot(); const inventory = #json_text_exact(f.audit_inspect());
 const cache = {}; const records = [];
 for (pair of scene.pairs) {
  const unit = f.game.get_um().get_unit(pair.first.id); const own = unit.get_terraforming();
  const cohort = work.cohort_state(f.game,unit,cache);
  test.assert(unit.owner == pair.owner && unit.get_terraforming_schema_version() == 2 && own.job.owner == pair.owner && own.work_units == 2);
  if (pair.owner == stale_owner) { test.assert(cohort == null); }
  else {
   test.assert(cohort != null && cohort.own_work_units == 2 && cohort.cohort_work_units == (pair.owner == 1 ? total : 4));
   let previous = 0;
   for (participant of cohort.participants) {
    test.assert(participant.unit_id > previous); previous = participant.unit_id;
    const peer = f.game.get_um().get_unit(participant.unit_id);
    test.assert(peer.owner == pair.owner && peer.get_terraforming().work_units == participant.work_units);
   }
  }
  records :+ {owner:pair.owner,unit_id:unit.id + 0,native_work:own,cohort:cohort};
 }
 test.assert(#sizeof(records) == 7 && f.audit_snapshot() == before && #json_text_exact(f.audit_inspect()) == inventory,
  'Every local/opponent cohort read preserves the complete native world RNG and queues');
 #print('COOPERATIVE_OWNERS|' + label + '|' + #json_text_exact(records));
};
const first_read = () => { read('first',4,(0-1)); };
const next_contribution = () => { order(scene.third); };
const second_read = () => { read('fresh-after-real-peer-work',6,(0-1)); };
const change_terrain = () => {
 const tm = scene.f.game.get_tm();
 for (pair of scene.pairs) {
  if (pair.owner == 2) {
   const tile = pair.first.get_tile(); const state = tm.get_terrain_state(tile.x,tile.y);
   scene.f.with_write(() => { tm.apply_terrain([{x:tile.x + 0,y:tile.y + 0,moisture:state.moisture == 1 ? 2 : 1}],[]); });
  }
 }
};
const final_read = () => {
 read('fresh-after-terrain-change',6,2);
 scene.last = scene.f.audit_snapshot(); scene.inventory = #json_text_exact(scene.f.audit_inspect());
};
test.after_stages('seven-owner-no-implicit-progress',() => {
 test.assert(scene.f.audit_snapshot() == scene.last && #json_text_exact(scene.f.audit_inspect()) == scene.inventory);
});
behavior.scenario_staged('actual local and all six opponent cohorts are observed without local selection gates',[
 {label:'setup-and-native-work',run:setup},{label:'first-full-owner-read',run:first_read},
 {label:'real-peer-contribution',run:next_contribution},{label:'fresh-work-read',run:second_read},
 {label:'native-terrain-change',run:change_terrain},{label:'fresh-terrain-read',run:final_read},
]);
