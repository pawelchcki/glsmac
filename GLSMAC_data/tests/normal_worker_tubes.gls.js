// Native application acceptance with explicitly connected source/destination flags.
const behavior = #include('./_behavior');
behavior.scenario('fresh normal 40 by 80 seven-owner world completes a finite zero-cost multi-edge Tube route',() => {
 const setup = #include('./_normal_route_corridor')(true); const f = setup.fixture; const game = f.game;
 const actor_id = setup.actor_id; const selected_y = setup.row; const target = setup.target;
 const tube_terrain = f.map_view(); const tube_turn = game.get_turn() + 0; const mp = game.get_um().get_unit(actor_id).movement + 0.0;
 f.checkpoint('tube-before'); f.begin(actor_id,'tube_to',38,selected_y);
 const unrelated = f.unrelated(actor_id);
 #print('NORMAL_ROUTE_PLAN_BEGIN|tube-execution'); const records = f.drain(actor_id,12); #print('NORMAL_ROUTE_PLAN_END|tube-execution');
 test.assert(#sizeof(records) >= 6 && #sizeof(records) <= 8 && game.get_turn() == tube_turn);
 for (record of records) { test.assert(record.mp == mp,'Every connected tube ACK preserves positive movement'); }
 const actor = game.get_um().get_unit(actor_id);
 test.assert(actor.get_tile() == target && actor.get_automation().command == '' && !actor.get_tile().is_locked());
 test.assert(!game.has_pending_actions(f.owner.id) && f.audit_inspect().pending_events == 0);
 test.assert(f.unrelated(actor_id) == unrelated && f.map_view() == tube_terrain);
 #print('NORMAL_ROUTE_MOVES|tube|' + #json_text_exact(records)); f.checkpoint('tube-after');
 #print('NORMAL_ROUTE_RESULT|' + #json_text_exact({tube_moves:#sizeof(records),tube_mp:mp,row:selected_y,turn:tube_turn}));
});
