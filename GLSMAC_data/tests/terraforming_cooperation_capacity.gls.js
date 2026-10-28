// Real native footprint/transport boundary. The corridor and new sea outlet
// are declared inputs; production river planning supplies the resulting route.
const behavior = #include('./_behavior'); const coop = #include('../default/game/terraforming_cooperation');
const scene = {f:null,identity:'',reads:0,before:'',inventory:''};
const setup = () => {
 const f = #include('./_aquifer_capacity_fixture')(); scene.f = f;
 // The existing authored corridor's earlier outlet bounds this accepted plan;
 // no production route, effect or expected observation is supplied here.
 f.with_write(() => { f.game.get_tm().apply_terrain([{x:66,y:130,canonical:{elevation:(0-500),is_water:true}}],[]); });
 scene.before = f.audit_snapshot(); scene.inventory = #json_text_exact(f.audit_inspect());
};
const prepare = () => {
 const f = scene.f; const tm = f.game.get_tm();
 const counted = {get_tile:tm.get_tile,get_terrain_geometry:tm.get_terrain_geometry,get_distance:tm.get_distance,validate_terrain:tm.validate_terrain};
 counted.get_terrain_state = (x,y) => { scene.reads = scene.reads + 1; return tm.get_terrain_state(x,y); };
 const facade = {get_tm:() => { return counted; }};
 const plan = coop.prepare(facade,f.former,'aquifer',2);
 test.assert(#sizeof(plan.patches) == 4096 && scene.reads == 4096,'Exactly the accepted footprint is fully materialized once per plan call');
 scene.identity = plan.job.terrain_identity + '';
 test.assert(scene.identity != '');
 test.assert(f.audit_snapshot() == scene.before && #json_text_exact(f.audit_inspect()) == scene.inventory);
 #print('COOPERATIVE_FOOTPRINT|' + #json_text_exact({version:1,patches:#sizeof(plan.patches),full_reads:scene.reads,identity:scene.identity}));
};
const native_bounds = () => {
 const f = scene.f; const original = f.former.get_terraforming(); const wide = #pad(scene.identity,'right',524288,' ');
 const data = {action:'aquifer',work_units:0,required_work:2,last_turn:0,previous_work_units:0,previous_movement:1.0,
  previous_moved:false,tile_x:2,tile_y:2,active:false,job:{version:1,policy:'application.cooperative-work.v1',owner:f.former.owner + 0,terrain_identity:wide}};
 f.with_write(() => { f.former.set_terraforming(data); });
 test.assert(f.former.get_terraforming().job.terrain_identity == wide);
 const before = f.audit_snapshot(); data.job.terrain_identity = #pad(scene.identity,'right',524289,' '); let denied = false;
 try { f.with_write(() => { f.former.set_terraforming(data); }); } catch { : (error) => { denied = true; } }
 test.assert(denied && f.audit_snapshot() == before,'One byte over the native guard rejects before changing work');
 f.with_write(() => { f.former.set_terraforming(original); });
 test.assert(f.audit_snapshot() == scene.before);
};
const real_plan = () => {
 const f = scene.f; const actual = coop.prepare(f.game,f.game.get_um().get_unit(f.former.id),'aquifer',2);
 test.assert(actual.job.terrain_identity == scene.identity && #sizeof(actual.patches) == 4096,
  'The counted facade supplies only native reads and matches the unwrapped production plan exactly');
 test.assert(f.audit_snapshot() == scene.before && #json_text_exact(f.audit_inspect()) == scene.inventory);
};
test.after_stages('capacity-clean-finish',() => {
 test.assert(scene.f.audit_snapshot() == scene.before && #json_text_exact(scene.f.audit_inspect()) == scene.inventory);
});
behavior.scenario_staged('real 4096-square identity is exact bounded cached and pure while native transport enforces its byte guard',[
 {label:'declared-native-world',run:setup},{label:'counted-production-plan',run:prepare},
 {label:'native-exact-byte-boundary',run:native_bounds},{label:'unwrapped-production-plan',run:real_plan},
]);
