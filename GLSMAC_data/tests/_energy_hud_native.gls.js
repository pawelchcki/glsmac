// Native treasury/notification authority; only display objects are substituted.
return (scenario) => {
 const mocks = #include('./_ui_mocks');
 const mount = (game) => {
  const view = mocks.display(); const p = {modules:{popup:{show:() => { throw Error('Unexpected turn dialog'); }}}};
  p.game = game; p.el = view.root; p.ui = view.ui;
  const bar = #include('../default/ui/parts/game/bottom_bar/mini_map'); bar.init(p);
  const result = {}; result.view = view; result.label = bar.info_energy; return result;
 };
 for (bonus of [0,100]) {
  const declared_bonus = bonus;
  scenario('native energy HUD shows source reserves and coalesced readonly changes with faction bonus ' + #to_string(declared_bonus), () => {
   const f = test.natural_startup_fixture(16,16,'flat-arid'); const game = f.game;
   const sources = #include('./_startup_faction_sources_fixture')({});
   if (declared_bonus > 0) {
    const lines = #split(sources.sources['gaians.txt'],'\n'); lines[2] = lines[2] + ',ENERGY,' + #to_string(declared_bonus);
    let text = ''; for (line of lines) { text += line + '\n'; } sources.sources['gaians.txt'] = text; sources.reload();
   }
   #include('./_natural_startup_mechanics')(f,sources); game.set('energy_rules',{starting_credits:10});
   f.initialize_single_player('GAIANS','Citizen'); f.start_world(); f.iterate();
   const player = game.get_player(); const initial = 10 + declared_bonus; const turn = game.get_turn();
   test.assert(player.get_energy_state().credits == initial && #sizeof(game.get_players()) == 7);
   const ui = mount(game); test.assert(ui.label.text == 'Energy: ' + #to_string(initial));
   const before = f.audit_snapshot(); const state = {events:[],readonly:false};
   const listener = game.on('energy_changed',(e) => {
    if (e.player_id == player.id) {
     state.events :+ {credits:e.credits + 0,revision:e.revision + 0};
     try { player.change_energy(1,player.get_energy_state().credits,turn); }
     catch { : (error) => { state.readonly = true; } }
    }
   });
   let first = 0; let noop = 0; let last = 0;
   f.with_write(() => {
    first = player.change_energy(7,initial,turn);
    noop = player.change_energy(0,initial + 7,turn);
    last = player.change_energy((0-2),initial + 7,turn);
   });
   test.assert(#sizeof(state.events) == 0 && ui.label.text == 'Energy: ' + #to_string(initial), 'No view callback runs inside mutation/receipt construction');
   f.iterate();
   test.assert(state.readonly && #sizeof(state.events) == 1 && state.events[0] == {credits:initial + 5,revision:last});
   test.assert(ui.label.text == 'Energy: ' + #to_string(initial + 5) && game.get_turn() == turn, 'Actual queued notification redraws without a new turn or local event receipt');
   f.with_write(() => { player.rollback_energy_sequence([last,noop,first]); }); f.iterate();
   test.assert(state.events[1].revision == player.get_energy_revision() && state.events[1].revision < last);
   test.assert(ui.label.text == 'Energy: ' + #to_string(initial) && f.audit_snapshot() == before, 'Undo restores the actual ledger and every native participant graph');
   const old_text = ui.label.text; ui.view.root.remove();
   f.with_write(() => { player.change_energy(1,initial,turn); }); f.iterate();
   test.assert(ui.label.text == old_text, 'Removed HUD does not redraw from later native notifications');
   game.off('energy_changed',listener);
  });
 }
 scenario('actual legacy Player decoder keeps zero-balance HUD appearance', () => {
  const player = test.legacy_energy_player(); const game = mocks.events();
  game.get_year = () => { return 2101; }; game.get_player = () => { return player; };
  test.assert(player.get_energy_state() == {credits:0,last_income_turn:0,initialized:false});
  const ui = mount(game); test.assert(ui.label.text == 'Energy: 0'); ui.view.root.remove();
 });
};
