const fixture = #include('./_base_open_fixture');
const resource_rules = #include('../default/resources');
const resource_panel = #include('../default/ui/parts/game/popup/base_screen/resources');
for (spec of hud_inputs) {
 const f = fixture(spec.input);
 const screen = f.popup.popup_defs.base_screen;
 resource_rules.configure(f.game);
 let mounted = false;
 const status_nodes = [];
 const inspect = (node) => {
  if (node.kind == 'text' && #is_defined(node.class) && node.class == 'base-screen-frame-info-text' && #is_defined(node.align) && node.align == 'left center') { status_nodes :+ node; }
  for (child of node.children) { inspect(child); }
 };
 #print('HUD_CASE|' + spec.id);
 let index = 0;
 for (action of spec.input.actions) {
  f.action(action);
  if (action == 'open') {
   if (!mounted) {
    const bodies = [];
    for (child of f.popup.popups.base_screen.el.children) { if (#is_defined(child.class) && child.class == 'game-popup-body') { bodies :+ child; } }
    if (#sizeof(bodies) != 1) { throw Error('Missing actual base popup body'); }
    const context = {}; context.body = bodies[0]; context.ui = f.view.ui;
    resource_panel.init(context);
    // Icon cells are a drawing boundary; keep actual production labels.
    resource_panel.total_cells = 0;
    screen.sections.resources = resource_panel; inspect(resource_panel.frame);
    if (#sizeof(status_nodes) != 1) { throw Error('Ambiguous resource status display node'); }
    mounted = true;
   }
   const refresh = {}; refresh.base = f.base; screen.set(refresh);
   const status = status_nodes[0];
   const actual = f.context();
   if (actual.screen != 'base' || !actual.title_matches_base) { throw Error('HUD base context not shown'); }
   #print('HUD_OPEN|' + #to_string(index) + '|' + #to_string(f.base.get_size()));
   const intake = f.base.get_intake(); const consumption = f.base.get_consumption();
   #print('DEBUG_HUD_NATIVE|' + #to_string(intake.NUTRIENTS) + '|' + #to_string(intake.MINERALS) + '|' + #to_string(intake.ENERGY) + '|' + #to_string(consumption.NUTRIENTS) + '|' + #to_string(consumption.MINERALS) + '|' + #to_string(consumption.ENERGY));
   for (type of ['nutrients', 'minerals', 'energy']) {
    const labels = resource_panel.labels[type];
    #print('HUD_RESOURCE|' + type + '|' + labels.left.text + '|' + labels.right.text);
   }
   #print('HUD_STATUS|' + status.text);
   for (type of ['economy', 'labs', 'psych']) {
    const labels = screen.sections.energy.labels[type];
    #print('HUD_ALLOCATION|' + type + '|' + labels.percentage.text + '|' + labels.value.text + '|' + labels.bonus.text + '|' + labels.total.text);
   }
   #print('HUD_OPEN_DONE');
  }
  index++;
 }
 #print('HUD_CASE_DONE');
}
