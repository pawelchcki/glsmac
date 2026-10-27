// Candidate-only declared inputs. One process executes one supplied action;
// there are no reference observations or expected output values in this file.
// Action/domain inputs come only from the public source-ID inventory; the
// initial native RNG state is a separately declared fixed replay input.
const behavior = #include('./_behavior');
const action = '__ACTION__'; const water = __WATER__;
const initial_rng = '__INITIAL_RNG__';
const work = #include('../default/game/terraforming');
const vocabulary = #include('../default/game/terraforming_actions');
let automation = false;
for (entry of vocabulary.automation) { if (entry.id == action) { automation = true; } }
// Native staging is mandatory: an older runtime must fail explicitly rather
// than silently return to the single accumulation that exhausted the heap.
test.assert(#typeof(test.stage) == 'Callable' && #typeof(test.stage_cleanup) == 'Callable' &&
 #typeof(test.after_stages) == 'Callable' && test.stage_version == 1,'Terraform action capture requires native script staging v1');
// Only the live scene and small scalar receipts survive phases. Full captures
// stay local, except quote/draft snapshots retained until the immediately next
// transition proves detachment and clears them before another observation.
const scene = {f:null,game:null,mounted:null,observer:null,capture:null,baseline:'',
 starting_movement:0.0,initial_actor_movement:0.0,start_x:0,start_y:0,movement_steps:0,
 detached_quote:null,detached_draft:null,cleanup_count:0,after_native:'',after_inventory:'',completion_wire:''};
const read_ui = () => {
 const mounted = scene.mounted; const preview = mounted.preview;
 // These transient references never escape observer.read(): its single
 // detachment clone runs synchronously before any following UI transition.
 const ui = {selected:preview.selected_unit_id,target:preview.terraforming_target.snapshot(),root:mounted.menu.menus.left_menu.is_open,
  modal:mounted.popup.is_shown(),order_label:preview.order_label == null ? null : preview.order_label.text + '',
  work_progress:preview.work_progress_label == null ? null : preview.work_progress_label.text + ''};
 ui.pending = preview.order_pending; ui.height = preview.height_presentation;
 return ui;
};
// Register cleanup before setup can create a view or fail. Removing the same
// owned root follows the original successful teardown and stops its UI timers.
test.stage_cleanup('terraform-scene-owned-resources',() => {
 test.assert(scene.cleanup_count == 0,'The owned scene is cleaned exactly once');
 scene.cleanup_count = scene.cleanup_count + 1;
 if (scene.f != null && #is_defined(scene.f.view)) { scene.f.view.root.remove(); }
});
test.after_stages('terraform-clean-finish',() => {
 test.assert(scene.cleanup_count == 1 && scene.mounted.view.root.removed && scene.detached_quote == null && scene.detached_draft == null);
 test.assert(scene.f.audit_snapshot() == scene.after_native && #json_text_exact(scene.f.audit_inspect()) == scene.after_inventory,
  'Cleanup and ordinary Finish never advance gameplay, RNG or queued native state');
 #print('TERRAFORM_ACTION_END|' + scene.completion_wire);
});
const setup = () => {
 const f = test.natural_startup_fixture(16,16,'flat-arid'); scene.f = f;
 const game = f.game; scene.game = game;
 #include('./_natural_startup_mechanics')(f);
 game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
 f.initialize_single_player('GAIANS','Citizen'); f.start_world(); f.enable_movement();
 const rows = test.parse_smac_text(#include('./_terraform_action_source'),'rules').rows('TERRAIN');
 for (row of rows) { row[4] = '1'; }
 game.set('terraforming_rules',#include('../default/game/terraforming_rules').parse({rows:(name) => { return rows; }}));
 let location = null;
 const tm = game.get_tm();
 for (let y = 2; y < tm.get_map_height() - 2; y++) {
  for (let x = 2 + y % 2; x < tm.get_map_width() - 2; x = x + 2) {
   const tile = tm.get_tile(x,y);
   if (location == null && tile.get_base() == null && #sizeof(tile.get_units()) == 0) { location = tile; }
  }
 }
 test.assert(location != null,'Declared fixture requires an empty interior work square');
 f.with_write(() => {
  const state = tm.get_terrain_state(location.x,location.y); const flags = #clone(state.terraforming);
  const owners = #clone(state.terraforming_owners); const features = #clone(state.features);
  for (name in flags) { flags[name] = false; owners[name] = (0-1); }
  features.monolith = false; features.xenofungus = action == 'remove_fungus' || action == 'auto_remove_fungus'; features.river = false;
  if (action == 'soil_enricher') { flags.farm = true; }
  if (action == 'mag_tube') { flags.road = true; }
  // These are authored setup conditions, before the first native baseline.
  // A healthy lowland land worker cannot lower its own square into water.
  const elevation = water ? (0-500) : (action == 'lower' ? 1500 : 500);
  tm.apply_terrain([{x:location.x + 0,y:location.y + 0,canonical:{elevation:elevation,is_water:water},
   rockiness:action == 'level' ? 3 : 1,features:features,terraforming:flags,terraforming_owners:owners}],[]);
  if (action == 'aquifer') {
   let outlet = null; const neighbors = tm.get_terrain_state(location.x,location.y).neighbors;
   for (direction of ['W','NW','N','NE','E','SE','S','SW']) {
    const next = neighbors[direction];
    if (outlet == null && next != null) {
     const tile = tm.get_tile(next.x,next.y);
     if (tile.get_base() == null && #sizeof(tile.get_units()) == 0) { outlet = tile; }
    }
   }
   test.assert(outlet != null); tm.apply_terrain([{x:outlet.x + 0,y:outlet.y + 0,canonical:{elevation:(0-500),is_water:true}}],[]);
  }
  let definition = 'Formers';
  if (water) {
   definition = 'DECLARED_SEA_WORKER';
   game.get_um().define_unit(definition,{name:'Declared sea Terraform module',morale:'STANDARD',type:'static',movement_type:'water',movement_per_turn:4,
    can_terraform:true,combat:{kind:'civilian',offense:0,defense:1,reactor:1},render:{type:'sprite',file:'synthetic.pcx',x:0,y:0,w:1,h:1,cx:0,cy:0}});
  }
  const declaration = {def:definition,health:1.0,morale:2}; declaration.owner = game.get_player(); declaration.tile = location;
  f.former = game.get_um().spawn_unit(declaration);
  // Declared treasury for paid-control exercise; normal installed startup
  // funding is covered separately, never inferred from this authored budget.
  const player = game.get_player(); player.change_energy(10000,player.get_energy_state().credits,game.get_turn());
 });
 scene.mounted = #include('./_terraform_controls_fixture')(f);
 scene.observer = #include('./_terrain_trace_observer')(game,read_ui);
 scene.observer.bind('unit',f.former.id,'actor');
 scene.capture = #include('./_terrain_capture_emit')(f,scene.observer);
 #print('TERRAFORM_ACTION_BEGIN|' + #json_text_exact({version:2,action:action,domain:water ? 'sea' : 'land',automation:automation,
  rng:{stream:'native-game-shared-map-and-logic',initial_requested:initial_rng,actual_before_action:f.audit_inspect().rng + '',terrain_input:'declared-16x16-flat-arid'},
  rates:'declared-one-turn',treasury:'authored-additive10000',actor_id:f.former.id + 0,x:location.x + 0,y:location.y + 0}));
};
const observe_before = () => {
 const initial = scene.capture('before'); const f = scene.f;
 scene.baseline = f.audit_snapshot(); scene.starting_movement = f.former.movement;
 const tile = f.former.get_tile(); scene.start_x = tile.x + 0; scene.start_y = tile.y + 0;
 let found = false;
 for (unit of initial.units) {
  if (unit.id == 'actor') { scene.initial_actor_movement = unit.movement; found = true; }
 }
 test.assert(found,'The detached checkpoint includes the actual bound actor');
};
const select_action = () => { scene.mounted.open_terraform(); scene.mounted.click(action); };
const observe_quote = () => {
 const mounted = scene.mounted;
 test.assert(mounted.popup.is_shown() && #sizeof(mounted.requests) == 0 && scene.f.audit_snapshot() == scene.baseline);
 scene.detached_quote = scene.capture('quote');
};
const cancel_quote = () => {
 const mounted = scene.mounted; const dialog = mounted.popup.popup_defs.terraforming_height;
 dialog.ok.emit('click',{}); test.assert(!mounted.popup.is_shown() && scene.f.audit_snapshot() == scene.baseline);
 test.assert(scene.detached_quote.terrain_trace.ui.height.stage == 'pending-consent' && mounted.preview.height_presentation.stage == 'cancelled',
  'A later real dialog transition cannot mutate the detached quote checkpoint');
 scene.detached_quote = null;
};
const observe_cancelled_quote = () => { scene.capture('cancelled-quote'); };
const select_payment = () => {
 const mounted = scene.mounted; mounted.open_terraform(); mounted.click(action);
 const dialog = mounted.popup.popup_defs.terraforming_height; dialog.rows[1].emit('click',{});
 test.assert(#sizeof(mounted.requests) == 0 && scene.f.audit_snapshot() == scene.baseline);
};
const observe_draft = () => { scene.detached_draft = scene.capture('draft-payment'); };
const confirm_payment = () => {
 const mounted = scene.mounted; const dialog = mounted.popup.popup_defs.terraforming_height; dialog.ok.emit('click',{});
 test.assert(scene.detached_draft.terrain_trace.ui.height.stage == 'pending-consent' && mounted.preview.height_presentation.stage == 'submitted',
  'Payment submission cannot mutate the detached draft checkpoint');
 scene.detached_draft = null;
};
const select_destination = () => {
 let destination = null; const game = scene.game;
 for (base of game.get_bm().get_bases()) { if (base.get_owner().id == game.get_player().id) { destination = base.get_tile(); } }
 test.assert(destination != null && scene.mounted.preview.terraforming_target.is_active());
 // Declared notification transport. The real pointer hook is independently
 // tested in a browser; this carries the actual current native target tile.
 const target = {}; target.tile = destination; scene.mounted.events.emit('tile_target',target);
};
const observe_queued = () => {
 test.assert(#sizeof(scene.mounted.requests) == 1 && scene.f.audit_snapshot() == scene.baseline,
  'Mounted selection/consent never mutates the native world before transport');
 scene.capture('queued');
};
const deliver = () => { scene.mounted.deliver(); };
const observe_acknowledged = () => { scene.capture('acknowledged'); };
const exercise_automation = () => {
 // Bounded actual execution, not a claim that the autonomous plan exhausted
 // every map tile. Native completion suites independently cover all ten.
 const f = scene.f; f.process_events();
 while (f.former.get_tile().is_locked()) {
  test.assert(scene.movement_steps < 32); f.finish_unit_move(f.former.id); f.process_events(); scene.movement_steps = scene.movement_steps + 1;
 }
};
const observe_exercised = () => { scene.capture('exercised'); };
const cancel_automation = () => {
 const f = scene.f; const cancel = #include('../default/game/event/unit_terraform_plan');
 const event = {caller:f.former.owner + 0,data:{unit_id:f.former.id + 0,command:'cancel',expected_epoch:f.former.get_automation().epoch}}; event.game = scene.game;
 const reason = cancel.validate(event); if (#is_defined(reason)) { throw Error(reason); }
 f.with_write(() => { cancel.apply(event); }); f.process_events();
 test.assert(f.former.get_automation().command == '' && !f.former.get_terraforming().active);
};
const observe_after = () => {
 const f = scene.f;
 if (!automation) { test.assert(f.former.get_order() == 'NO_ORDERS' && !f.former.get_terraforming().active && f.former.movement == 0.0); }
 scene.capture('after');
 test.assert(#float_bits(scene.initial_actor_movement) == #float_bits(scene.starting_movement),
  'The detached native Float checkpoint preserves its exact bits after real work debit');
 // Read the native mutable Float into a local scalar before object-literal
 // construction; the literal would otherwise clone its native pointer wrapper.
 const final_movement = f.former.movement;
 // Retain only the serialized small completion receipt. Publish it after
 // cleanup/Finish and all native no-progress checks succeed.
 scene.completion_wire = #json_text_exact({version:1,action:action,domain:water ? 'sea' : 'land',
  lifecycle:automation ? 'bounded-exercise-and-cancel' : 'rate-one-completed',actor_id:f.former.id + 0,
  final_order:f.former.get_order(),final_work:f.former.get_terraforming(),movement:{arithmetic:'native-float32-subtraction',actual_step_count:scene.movement_steps,
   movement_before:scene.starting_movement,movement_after:final_movement,actual_debit_mp:scene.starting_movement - final_movement,
   before:{x:scene.start_x + 0,y:scene.start_y + 0},after:{x:f.former.get_tile().x + 0,y:f.former.get_tile().y + 0}}});
 scene.after_native = f.audit_snapshot(); scene.after_inventory = #json_text_exact(f.audit_inspect());
};
// Phase boundaries collect completed invocation locals without running timers,
// events or a replacement world. Only explicit phases below issue controls or
// advance native events. Observation packet names/counts remain case-specific:
// primitive4, height7, command5; every checkpoint still contains all7 players.
const steps = [{label:'setup',run:setup},{label:'before',run:observe_before},{label:'select-action',run:select_action}];
if (action == 'raise' || action == 'lower') {
 for (step of [{label:'quote',run:observe_quote},{label:'cancel-quote',run:cancel_quote},
  {label:'cancelled-quote',run:observe_cancelled_quote},{label:'select-payment',run:select_payment},
  {label:'draft-payment',run:observe_draft},{label:'confirm-payment',run:confirm_payment}]) { steps :+ step; }
}
if (action == 'road_to' || action == 'tube_to') { steps :+ {label:'select-destination',run:select_destination}; }
for (step of [{label:'queued',run:observe_queued},{label:'deliver',run:deliver},{label:'acknowledged',run:observe_acknowledged}]) { steps :+ step; }
if (automation) {
 for (step of [{label:'exercise',run:exercise_automation},{label:'exercised',run:observe_exercised},{label:'cancel-plan',run:cancel_automation}]) { steps :+ step; }
}
steps :+ {label:'after',run:observe_after};
behavior.scenario_staged('native all-owner mounted Terraform action ' + action + (water ? ':sea' : ':land'),steps);
