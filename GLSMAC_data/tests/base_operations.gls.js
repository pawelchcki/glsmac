const behavior = #include('./_behavior');
const fixture = #include('./_base_operations_fixture');
const unchanged = (f, before) => {
 const after = f.snapshot();
 test.assert(#sizeof(after.players) == 7 && #sizeof(after.identities) == 7 && #sizeof(after.bases) == #sizeof(before.bases));
 test.assert(after == before, 'Report controls preserve all seven owners, identities, units, bases, stores, jobs and research');
};
behavior.scenario('mounted source7 opens live report and actual row roundtrip preserves every native owner', () => {
 const f = fixture(); const before = f.snapshot();
 test.assert(#sizeof(f.game.get_players()) == 7 && #sizeof(f.game.bm.get_bases()) == 7);
 f.open_menu();
 test.assert(f.popup.is_shown() && f.popup.popup.id == 'base_operations' && !f.menu.menus.left_menu.is_open);
 test.assert(f.report.header.text == 'GAIAN BASE OPERATIONS');
 test.assert(f.report.tabs[0].text == 'PRODUCTION' && f.report.tabs[0].active);
 test.assert(f.report.tabs[1].text == 'CITIZENS' && !f.report.tabs[1].active && f.report.tabs[2].text == 'GARRISON');
 test.assert(f.report.datalinks.text == 'DATALINKS' && f.report.close.text == 'CLOSE');
 test.assert(#sizeof(f.report.rows) == 1 && f.row().name.text == #uppercase(f.base.name));
 test.assert(f.row().project.text == 'Formers' && f.row().el.border == 'transparent,1'); unchanged(f, before);
 f.row().el.emit('click', {});
 test.assert(f.popup.popup.id == 'base_operations' && f.row().el.border == 'rgb(0,235,0),1'); unchanged(f, before);
 f.row().el.emit('click', {}); f.flush();
 test.assert(f.popup.popup.id == 'base_screen' && f.management.is_open && f.management.base == f.base);
 const strip = f.management.sections.bottom_bar.parts.middle_area;
 test.assert(strip.basename.text == f.base.name); unchanged(f, before);
 f.escape();
 test.assert(f.popup.popup.id == 'base_operations' && f.row().el.border == 'rgb(0,235,0),1'); unchanged(f, before);
 f.escape(); test.assert(!f.popup.is_shown()); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('edited installed labels bind source identity while report row follows live native city and project', () => {
 const f = fixture(true); f.open_menu();
 test.assert(f.report.header.text == 'GAIAN EDITED BASE OPERATIONS' && f.report.tabs[0].text == 'EDITED PRODUCTION' && f.report.close.text == 'EDITED CLOSE');
 f.row().el.emit('click', {});
 f.native.with_write(() => {
  f.base.rename(f.game.get_player().id, f.game.get_turn(), f.base.name, 'Another City');
  f.base.select_production('COLONY_POD');
 });
 const event = {}; event.base = f.base; f.events.emit('update_base', event);
 test.assert(f.row().name.text == 'ANOTHER CITY' && f.row().project.text == 'Colony Pod');
 test.assert(f.row().el.border == 'rgb(0,235,0),1');
 const before = f.snapshot(); f.escape(); unchanged(f, before); f.view.root.remove();
});
behavior.scenario('multiple owned cities retain native identity when selecting and returning from the second row', () => {
 const f = fixture(); let tile = null;
 for (let y = 0; y < 16; y++) {
  for (let x = y % 2; x < 16; x = x + 2) {
   let occupied = false;
   for (base of f.game.bm.get_bases()) { const point = base.get_tile(); if (point.x == x && point.y == y) { occupied = true; } }
   if (tile == null && !occupied) { tile = f.game.tm.get_tile(x, y); }
  }
 }
 let second = null;
 f.native.with_write(() => {
  second = f.game.bm.spawn_base(f.game.get_player(), tile, {name: 'Second Declared City', facilities: []});
  if (second.get_size() == 0) { second.create_pop({type: 'DOCTOR'}); }
  const project = f.base.get_production(); second.select_production(project.choice_id);
 });
 const before = f.snapshot(); f.open_menu(); test.assert(#sizeof(f.report.rows) == 2);
 let row = null; for (entry of f.report.rows) { if (entry.id == second.id) { row = entry; } }
 test.assert(row != null && row.name.text == #uppercase(second.name), 'Second row displays its actual native name');
 row.el.emit('click', {}); row.el.emit('click', {}); f.flush();
 test.assert(f.controller.session.selected == second.id, 'Second row selects the second native identity');
 test.assert(f.popup.popup.id == 'base_screen', 'Second city acknowledgment opens its actual management screen');
 test.assert(f.management.base == second, 'Management remains bound to the second native city'); unchanged(f, before);
 f.escape(); test.assert(f.controller.session.selected == second.id && f.popup.popup.id == 'base_operations');
 let selected = 0; for (entry of f.report.rows) { if (entry.el.border == 'rgb(0,235,0),1') { selected++; test.assert(entry.id == second.id); } }
 test.assert(selected == 1); f.escape(); unchanged(f, before); f.view.root.remove();
});
