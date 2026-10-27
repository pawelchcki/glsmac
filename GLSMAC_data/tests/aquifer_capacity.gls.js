const behavior = #include('./_behavior');
behavior.scenario('native terrain limits reject a long aquifer before work or movement changes',() => {
 const f = #include('./_aquifer_capacity_fixture')(); const game = f.game;
 const before = f.audit_snapshot(); const inventory = f.audit_inspect();
 const event = {caller:game.get_player().id + 0,data:{unit_id:f.former.id + 0,action:'aquifer'}}; event.game = game;
 const reason = #include('../default/game/event/unit_terraform').validate(event);
 #print('AQUIFER_CAP_PREFLIGHT|' + #json_text_exact({reason:#is_defined(reason) ? reason : null,inventory:inventory}));
 test.assert(reason == 'River route exceeds the supported terrain transaction capacity','An unpublishable river must be rejected before accepting work');
 const geometry = game.get_tm().get_terrain_geometry(2,2);
 test.assert(geometry[5] == 4096,'The rejection uses the actual unchanged native transaction capacity');
 test.assert(f.audit_snapshot() == before && f.audit_inspect() == inventory && f.former.movement == 1.0 && !f.former.get_terraforming().active,
  'Unsupported routes preserve every native player, unit, tile, RNG and pending event');
});
