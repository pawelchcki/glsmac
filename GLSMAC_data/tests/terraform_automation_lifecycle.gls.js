// Native event/animation lifecycle regressions, not original timing claims.
const behavior = #include('./_behavior');
const fixture = #include('./_terraform_automation_fixture');
const complete = #include('../default/game/event/complete_turn');
const request = (f) => { const e = {caller:f.owner.id + 0,data:{}}; e.game = f.game; return e; };
behavior.scenario('ordinary turn completion waits for real pending automated movement acknowledgement',() => {
 const f = fixture('arid'); const base = f.base.get_tile(); f.begin('road_to',base.x + 0,base.y + 0); f.drain();
 #print('FENCE_PHASE before actual turn advance'); f.advance(); f.process_events();
 #print('FENCE_PHASE native move awaiting ACK');
 test.assert(f.former.get_tile().is_locked(),'The actual native move awaits its display acknowledgement');
 const e = request(f); const before = f.snapshot(); const turn = f.game.get_turn();
 test.assert(!f.game.get_um().has_ready_unit(f.owner.id),'Manual readiness retains its AUTOMATE semantics');
 test.assert(f.game.has_pending_actions(f.owner.id) && #is_defined(complete.validate(e)));
 let rejected = false; try { f.with_write(() => { f.game.complete_turn(f.owner.id); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && !f.game.is_turn_complete(f.owner.id),'Native completion enforces the same fence');
 #print('FENCE_PHASE before deliberate native advance rejection');
 rejected = false; try { f.with_write(() => { f.game.advance_turn(turn + 1); }); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && f.game.get_turn() == turn && f.snapshot() == before,'No turn, movement debit or RNG changes on rejected completion');
 f.finish_unit_move(f.former.id); f.process_events();
 test.assert(!f.former.get_tile().is_locked() && !f.game.has_pending_actions(f.owner.id));
 test.assert(!#is_defined(complete.validate(e)),'Exhausted movement permits the next real turn even if the route needs another edge');
 f.complete_plan(8);
 test.assert(f.former.get_automation().command == '' && !f.game.has_pending_actions(f.owner.id));
});
behavior.scenario('native movement stays pending inside the unlocked ACK callback through its full continuation',() => {
 const f = fixture('arid'); const destination = f.game.get_tm().get_tile(0,2); const seen = {callback:false};
 f.with_write(() => {
  f.former.move_to_tile(destination,() => {
   seen.callback = true;
   test.assert(!f.former.get_tile().is_locked(),'The real native callback has unlocked the map');
   test.assert(f.game.has_pending_actions(f.owner.id),'Unlock alone never advertises completed movement');
   let rejected = false; try { f.game.complete_turn(f.owner.id); } catch { : (error) => { rejected = true; } }
   test.assert(rejected && !f.game.is_turn_complete(f.owner.id));
  });
 });
 f.finish_unit_move(f.former.id);
 test.assert(seen.callback && f.former.get_tile() == destination && !f.game.has_pending_actions(f.owner.id));
 const before = f.snapshot(); let rejected = false;
 try { f.finish_unit_move(f.former.id); } catch { : (error) => { rejected = true; } }
 test.assert(rejected && f.snapshot() == before,'A duplicate retired display ACK cannot move or debit again');
});
behavior.scenario('real executable work is pending even after the native event queue has swapped into a processing batch',() => {
 const f = fixture('arid'); const seen = {checked:false};
 f.game.register_event('completion_probe',{
  validate:(e) => {}, apply:(e) => {
   seen.checked = true; const before = f.snapshot();
   test.assert(f.game.has_pending_actions(f.owner.id) && #is_defined(complete.validate(request(f))));
   test.assert(f.snapshot() == before,'Live decision preflight never consumes RNG or work');
  }, rollback:(e) => {}
 });
 f.game.event('completion_probe',{}); f.begin('farm_mine_road');
 test.assert(f.game.has_pending_actions(f.owner.id),'The unprocessed native queue is visible');
 f.process_events(); test.assert(seen.checked && f.former.get_terraforming().active == false);
 test.assert(f.former.get_automation().command != '' && f.former.movement == 0.0);
 test.assert(!f.game.has_pending_actions(f.owner.id) && !#is_defined(complete.validate(request(f))),'A plan waiting for next-turn credit permits end turn');
 f.with_write(() => { f.game.complete_turn(f.owner.id); }); test.assert(f.game.is_turn_complete(f.owner.id));
});
behavior.scenario('cancelled queued plans and stale host events never latch native completion or restart a job',() => {
 const f = fixture('arid'); f.begin('farm_solar_road'); const old = f.former.get_automation(); const turn = f.game.get_turn();
 test.assert(f.game.has_pending_actions(f.owner.id)); f.begin('cancel'); const before = f.snapshot();
 test.assert(!f.game.has_pending_actions(f.owner.id) && !#is_defined(complete.validate(request(f))));
 #include('../default/game/terraforming_automation').after_move(f.game,f.former.id,f.owner.id,old.epoch,old.cursor,turn);
 f.process_events();
 test.assert(f.snapshot() == before && f.former.get_automation().command == '' && !f.game.get_tm().get_terraforming(2,2).farm);
 test.assert(!f.game.has_pending_actions(f.owner.id),'Cancelled epochs stay retired after a stale continuation');
});
behavior.scenario('an actual queued plan with no eligible work never prevents completion, including at zero treasury',() => {
 const f = fixture('arid'); const energy = f.owner.get_energy_state().credits;
 if (energy > 0) { f.with_write(() => { f.owner.change_energy((0 - energy),energy,f.game.get_turn()); }); }
 f.begin('auto_remove_fungus'); const before = f.snapshot();
 test.assert(f.former.get_automation().command != '' && f.owner.get_energy_state().credits == 0);
 test.assert(!f.game.has_pending_actions(f.owner.id) && !#is_defined(complete.validate(request(f))) && f.snapshot() == before);
 f.with_write(() => { f.game.complete_turn(f.owner.id); }); test.assert(f.game.is_turn_complete(f.owner.id));
});
behavior.scenario('a genuine ACK queues fractional-movement continuation before busy clears and cancellation retires it',() => {
 const f = fixture('arid');
 f.with_write(() => {
  const patches = []; const tm = f.game.get_tm();
  for (let y = 0; y < tm.get_map_height(); y++) {
   for (let x = y % 2; x < tm.get_map_width(); x += 2) {
    const flags = tm.get_terraforming(x,y); flags.road = true; patches :+ {x:x,y:y,terraforming:flags};
   }
  }
  tm.apply_terrain(patches,[]);
 });
 const base = f.base.get_tile(); f.begin('road_to',base.x + 0,base.y + 0); f.process_events();
 test.assert(f.former.get_tile().is_locked()); f.finish_unit_move(f.former.id);
 test.assert(!f.former.get_tile().is_locked() && f.former.movement > 0.0 && f.former.movement < 1.0);
 test.assert(f.game.has_pending_actions(f.owner.id),'The next real executable step is already enqueued at ACK return');
 const old = f.former.get_automation(); const turn = f.game.get_turn(); f.begin('cancel'); const before = f.snapshot();
 #include('../default/game/terraforming_automation').after_move(f.game,f.former.id,f.owner.id,old.epoch,old.cursor,turn);
 test.assert(!f.game.has_pending_actions(f.owner.id)); f.process_events();
 test.assert(f.snapshot() == before && f.former.get_automation().command == '','Cancelled queued motion never resumes from an old ACK identity');
});
behavior.scenario('a queued route that loses every legal edge allows end turn without moving a stranded actor',() => {
 const f = fixture('arid'); const base = f.base.get_tile(); f.begin('road_to',base.x + 0,base.y + 0); f.drain();
 f.advance();
 f.with_write(() => {
  const patches = []; const seen = {}; const source = f.former.get_tile();
  for (tile of source.get_surrounding_tiles()) {
   const key = #to_string(tile.x) + ',' + #to_string(tile.y);
   if (tile != source && !#is_defined(seen[key])) {
    seen[key] = true;
    test.assert(tile.get_base() == null && #sizeof(tile.get_units()) == 0,'The authored water ring never strands unrelated units or a base');
    patches :+ {x:tile.x + 0,y:tile.y + 0,canonical:{elevation:(0 - 500),is_water:true}};
   }
  }
  f.game.get_tm().apply_terrain(patches,[]);
 });
 const before = f.snapshot();
 test.assert(f.former.get_automation().command == 'road_to' && !f.former.get_tile().is_locked());
 test.assert(!f.game.has_pending_actions(f.owner.id) && !#is_defined(complete.validate(request(f))) && f.snapshot() == before);
 f.with_write(() => { f.game.complete_turn(f.owner.id); }); test.assert(f.game.is_turn_complete(f.owner.id));
});
