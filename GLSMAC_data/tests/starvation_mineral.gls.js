// Bounded native first-turn mineral regressions. Synthetic world/text/display
// boundaries are declared in _starvation_mineral_fixture. Reference checkpoints
// are kept separate from the source/transaction assumptions below.
const behavior = #include('./_behavior');
const fixture = #include('./_starvation_mineral_fixture');
const production = #include('../default/game/event/process_base_production');
const growth = #include('../default/game/event/process_base_growth');
const confirmation = #include('../default/game/event/confirm_base_starvation');
const make = (mode) => {
 let labels = '#LABELS\n444\n';
 for (let i = 0; i < 444; i++) {
  if (i == 44) { labels += 'Inspect city\n'; }
  else if (i == 45) { labels += 'Continue city\n'; }
  else if (i == 443) { labels += 'Mute notice\n'; }
  else { labels += 'Unused fixture label\n'; }
 }
 return fixture({mode: mode, initial_base: {workers: 0, doctors: 1, worked_tiles: 0, nutrients: 0, minerals: 9},
  sources: [{name: 'script.txt', source: '#STARVE\n#caption Fixture Chaplain\nWarning at $BASENAME0!\n'}, {name: 'labels.txt', source: labels}]});
};
const stage_event = (f, minerals) => {
 const e = {caller: 0, data: {turn_id: f.game.get_turn(), minerals: minerals}}; e.game = f.game; e.data.base = f.base; return e;
};

behavior.scenario('mineral income uses live native intake rather than a fixed base credit', () => {
 const f = make('unchanged');
 f.game.tm.on('get_tile_resources', (e) => { return {NUTRIENTS: 2, MINERALS: 3, ENERGY: 2}; });
 test.assert(f.base.get_intake().MINERALS == 3 && f.base.get_consumption().MINERALS == 0);
 f.turn();
 test.assert(f.base.get_production().minerals == 12 && f.base.get_size() == 1 && !f.popup.is_shown());
 test.assert(f.base.get_production().last_processed_turn == f.game.get_turn()); f.view.root.remove();
});

behavior.scenario('balanced food after a source change preserves mineral credit in the joined context', () => {
 const f = make('starvation');
 f.game.tm.on('get_tile_resources', (e) => { return {NUTRIENTS: 4, MINERALS: 3, ENERGY: 2}; });
 test.assert(f.base.get_intake().NUTRIENTS == f.base.get_consumption().NUTRIENTS);
 f.turn();
 test.assert(f.base.get_size() == 2 && !f.base.has('pending_starvation') && !f.popup.is_shown());
 test.assert(f.base.get_production().minerals == 12, 'The joined layout alone cannot suppress income'); f.view.root.remove();
});

behavior.scenario('a zero-credit native production receipt marks the turn and rolls back exactly', () => {
 const f = make('starvation'); const before = f.base.get_production(); const e = stage_event(f, 0);
 test.assert(!#is_defined(production.validate(e)));
 f.native.with_write(() => { e.applied = production.apply(e); });
 test.assert(f.base.get_production().minerals == before.minerals && f.base.get_production().last_processed_turn == f.game.get_turn());
 test.assert(#is_defined(production.validate(e)), 'A turn cannot be credited a second time');
 test.assert(!#is_defined(growth.validate(e)), 'The zero-credit receipt must still allow queued growth');
 f.native.with_write(() => { production.rollback(e); });
 test.assert(f.base.get_production() == before && f.base.get_size() == 2 && !f.base.has('pending_starvation'));
 f.view.root.remove();
});

// Exact mineral/population checkpoints from independently repeated public
// smacx-gog-2.0-starvation-mineral observations; no project-price claim.
behavior.scenario('the unchanged one-Doctor base earns its first native mineral credit', () => {
 const f = make('unchanged');
 const initial_pops = f.base.get_pops();
 test.assert(f.base.get_size() == 1 && initial_pops[0].get_type() == 'DOCTOR' && f.base.get_worked_tiles() == []);
 test.assert(f.base.get_production().minerals == 9 && f.game.get_year() == f.initial_year);
 f.turn();
 test.assert(f.base.get_production().minerals == 10 && f.base.get_size() == 1 && f.game.get_year() - f.initial_year == 1);
 test.assert(!f.popup.is_shown() && f.turn_button.text == 'TURN COMPLETE'); f.view.root.remove();
});

behavior.scenario('the joined starving base preserves nine minerals at the notice and after actual Proceed', () => {
 const f = make('starvation');
 test.assert(f.base.get_size() == 2 && f.base.get_worked_tiles() == [] && f.base.get_production().minerals == 9);
 for (pop of f.base.get_pops()) { test.assert(pop.get_type() == 'DOCTOR'); }
 test.assert(f.game.get('f_base_get_pending_production')(f.base) == 1, 'The displayed mineral surplus remains independent of income processing');
 f.turn();
 test.assert(f.popup.is_shown() && f.popup.popup.id == 'starvation' && f.base.has('pending_starvation'));
 test.assert(f.base.get_size() == 2 && f.game.get_year() - f.initial_year == 1);
 test.assert(f.base.get_production().minerals == 9, 'Observed starvation suppresses this turn credit before the pending notice');
 test.assert(f.base.get_production().last_processed_turn == f.game.get_turn());
 const duplicate = stage_event(f, 1); test.assert(#is_defined(production.validate(duplicate)));
 f.proceed();
 const survivors = f.base.get_pops();
 test.assert(f.base.get_size() == 1 && survivors[0].get_type() == 'DOCTOR' && !f.base.has('pending_starvation'));
 test.assert(f.base.get_production().minerals == 9 && !f.popup.is_shown() && f.turn_button.text == 'TURN COMPLETE');
 test.assert(#sizeof(f.confirm_receipts) == 1 && #is_defined(production.validate(duplicate)), 'Proceed cannot reopen mineral processing for that turn');
 f.view.root.remove();
});

behavior.scenario('starvation confirmation rollback preserves the suppressed credit and supports a real retry', () => {
 const f = make('starvation'); f.turn(); const before = f.base.get_production();
 test.assert(before.minerals == 9 && before.last_processed_turn == f.game.get_turn());
 const pending = f.base.get('pending_starvation');
 const e = {caller: f.native.owner.id, data: {base_id: f.base.id, turn_id: f.game.get_turn(), request_token: pending.request_token, choice: 1}}; e.game = f.game;
 test.assert(!#is_defined(confirmation.validate(e)));
 f.native.with_write(() => { e.applied = confirmation.apply(e); });
 test.assert(f.base.get_size() == 1 && f.base.get_production() == before);
 f.native.with_write(() => { confirmation.rollback(e); });
 test.assert(f.base.get_size() == 2 && f.base.has('pending_starvation') && f.base.get_production() == before);
 test.assert(!#is_defined(confirmation.validate(e))); f.proceed();
 test.assert(f.base.get_size() == 1 && !f.base.has('pending_starvation') && f.base.get_production() == before); f.view.root.remove();
});

// Application sequencing boundary: completion is outside original observations.
behavior.scenario('a project crossing its native cost keeps credit and can rescue the base before growth', () => {
 const f = make('starvation');
 f.native.with_write(() => {
  f.native.owner.add_production_choice('RESCUE_POD', {type: 'unit', id: 'ColonyPod', cost: 10, cost_rows: 1, population_cost: 1});
  f.base.restore_production({choice_id: 'RESCUE_POD', minerals: 9, last_processed_turn: 0}, '');
 });
 test.assert(f.base.get_production().minerals == 9 && f.base.get_size() == 2);
 test.assert(f.base.get_intake().NUTRIENTS < f.base.get_consumption().NUTRIENTS);
 test.assert(#sizeof(f.native.inspect().unit_ids) == 2);
 f.turn();
 test.assert(f.base.get_production() == {choice_id: '', minerals: 0, last_processed_turn: f.game.get_turn()});
 test.assert(f.base.get_size() == 1 && !f.base.has('pending_starvation') && !f.popup.is_shown());
 test.assert(f.base.get_intake().NUTRIENTS == f.base.get_consumption().NUTRIENTS);
 test.assert(#sizeof(f.native.inspect().unit_ids) == 3, 'Real native completion must create the rescuing Colony Pod');
 let pods = 0; for (unit of f.base.get_tile().get_units()) { if (unit.def == 'ColonyPod') { pods++; } }
 test.assert(pods == 1); f.view.root.remove();
});
