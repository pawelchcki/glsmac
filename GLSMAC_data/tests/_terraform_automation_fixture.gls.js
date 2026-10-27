// Controlled native mechanics, source rates1 are inputs, not stock duration.
const command = #include('../default/game/event/unit_terraform_plan');
const step = #include('../default/game/event/unit_terraform_plan_step');
return (profile) => {
 const f = #include('./_former_work_fixture')('arid');
 f.configure_unit(f.former.id,'flat_arid_world');
 // Native Base.get_workable_tiles delegates to this real production callback.
 f.game.get_bm().on('get_base_workable_tiles',(e) => { return #include('../default/game/base_workable_tiles')(e.base); });
 f.enable_movement(); f.game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
 const rows = test.parse_smac_text(#include('./_terraform_action_source'),'rules').rows('TERRAIN');
 for (row of rows) { row[4] = '1'; }
 f.game.set('terraforming_rules',#include('../default/game/terraforming_rules').parse({rows:(block) => { return rows; }}));
 f.game.register_event('unit_terraform_plan_step',step);
 const observed = {failed:false,steps:0};
 f.game.on('event_result',(e) => { if (e.name == 'unit_terraform_plan_step') { observed.steps = observed.steps + 1; if (!e.success) { observed.failed = true; #print('AUTOMATION_REJECTED'); #print(e.data); } } });
 f.observed = observed;
 f.begin = (action,x,y) => {
  const event = {caller:f.owner.id + 0,data:{unit_id:f.former.id + 0,command:action,expected_epoch:f.former.get_automation().epoch}}; event.game = f.game;
  if (#is_defined(x)) { event.data.target_x = x; event.data.target_y = y; }
  const error = command.validate(event); if (#is_defined(error)) { throw Error(error); }
  f.with_write(() => { event.applied = command.apply(event); }); return event;
 };
 f.drain = () => {
  let iterations = 0;
  while (true) {
   f.process_events();
   const locked = f.former.get_tile().is_locked();
   // Arriving home queues its first work step without starting an animation.
   // Real frames process the next native batch before ending the turn too.
   if (!locked && f.inspect().pending_events == 0) { break; }
   if (iterations >= 100) { throw Error('Automation queue or movement failed to settle'); }
   if (locked) { f.finish_unit_move(f.former.id); }
   iterations++;
  }
  test.assert(!observed.failed,'Every authoritative queued plan step validates');
  return iterations;
 };
 f.complete_plan = (turn_limit) => {
  f.drain(); let turns = 0;
  while (f.former.get_automation().command != '') {
   if (turns >= turn_limit) { throw Error('Worker plan failed to complete'); }
   f.advance(); f.drain(); turns++;
  }
  return turns;
 };
 if (profile == 'fungus') {
  f.with_write(() => {
   const features = f.game.get_tm().get_terrain_state(0,2).features; features.xenofungus = true;
   f.game.get_tm().apply_terrain([{x:0,y:2,features:features}],[]);
  });
 }
 return f;
};
