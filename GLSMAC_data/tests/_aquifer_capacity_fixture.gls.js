// Declared terrain/participants only. Production source plans the river and
// native transaction validation supplies every capacity and safety decision.
return (profile) => {
 const alternate = #is_defined(profile) && profile == 'alternate-parent';
 const f = alternate ? test.natural_startup_fixture(8,8,'flat-arid') : test.natural_startup_fixture(256,136,'aquifer-corridor'); const game = f.game;
 #include('./_natural_startup_mechanics')(f);
 f.initialize_declared_players(['GAIANS','HIVE','UNIVERSITY','MORGANITES','SPARTANS','BELIEVERS','PEACEKEEPERS'],'Citizen');
 f.configure_declared_world();
 game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
 const rows = test.parse_smac_text(#include('./_terraform_action_source'),'rules').rows('TERRAIN');
 for (row of rows) { row[4] = '1'; }
 game.set('terraforming_rules',#include('../default/game/terraforming_rules').parse({rows:(name) => { return rows; }}));
 if (alternate) {
  // Declared geometry: W is lower and sees the central target uphill first;
  // NW can later reach that same target downhill. All other squares are walls.
  const patches = [];
  for (let y = 0; y < 8; y++) {
   for (let x = y % 2; x < 8; x = x + 2) {
    let center = 3500;
    if (x == 2 && y == 2) { center = 1000; }
    if (x == 0 && y == 2) { center = 0; }
    if (x == 1 && y == 1) { center = 500; }
    if (x == 0 && y == 0) { center = 100; }
    if (x == 6 && y == 0) { center = (0-500); }
    patches :+ {x:x + 0,y:y + 0,canonical:{elevation:center + 0,is_water:center < 0}};
   }
  }
  f.with_write(() => { game.get_tm().apply_terrain(patches,[]); });
 }
 const tile = game.get_tm().get_tile(2,2);
 test.assert(tile.is_land && tile.elevation == (alternate ? 1000 : 0) && tile.get_base() == null && #sizeof(tile.get_units()) == 0);
 f.with_write(() => {
  const declaration = {def:'Formers',health:1.0,morale:2}; declaration.owner = game.get_player(); declaration.tile = tile;
  f.former = game.get_um().spawn_unit(declaration);
 });
 test.assert(#sizeof(game.get_players()) == 7 && #sizeof(game.get_bm().get_bases()) == 0);
 return f;
};
