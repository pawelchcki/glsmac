// Declared application teamwork, not original work-rate/cooperation parity.
const behavior = #include('./_behavior'); const fixture = #include('./_terraform_cooperation_fixture');
const work = #include('../default/game/terraforming'); const command = #include('../default/game/event/unit_terraform');
const coop = #include('../default/game/terraforming_cooperation');
const denied = (f,e) => {
 const before = f.snapshot(); const terrain = f.terrain_snapshot(); const inventory = f.inspect();
 test.assert(#is_defined(command.validate(e)));
 test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain && f.inspect() == inventory);
};
for (water of [false,true]) {
 for (action of ['farm','soil_enricher','mine','solar','forest','road','mag_tube','bunker','airbase','sensor','remove_fungus','plant_fungus','level','condenser','mirror','borehole','aquifer']) {
  if (!water || action == 'farm' || action == 'mine' || action == 'solar' || action == 'remove_fungus' || action == 'plant_fungus') {
   behavior.scenario('two actual workers complete one atomic ' + action + ' job on ' + (water ? 'sea' : 'land'),() => {
    const f = fixture(action,water,2); const before = f.snapshot(); const terrain = f.terrain_snapshot(); const rng = f.inspect().rng + '';
    const first = f.order(f.former,action); test.assert(f.former.get_terraforming().work_units == 2 && f.former.movement == 0.0);
    // This behavioral assertion comes before any new native capability read.
    // A frozen old host/runtime must fail here on the actual cooperation guard.
    const request = f.request(f.peer,action); const reason = command.validate(request);
    if (#is_defined(reason)) {
     const am = f.former.movement; const bm = f.peer.movement;
     #print('COOPERATIVE_GUARD_REJECTION|' + #json_text_exact({reason:reason,action:action,owner:f.owner.id + 0,turn:f.game.get_turn() + 0,
      first:{unit_id:f.former.id + 0,work:f.former.get_terraforming(),movement:am},second:{unit_id:f.peer.id + 0,work:f.peer.get_terraforming(),movement:bm},
      x:f.former.get_tile().x + 0,y:f.former.get_tile().y + 0}));
    }
    test.assert(!#is_defined(reason),'A same-owner same-job second worker can contribute');
    test.assert(f.former.get_terraforming_schema_version() == 2);
    const group = work.cohort_state(f.game,f.former);
    test.assert(group.own_work_units == 2 && group.cohort_work_units == 2 && #sizeof(group.participants) == 1);
    const pre_completion = f.snapshot(); const pre_terrain = f.terrain_snapshot();
    const second = f.order(f.peer,action);
    test.assert(second.applied.terrain_receipt > 0 && #sizeof(second.applied.cohort) == 1);
    test.assert(f.former.get_terraforming().action == '' && f.peer.get_terraforming().action == '' && f.former.movement == 0.0 && f.peer.movement == 0.0);
    test.assert(f.inspect().rng == rng && !f.game.has_pending_actions(f.owner.id));
    f.with_write(() => { command.rollback(second); });
    test.assert(f.snapshot() == pre_completion && f.terrain_snapshot() == pre_terrain);
    f.with_write(() => { command.rollback(first); });
    test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
   });
  }
 }
}
behavior.scenario('damaged fractional workers retain distinct own credits and completion leaves the later peer movement unused',() => {
 const f = fixture('farm',false,3);
 f.with_write(() => { f.former.health = 0.5; f.former.movement = 1.0 / 3.0; f.peer.health = 0.25; f.peer.movement = 1.0 / 3.0; });
 f.former = f.game.get_um().get_unit(f.former.id); f.peer = f.game.get_um().get_unit(f.peer.id);
 f.order(f.former,'farm'); f.order(f.peer,'farm');
 test.assert(f.former.get_terraforming().work_units == 2 && f.peer.get_terraforming().work_units == 2);
 const group = work.cohort_state(f.game,f.former); test.assert(group.own_work_units == 2 && group.cohort_work_units == 4 && #sizeof(group.participants) == 2);
 f.advance();
 test.assert(f.game.get_tm().get_terrain_state(2,2).terraforming.farm && f.former.get_terraforming().action == '' && f.peer.get_terraforming().action == '');
 test.assert(f.former.movement == 0.0 && f.peer.movement == 1.0 && !f.peer.moved_this_turn);
});
behavior.scenario('pausing and same-turn resumption never duplicate another worker contribution',() => {
 const f = fixture('farm',false,5); f.order(f.former,'farm'); f.order(f.peer,'farm');
 f.pause(f.former); test.assert(!f.former.get_terraforming().active && f.former.get_terraforming().work_units == 2);
 f.order(f.former,'farm'); test.assert(work.cohort_state(f.game,f.former).cohort_work_units == 4 && f.former.get_terraforming().work_units == 2);
 f.advance(); test.assert(f.former.get_terraforming().work_units == 4 && f.peer.get_terraforming().work_units == 4);
 f.pause(f.former); test.assert(f.former.get_terraforming().work_units == 2 && f.peer.get_terraforming().work_units == 4 && f.former.movement == 1.0);
 f.order(f.former,'farm'); test.assert(f.former.get_terraforming().work_units == 4 && f.peer.get_terraforming().work_units == 4 && work.cohort_state(f.game,f.former).cohort_work_units == 8);
});
behavior.scenario('undoing a noncompletion restores only its actor and preserves a later genuine peer contribution',() => {
 const f = fixture('farm',false,5); const first = f.order(f.former,'farm'); const second = f.order(f.peer,'farm');
 test.assert(#sizeof(first.applied.cohort) == 0 && #sizeof(second.applied.cohort) == 0);
 const peer = f.peer.get_terraforming(); const mp = f.peer.movement + 0.0;
 f.with_write(() => { command.rollback(first); });
 test.assert(f.former.get_terraforming().action == '' && f.former.movement == 1.0 && f.peer.get_terraforming() == peer && f.peer.movement == mp);
 test.assert(work.cohort_state(f.game,f.peer).cohort_work_units == 2);
});
behavior.scenario('different and foreign jobs reject before consuming any credit while a valid cohort remains intact',() => {
 const f = fixture('farm',false,5); f.order(f.former,'farm');
 denied(f,f.request(f.peer,'mine'));
 f.with_write(() => {
  const data = {def:'Formers',health:1.0,morale:2}; data.owner = f.game.get_player(); data.tile = f.former.get_tile(); f.foreign = f.game.get_um().spawn_unit(data);
 });
 test.assert(f.foreign.owner != f.former.owner); denied(f,f.request(f.foreign,'farm'));
});
behavior.scenario('a stale completion peer rejects the whole undo before any terrain or participant restoration',() => {
 const f = fixture('farm',false,2); f.order(f.former,'farm'); const second = f.order(f.peer,'farm');
 f.with_write(() => { const live = f.game.get_um().get_unit(f.former.id); live.movement = 0.5; });
 const before = f.snapshot(); const terrain = f.terrain_snapshot(); let rejected = false;
 try { f.with_write(() => { command.rollback(second); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && f.snapshot() == before && f.terrain_snapshot() == terrain);
});
behavior.scenario('common identity rejects target ABA but survives an unrelated native terrain edit',() => {
 const f = fixture('farm',false,5); f.order(f.former,'farm'); const identity = f.former.get_terraforming().job.terrain_identity + '';
 const tm = f.game.get_tm(); const unrelated = tm.get_terrain_state(0,0);
 f.with_write(() => { tm.apply_terrain([{x:0,y:0,moisture:unrelated.moisture == 1 ? 2 : 1}],[]); });
 test.assert(coop.prepare(f.game,f.peer,'farm',10).job.terrain_identity == identity);
 const old = tm.get_terrain_state(2,2);
 f.with_write(() => { tm.apply_terrain([{x:2,y:2,moisture:old.moisture == 1 ? 2 : 1}],[]); tm.apply_terrain([{x:2,y:2,moisture:old.moisture}],[]); });
 test.assert(coop.prepare(f.game,f.peer,'farm',10).job.terrain_identity != identity);
 denied(f,f.request(f.peer,'farm'));
});
behavior.scenario('same-target manual job switching carries only genuine own legacy credit and withdraws it from the old cohort',() => {
 const f = fixture('mine',false,5); const rules = f.game.get('terraforming_rules'); rules.farm.turns = 2;
 f.order(f.former,'mine'); f.order(f.peer,'mine'); f.pause(f.former); f.pause(f.peer);
 // First ticks were already consumed, so a real turn restores both budgets.
 f.advance();
 const peer_before = f.peer.get_terraforming(); const own_before = f.former.get_terraforming().work_units;
 f.order(f.former,'farm');
 test.assert(own_before == 2 && f.game.get_tm().get_terrain_state(2,2).terraforming.farm);
 test.assert(f.peer.get_terraforming() == peer_before && f.peer.get_terraforming().work_units == 2);
 test.assert(work.cohort_state(f.game,f.peer) == null,'Physical completion invalidates the prior cohort without rewriting that peer');
});
behavior.scenario('receiving paid-free cooperative state preserves own contributions and common identity without synthesizing legacy metadata',() => {
 const f = fixture('farm',false,5); f.order(f.former,'farm'); f.order(f.peer,'farm');
 const aid = f.former.id + 0; const bid = f.peer.id + 0; const identity = f.former.get_terraforming().job.terrain_identity + ''; const rules = f.game.get('terraforming_rules');
 const old = f.former; f.receive_height_world(); f.game.set('terraforming_rules',rules);
 f.former = f.game.get_um().get_unit(aid); f.peer = f.game.get_um().get_unit(bid);
 test.assert(f.former.get_terraforming().job.terrain_identity == identity && f.peer.get_terraforming().job.terrain_identity == identity);
 test.assert(f.former.get_terraforming().work_units == 2 && f.peer.get_terraforming().work_units == 2 && work.cohort_state(f.game,f.former).cohort_work_units == 4);
 let retired = false; try { old.get_terraforming_schema_version(); } catch { : (error) => { retired = true; } } test.assert(retired);
});
behavior.scenario('actual pre-cooperation candidate wire remains a singleton with no fabricated job',() => {
 const f = fixture('farm',false,4); const input = #include('./_legacy_height_wire');
 f.former = f.receive_legacy_height_world(input.map_hex,input.unit_hex);
 const actual = f.former.get_terraforming();
 test.assert(f.former.get_terraforming_schema_version() == 2 && actual.work_units == 2 && actual.required_work == 8 && !#is_defined(actual.job) && !#is_defined(actual.height));
});

behavior.scenario('native job metadata is detached bounded owner-fenced and preserves the actual receiving unit codec',() => {
 const f = fixture('farm',false,5); f.order(f.former,'farm');
 const saved = f.former.get_terraforming(); const identity = saved.job.terrain_identity + ''; const before = f.snapshot();
 test.assert(f.former.get_terraforming_schema_version() == 2 && identity != '');
 const probe = f.unit_order_codec_probe(f.former.id);
 #print('COOPERATIVE_CODEC_CHECK|' + #json_text_exact({probe:probe,definition:f.former.def + '',morale_set:f.former.get_def().morale + '',owner:f.former.owner + 0}));
 test.assert(probe.roundtrip && probe.canonical_owner && probe.canonical_morale && probe.source_unchanged && probe.trailing_rejected && probe.truncated_rejected && probe.receiver_unchanged);
 saved.job.terrain_identity = 'changed detached value'; test.assert(f.former.get_terraforming().job.terrain_identity == identity);
 let oversized = 'x'; for (let index = 0; index < 20; index++) { oversized = oversized + oversized; }
 let rejected = 0;
 for (input of [{field:'version',value:2},{field:'policy',value:'unknown'},{field:'owner',value:f.owner.id + 1},
  {field:'terrain_identity',value:''},{field:'terrain_identity',value:oversized},{field:'terrain_identity',value:'é'},
  {field:'terrain_identity',value:1}]) {
  const bad = f.former.get_terraforming(); bad.job[input.field] = input.value;
  let caught = false;
  try { f.with_write(() => { f.former.set_terraforming(bad); }); } catch { : (error) => { caught = true; } }
  // A terminal catch returns Undefined to GSE's array-loop control. Keep this
  // real post-catch validation so every declared invalid input is exercised.
  test.assert(caught && f.snapshot() == before,'Every malformed metadata input rejects without changing any native byte');
  rejected++;
 }
 const extra = f.former.get_terraforming(); extra.job.extra = true;
 let extra_caught = false;
 try { f.with_write(() => { f.former.set_terraforming(extra); }); } catch { : (error) => { extra_caught = true; } }
 test.assert(extra_caught && f.snapshot() == before,'Extra metadata fields also reject atomically'); rejected++;
 test.assert(rejected == 8 && f.snapshot() == before);
});
behavior.scenario('cached guards preserve the real construction owner across same-epoch physical worlds and actual reception',() => {
 const a = fixture('mine',false,5); const b = fixture('mine',false,5);
 for (input of [{which:0,owner:0},{which:1,owner:1}]) {
  const f = input.which == 0 ? a : b; const tm = f.game.get_tm(); const state = tm.get_terrain_state(2,2);
  state.terraforming.solar = true; state.terraforming_owners.solar = input.owner;
  f.with_write(() => { tm.apply_terrain([{x:2,y:2,terraforming:state.terraforming,terraforming_owners:state.terraforming_owners}],[]); });
 }
 const as = a.game.get_tm().get_terrain_state(2,2); const bs = b.game.get_tm().get_terrain_state(2,2);
 test.assert(as.terrain_epoch == bs.terrain_epoch && as.terraforming_raw == bs.terraforming_raw && as.features_raw == bs.features_raw && as.terraforming_owners.solar != bs.terraforming_owners.solar);
 const before_a = a.snapshot(); const before_b = b.snapshot(); const ai = a.inspect(); const bi = b.inspect();
 const aj = coop.prepare(a.game,a.former,'mine',10); const bj = coop.prepare(b.game,b.former,'mine',10);
 test.assert(aj.job.terrain_identity != bj.job.terrain_identity,'Planning must seal original owners, not mutated replacement-patch owners');
 test.assert(a.snapshot() == before_a && b.snapshot() == before_b && a.inspect() == ai && b.inspect() == bi);
 a.order(a.former,'mine'); const foreign_baseline = a.former.get_terraforming();
 // Author a logically received job on the second actual physical map, then
 // exercise the real receiving-world codec before checking live eligibility.
 const id = b.former.id + 0; const rules = b.game.get('terraforming_rules');
 b.with_write(() => { b.former.set_terraforming(foreign_baseline); }); b.receive_height_world(); b.game.set('terraforming_rules',rules);
 b.former = b.game.get_um().get_unit(id);
 test.assert(b.former.get_terraforming().job == foreign_baseline.job && work.cohort_state(b.game,b.former) == null);
});
behavior.scenario('an exhausted paused actor cannot reactivate stale work after target ABA',() => {
 const f = fixture('farm',false,5); f.order(f.former,'farm'); f.pause(f.former);
 const tm = f.game.get_tm(); const state = tm.get_terrain_state(2,2);
 f.with_write(() => { tm.apply_terrain([{x:2,y:2,moisture:state.moisture == 1 ? 2 : 1}],[]); tm.apply_terrain([{x:2,y:2,moisture:state.moisture}],[]); });
 test.assert(f.former.movement == 0.0 && !f.former.get_terraforming().active);
 denied(f,f.request(f.former,'farm'));
});
behavior.scenario('a paused cohort peer keeps exact negative-zero movement through true completion undo',() => {
 const f = fixture('farm',false,2); f.order(f.former,'farm'); f.pause(f.former);
 f.with_write(() => { f.former.movement = 0.0 * (0.0-1.0); }); f.former = f.game.get_um().get_unit(f.former.id);
 const original = f.former.movement; test.assert(#float_bits(original) == 2147483648);
 const before = f.snapshot(); const terrain = f.terrain_snapshot(); const second = f.order(f.peer,'farm');
 f.with_write(() => { command.rollback(second); });
 const actual = f.game.get_um().get_unit(f.former.id).movement;
 test.assert(#float_bits(actual) == #float_bits(original) && f.snapshot() == before && f.terrain_snapshot() == terrain);
});
