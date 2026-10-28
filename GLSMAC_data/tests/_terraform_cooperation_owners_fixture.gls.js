// Shared declared seven-owner setup only. Real production event validation/apply
// supplies every work contribution; observers never seed job/progress answers.
const command = #include('../default/game/event/unit_terraform');
const uncomplete = #include('../default/game/event/uncomplete_turn');
return () => {
 const f = test.natural_startup_fixture(16,16,'flat-arid'); const pairs = []; let third = null;
 #include('./_natural_startup_mechanics')(f); f.initialize_single_player('GAIANS','Citizen'); f.start_world();
 const order = (unit) => {
  const e = {caller:unit.owner + 0,data:{unit_id:unit.id + 0,action:'farm',replace_existing:true}}; e.game = f.game;
  const error = command.validate(e); if (#is_defined(error)) { throw Error(error); }
  f.with_write(() => { e.applied = command.apply(e); }); return e;
 };
 const game = f.game;
 // This observation fixture authors simultaneous active turns for every owner.
 // Normal offline startup correctly completes computer turns; reopen through
 // the real production event before issuing each owner's actual work order.
 for (player of game.get_players()) {
  if (game.is_turn_complete(player.id)) {
   const e = {caller:player.id + 0,data:{}}; e.game = game;
   test.assert(!#is_defined(uncomplete.validate(e)));
   f.with_write(() => { uncomplete.apply(e); });
  }
  test.assert(!game.is_turn_complete(player.id));
 }
 game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
 const rows = test.parse_smac_text(#include('./_terraform_action_source'),'rules').rows('TERRAIN'); rows[0][4] = '5';
 game.set('terraforming_rules',#include('../default/game/terraforming_rules').parse({rows:(block) => { return rows; }}));
 test.assert(#sizeof(game.get_players()) == 7 && game.get_player().id == 0);
 for (player of game.get_players()) {
  let location = null; const tm = game.get_tm();
  for (let y = 2; y < 14; y++) {
   for (let x = 2 + y % 2; x < 14; x = x + 2) {
    const tile = tm.get_tile(x,y);
    if (location == null && tile.is_land && tile.get_base() == null && #sizeof(tile.get_units()) == 0 && tile.rockiness < 3) { location = tile; }
   }
  }
  test.assert(location != null);
  const pair = {owner:player.id + 0};
  f.with_write(() => {
   const data = {def:'Formers',health:1.0,morale:2}; data.owner = player; data.tile = location;
   pair.first = game.get_um().spawn_unit(data); pair.second = game.get_um().spawn_unit(data);
   if (player.id == 1) { third = game.get_um().spawn_unit(data); }
  });
  pairs :+ pair;
 }
 for (pair of pairs) { order(pair.first); order(pair.second); }
 f.cooperation_pairs = pairs; f.cooperation_third = third;
 return f;
};
