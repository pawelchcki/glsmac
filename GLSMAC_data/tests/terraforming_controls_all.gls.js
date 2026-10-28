// Functional mounted application controls; original agreement and real browser
// delivery are separate. Native fixtures declare source rates1/preconditions.
const behavior = #include('./_behavior');
const native = #include('./_terraform_primitives_fixture');
const mount = #include('./_terraform_controls_fixture');
const actions = ['farm','soil_enricher','mine','solar','forest','road','mag_tube','bunker','airbase','sensor','remove_fungus','plant_fungus','level','condenser','mirror','borehole','aquifer'];
for (water of [false,true]) {
 for (action of actions) {
  if (!water || action == 'farm' || action == 'mine' || action == 'solar' || action == 'remove_fungus' || action == 'plant_fungus') {
   behavior.scenario('mounted source action executes actual ' + (water ? 'sea:' : 'land:') + action,() => {
    const f = mount(native(action,water)); const before = f.snapshot(); const terrain = f.terrain_snapshot();
    f.open_terraform(); const row = f.control(action);
    test.assert(f.events.get_player().id == f.former.owner && row.el.color != 'black' && f.game.get_settings().global.rules.get_terraforming_policy().ignore_technologies,
     'A valid worker must remain enabled in its declared owning UI context under the normal technology policy');
    const rule = #include('../default/game/terraforming').describe(f.game,f.former,action);
    test.assert(rule != null && row.el.text == rule.order,'Live land/sea labels must come from the declared source variant');
    f.click(action); f.click(action);
    test.assert(#sizeof(f.requests) == 1 && f.requests[0].name == 'unit_terraform');
    test.assert(f.requests[0].data == {unit_id:f.former.id + 0,action:action} && f.snapshot() == before && f.terrain_snapshot() == terrain);
    const receipt = f.deliver();
    test.assert(f.former.movement == 0.0 && f.former.get_order() == 'NO_ORDERS' && !f.former.get_terraforming().active);
    test.assert(f.preview.order_pending == null && !f.menu.menus.left_menu_terraform.is_open);
    f.with_write(() => { #include('../default/game/event/unit_terraform').rollback(receipt); });
    test.assert(f.snapshot() == before && f.terrain_snapshot() == terrain);
    f.view.root.remove();
   });
  }
 }
}
