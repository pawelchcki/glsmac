// Actual mounted controls and all-owner native invariants. The independent
// controlled world/initial focus is separate from the original motion prelude.
const behavior = #include('./_behavior');
behavior.scenario('bounded Base Operations report UI projection and complete native preservation', () => {
 const f = #include('./_base_operations_fixture')(); const before = f.snapshot();
 const guard = (id) => {
  const current = f.snapshot();
  test.assert(current == before, 'Every captured owner/unit/base/citizen/resource/identity/research field must remain unchanged');
  test.assert(#sizeof(current.players) == 7 && #sizeof(current.identities) == 7 && #sizeof(current.city_details) == 7);
  const owners = {};
  for (player of current.players) {
   const key = #to_string(player.raw_id); test.assert(!#is_defined(owners[key])); owners[key] = true;
  }
  for (let owner = 0; owner < 7; owner++) { const key = #to_string(owner); test.assert(#is_defined(owners[key])); }
  for (domain of [current.units, current.bases]) {
   const seen = {};
   for (entity of domain) { const key = #to_string(entity.raw_id); test.assert(!#is_defined(seen[key])); seen[key] = true; }
  }
  #print('BASEOPS_NATIVE|' + id + '|' + #to_string(current.turn) + '|' + #to_string(#sizeof(current.players)) + '|' + #to_string(#sizeof(current.units)) + '|' + #to_string(#sizeof(current.bases)));
 };
 const emit = (id) => {
  const popup = f.popup;
  const screen = !popup.is_shown() ? 'map' : (popup.popup.id == 'base_operations' ? 'base-operations' : 'city-panel');
  #print('BASEOPS_CHECK|' + id + '|' + screen);
  if (screen == 'base-operations') {
   #print('BASEOPS_TITLE|' + f.report.header.text);
   if (id == 'report-open') {
    #print('BASEOPS_TABS|' + f.report.tabs[0].text + '|' + f.report.tabs[1].text + '|' + f.report.tabs[2].text);
    #print('BASEOPS_SELECTEDTAB|' + (f.report.tabs[0].active ? f.report.tabs[0].text : ''));
    #print('BASEOPS_BUTTONS|' + f.report.datalinks.text + '|' + f.report.close.text);
   }
   test.assert(#sizeof(f.report.rows) == 1);
   const row = f.report.rows[0];
   #print('BASEOPS_ROW|' + row.name.text + '|' + row.project.text + '|' + #to_string(row.el.border == 'rgb(0,235,0),1'));
  } else if (screen == 'city-panel') {
   const bar = f.management.sections.bottom_bar.parts;
   test.assert(f.management.base == f.base);
   test.assert(bar.middle_area.basename.text == f.base.name);
   let project = ''; const production = f.base.get_production();
   for (choice of f.base.get_owner().get_production_choices()) { if (choice.id == production.choice_id) { project = choice.name + ''; } }
   test.assert(project != '' && bar.production.production_title.text == project);
   #print('BASEOPS_TITLE|' + bar.middle_area.basename.text);
   #print('BASEOPS_PROJECT|' + bar.production.production_title.text);
  }
  #print('BASEOPS_ENDCHECK');
 };
 guard('base-flow-before');
 f.open_menu(guard); guard('base-flow-report-stable'); emit('report-open');
 f.row().el.emit('click', {}); guard('base-flow-selected-row'); emit('single-click-row');
 f.row().el.emit('click', {}); f.flush(); guard('base-flow-panel-stable'); emit('double-click-row');
 f.escape(); guard('base-flow-return-stable'); emit('escape-city-panel');
 f.escape(); guard('base-flow-escape-close'); emit('escape-report');
 #print('BASEOPS_COMPLETE'); f.view.root.remove();
});
